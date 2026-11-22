// Pure speed math, plus the in-page runner against a fake document.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const speed = require('../speed.js');

function video(rate) {
    let value = rate;
    return {
        get playbackRate() { return value; },
        set playbackRate(next) {
            if (!(next >= 0.0625 && next <= 16)) throw new Error('NotSupportedError: ' + next);
            value = next;
        }
    };
}

test('steps 0.25 from the current rate and rounds off float drift', () => {
    assert.strictEqual(speed.stepSpeed(1, 0.25), 1.25);
    assert.strictEqual(speed.stepSpeed(1, -0.25), 0.75);
    assert.strictEqual(speed.roundSpeed(1.2500000001), 1.25);
    assert.strictEqual(speed.roundSpeed(0.1 + 0.2), 0.3);
    assert.strictEqual(speed.stepSpeed(1.2500000001, 0.25), 1.5);
    let rate = 1;
    for (let i = 0; i < 4; i++) rate = speed.stepSpeed(rate, speed.SPEED_STEP);
    assert.strictEqual(rate, 2);
    assert.strictEqual(speed.formatSpeed(1.2500000001), '1.25x');
    assert.strictEqual(speed.formatSpeed(rate), '2x');
});

test('repeated steps from 0.0625 stay on exact quarter-plus-sixteenth values', () => {
    let rate = speed.MIN_SPEED;
    const seen = [];
    for (let i = 0; i < 4; i++) {
        rate = speed.stepSpeed(rate, 0.25);
        seen.push(rate);
    }
    assert.deepStrictEqual(seen, [0.3125, 0.5625, 0.8125, 1.0625]);
});

test('clamp keeps speeds inside 0.0625–16', () => {
    assert.strictEqual(speed.clampSpeed(0), 0.0625);
    assert.strictEqual(speed.clampSpeed(20), 16);
    assert.strictEqual(speed.clampSpeed(1.5), 1.5);
    assert.strictEqual(speed.nextSpeed(16, 'speed-up'), 16);
    assert.strictEqual(speed.nextSpeed(15.8, 'speed-up'), 16);
    assert.strictEqual(speed.nextSpeed(0.0625, 'speed-down'), 0.0625);
    assert.strictEqual(speed.nextSpeed(0.2, 'speed-down'), 0.0625);
    assert.strictEqual(speed.nextSpeed(0.3125, 'speed-down'), 0.0625);
});

test('reset returns 1x and ignores the current rate', () => {
    assert.strictEqual(speed.nextSpeed(2.5, 'speed-reset'), 1);
    assert.strictEqual(speed.nextSpeed(0.0625, 'speed-reset'), 1);
    assert.strictEqual(speed.nextSpeed(Number.NaN, 'speed-reset'), 1);
});

test('a non-finite current rate steps from 1', () => {
    assert.strictEqual(speed.nextSpeed(Number.NaN, 'speed-up'), 1.25);
    assert.strictEqual(speed.nextSpeed(undefined, 'speed-down'), 0.75);
    assert.strictEqual(speed.nextSpeed(1, 'unknown'), null);
});

test('custom steps round off float drift and honor the clamp', () => {
    assert.deepStrictEqual(speed.STEP_CHOICES, [0.05, 0.1, 0.25, 0.5]);
    assert.strictEqual(speed.roundSpeed(1.2500000001), 1.25);
    assert.strictEqual(speed.stepSpeed(1.2500000001, 0.05), 1.3);
    assert.strictEqual(speed.stepSpeed(1.2500000001, 0.1), 1.35);
    let rate = 1;
    for (let i = 0; i < 20; i++) rate = speed.stepSpeed(rate, 0.05);
    assert.strictEqual(rate, 2);
    rate = 1;
    for (let i = 0; i < 7; i++) rate = speed.stepSpeed(rate, 0.1);
    assert.strictEqual(rate, 1.7);
    rate = speed.MIN_SPEED;
    const fromFloor = [];
    for (let i = 0; i < 4; i++) {
        rate = speed.stepSpeed(rate, 0.05);
        fromFloor.push(rate);
    }
    assert.deepStrictEqual(fromFloor, [0.1125, 0.1625, 0.2125, 0.2625]);

    const tight = { speedStep: 0.5, minSpeed: 1, maxSpeed: 1.25 };
    assert.strictEqual(speed.nextSpeed(1, 'speed-up', tight), 1.25);
    assert.strictEqual(speed.nextSpeed(1, 'speed-down', tight), 1);
    assert.strictEqual(speed.nextSpeed(1.2500000001, 'speed-up', { speedStep: 0.05, maxSpeed: 1.26 }), 1.26);
    assert.strictEqual(speed.nextSpeed(0.5, 'speed-down', { speedStep: 0.25, minSpeed: 0.5, maxSpeed: 4 }), 0.5);
    assert.strictEqual(speed.nextSpeed(4, 'speed-reset', { minSpeed: 0.5, maxSpeed: 2 }), 1);
    assert.strictEqual(speed.nextSpeed(4, 'speed-reset', { minSpeed: 1.5, maxSpeed: 3 }), 1.5);
    assert.strictEqual(speed.nextSpeed(1, 'speed-up', { speedStep: 0.2 }), 1.25);
    assert.strictEqual(speed.nextSpeed(Number.NaN, 'speed-down', { minSpeed: 2, maxSpeed: 4 }), 2);
});

test('invalid stored settings fall back to the 0.25 step and 0.0625–16', () => {
    const defaults = { step: 0.25, min: 0.0625, max: 16 };
    assert.deepStrictEqual(speed.resolveSettings(undefined), defaults);
    assert.deepStrictEqual(speed.resolveSettings(null), defaults);
    assert.deepStrictEqual(speed.resolveSettings('0.5'), defaults);
    assert.deepStrictEqual(speed.resolveSettings(1), defaults);
    assert.deepStrictEqual(speed.resolveSettings({}), defaults);
    assert.deepStrictEqual(speed.resolveSettings([]), defaults);
    assert.deepStrictEqual(speed.resolveSettings({ speedStep: 'nope', minSpeed: 'fast', maxSpeed: null }), defaults);
    assert.deepStrictEqual(speed.resolveSettings({ speedStep: true, minSpeed: false, maxSpeed: {} }), defaults);
    assert.deepStrictEqual(speed.resolveSettings({ speedStep: 0.2, minSpeed: 0, maxSpeed: 100 }), defaults);
    assert.deepStrictEqual(speed.resolveSettings({ speedStep: -1, minSpeed: 10, maxSpeed: 2 }), defaults);
    assert.deepStrictEqual(speed.resolveSettings({ speedStep: '', minSpeed: '', maxSpeed: '  ' }), defaults);
    assert.deepStrictEqual(speed.resolveSettings({ speedStep: Number.POSITIVE_INFINITY, minSpeed: Number.NaN, maxSpeed: -5 }), defaults);
    assert.deepStrictEqual(
        speed.resolveSettings({ speedStep: '0.05', minSpeed: '0,5', maxSpeed: '3x' }),
        { step: 0.05, min: 0.5, max: 3 }
    );
    assert.deepStrictEqual(
        speed.resolveSettings({ speedStep: 0.1, minSpeed: 0, maxSpeed: 4 }),
        { step: 0.1, min: 0.0625, max: 4 }
    );
    assert.deepStrictEqual(
        speed.resolveSettings({ speedStep: '0.10', minSpeed: '1.2500000001', maxSpeed: 8 }),
        { step: 0.1, min: 1.25, max: 8 }
    );
    const input = { speedStep: 0.5, minSpeed: 0.25, maxSpeed: 8 };
    const once = speed.resolveSettings(input);
    assert.deepStrictEqual(input, { speedStep: 0.5, minSpeed: 0.25, maxSpeed: 8 });
    assert.deepStrictEqual(speed.resolveSettings(once), once);
    assert.deepStrictEqual(speed.explainSettings({ minSpeed: 100 }).settings, defaults);
    assert.strictEqual(speed.explainSettings({ minSpeed: 100 }).adjusted, true);
    assert.strictEqual(speed.explainSettings({ speedStep: 0.2, minSpeed: 0.5, maxSpeed: 2 }).adjusted, true);
    assert.strictEqual(speed.explainSettings({ speedStep: 0.1, minSpeed: 0.5, maxSpeed: 2 }).adjusted, false);
    assert.strictEqual(speed.explainSettings({ speedStep: '', minSpeed: '', maxSpeed: '' }).adjusted, false);
    assert.strictEqual(speed.explainSettings(null).adjusted, false);
});

test('labels stay short and exact', () => {
    assert.strictEqual(speed.formatSpeed(1), '1x');
    assert.strictEqual(speed.formatSpeed(1.75), '1.75x');
    assert.strictEqual(speed.formatSpeed(0.0625), '0.0625x');
    assert.strictEqual(speed.formatSpeed(16), '16x');
    assert.strictEqual(speed.badgeText(1), '1x');
    assert.strictEqual(speed.badgeText(1.5), '1.5x');
    assert.strictEqual(speed.badgeText(1.75), '1.75');
    assert.strictEqual(speed.badgeText(16), '16x');
    for (const value of [0.0625, 0.3125, 1, 1.75, 10.25, 16]) {
        assert.ok(speed.badgeText(value).length <= 4, speed.badgeText(value));
    }
});

function loadPage(rates) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'speed.js'), 'utf8');
    const vids = rates.map(video);
    const pending = new Map();
    const cleared = [];
    let seq = 1;
    const docEl = {
        childNodes: [],
        appendChild(child) {
            child.parentNode = docEl;
            this.childNodes.push(child);
        },
        removeChild(child) {
            child.parentNode = null;
            this.childNodes = this.childNodes.filter((node) => node !== child);
        }
    };
    const sandbox = {
        Math, Number, String, Array, Object, isFinite,
        document: {
            documentElement: docEl,
            querySelectorAll: (sel) => (sel === 'video' ? vids : []),
            createElement: () => ({
                style: {},
                attributes: {},
                parentNode: null,
                setAttribute(name, value) { this.attributes[name] = value; },
                get textContent() { return this._text || ''; },
                set textContent(value) { this._text = String(value); }
            })
        },
        setTimeout(fn) {
            const id = seq++;
            pending.set(id, fn);
            return id;
        },
        clearTimeout(id) {
            if (pending.has(id)) cleared.push(id);
            pending.delete(id);
        },
        flush() {
            const fns = [...pending.values()];
            pending.clear();
            fns.forEach((fn) => fn());
        }
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(code, sandbox);
    return { sandbox, vids, docEl, pending, cleared };
}

test('runSpeedCommand steps every video from the first and shows one toast', () => {
    const page = loadPage([1.5, 2]);
    const result = page.sandbox.runSpeedCommand('speed-up');
    assert.deepStrictEqual(page.vids.map((v) => v.playbackRate), [1.75, 1.75]);
    // The runner runs in a vm, so copy the result into this realm before comparing.
    assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), { speed: 1.75, text: '1.75x', badge: '1.75' });
    assert.strictEqual(page.docEl.childNodes.length, 1);
    const toast = page.sandbox.__cpsOverlay;
    assert.strictEqual(toast.textContent, '1.75x');
    assert.strictEqual(toast.attributes['data-custom-playback-speed'], '1');
    assert.match(toast.style.cssText, /pointer-events:none/);
    page.sandbox.flush();
    assert.strictEqual(toast.style.opacity, '0');
    assert.strictEqual(page.docEl.childNodes.length, 1);
    page.sandbox.flush();
    assert.strictEqual(page.docEl.childNodes.length, 0);
    assert.strictEqual(page.sandbox.__cpsOverlay, null);
});

test('a second step replaces the toast instead of leaking nodes', () => {
    const page = loadPage([1]);
    page.sandbox.runSpeedCommand('speed-up');
    const first = page.sandbox.__cpsOverlay;
    page.sandbox.runSpeedCommand('speed-up');
    assert.strictEqual(page.vids[0].playbackRate, 1.5);
    assert.strictEqual(first.parentNode, null);
    assert.strictEqual(page.docEl.childNodes.length, 1);
    assert.notStrictEqual(page.sandbox.__cpsOverlay, first);
    assert.ok(page.cleared.length >= 1);
    page.sandbox.flush();
    page.sandbox.flush();
    assert.strictEqual(page.docEl.childNodes.length, 0);
});

test('reset sets 1x on every video', () => {
    const page = loadPage([1.75, 0.5]);
    const result = page.sandbox.runSpeedCommand('speed-reset');
    assert.deepStrictEqual(page.vids.map((v) => v.playbackRate), [1, 1]);
    assert.strictEqual(result.text, '1x');
    assert.strictEqual(result.badge, '1x');
});

test('no video shows a No video toast and does not throw', () => {
    const page = loadPage([]);
    const result = page.sandbox.runSpeedCommand('speed-down');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), { speed: null, text: 'No video', badge: '' });
    assert.strictEqual(page.sandbox.__cpsOverlay.textContent, 'No video');
    page.sandbox.flush();
    page.sandbox.flush();
    assert.strictEqual(page.docEl.childNodes.length, 0);
});

test('holding the limit still confirms the speed', () => {
    const page = loadPage([16]);
    const result = page.sandbox.runSpeedCommand('speed-up');
    assert.strictEqual(page.vids[0].playbackRate, 16);
    assert.strictEqual(result.text, '16x');
});

test('runSpeedCommand applies a stored step and clamp', () => {
    const page = loadPage([1, 1]);
    const result = page.sandbox.runSpeedCommand('speed-up', { speedStep: 0.5, minSpeed: 0.25, maxSpeed: 1.4 });
    assert.deepStrictEqual(page.vids.map((v) => v.playbackRate), [1.4, 1.4]);
    assert.strictEqual(result.text, '1.4x');
    const again = loadPage([1]);
    const fallback = again.sandbox.runSpeedCommand('speed-up', { speedStep: 'nope', minSpeed: 0, maxSpeed: 99 });
    assert.strictEqual(again.vids[0].playbackRate, 1.25);
    assert.strictEqual(fallback.text, '1.25x');
});

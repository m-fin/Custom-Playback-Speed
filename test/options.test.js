// Options page against a fake document and chrome.storage. No browser required.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const speed = require('../speed.js');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'options.html'), 'utf8');
const code = fs.readFileSync(path.join(root, 'options.js'), 'utf8');

test('options page lists the same steps speed.js accepts', () => {
    for (const step of speed.STEP_CHOICES) {
        const value = String(step).replace(/[.]/g, '\\.');
        assert.match(html, new RegExp('<option value="' + value + '"(?:\\s[^>]*)?>'));
    }
    assert.match(html, /src="speed\.js"/);
    assert.match(html, /src="options\.js"/);
    assert.match(html, /id="min-speed"/);
    assert.match(html, /id="max-speed"/);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/);
});

function mount(stored, options = {}) {
    const elements = {
        'speed-step': { value: '0.25', textContent: '' },
        'min-speed': { value: '', textContent: '' },
        'max-speed': { value: '', textContent: '' },
        status: { value: '', textContent: '' }
    };
    const form = {
        handler: null,
        addEventListener(type, fn) {
            if (type === 'submit') this.handler = fn;
        }
    };
    const sets = [];
    const chrome = {
        storage: {
            sync: {
                get: async () => {
                    if (options.getError) throw new Error(options.getError);
                    return stored || {};
                },
                set: async (value) => {
                    if (options.setError) throw new Error(options.setError);
                    sets.push(JSON.parse(JSON.stringify(value)));
                }
            }
        }
    };
    const sandbox = {
        Promise, Object, Number, String, Math, isFinite,
        CustomPlaybackSpeed: speed,
        document: {
            getElementById(id) {
                if (id === 'options') return form;
                return elements[id];
            }
        },
        chrome
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(code, sandbox);
    return { elements, form, sets };
}

async function settle() {
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

test('loading empty storage shows the defaults', async () => {
    const page = mount({});
    await settle();
    assert.strictEqual(page.elements['speed-step'].value, '0.25');
    assert.strictEqual(page.elements['min-speed'].value, '0.0625');
    assert.strictEqual(page.elements['max-speed'].value, '16');
    assert.strictEqual(page.elements.status.textContent, '');
});

test('loading saved settings fills the form, and invalid values become defaults', async () => {
    const page = mount({ speedStep: 0.5, minSpeed: 1, maxSpeed: 4 });
    await settle();
    assert.strictEqual(page.elements['speed-step'].value, '0.5');
    assert.strictEqual(page.elements['min-speed'].value, '1');
    assert.strictEqual(page.elements['max-speed'].value, '4');

    const bad = mount({ speedStep: 'nope', minSpeed: -5, maxSpeed: 99 });
    await settle();
    assert.strictEqual(bad.elements['speed-step'].value, '0.25');
    assert.strictEqual(bad.elements['min-speed'].value, '0.0625');
    assert.strictEqual(bad.elements['max-speed'].value, '16');
});

test('a storage read failure shows the defaults', async () => {
    const page = mount({}, { getError: 'denied' });
    await settle();
    assert.strictEqual(page.elements['speed-step'].value, '0.25');
    assert.match(page.elements.status.textContent, /Could not load/);
});

test('clearing a limit saves the default for that field', async () => {
    const page = mount({});
    await settle();
    page.elements['min-speed'].value = '';
    page.elements['max-speed'].value = '4';
    await page.form.handler({ preventDefault() {} });
    assert.deepStrictEqual(page.sets, [{ speedStep: 0.25, minSpeed: 0.0625, maxSpeed: 4 }]);
    assert.strictEqual(page.elements['min-speed'].value, '0.0625');
});

test('saving writes the chosen step and limits', async () => {
    const page = mount({});
    await settle();
    page.elements['speed-step'].value = '0.1';
    page.elements['min-speed'].value = '0.5';
    page.elements['max-speed'].value = '2';
    let prevented = false;
    await page.form.handler({ preventDefault() { prevented = true; } });
    assert.strictEqual(prevented, true);
    assert.deepStrictEqual(page.sets, [{ speedStep: 0.1, minSpeed: 0.5, maxSpeed: 2 }]);
    assert.strictEqual(page.elements.status.textContent, 'Saved.');
    assert.strictEqual(page.elements['min-speed'].value, '0.5');
});

test('saving rounds a drifted limit and accepts a comma', async () => {
    const page = mount({});
    await settle();
    page.elements['speed-step'].value = '0.05';
    page.elements['min-speed'].value = '1.2500000001';
    page.elements['max-speed'].value = '3,5';
    await page.form.handler({ preventDefault() {} });
    assert.deepStrictEqual(page.sets, [{ speedStep: 0.05, minSpeed: 1.25, maxSpeed: 3.5 }]);
    assert.strictEqual(page.elements['min-speed'].value, '1.25');
    assert.strictEqual(page.elements['max-speed'].value, '3.5');
});

test('an out-of-range limit is not written', async () => {
    const page = mount({ speedStep: 0.25, minSpeed: 0.5, maxSpeed: 2 });
    await settle();
    page.elements['min-speed'].value = '0';
    page.elements['max-speed'].value = '20';
    await page.form.handler({ preventDefault() {} });
    assert.deepStrictEqual(page.sets, []);
    assert.match(page.elements.status.textContent, /0\.0625/);
    assert.match(page.elements.status.textContent, /16/);
    assert.strictEqual(page.elements['min-speed'].value, '0');
});

test('a minimum above the maximum is not written', async () => {
    const page = mount({});
    await settle();
    page.elements['min-speed'].value = '4';
    page.elements['max-speed'].value = '1';
    await page.form.handler({ preventDefault() {} });
    assert.deepStrictEqual(page.sets, []);
    assert.match(page.elements.status.textContent, /minimum/i);
});

test('a storage write failure leaves a message and does not claim success', async () => {
    const page = mount({}, { setError: 'quota' });
    await settle();
    page.elements['min-speed'].value = '0.5';
    page.elements['max-speed'].value = '4';
    await page.form.handler({ preventDefault() {} });
    assert.deepStrictEqual(page.sets, []);
    assert.match(page.elements.status.textContent, /Could not save/);
});

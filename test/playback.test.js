// Runs playback.js and the bookmarklet against a fake page. No dependencies:
//   node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const scripts = {
    'playback.js': fs.readFileSync(path.join(root, 'playback.js'), 'utf8'),
    bookmarklet: fs.readFileSync(path.join(root, 'bookmarklet/bookmarklet-condensed.js'), 'utf8').replace(/^javascript:/, '')
};

function run(code, { videos = 1, answer = '2', paused = true } = {}) {
    const vids = Array.from({ length: videos }, () => {
        let rate = 1;
        return {
            paused,
            get playbackRate() { return rate; },
            set playbackRate(r) {
                if (!(r >= 0.0625 && r <= 16)) throw new Error('NotSupportedError: ' + r);
                rate = r;
            }
        };
    });
    const alerts = [];
    const prompts = [];
    const ctx = {
        document: { querySelectorAll: (sel) => (sel === 'video' ? vids : []) },
        prompt: (msg, def) => { prompts.push(def); return answer; },
        alert: (m) => alerts.push(m),
        String, parseFloat, isFinite, Array
    };
    vm.runInNewContext(code, ctx);
    return { rates: vids.map((v) => v.playbackRate), alerts, prompts };
}

for (const [name, code] of Object.entries(scripts)) {
    test(`${name}: sets every video`, () => {
        assert.deepStrictEqual(run(code, { videos: 2, answer: '2.5' }).rates, [2.5, 2.5]);
    });
    test(`${name}: accepts "1,5" and "3x"`, () => {
        assert.deepStrictEqual(run(code, { answer: '1,5' }).rates, [1.5]);
        assert.deepStrictEqual(run(code, { answer: '3x' }).rates, [3]);
    });
    test(`${name}: cancel or empty leaves speed alone`, () => {
        assert.deepStrictEqual(run(code, { answer: null }).rates, [1]);
        assert.deepStrictEqual(run(code, { answer: '  ' }).rates, [1]);
    });
    test(`${name}: rejects out-of-range and junk without throwing`, () => {
        for (const a of ['0', '20', 'fast', '-1']) {
            const r = run(code, { answer: a });
            assert.deepStrictEqual(r.rates, [1]);
            assert.strictEqual(r.alerts.length, 1);
        }
    });
    test(`${name}: no video shows a message`, () => {
        const r = run(code, { videos: 0 });
        assert.strictEqual(r.alerts[0], 'No video found on this page.');
    });
    test(`${name}: prompt is prefilled with the current speed`, () => {
        assert.deepStrictEqual(run(code).prompts, ['1']);
    });
}

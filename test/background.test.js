// background.js with a fake chrome API: injection works on normal pages, and blocked pages get a badge.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function load({ inject }) {
    const calls = [];
    const listeners = {};
    const action = {};
    for (const fn of ['setBadgeText', 'setBadgeBackgroundColor', 'setTitle']) {
        action[fn] = async (arg) => { calls.push([fn, JSON.parse(JSON.stringify(arg))]); }; // copy out of the vm realm
    }
    action.onClicked = { addListener: (f) => { listeners.click = f; } };
    const chrome = {
        action,
        tabs: { onUpdated: { addListener: (f) => { listeners.updated = f; } } },
        scripting: { executeScript: async (arg) => { calls.push(['executeScript', JSON.parse(JSON.stringify(arg))]); return inject(arg); } }
    };
    vm.runInNewContext(code, { chrome });
    return { calls, listeners };
}

test('clicking injects playback.js into the clicked tab, no badge', async () => {
    const { calls, listeners } = load({ inject: () => [] });
    await listeners.click({ id: 7 });
    assert.deepStrictEqual(calls, [['executeScript', { target: { tabId: 7 }, files: ['playback.js'] }]]);
});

test('a blocked page (chrome://) shows a "!" badge and explains why, without throwing', async () => {
    const { calls, listeners } = load({ inject: () => { throw new Error('Cannot access a chrome:// URL'); } });
    await listeners.click({ id: 3 });
    const badge = calls.find((c) => c[0] === 'setBadgeText');
    const title = calls.find((c) => c[0] === 'setTitle');
    assert.deepStrictEqual(badge[1], { tabId: 3, text: '!' });
    assert.match(title[1].title, /doesn't let extensions/);
});

test('navigating clears the badge for that tab only', async () => {
    const { calls, listeners } = load({ inject: () => [] });
    listeners.updated(5, { status: 'complete' });
    assert.strictEqual(calls.length, 0);
    listeners.updated(5, { status: 'loading' });
    assert.deepStrictEqual(calls.find((c) => c[0] === 'setBadgeText')[1], { tabId: 5, text: '' });
});

test('manifest: keyboard shortcut opens the action', () => {
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    assert.strictEqual(m.commands._execute_action.suggested_key.default, 'Alt+Shift+S');
    assert.deepStrictEqual(m.permissions, ['activeTab', 'scripting'], 'no new permissions');
});

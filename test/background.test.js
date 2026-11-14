// background.js with a fake chrome API: injection works on normal pages, and blocked pages get a badge.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function load({ inject, tabs } = {}) {
    const calls = [];
    const listeners = {};
    const action = {};
    for (const fn of ['setBadgeText', 'setBadgeBackgroundColor', 'setTitle']) {
        action[fn] = async (arg) => { calls.push([fn, JSON.parse(JSON.stringify(arg))]); }; // copy out of the vm realm
    }
    action.onClicked = { addListener: (f) => { listeners.click = f; } };
    const chrome = {
        action,
        tabs: {
            onUpdated: { addListener: (f) => { listeners.updated = f; } },
            query: async (arg) => {
                calls.push(['tabs.query', JSON.parse(JSON.stringify(arg))]);
                return tabs ? tabs() : [{ id: 9 }];
            }
        },
        commands: { onCommand: { addListener: (f) => { listeners.command = f; } } },
        scripting: {
            executeScript: async (arg) => {
                const recorded = {};
                for (const key of Object.keys(arg)) {
                    recorded[key] = typeof arg[key] === 'function' ? 'function' : arg[key];
                }
                calls.push(['executeScript', JSON.parse(JSON.stringify(recorded))]);
                return inject(arg);
            }
        }
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

test('manifest: step shortcuts stay within the four suggested-key limit', () => {
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    assert.strictEqual(m.version, '0.2.0');
    assert.deepStrictEqual(m.permissions, ['activeTab', 'scripting']);
    const commands = m.commands;
    assert.strictEqual(Object.keys(commands).length, 4, 'Chrome allows at most four suggested keys');
    assert.strictEqual(commands['speed-up'].suggested_key.default, 'Alt+Shift+Period');
    assert.strictEqual(commands['speed-down'].suggested_key.default, 'Alt+Shift+Comma');
    assert.strictEqual(commands['speed-reset'].suggested_key.default, 'Alt+Shift+0');
    for (const command of Object.values(commands)) {
        assert.ok(command.suggested_key && command.suggested_key.default);
        assert.strictEqual(Object.keys(command.suggested_key).length, 1);
    }
});

for (const command of ['speed-up', 'speed-down', 'speed-reset']) {
    test(`command ${command} injects speed.js into the active tab and badges the speed`, async () => {
        const { calls, listeners } = load({
            inject: (arg) => (arg.files ? [] : [{ result: { speed: 1.75, text: '1.75x', badge: '1.75' } }])
        });
        await listeners.command(command);
        assert.deepStrictEqual(calls.find((c) => c[0] === 'tabs.query')[1], { active: true, currentWindow: true });
        const scripts = calls.filter((c) => c[0] === 'executeScript');
        assert.deepStrictEqual(scripts[0][1], { target: { tabId: 9 }, files: ['speed.js'] });
        assert.strictEqual(scripts[1][1].func, 'function');
        assert.deepStrictEqual(scripts[1][1].args, [command]);
        assert.deepStrictEqual(scripts[1][1].target, { tabId: 9 });
        assert.deepStrictEqual(calls.find((c) => c[0] === 'setBadgeText')[1], { tabId: 9, text: '1.75' });
        assert.deepStrictEqual(calls.find((c) => c[0] === 'setBadgeBackgroundColor')[1], { tabId: 9, color: '#202124' });
        assert.strictEqual(calls.find((c) => c[0] === 'setTitle')[1].title, 'Playback speed 1.75x');
        assert.strictEqual(calls.some((c) => c[0] === 'setBadgeText' && c[1].text === '!'), false);
    });
}

test('a speed command on a blocked page shows the same "!" badge', async () => {
    const { calls, listeners } = load({ inject: () => { throw new Error('Cannot access a chrome:// URL'); } });
    await listeners.command('speed-up');
    const badge = calls.find((c) => c[0] === 'setBadgeText');
    const title = calls.find((c) => c[0] === 'setTitle');
    assert.deepStrictEqual(badge[1], { tabId: 9, text: '!' });
    assert.match(title[1].title, /doesn't let extensions/);
    assert.strictEqual(calls.filter((c) => c[0] === 'executeScript').length, 1);
});

test('a speed command with no video clears the badge instead of alerting', async () => {
    const { calls, listeners } = load({
        inject: (arg) => (arg.files ? [] : [{ result: { speed: null, text: 'No video', badge: '' } }])
    });
    await listeners.command('speed-down');
    assert.deepStrictEqual(calls.find((c) => c[0] === 'setBadgeText')[1], { tabId: 9, text: '' });
    assert.strictEqual(calls.some((c) => c[0] === 'setBadgeText' && c[1].text === '!'), false);
    assert.strictEqual(calls.some((c) => c[0] === 'setBadgeBackgroundColor'), false);
});

test('a speed command with no active tab does nothing', async () => {
    const { calls, listeners } = load({ inject: () => [], tabs: () => [] });
    await listeners.command('speed-reset');
    assert.strictEqual(calls.some((c) => c[0] === 'executeScript'), false);
});

test('an unknown command is ignored', async () => {
    const { calls, listeners } = load({ inject: () => [] });
    await listeners.command('something-else');
    assert.deepStrictEqual(calls, []);
});

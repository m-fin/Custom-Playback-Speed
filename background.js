// Clicking the toolbar button (or pressing Alt+Shift+S) runs playback.js in the current tab.
// The step shortcuts (speed up, slow down, reset) run speed.js instead, with no prompt.
// Chrome blocks extensions on some pages (chrome://, the Chrome Web Store, the New Tab page, PDFs).
// There, show a "!" badge with an explanation instead of failing silently.
// A keyboard command grants activeTab, so scripting.executeScript needs no extra permission.
const BLOCKED_TITLE = "Chrome doesn't let extensions change videos on this page";
const DEFAULT_TITLE = 'Set playback speed';
const SPEED_COMMANDS = { 'speed-up': true, 'speed-down': true, 'speed-reset': true };

async function showBlocked(tabId) {
    await chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#b00020' });
    await chrome.action.setBadgeText({ tabId: tabId, text: '!' });
    await chrome.action.setTitle({ tabId: tabId, title: BLOCKED_TITLE });
}

async function setSpeed(tab) {
    try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['playback.js'] });
    } catch (err) {
        await showBlocked(tab.id);
    }
}

chrome.action.onClicked.addListener(setSpeed);

// The badge belongs to the page that blocked us: clear it when the tab navigates.
chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading') {
        chrome.action.setBadgeText({ tabId, text: '' });
        chrome.action.setTitle({ tabId, title: DEFAULT_TITLE });
    }
});

async function nudgeSpeed(tab, command) {
    try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['speed.js'] });
        const injected = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: function (command) {
                var run = globalThis.runSpeedCommand;
                return run ? run(command) : { speed: null, text: '', badge: '' };
            },
            args: [command]
        });
        const result = injected && injected[0] && injected[0].result;
        if (result && typeof result.speed === 'number') {
            await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#202124' });
            if (chrome.action.setBadgeTextColor) {
                await chrome.action.setBadgeTextColor({ tabId: tab.id, color: '#ffffff' });
            }
            await chrome.action.setBadgeText({ tabId: tab.id, text: String(result.badge || '').slice(0, 4) });
            await chrome.action.setTitle({ tabId: tab.id, title: 'Playback speed ' + (result.text || result.speed) });
        } else if (result && result.text === 'No video') {
            await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
            await chrome.action.setTitle({ tabId: tab.id, title: DEFAULT_TITLE });
        }
    } catch (err) {
        await showBlocked(tab.id);
    }
}

chrome.commands.onCommand.addListener(async function (command) {
    if (!SPEED_COMMANDS[command]) return;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) return;
    await nudgeSpeed(tab, command);
});

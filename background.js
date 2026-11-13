// Clicking the toolbar button (or pressing the shortcut) runs playback.js in the current tab.
// Chrome blocks extensions on some pages (chrome://, the Chrome Web Store, the New Tab page, PDFs).
// There, show a "!" badge with an explanation instead of failing silently.
const BLOCKED_TITLE = "Chrome doesn't let extensions change videos on this page";

async function setSpeed(tab) {
    try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['playback.js'] });
    } catch (err) {
        await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#b00020' });
        await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
        await chrome.action.setTitle({ tabId: tab.id, title: BLOCKED_TITLE });
    }
}

chrome.action.onClicked.addListener(setSpeed);

// The badge belongs to the page that blocked us: clear it when the tab navigates.
chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading') {
        chrome.action.setBadgeText({ tabId, text: '' });
        chrome.action.setTitle({ tabId, title: 'Set playback speed' });
    }
});

// Clicking the toolbar button runs playback.js in the current tab.
chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['playback.js']
    });
});

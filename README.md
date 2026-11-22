# Custom-Playback-Speed
Chrome extension that allows you to set the playback speed of any video in your browser to whatever you want.

![Screenshot](demo/screenshot800.png)

Click the toolbar button, type a speed (for example `1.75`, `2,5` or `3x`), and every video on the page switches to it. The prompt starts with the current speed. Chrome allows speeds from 0.0625 to 16.

Keyboard shortcuts (change any of them at `chrome://extensions/shortcuts`):

- **Alt+Shift+S**: prompt for a speed
- **Alt+Shift+Period**: speed up by one step (0.25 by default)
- **Alt+Shift+Comma**: slow down by one step (0.25 by default)
- **Alt+Shift+0**: reset to 1x

The step shortcuts start from the first video's current speed and apply the result to every video on the page, staying inside your minimum and maximum (0.0625–16 by default). A small overlay shows the new speed (for example `1.75x`) for about a second. The toolbar badge shows that speed, shortened to four characters when it has to. If the page has no video, the overlay says **No video**. On pages where Chrome doesn't let extensions run (like `chrome://` pages, the Chrome Web Store and the New Tab page), the button shows a red **!** and its tooltip explains why.

## Options
Right-click the toolbar button and choose **Options**, or open this extension's details at `chrome://extensions`.

- **Speed step**: `0.05`, `0.1`, `0.25`, or `0.5`. The default is `0.25`, which is what the shortcuts do until you change it.
- **Minimum and maximum**: optional tighter limits for those shortcuts. The defaults are `0.0625` and `16`. That is the range Chrome allows for playback rate, the same bounds the prompt and the step math already use. A rate outside it raises `NotSupportedError`. Leave these at the defaults if you only want to change the step.

A saved value that is not one of those steps, that is not a number, that sits outside 0.0625–16, or that puts the minimum above the maximum is ignored and that field falls back to its default. Settings are stored with `chrome.storage.sync` and apply the next time you use a step shortcut. The only permission added for this is `storage`. The extension still has no host permissions.

The toolbar prompt is unchanged and still accepts any speed from 0.0625 to 16. Reset targets 1x, or the nearest configured limit when 1x is outside it.

[Chrome Webstore Link](https://chrome.google.com/webstore/detail/custom-playback-speed/giolnpkidakdmghddhlikfjbakcgejld)

## Install from source
1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder.

Uses Manifest V3 (`activeTab`, `scripting`, and `storage`). It only runs in the tab you click, or the active tab when you press a shortcut.

## Bookmarklet
Or, get it in bookmarklet form. Just paste the following into the "URL" section of a chrome bookmark link:

```
javascript:(function(){var v=[].slice.call(document.querySelectorAll('video'));if(!v.length){alert('No video found on this page.');return}var x=prompt('Speed? (0.0625 to 16)',String(v[0].playbackRate));if(x===null||x.trim()==='')return;var s=parseFloat(x.trim().replace(',','.').replace(/x$/i,''));if(!isFinite(s)||s<0.0625||s>16){alert('Please enter a number from 0.0625 to 16.');return}v.forEach(function(e){e.playbackRate=s})})();
```

## Tests
```sh
node --test test/*.test.js
```

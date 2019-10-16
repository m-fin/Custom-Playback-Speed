# Custom-Playback-Speed
Chrome extension that allows you to set the playback speed of any video in your browser to whatever you want.

[Chrome Webstore Link](www.google.com)

Or, get it in bookmarklet form. Just paste the following into the "URL" section of a chrome bookmark link:

__javascript: function func() { var x = prompt("Speed?"); if (x != "") { document.getElementsByTagName("video")[0].playbackRate = x; } }; func();__
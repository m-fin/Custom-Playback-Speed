(function () {
    var videos = Array.prototype.slice.call(document.querySelectorAll('video'));
    if (!videos.length) { alert('No video found on this page.'); return; }
    var x = prompt('Speed? (0.0625 to 16)', String(videos[0].playbackRate));
    if (x === null || x.trim() === '') { return; }
    var s = parseFloat(x.trim().replace(',', '.').replace(/x$/i, ''));
    if (!isFinite(s) || s < 0.0625 || s > 16) { alert('Please enter a number from 0.0625 to 16.'); return; }
    videos.forEach(function (v) { v.playbackRate = s; });
})();

// Asks for a speed and applies it to every <video> on the page.
// Chrome supports playback rates from 0.0625 to 16.
(function () {
    var MIN = 0.0625, MAX = 16;
    var videos = Array.prototype.slice.call(document.querySelectorAll('video'));
    if (!videos.length) {
        alert('No video found on this page.');
        return;
    }
    var playing = videos.filter(function (v) { return !v.paused; })[0];
    var current = (playing || videos[0]).playbackRate;
    var input = prompt('Speed? (' + MIN + ' to ' + MAX + ')', String(current));
    if (input === null || input.trim() === '') {
        return; // cancelled or left empty: keep the current speed
    }
    var speed = parseFloat(input.trim().replace(',', '.').replace(/x$/i, ''));
    if (!isFinite(speed) || speed < MIN || speed > MAX) {
        alert('Please enter a number from ' + MIN + ' to ' + MAX + '.');
        return;
    }
    videos.forEach(function (v) { v.playbackRate = speed; });
})();

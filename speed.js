// Playback-speed math plus the in-page runner for the step shortcuts.
// Injected into the tab (it installs itself on globalThis) and required by the node tests.
(function (root) {
    var MIN_SPEED = 0.0625;
    var MAX_SPEED = 16;
    var SPEED_STEP = 0.25;
    // Four decimal places keeps 0.0625 and 0.25 steps exact and folds binary
    // noise such as 1.2500000001 back to 1.25.
    var ROUND_PLACES = 10000;
    var OVERLAY_MS = 1000;
    var FADE_MS = 200;

    function roundSpeed(speed) {
        var n = Number(speed);
        if (!isFinite(n)) return n;
        return Math.round(n * ROUND_PLACES) / ROUND_PLACES;
    }

    function clampSpeed(speed) {
        var n = roundSpeed(speed);
        if (!isFinite(n)) return 1;
        if (n < MIN_SPEED) return MIN_SPEED;
        if (n > MAX_SPEED) return MAX_SPEED;
        return n;
    }

    function stepSpeed(current, delta) {
        var base = roundSpeed(current);
        if (!isFinite(base)) base = 1;
        return clampSpeed(base + Number(delta));
    }

    function formatSpeed(speed) {
        var n = clampSpeed(speed);
        return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + 'x';
    }

    // Toolbar badges show about four characters. Prefer "1.5x"; drop the x,
    // then extra decimals, when the full label does not fit.
    function badgeText(speed) {
        var label = formatSpeed(speed);
        if (label.length <= 4) return label;
        var bare = label.slice(0, -1);
        if (bare.length <= 4) return bare;
        var n = clampSpeed(speed);
        for (var places = 2; places >= 0; places--) {
            var text = n.toFixed(places);
            if (text.length <= 4) return text;
        }
        return String(Math.round(n)).slice(0, 4);
    }

    // command is 'speed-up', 'speed-down', or 'speed-reset'.
    // The step is applied to the current rate (the first video); reset ignores it.
    function nextSpeed(current, command) {
        if (command === 'speed-reset') return 1;
        if (command === 'speed-up') return stepSpeed(current, SPEED_STEP);
        if (command === 'speed-down') return stepSpeed(current, -SPEED_STEP);
        return null;
    }

    function dismissOverlay() {
        var el = root.__cpsOverlay;
        if (!el) return;
        if (el._cpsFade) clearTimeout(el._cpsFade);
        if (el._cpsRemove) clearTimeout(el._cpsRemove);
        el._cpsFade = null;
        el._cpsRemove = null;
        if (el.parentNode) el.parentNode.removeChild(el);
        if (root.__cpsOverlay === el) root.__cpsOverlay = null;
    }

    // Best-effort toast. Failures here must not undo a speed change or leak nodes.
    function showSpeedOverlay(text) {
        try {
            if (typeof document === 'undefined' || !document.documentElement || !document.createElement) return;
            if (typeof setTimeout !== 'function') return;
            dismissOverlay();
            var el = document.createElement('div');
            el.setAttribute('data-custom-playback-speed', '1');
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            el.textContent = text;
            var decls = [
                'all:initial',
                'display:block',
                'position:fixed',
                'top:12px',
                'left:50%',
                'transform:translateX(-50%)',
                'z-index:2147483647',
                'width:max-content',
                'max-width:80vw',
                'box-sizing:border-box',
                'margin:0',
                'background:rgba(32,33,36,0.92)',
                'color:#fff',
                'font-family:system-ui,-apple-system,Segoe UI,sans-serif',
                'font-size:14px',
                'font-weight:600',
                'line-height:1.2',
                'padding:8px 12px',
                'border-radius:8px',
                'pointer-events:none',
                'white-space:nowrap',
                'opacity:1',
                'transition:opacity 180ms ease'
            ];
            // Inline !important so a page stylesheet cannot restyle or hide the toast.
            el.style.cssText = decls.join(';');
            if (typeof el.style.setProperty === 'function') {
                decls.forEach(function (decl) {
                    var split = decl.indexOf(':');
                    el.style.setProperty(decl.slice(0, split).trim(), decl.slice(split + 1).trim(), 'important');
                });
            }
            document.documentElement.appendChild(el);
            root.__cpsOverlay = el;
            el._cpsFade = setTimeout(function () {
                if (typeof el.style.setProperty === 'function') el.style.setProperty('opacity', '0', 'important');
                else el.style.opacity = '0';
                el._cpsRemove = setTimeout(dismissOverlay, FADE_MS);
            }, OVERLAY_MS);
        } catch (err) {
            // The page is still usable without the toast.
        }
    }

    // Reads the first <video>, writes every video, and shows a short toast.
    // Returns { speed, text, badge } for the service worker. speed is null
    // when there is nothing to change.
    function runSpeedCommand(command) {
        var videos = Array.prototype.slice.call(document.querySelectorAll('video'));
        if (!videos.length) {
            showSpeedOverlay('No video');
            return { speed: null, text: 'No video', badge: '' };
        }
        var speed = nextSpeed(videos[0].playbackRate, command);
        if (speed == null) return { speed: null, text: '', badge: '' };
        videos.forEach(function (video) { video.playbackRate = speed; });
        var text = formatSpeed(speed);
        showSpeedOverlay(text);
        return { speed: speed, text: text, badge: badgeText(speed) };
    }

    var api = {
        MIN_SPEED: MIN_SPEED,
        MAX_SPEED: MAX_SPEED,
        SPEED_STEP: SPEED_STEP,
        roundSpeed: roundSpeed,
        clampSpeed: clampSpeed,
        stepSpeed: stepSpeed,
        formatSpeed: formatSpeed,
        badgeText: badgeText,
        nextSpeed: nextSpeed,
        runSpeedCommand: runSpeedCommand,
        showSpeedOverlay: showSpeedOverlay,
        dismissOverlay: dismissOverlay
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.CustomPlaybackSpeed = api;
    root.runSpeedCommand = runSpeedCommand;
})(typeof globalThis !== 'undefined' ? globalThis : this);

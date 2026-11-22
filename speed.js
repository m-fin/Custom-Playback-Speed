// Playback-speed math plus the in-page runner for the step shortcuts.
// Injected into the tab (it installs itself on globalThis) and required by the node tests.
// Chrome's playbackRate is 0.0625–16; anything outside that throws NotSupportedError.
(function (root) {
    var MIN_SPEED = 0.0625;
    var MAX_SPEED = 16;
    var SPEED_STEP = 0.25;
    // Four decimal places keeps 0.0625 and the step choices exact and folds binary
    // noise such as 1.2500000001 back to 1.25.
    var ROUND_PLACES = 10000;
    var STEP_CHOICES = [0.05, 0.1, SPEED_STEP, 0.5];
    var OVERLAY_MS = 1000;
    var FADE_MS = 200;
    if (typeof Object !== 'undefined' && Object.freeze) STEP_CHOICES = Object.freeze(STEP_CHOICES);

    function roundSpeed(speed) {
        var n = Number(speed);
        if (!isFinite(n)) return n;
        return Math.round(n * ROUND_PLACES) / ROUND_PLACES;
    }

    // Numbers pass through. Strings accept "1,5" and "3x", matching the prompt.
    // Anything else (objects, booleans) is not a stored speed.
    function parseSpeed(value) {
        if (typeof value === 'number') return value;
        if (typeof value !== 'string') return NaN;
        var text = value.trim().replace(',', '.').replace(/x$/i, '').trim();
        if (text === '') return NaN;
        return Number(text);
    }

    function pick(source, keys) {
        for (var i = 0; i < keys.length; i++) {
            var value = source[keys[i]];
            if (value != null && value !== '') return value;
        }
        return undefined;
    }

    function normalizeStep(value) {
        if (value == null || value === '') return SPEED_STEP;
        var n = roundSpeed(parseSpeed(value));
        if (!isFinite(n)) return SPEED_STEP;
        for (var i = 0; i < STEP_CHOICES.length; i++) {
            if (n === STEP_CHOICES[i]) return STEP_CHOICES[i];
        }
        return SPEED_STEP;
    }

    function normalizeBound(value, fallback) {
        if (value == null || value === '') return fallback;
        var n = roundSpeed(parseSpeed(value));
        if (!isFinite(n) || n < MIN_SPEED || n > MAX_SPEED) return fallback;
        return n;
    }

    // Stored shape is { speedStep, minSpeed, maxSpeed }. { step, min, max } is
    // accepted too, so resolving a result again is a no-op. An unknown step,
    // a non-number, a bound outside 0.0625–16, or a minimum above the maximum
    // falls back to that field's default (both bounds, when the range is reversed).
    function resolveSettings(stored) {
        var src = stored && typeof stored === 'object' ? stored : {};
        var step = normalizeStep(pick(src, ['speedStep', 'step']));
        var min = normalizeBound(pick(src, ['minSpeed', 'min']), MIN_SPEED);
        var max = normalizeBound(pick(src, ['maxSpeed', 'max']), MAX_SPEED);
        if (min > max) {
            min = MIN_SPEED;
            max = MAX_SPEED;
        }
        return { step: step, min: min, max: max };
    }

    // Empty means "use the default" and is not an adjustment. A provided value
    // that resolveSettings did not keep is one.
    function explicitlyDiffers(raw, resolved) {
        if (raw == null) return false;
        if (typeof raw === 'string' && raw.trim() === '') return false;
        return roundSpeed(parseSpeed(raw)) !== resolved;
    }

    function explainSettings(stored) {
        var settings = resolveSettings(stored);
        var src = stored && typeof stored === 'object' ? stored : {};
        var adjusted = explicitlyDiffers(pick(src, ['speedStep', 'step']), settings.step)
            || explicitlyDiffers(pick(src, ['minSpeed', 'min']), settings.min)
            || explicitlyDiffers(pick(src, ['maxSpeed', 'max']), settings.max);
        return { settings: settings, adjusted: adjusted };
    }

    function clampSpeed(speed, limits) {
        var bounds = resolveSettings(limits);
        var n = roundSpeed(speed);
        if (!isFinite(n)) n = 1;
        if (n < bounds.min) return bounds.min;
        if (n > bounds.max) return bounds.max;
        return n;
    }

    function stepSpeed(current, delta, limits) {
        var base = roundSpeed(current);
        if (!isFinite(base)) base = 1;
        return clampSpeed(base + Number(delta), limits);
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
    // stored is the options object (or null for the defaults). The step is
    // applied to the current rate; reset targets 1x, then the same clamp.
    function nextSpeed(current, command, stored) {
        if (command !== 'speed-reset' && command !== 'speed-up' && command !== 'speed-down') return null;
        var settings = resolveSettings(stored);
        if (command === 'speed-reset') return clampSpeed(1, settings);
        var delta = command === 'speed-up' ? settings.step : -settings.step;
        return stepSpeed(current, delta, settings);
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
    function runSpeedCommand(command, stored) {
        var videos = Array.prototype.slice.call(document.querySelectorAll('video'));
        if (!videos.length) {
            showSpeedOverlay('No video');
            return { speed: null, text: 'No video', badge: '' };
        }
        var speed = nextSpeed(videos[0].playbackRate, command, stored);
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
        STEP_CHOICES: STEP_CHOICES,
        roundSpeed: roundSpeed,
        resolveSettings: resolveSettings,
        explainSettings: explainSettings,
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

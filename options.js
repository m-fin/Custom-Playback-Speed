// Options page. Reads and writes chrome.storage.sync.
// Step and clamp rules live in speed.js so this file only handles the form.
(function () {
    var api = globalThis.CustomPlaybackSpeed;
    var form = document.getElementById('options');
    var stepEl = document.getElementById('speed-step');
    var minEl = document.getElementById('min-speed');
    var maxEl = document.getElementById('max-speed');
    var statusEl = document.getElementById('status');

    function fill(settings) {
        stepEl.value = String(settings.step);
        minEl.value = String(settings.min);
        maxEl.value = String(settings.max);
    }

    function readForm() {
        return {
            speedStep: stepEl.value,
            minSpeed: minEl.value,
            maxSpeed: maxEl.value
        };
    }

    function show(text) {
        statusEl.textContent = text;
    }

    async function load() {
        try {
            var items = await chrome.storage.sync.get(['speedStep', 'minSpeed', 'maxSpeed']);
            fill(api.resolveSettings(items));
        } catch (err) {
            fill(api.resolveSettings(null));
            show('Could not load saved settings. Showing defaults.');
        }
    }

    async function save(event) {
        event.preventDefault();
        var result = api.explainSettings(readForm());
        if (result.adjusted) {
            show('Enter a step of 0.05, 0.1, 0.25, or 0.5, and limits from '
                + api.MIN_SPEED + ' to ' + api.MAX_SPEED
                + ' with the minimum at or below the maximum.');
            return;
        }
        var settings = result.settings;
        try {
            await chrome.storage.sync.set({
                speedStep: settings.step,
                minSpeed: settings.min,
                maxSpeed: settings.max
            });
            fill(settings);
            show('Saved.');
        } catch (err) {
            show('Could not save settings.');
        }
    }

    form.addEventListener('submit', function (event) {
        return save(event);
    });

    load();
})();

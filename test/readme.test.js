// The README's copy-paste bookmarklet must be exactly bookmarklet/bookmarklet-condensed.js (the tested one).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const condensed = fs.readFileSync(path.join(root, 'bookmarklet/bookmarklet-condensed.js'), 'utf8').trim();

test('README bookmarklet matches bookmarklet-condensed.js', () => {
    const blocks = [...readme.matchAll(/```[a-z]*\n(javascript:[^\n]*)\n```/g)].map((m) => m[1].trim());
    assert.strictEqual(blocks.length, 1, 'expected exactly one javascript: code block in README.md');
    assert.strictEqual(blocks[0], condensed);
});

test('bookmarklet stays a single line that fits in a bookmark URL', () => {
    assert.ok(!condensed.includes('\n'));
    assert.ok(condensed.startsWith('javascript:'));
    assert.ok(condensed.length < 2000, `bookmarklet is ${condensed.length} chars`);
});

test('README documents the speed-step shortcuts and where to change them', () => {
    assert.match(readme, /Alt\+Shift\+S/);
    assert.match(readme, /Alt\+Shift\+Period/);
    assert.match(readme, /Alt\+Shift\+Comma/);
    assert.match(readme, /Alt\+Shift\+0/);
    assert.match(readme, /chrome:\/\/extensions\/shortcuts/);
    assert.match(readme, /0\.25/);
    assert.match(readme, /No video/);
});

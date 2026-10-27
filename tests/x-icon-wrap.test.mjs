/**
 * The X icon before a post link must stay on the line of the link's first word.
 *
 * Line breaking is decided by the browser, so this pins the source facts it
 * depends on. The icon is a plain inline box, not an inline-block, which left
 * a break opportunity after it. Its content is a word joiner, so there is no
 * break between it and the link text. Nothing forces the link onto one line,
 * so a long bare URL still wraps.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the X icon is plain inline and joined to the link text', async () => {
	const text = await readFile(new URL('../src/components/SlidingPanes.astro', import.meta.url), 'utf8');
	const rule = text.match(/a\.x-link::before \{([^}]*)\}/)?.[1];
	assert.ok(rule, 'no a.x-link::before rule');
	assert.match(rule, /content: '\\2060';/);
	assert.doesNotMatch(rule, /display:/);
	assert.doesNotMatch(rule, /white-space/);
	assert.doesNotMatch(text, /a\.x-link \{[^}]*white-space/);
});

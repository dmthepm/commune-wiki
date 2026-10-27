/**
 * The star after a starred link must stay on the line of the link's last word.
 *
 * Line breaking is decided by the browser, so these tests pin the two source
 * facts it depends on. Each star starts with a no-break space, and the star is
 * a plain inline box. Chrome will break before an inline-block even after a
 * no-break space, which left the star alone at the start of the next line.
 * Nothing here forces the link onto one line, so a long title still wraps.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const source = (name) => readFile(new URL(`../src/components/${name}`, import.meta.url), 'utf8');

test('every inline star starts with a no-break space', async () => {
	for (const name of ['StarredLinksScript.astro', 'BacklinksScript.astro']) {
		const text = await source(name);
		const stars = [...text.matchAll(/star\.textContent = '([^']*)'/g)].map((m) => m[1]);
		assert.ok(stars.length > 0, `${name} sets no star text`);
		for (const star of stars) assert.equal(star, '\\u00A0⭐', `${name} star text`);
	}
});

test('the inline star is a plain inline box and nothing forces the link onto one line', async () => {
	const text = await source('HeaderStarScript.astro');
	const rule = text.match(/\.star-indicator-inline \{([^}]*)\}/)?.[1];
	assert.ok(rule, 'no .star-indicator-inline rule');
	assert.match(rule, /display:\s*inline;/);
	for (const name of ['StarredLinksScript.astro', 'BacklinksScript.astro']) {
		assert.doesNotMatch(await source(name), /whiteSpace|white-space/, `${name} sets white-space`);
	}
});

test('the footer card link is inline, so a star after it is not pushed to its own line', async () => {
	const text = await source('HomeFooterCards.astro');
	const rule = text.match(/\.backlinks-list a \{([^}]*)\}/)?.[1];
	assert.ok(rule, 'no .backlinks-list a rule');
	assert.doesNotMatch(rule, /display:\s*(block|flex|grid|inline-block)/);
});

test('no stylesheet rule gives the inline star any display but inline', async () => {
	const root = new URL('../src/', import.meta.url);
	const files = (await readdir(root, { recursive: true })).filter((f) => /\.(astro|css)$/.test(f));
	for (const file of files) {
		const text = await readFile(new URL(file, root), 'utf8');
		for (const [, selector, body] of text.matchAll(/([^{}]*star-indicator-inline[^{}]*)\{([^}]*)\}/g)) {
			const display = body.match(/display:\s*([\w-]+)/)?.[1];
			if (display) assert.equal(display, 'inline', `${file}: ${selector.trim()}`);
		}
	}
});

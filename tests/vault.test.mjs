/**
 * Tests for the graph core against a fixture vault.
 *
 * The two real corpora contain no duplicate titles, no basename/title
 * collisions and (on devon-wiki) no broken links, so the rules that only fire
 * on malformed content have nothing to fire on. This fixture is a minimal
 * project root — a directory containing `src/content` — carrying exactly one
 * instance of each condition the graph is supposed to notice.
 *
 * It also pins the meaning of `--root`: the project root, never the content
 * directory, because slugs and `file` values are both derived from it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentEntries } from '../src/lib/graph.ts';

export const VAULT = fileURLToPath(new URL('./fixtures/vault/', import.meta.url));

test('a root loads content from another project without changing the process cwd', async () => {
	const before = process.cwd();
	const entries = await loadContentEntries({ root: VAULT });

	assert.equal(process.cwd(), before);
	assert.equal(entries.length, 10);
});

test('file paths stay relative to the given root, in POSIX spelling', async () => {
	const entries = await loadContentEntries({ root: VAULT });
	const alpha = entries.find((entry) => entry.title === 'Alpha');

	assert.equal(alpha.file, 'src/content/notes/Alpha.md');
	assert.equal(alpha.urlPath, '/notes/alpha/');
	assert.equal(alpha.slug, 'alpha');
});

test('a trailing separator on the root does not change any path', async () => {
	const withSlash = await loadContentEntries({ root: VAULT });
	const withoutSlash = await loadContentEntries({ root: VAULT.replace(/\/$/, '') });

	assert.deepEqual(
		withoutSlash.map((entry) => entry.file),
		withSlash.map((entry) => entry.file)
	);
});

test('visibility still gates notes when the content is read from a root', async () => {
	const entries = await loadContentEntries({ root: VAULT });

	assert.equal(entries.some((entry) => entry.title === 'Hidden'), false);
});

test('collections keep their scan order across roots', async () => {
	const entries = await loadContentEntries({ root: VAULT });

	assert.deepEqual(
		[...new Set(entries.map((entry) => entry.collection))],
		['notes', 'research', 'pages']
	);
});

test('omitting the root reads the project the process is running in', async () => {
	const implicit = await loadContentEntries();
	const explicit = await loadContentEntries({ root: process.cwd() });

	assert.deepEqual(
		implicit.map((entry) => entry.file),
		explicit.map((entry) => entry.file)
	);
});

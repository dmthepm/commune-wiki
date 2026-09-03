/**
 * Tests for the markdown twin every entry gets at `<url>.md`.
 *
 * Two halves, and they check different things. The unit half pins the pure
 * mapping from a canonical URL to a dist path — cheap, and the only place the
 * home page and a pinned `slug` can be exercised at all, since the engine's own
 * content has neither. The build half is the promise itself: the file served at
 * `/notes/atomic-notes.md` is byte-for-byte the file an author edits, so it is
 * checked by comparing bytes rather than parsed frontmatter — and the rendered
 * page at that URL actually links to it, which is the only assertion that
 * catches a template computing the suffix its own way.
 *
 * `dist-site/` is gitignored, so unlike `public/backlinks.json` there is no committed
 * artifact to read and the build has to be spawned here. It runs once, in a
 * `before` hook, straight from astro's own bin — `pnpm build` would also run the
 * search-index gate, which this file has no business asserting on.
 */

import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadContentEntries, toMarkdownHref, toMarkdownPath, toUrlPath } from '../src/lib/graph.ts';
import { run } from './helpers.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = path.join(ROOT, 'dist-site');

/** Quote a literal for use inside a RegExp — `.` in a path must not match anything. */
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('a note URL becomes a sibling .md file', () => {
	assert.equal(toMarkdownPath('/notes/atomic-notes/'), 'notes/atomic-notes.md');
	assert.equal(toMarkdownPath('/research/why-wikilinks/'), 'research/why-wikilinks.md');
});

test('the home page has no name to suffix, so it becomes index.md', () => {
	assert.equal(toMarkdownPath('/'), 'index.md');
});

test('the href a page links to is the file path with a leading slash', () => {
	assert.equal(toMarkdownHref('/notes/atomic-notes/'), '/notes/atomic-notes.md');
	assert.equal(toMarkdownHref('/about-this-wiki/'), '/about-this-wiki.md');
	assert.equal(toMarkdownHref('/'), '/index.md');
});

test('a standalone page lands at the route it declares', () => {
	const { urlPath } = toUrlPath('src/content/pages/About this wiki.md', 'pages', {
		url: '/about-this-wiki/',
	});

	assert.equal(toMarkdownPath(urlPath), 'about-this-wiki.md');
});

test('a pinned slug moves the .md file with the page', () => {
	const { urlPath } = toUrlPath('src/content/notes/Renamed Later.md', 'notes', {
		slug: 'original-name',
	});

	assert.equal(urlPath, '/notes/original-name/');
	assert.equal(toMarkdownPath(urlPath), 'notes/original-name.md');
});

test('nested content keeps its directories', () => {
	assert.equal(toMarkdownPath('/notes/series/part-one/'), 'notes/series/part-one.md');
});

test('a relative segment is refused rather than normalized', () => {
	// `url` is author-controlled frontmatter, and joining `..` onto the output
	// directory would write outside the build.
	assert.throws(() => toMarkdownPath('/notes/../../etc/passwd/'), /relative segment/);
});

describe('the built site', () => {
	before(async () => {
		const require = createRequire(import.meta.url);
		const manifest = require.resolve('astro/package.json');
		const astro = path.join(path.dirname(manifest), require(manifest).bin.astro);

		await run(process.execPath, [astro, 'build'], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
	});

	test('serves the .md byte-identical to the source file', async () => {
		const built = await readFile(path.join(DIST, 'notes', 'atomic-notes.md'));
		const source = await readFile(path.join(ROOT, 'src/content/notes/Atomic Notes.md'));

		assert.deepEqual(built, source);
	});

	test('links every rendered page to its own markdown twin', async () => {
		const entries = await loadContentEntries();

		for (const entry of entries) {
			// Directory build format: `/notes/x/` renders to `notes/x/index.html`.
			const page = path.join(DIST, entry.urlPath, 'index.html');
			const html = await readFile(page, 'utf8');

			assert.match(
				html,
				new RegExp(`href="${escape(toMarkdownHref(entry.urlPath))}"`),
				`${entry.urlPath} does not link to its .md`
			);
		}
	});

	test('serves every entry the graph sees as markdown too', async () => {
		const entries = await loadContentEntries();

		assert.ok(entries.length > 0);

		for (const entry of entries) {
			const built = await readFile(path.join(DIST, toMarkdownPath(entry.urlPath)));
			const source = await readFile(path.join(ROOT, entry.file));

			assert.deepEqual(built, source, `${entry.urlPath} does not match ${entry.file}`);
		}
	});
});

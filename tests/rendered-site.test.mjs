/**
 * What a reader's browser is actually handed.
 *
 * Every other suite here checks a mechanism in isolation. This one reads the
 * built HTML and asks the question #56 settled on the map: does a page this
 * engine renders reach for anything the build did not produce? The rule it
 * enforces is that ticket's, in one line — *the engine ships no component that
 * calls a URL a stranger does not have* — and the only way to check it is on
 * the output, because a component can be innocent in source and still emit a
 * literal URL into a script tag.
 *
 * The build runs once here, from astro's own bin rather than through
 * `pnpm build`, so the search-index gate's exit code is not this file's
 * problem — the same shape as `tests/markdown-urls.test.mjs`, with one
 * difference that matters: it builds into a temporary `outDir` of its own.
 * `node --test` runs files in parallel, and two Astro builds sharing `dist/`
 * delete each other's prerender chunks mid-run.
 */

import { test, after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { glob, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { run } from './helpers.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Set by the `before` hook; the build's output directory for this run. */
let DIST;

/** Every rendered page, as `[relative path, html]`. */
async function pages() {
	const found = [];
	for await (const file of glob('**/*.html', { cwd: DIST })) {
		found.push([file, await readFile(path.join(DIST, file), 'utf8')]);
	}
	return found.sort(([a], [b]) => a.localeCompare(b));
}

describe('the rendered site', () => {
	before(async () => {
		const require = createRequire(import.meta.url);
		const manifest = require.resolve('astro/package.json');
		const astro = path.join(path.dirname(manifest), require(manifest).bin.astro);

		DIST = await mkdtemp(path.join(tmpdir(), 'commune-rendered-'));
		await run(process.execPath, [astro, 'build', '--outDir', DIST], {
			cwd: ROOT,
			maxBuffer: 16 * 1024 * 1024,
		});
	});

	after(async () => {
		if (DIST) await rm(DIST, { recursive: true, force: true });
	});

	test('the build emits a 404 page, and keeps it out of the index', async () => {
		// Every static host serves this exact filename for an unknown path, so
		// the assertion is on the name as much as on the content: rename it and
		// a mistyped URL falls back to the host's own bare error page.
		const html = await readFile(path.join(DIST, '404.html'), 'utf8');

		assert.match(html, /<meta name="robots" content="noindex"/);
		// One file answers for every unknown URL, so it must not be indexed as a
		// page in its own right either.
		const sitemap = await readFile(path.join(DIST, 'sitemap-0.xml'), 'utf8');
		assert.doesNotMatch(sitemap, /404/);

		// It is a page of the site, not a stub: header, search and a way back.
		assert.match(html, /class="skip-link"/);
		assert.match(html, /id="commune-search"/);
		assert.match(html, /href="\/notes\/"/);
	});

	test('the search modal ships no semantic tier when no page asks for one', async () => {
		const rendered = await pages();
		assert.ok(rendered.length > 0, 'no pages were built');

		for (const [file, html] of rendered) {
			// The endpoint that only ever existed on devon.md. Its absence is the
			// visible half of the fix; the two below are the half that matters,
			// because a renamed endpoint would still be an endpoint.
			assert.doesNotMatch(html, /\/api\/ask/, `${file} still names /api/ask`);

			// With `semanticEndpoint` unset the tier is not rendered at all, so
			// neither the global it defines nor the shape it returns appears.
			assert.doesNotMatch(
				html,
				/window\.CommuneSemanticSearch\s*=\s*async/,
				`${file} defines the semantic tier without being asked to`
			);
			assert.doesNotMatch(
				html,
				/source:\s*'semantic'/,
				`${file} labels results as semantic with no semantic tier to produce them`
			);
		}
	});

	test('every fetch a page makes is for something this build wrote', async () => {
		for (const [file, html] of await pages()) {
			for (const [, url] of html.matchAll(/\bfetch\(\s*[`'"]([^`'"$]*)/g)) {
				assert.ok(
					url.startsWith('/'),
					`${file} fetches ${url || '(a computed URL)'}, which is not a root-relative path`
				);
			}
		}
	});

	test('no page loads a subresource from another origin', async () => {
		// The tags a browser fetches without being asked: scripts, stylesheets,
		// preloads, images, frames. A link in prose is the reader's decision and
		// is not one of these; `<a>` is deliberately absent from the list.
		const subresource = /<(?:script|link|img|iframe|source|video|audio|embed|object)\b[^>]*\b(?:src|href|data|srcset)="([^"]+)"/gi;

		for (const [file, html] of await pages()) {
			for (const [, url] of html.matchAll(subresource)) {
				assert.doesNotMatch(
					url,
					/^(?:https?:)?\/\//,
					`${file} loads ${url} from another origin`
				);
			}
		}
	});

	test('the pane script keeps a link\'s fragment and looks it up inside its own pane', async () => {
		// Every open pane repeats its note's heading ids, so `document.getElementById`
		// would answer from whichever pane came first. The browser check lives in
		// the PR for #61; this pins the three pieces that behaviour rests on.
		const [, html] = (await pages()).find(([file]) => file.startsWith('notes/') && file.endsWith('index.html'));

		assert.match(html, /new URL\(url, window\.location\.origin\)\.hash/);
		assert.match(html, /pane\.querySelector\('#' \+ CSS\.escape\(id\)\)/);
		assert.match(html, /normalizedUrl \+ hash/);
		assert.match(html, /closest\?\.\('\.pane a\[href\^="#"\]'\)/);
		assert.doesNotMatch(html, /document\.getElementById\(id\)/);
		// History navigation follows the fragment too (#113): Back and Forward
		// hand the address bar's hash to the pane, a rebuilt page scrolls to it
		// on load, and re-clicking the current fragment replaces its entry.
		assert.match(html, /focusPane\(panes\[targetIndex\], window\.location\.hash, e\.state\)/);
		assert.match(html, /history\.replaceState\(\{ \.\.\.history\.state, \.\.\.positionOf\(scroller\) \}, ''\)/);
		assert.match(html, /scrollToHash\(firstPane, window\.location\.hash\)/);
		assert.match(html, /history\[alreadyHere \? 'replaceState' : 'pushState'\]/);
	});

	test('the pane script keeps the current entry\'s scroll position, so Forward can restore it', async () => {
		// Back fires popstate after the address bar has moved, so the entry being
		// left can only have its position saved ahead of time: debounced, on the
		// scroll of the pane that owns the current URL (#156).
		const [, html] = (await pages()).find(([file]) => file.startsWith('notes/') && file.endsWith('index.html'));

		assert.match(html, /container\.addEventListener\('scroll', handleScroll, true\)/);
		assert.match(html, /container\.removeEventListener\('scroll', handleScroll, true\)/);
		assert.match(html, /clearTimeout\(scrollTimer\)/);
		assert.match(html, /scroller !== currentScroller\(\)/);
		// A remembered position beats the fragment on a rebuilt page, as in focusPane.
		assert.match(html, /typeof remembered\?\.scrollTop === 'number'/);
		// ...but only once the images have their heights: a pixel offset applied
		// earlier lands on different content, and the error is then saved back.
		assert.match(html, /document\.readyState === 'complete'/);
		assert.match(html, /window\.addEventListener\('load', correct, \{ once: true \}\)/);
		// ...and straight away too, with the load pass skipped once the reader
		// has scrolled, so a slow image cannot undo what they did (#159).
		assert.match(html, /\[\[scroller, 'wheel'\], \[scroller, 'touchmove'\], \[scroller, 'pointerdown'\], \[window, 'keydown'\]\]/);
		assert.match(html, /window\.removeEventListener\('load', correct\)/);
		assert.match(html, /if \(!positionReady \|\|/);
		// The position is an element and an offset, with pixels as the fallback,
		// and Back and Forward restore it the same way.
		assert.match(html, /const positionOf = /);
		assert.match(html, /restorePosition\(pane, position\)/);
		// The same id twice in a pane: the copy is remembered by its place among
		// them and found the same way, never by whichever querySelector hits first.
		assert.match(html, /nth = seen\[el\.id\] = /);
		assert.match(html, /scroller\.querySelectorAll\('\[id="' \+ CSS\.escape\(position\.anchor\) \+ '"\]'\)\[position\.nth \?\? 0\]/);
		assert.match(html, /\.\.\.positionOf\(paneScroller\(previousPane\)\)/);
		// closePane's own saveScroll was overwritten by the replaceState after it.
		const close = html.slice(html.indexOf('const closePane'), html.indexOf('Single Event Delegation'));
		assert.ok(close.includes('history.replaceState'), 'closePane no longer found');
		assert.doesNotMatch(close, /saveScroll\(\)/);
	});
});

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
});

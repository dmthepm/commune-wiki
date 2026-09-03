/**
 * The stranger's *project*: install this package and build a wiki with it.
 *
 * `tests/install.test.mjs` proves the package installs and its bin runs.
 * That is a lower bar than it sounds: it never loads the integration, never
 * renders a `[[WikiLink]]`, and never asks whether `exports` names a path that
 * exists. Every one of those has to work from inside somebody else's
 * `node_modules`, and none of them can be checked from a checkout — where the
 * cwd, the project root and the package root are all the same directory, so
 * three separate mistakes look identical to success.
 *
 * `tests/fixtures/consumer/` is that project, kept as small as a wiki can be:
 * two notes that link each other, one external link, two routes. It depends on
 * the repository through `file:../../..`, which pnpm resolves to a symlink —
 * the same resolution a `github:` install lands on, minus the tarball. What it
 * asserts is the whole contract:
 *
 *   - the remark plugin resolved a wikilink against the *consumer's* content
 *     tree, not this repository's;
 *   - the rehype plugin knew the consumer's `site` and marked the foreign host
 *     external — and left the consumer's own host alone;
 *   - the integration wrote `backlinks.json` into the consumer's `dist`, with
 *     both directions of the edge;
 *   - the `.md` beside the page is the source file, byte for byte;
 *   - and the search modal's semantic tier stays absent unless a page asks for
 *     it — the one assertion here that reads a second route, because proving
 *     the opt-in is a seam takes a project on both sides of it.
 *
 * It is the slowest test here after `install.test.mjs`: pnpm installs Astro
 * into the fixture and Astro builds it.
 *
 * `dist/404.html` is deliberately not asserted. The engine has no 404 route
 * to give a consumer yet; that is #36.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FIXTURE = path.join(ROOT, 'tests/fixtures/consumer');
const DIST = path.join(FIXTURE, 'dist');

/**
 * Run a command, and on failure throw an error that *says what it printed*.
 *
 * Same reasoning as `install.test.mjs`: an install or an Astro build that
 * fails with an exit code and nothing else costs a round trip to diagnose.
 * `maxBuffer` is raised because a full Astro install overflows the 1 MB
 * default and takes the real output with it.
 */
async function sh(command, args, options = {}) {
	try {
		return await execFileAsync(command, args, {
			maxBuffer: 32 * 1024 * 1024,
			cwd: FIXTURE,
			...options,
		});
	} catch (error) {
		const parts = [`${command} ${args.join(' ')} (in ${options.cwd ?? FIXTURE}) exited ${error.code ?? '?'}`];
		if (error.stdout?.trim()) parts.push(`stdout:\n${error.stdout.trim()}`);
		if (error.stderr?.trim()) parts.push(`stderr:\n${error.stderr.trim()}`);
		throw new Error(parts.join('\n'), { cause: error });
	}
}

test('a consumer project installs this package and builds a wiki with it', async () => {
	// The fixture links to the repository as it is on disk, so it loads `lib/`
	// rather than building it — `file:` dependencies do not run `prepare`.
	// Said here rather than left to `ERR_MODULE_NOT_FOUND` four minutes into an
	// Astro build. `pretest` builds it for `pnpm test`; a direct
	// `node --test tests/consumer.test.mjs` does not.
	const compiled = path.join(ROOT, 'lib/integration.js');
	try {
		await stat(compiled);
	} catch {
		assert.fail(`${compiled} is missing. Run \`pnpm build:lib\` first.`);
	}

	// A stale `dist/` would let every assertion below pass on last run's
	// output, including on a build that never happened.
	await rm(DIST, { recursive: true, force: true });

	// The lockfile is committed, and in CI (where pnpm defaults to
	// `--frozen-lockfile`) this step is also the check that it is current: the
	// fixture's lock records this package's own dependency and peer sets, so
	// changing either here without regenerating it fails right there, which is
	// the earliest anyone could be told.
	await sh('pnpm', ['install']);
	const { stdout: build, stderr: buildErr } = await sh('pnpm', ['build']);

	assert.match(build, /2 total backlinks across 2 entries/, build);

	// A stylesheet this package ships has to be CSS in a build that has never
	// heard of Tailwind (#8). `@tailwind utilities` in `design-system.css` used
	// to reach Lightning CSS unprocessed here: a warning, and a rule that did
	// nothing. The build still succeeded, which is exactly why this is asserted
	// on the output rather than on the exit code.
	assert.doesNotMatch(build + buildErr, /Unknown at rule/, build + buildErr);

	const hello = await readFile(path.join(DIST, 'notes/hello/index.html'), 'utf8');

	// Resolved against the consumer's content tree. The engine's own vault has
	// no note called World, so this line cannot pass by accident.
	assert.match(hello, /<a href="\/notes\/world\/" class="wikilink">/);

	// A foreign host is external...
	assert.match(hello, /<a href="https:\/\/example\.org\/away" target="_blank" rel="noopener noreferrer">/);

	// ...and the consumer's own `site` host is not. This is the half that
	// silently regresses if `site` stops reaching the rehype plugin: every
	// link would still get a `target`, and the page would still look fine.
	assert.match(hello, /<a href="https:\/\/example\.com\/notes\/world\/">/);

	const backlinks = JSON.parse(await readFile(path.join(DIST, 'backlinks.json'), 'utf8'));
	assert.deepEqual(Object.keys(backlinks).sort(), ['/notes/hello/', '/notes/world/']);
	assert.deepEqual(backlinks['/notes/hello/'].inbound, ['/notes/world/']);
	assert.deepEqual(backlinks['/notes/world/'].inbound, ['/notes/hello/']);

	// The `.md` URL returns the file, not a re-serialization of it.
	const published = await readFile(path.join(DIST, 'notes/hello.md'), 'utf8');
	const source = await readFile(path.join(FIXTURE, 'src/content/notes/hello.md'), 'utf8');
	assert.equal(published, source);

	// The search modal's semantic tier is opt-in (#56). This fixture is the
	// stranger: it passes no `semanticEndpoint`, so its note page must carry no
	// code for one — not a disabled fetch, no fetch. The only URL the modal
	// reaches for is `/backlinks.json`, which this build wrote.
	assert.doesNotMatch(hello, /\/api\/ask/);
	assert.doesNotMatch(hello, /window\.CommuneSemanticSearch\s*=\s*async/);
	assert.match(hello, /fetch\('\/backlinks\.json'/);

	// And the half that proves the prop is a real seam rather than a deletion:
	// a page that does serve an endpoint says so, and gets the tier pointed at
	// its own URL.
	const optIn = await readFile(path.join(DIST, 'opt-in-search/index.html'), 'utf8');
	assert.match(optIn, /window\.CommuneSemanticSearch\s*=\s*async/);
	assert.match(optIn, /const semanticEndpoint = "\/api\/ask"/);
});

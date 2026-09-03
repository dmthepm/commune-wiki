/**
 * The version this build answers to.
 *
 * Read out of `package.json` at run time rather than baked in at build time.
 * There is nothing in the build that could bake it in — `tsc` compiles types
 * away, not values — and release-please bumps exactly one file when it cuts a
 * release. A second copy of the number would be a second thing to forget.
 *
 * `../../package.json` is the same file in both layouts this code runs in, and
 * that is the only reason this can be one line. Compiled, this is
 * `lib/cli/version.js`, so two levels up is the package root; in a checkout the
 * tests and `astro.config.mjs` import `src/cli/version.ts`, so two levels up is
 * the repo root. Same `package.json` either way, including inside an installed
 * `node_modules/@dmthepm/commune` — npm packs `package.json` into every tarball
 * regardless of the `files` allowlist, so it is there on an install too.
 */

import { readFile } from 'node:fs/promises';

/** The `version` field of the package this file was loaded from. */
export async function readVersion(): Promise<string> {
	const manifest = new URL('../../package.json', import.meta.url);
	const { version } = JSON.parse(await readFile(manifest, 'utf8')) as { version: string };
	return version;
}

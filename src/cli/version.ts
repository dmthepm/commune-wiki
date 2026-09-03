/**
 * The version this build answers to.
 *
 * Read out of `package.json` at run time rather than baked in at build time.
 * There is nothing in the build that could bake it in — `tsc` compiles types
 * away, not values — and release-please bumps exactly one file when it cuts a
 * release. A second copy of the number would be a second thing to forget.
 *
 * `../../package.json` survives compilation because `src/cli/` and `lib/cli/`
 * sit at the same depth: `tsconfig.build.json` sets `rootDir: src`, so this
 * file becomes `lib/cli/version.js` and two levels up is the package root
 * exactly as two levels up from `src/cli/version.ts` is the repo root. Only the
 * `lib/` layout is ever exercised — nothing imports `src/cli/*.ts` directly,
 * and the tests reach this code the way a consumer does, by spawning
 * `bin/commune.mjs`, which imports `../lib/cli/main.js`. The `src/` half of
 * that sentence is a property of the build, not a path anything walks.
 *
 * It resolves inside an installed `node_modules/@dmthepm/commune` too, and for
 * a reason worth writing down: npm packs `package.json` into every tarball
 * regardless of the `files` allowlist, so it is there even though `files` never
 * names it.
 */

import { readFile } from 'node:fs/promises';

/** The `version` field of the package this file was loaded from. */
export async function readVersion(): Promise<string> {
	const manifest = new URL('../../package.json', import.meta.url);
	const { version } = JSON.parse(await readFile(manifest, 'utf8')) as { version: string };
	return version;
}

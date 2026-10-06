/**
 * The public `@dmthepm/commune/astro` entry is `commune()` alone.
 *
 * Everything `src/integration.ts` exports is public once built, because the
 * `./astro` export points at `lib/integration.js`. A helper exported only so a
 * test could call it once leaked that way (#127), so the export names are
 * pinned here and widening them is a deliberate edit.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

test('the astro entry exports commune() and nothing else', async () => {
	const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
	const entry = path.join(ROOT, pkg.exports['./astro'].default);
	const module = await import(pathToFileURL(entry).href);

	assert.deepEqual(Object.keys(module).sort(), ['default']);
	assert.equal(typeof module.default, 'function');
});

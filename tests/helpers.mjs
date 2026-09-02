/**
 * Shared test fixtures and the bin runner.
 *
 * Deliberately not a `*.test.mjs` file: `node --test` runs each test file in
 * its own process, and a test file that exports a helper gets its own tests
 * re-registered — and re-run — in every file that imports it. Three suites
 * importing one helper was silently running the CLI suite three times and
 * inflating the reported test count.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

export const run = promisify(execFile);

/** A minimal project root: the directory containing `src/content`, never `src/content`. */
export const VAULT = fileURLToPath(new URL('./fixtures/vault/', import.meta.url));

export const BIN = fileURLToPath(new URL('../bin/commune.mjs', import.meta.url));

/** Run the bin, never throwing: the exit code is part of what is under test. */
export async function commune(...args) {
	try {
		const { stdout, stderr } = await run(process.execPath, [BIN, ...args]);
		return { code: 0, stdout, stderr };
	} catch (error) {
		return { code: error.code, stdout: error.stdout, stderr: error.stderr };
	}
}

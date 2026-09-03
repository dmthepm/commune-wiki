/**
 * The stranger test: install this package the way somebody else would.
 *
 * Every other test in this directory runs from the checkout, where `lib/` is on
 * disk because someone built it. That hides the two things an install does
 * differently, and both of them have already been wrong once:
 *
 *   - `prepare` has to *build* `lib/` inside pnpm's own clone of the git ref;
 *   - `files` has to *pack* it. Without that field the pack falls back to
 *     `.gitignore`, which ignores build output, so the package arrives with a
 *     bin and nothing for it to run — `ERR_MODULE_NOT_FOUND`, on every install,
 *     invisible from any checkout.
 *
 * `git+file://` is the same code path a `github:` dependency takes, so this is
 * the real thing rather than a simulation of it. It is also the slowest test
 * here by a wide margin: pnpm clones, installs dev dependencies and compiles.
 *
 * It reads the committed HEAD, so it is skipped — loudly, never silently —
 * when tracked files are modified, since an uncommitted fix would not be in the
 * ref pnpm resolves and the pass would mean nothing. Untracked files do not
 * count: a worktree legitimately carries scratch that is not part of the
 * package, and a new file that *is* part of it shows up here the moment it is
 * staged.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');

/** The commit pnpm will resolve, and whether it is the code on disk. */
async function head() {
	const { stdout: sha } = await exec('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
	const { stdout: dirty } = await exec('git', ['status', '--porcelain', '-uno'], { cwd: ROOT });
	return { sha: sha.trim(), dirty: dirty.trim() };
}

test('a git install builds and packs lib/, so the bin runs', async (t) => {
	const { sha, dirty } = await head();

	if (dirty) {
		t.skip(
			`tracked files are modified, so HEAD (${sha.slice(0, 7)}) is not the code under test. ` +
				`Commit first to run this. Modified:\n${dirty}`
		);
		return;
	}

	const consumer = await mkdtemp(path.join(tmpdir(), 'commune-install-'));
	try {
		await exec('pnpm', ['init'], { cwd: consumer });
		await exec('pnpm', ['add', `git+file://${ROOT}#${sha}`], { cwd: consumer });

		// `files` packed the compiled output. Checked by path rather than by
		// running the bin, because a missing `lib/` is the specific regression.
		// The directory is named for the package, read rather than spelled out
		// so #7's rename does not quietly turn this into a test of nothing.
		const { name } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
		const installed = path.join(consumer, 'node_modules', name, 'lib/cli/main.js');
		assert.ok((await stat(installed)).isFile(), `${installed} was not packed`);

		// And the bin pnpm linked actually runs it.
		const { stdout } = await exec(path.join(consumer, 'node_modules/.bin/commune'), ['--help']);
		assert.match(stdout, /^commune — query the content graph/);
	} finally {
		await rm(consumer, { recursive: true, force: true });
	}
});

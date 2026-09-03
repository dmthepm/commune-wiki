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
 * It installs from a **bare clone this test makes**, not from the working
 * checkout, because the checkout's shape is not ours to control. On a pull
 * request `actions/checkout` leaves HEAD detached on a synthetic merge commit
 * that exists only in that checkout, with no local branch and, at the default
 * `fetch-depth: 1`, no history — and an install pointed straight at that failed
 * in CI while every local shape passed. A bare clone with an explicit branch at
 * the commit under test is deterministic: pnpm fetches from an ordinary
 * repository where the sha is reachable from `refs/heads/*`, which is what a
 * `github:` consumer hits.
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
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');

/** The branch the bare clone gets, so the commit is reachable from a real ref. */
const REF = 'commune-install-test';

/**
 * Run a command, and on failure throw an error that *says what it printed*.
 *
 * The first version of this test called `execFile` directly. A `pnpm add`
 * failed in CI and the log carried an exit code and nothing else — no pnpm
 * error, no git error, no way to tell a fetch problem from a `prepare` problem
 * without pushing another commit to find out. Everything here goes through this
 * instead, so the next failure is legible on the first read.
 *
 * `maxBuffer` is raised for the same reason: at the 1 MB default a long install
 * dies with `ENOBUFS` and takes the real output with it.
 */
async function sh(command, args, options = {}) {
	try {
		return await execFileAsync(command, args, { maxBuffer: 32 * 1024 * 1024, ...options });
	} catch (error) {
		const where = options.cwd ? ` (in ${options.cwd})` : '';
		const parts = [`${command} ${args.join(' ')}${where} exited ${error.code ?? '?'}`];
		if (error.stdout?.trim()) parts.push(`stdout:\n${error.stdout.trim()}`);
		if (error.stderr?.trim()) parts.push(`stderr:\n${error.stderr.trim()}`);
		throw new Error(parts.join('\n'), { cause: error });
	}
}

/** The commit pnpm will resolve, and whether it is the code on disk. */
async function head() {
	const { stdout: sha } = await sh('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
	const { stdout: dirty } = await sh('git', ['status', '--porcelain', '-uno'], { cwd: ROOT });
	return { sha: sha.trim(), dirty: dirty.trim() };
}

/** Does this repository actually hold this commit? */
async function hasCommit(repo, sha) {
	try {
		await execFileAsync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repo });
		return true;
	} catch {
		return false;
	}
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

	const scratch = await mkdtemp(path.join(tmpdir(), 'commune-install-'));
	const bare = path.join(scratch, 'bare.git');
	const consumer = path.join(scratch, 'consumer');

	try {
		// `git clone` fetches what the source advertises, HEAD included, so this
		// works from a detached checkout as well as from a branch.
		await sh('git', ['clone', '--quiet', '--bare', ROOT, bare]);

		if (!(await hasCommit(bare, sha))) {
			// A checkout so truncated that its own HEAD did not come across.
			// There is nothing for pnpm to fetch, and failing here would blame
			// the package for the shape of the clone.
			t.skip(
				`HEAD (${sha.slice(0, 7)}) is not present in a bare clone of ${ROOT}, so there is ` +
					'nothing for pnpm to fetch. In CI this means the checkout was too shallow: ' +
					'set fetch-depth: 0 on actions/checkout.'
			);
			return;
		}

		// The commit under test, on a branch, so pnpm resolves it against an
		// ordinary repository rather than against whatever HEAD happens to be.
		await sh('git', ['update-ref', `refs/heads/${REF}`, sha], { cwd: bare });

		await mkdir(consumer, { recursive: true });
		await sh('pnpm', ['init'], { cwd: consumer });
		await sh('pnpm', ['add', `git+file://${bare}#${sha}`], { cwd: consumer });

		// `files` packed the compiled output. Checked by path rather than by
		// running the bin, because a missing `lib/` is the specific regression.
		// The directory is named for the package, read rather than spelled out
		// so #7's rename does not quietly turn this into a test of nothing.
		const { name } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
		const installed = path.join(consumer, 'node_modules', name, 'lib/cli/main.js');
		assert.ok((await stat(installed)).isFile(), `${installed} was not packed`);

		// And the bin pnpm linked actually runs it.
		const { stdout } = await sh(path.join(consumer, 'node_modules/.bin/commune'), ['--help']);
		assert.match(stdout, /^commune — query the content graph/);
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
});

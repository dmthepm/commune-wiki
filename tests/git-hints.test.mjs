/**
 * The two places the engine asks git for help, and both are advisory.
 *
 *   - `check` names the likely rename behind a `broken-link`, from git's own
 *     rename detection, when a note was renamed with a plain `mv`.
 *   - `rename` prints the `git mv -f` line when only the case of a name changed.
 *
 * Every test runs in a throwaway directory. A directory outside any repository
 * and a repository with no rename are the control cases: both must behave
 * exactly as they did before git was consulted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commune, run } from './helpers.mjs';

const NOTES = 'src/content/notes';

const note = (body = '') => `---\nvisibility: public\nstatus: seed\n---\n\n${body}\n`;

async function put(root, file, text) {
	await mkdir(path.dirname(path.join(root, file)), { recursive: true });
	await writeFile(path.join(root, file), text);
}

async function git(root, ...args) {
	return run('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: root });
}

/** A vault of `Old` and a note linking to it, committed when `repo` is true. */
async function vault({ repo }) {
	const root = await mkdtemp(path.join(tmpdir(), 'commune-git-hints-'));
	await put(root, `${NOTES}/Old.md`, note('The old note.'));
	await put(root, `${NOTES}/Linker.md`, note('It points at [[Old]] and at [[Nowhere]].'));
	if (repo) {
		await git(root, 'init', '-q');
		await git(root, 'config', 'user.email', 'test@example.com');
		await git(root, 'config', 'user.name', 'Test');
		await git(root, 'add', '.');
		await git(root, 'commit', '-q', '-m', 'init');
	}
	return root;
}

async function brokenLinks(root) {
	const { code, stdout, stderr } = await commune('--root', root, 'check', '--json');
	assert.equal(code, 0, stderr);
	const payload = JSON.parse(stdout);
	return { payload, broken: payload.findings.filter((finding) => finding.rule === 'broken-link') };
}

test('check names the rename behind a broken link after a plain mv, in json and in text', async () => {
	const root = await vault({ repo: true });
	try {
		await rename(path.join(root, NOTES, 'Old.md'), path.join(root, NOTES, 'New.md'));

		const { broken } = await brokenLinks(root);
		assert.equal(broken.length, 2);
		const old = broken.find((finding) => finding.target === 'Old');
		assert.equal(old.hint, '`Old.md` looks renamed to `New.md`');
		assert.equal(old.message, '[[Old]] does not resolve', 'the message itself is unchanged');
		assert.equal(old.severity, 'warning');
		assert.equal('hint' in broken.find((finding) => finding.target === 'Nowhere'), false, 'no rename, no hint');

		const text = await commune('--root', root, 'check');
		assert.equal(text.code, 0);
		assert.match(text.stdout, /\[\[Old\]\] does not resolve \(`Old\.md` looks renamed to `New\.md`\)/);
		assert.match(text.stdout, /\[\[Nowhere\]\] does not resolve\n/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('check names a staged rename and one that is already committed', async () => {
	const root = await vault({ repo: true });
	try {
		await git(root, 'mv', `${NOTES}/Old.md`, `${NOTES}/Newer.md`);
		assert.equal((await brokenLinks(root)).broken.find((finding) => finding.target === 'Old').hint, '`Old.md` looks renamed to `Newer.md`');

		await git(root, 'commit', '-q', '-m', 'rename');
		assert.equal((await brokenLinks(root)).broken.find((finding) => finding.target === 'Old').hint, '`Old.md` looks renamed to `Newer.md`');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('check matches the old name the way links match titles, ignoring case', async () => {
	const root = await vault({ repo: true });
	try {
		await put(root, `${NOTES}/Linker.md`, note('It points at [[old]].'));
		await git(root, 'add', '.');
		await git(root, 'commit', '-q', '-m', 'lowercase link');
		await rename(path.join(root, NOTES, 'Old.md'), path.join(root, NOTES, 'Fresh.md'));

		const { broken } = await brokenLinks(root);
		assert.equal(broken[0].hint, '`Old.md` looks renamed to `Fresh.md`');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('check is unchanged outside a repository, and for a repository with no rename', async () => {
	for (const repo of [false, true]) {
		const root = await vault({ repo });
		try {
			await rm(path.join(root, NOTES, 'Old.md'));
			const { broken, payload } = await brokenLinks(root);
			assert.equal(broken.length, 2, `repo=${repo}`);
			for (const finding of broken) {
				assert.equal('hint' in finding, false);
				assert.deepEqual(Object.keys(finding).sort(), ['file', 'message', 'rule', 'severity', 'target']);
			}
			assert.equal(payload.summary.errors, 0);

			const text = await commune('--root', root, 'check');
			assert.doesNotMatch(text.stdout, /looks renamed/);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}
});

test('check with git missing from the PATH behaves as without it', async () => {
	const root = await vault({ repo: true });
	try {
		await rename(path.join(root, NOTES, 'Old.md'), path.join(root, NOTES, 'New.md'));
		const { stdout } = await run(process.execPath, [path.join(import.meta.dirname, '..', 'bin', 'commune.mjs'), '--root', root, 'check', '--json'], {
			env: { ...process.env, PATH: path.dirname(process.execPath) },
		});
		const broken = JSON.parse(stdout).findings.filter((finding) => finding.rule === 'broken-link');
		assert.equal(broken.length, 2);
		assert.equal(broken.some((finding) => 'hint' in finding), false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

async function caseInsensitive() {
	const dir = await mkdtemp(path.join(tmpdir(), 'commune-case-probe-'));
	try {
		await writeFile(path.join(dir, 'Probe'), '');
		return await run('test', ['-e', path.join(dir, 'probe')]).then(() => true, () => false);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test('a case-only rename inside a repository prints the git mv line on stderr', async () => {
	const root = await vault({ repo: true });
	try {
		const result = await commune('--root', root, 'rename', `${NOTES}/Old.md`, `${NOTES}/old.md`);
		assert.equal(result.code, 0, result.stderr);
		assert.match(result.stderr, /git mv -f "src\/content\/notes\/Old\.md" "src\/content\/notes\/old\.md"/);
		assert.doesNotMatch(result.stdout, /git mv/);

		// The printed line is the one that works, wherever the disk is case-insensitive.
		if (await caseInsensitive()) {
			await run('sh', ['-c', 'git mv -f "$0" "$1"', `${NOTES}/Old.md`, `${NOTES}/old.md`], { cwd: root });
			const { stdout } = await git(root, 'ls-files');
			assert.match(stdout, /notes\/old\.md/);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('a case-only rename prints nothing for git on a dry run, outside a repository, or when the name really changes', async () => {
	const dry = await vault({ repo: true });
	const bare = await vault({ repo: false });
	const plain = await vault({ repo: true });
	try {
		const dryRun = await commune('--root', dry, 'rename', `${NOTES}/Old.md`, `${NOTES}/old.md`, '--dry-run');
		assert.equal(dryRun.code, 0, dryRun.stderr);
		assert.doesNotMatch(dryRun.stderr, /git mv/);

		const outside = await commune('--root', bare, 'rename', `${NOTES}/Old.md`, `${NOTES}/old.md`);
		assert.equal(outside.code, 0, outside.stderr);
		assert.doesNotMatch(outside.stderr, /git mv/);

		const normal = await commune('--root', plain, 'rename', `${NOTES}/Old.md`, `${NOTES}/Renamed.md`);
		assert.equal(normal.code, 0, normal.stderr);
		assert.doesNotMatch(normal.stderr, /git mv/);
	} finally {
		await Promise.all([dry, bare, plain].map((root) => rm(root, { recursive: true, force: true })));
	}
});

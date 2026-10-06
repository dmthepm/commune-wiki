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
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commune, run } from './helpers.mjs';
import { caseOnlyMoveHint, shellQuote } from '../src/lib/git-hints.ts';

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

test('a case-only rename inside a repository prints a git mv line that works, on a case-insensitive disk only', async () => {
	const root = await vault({ repo: true });
	try {
		const result = await commune('--root', root, 'rename', `${NOTES}/Old.md`, `${NOTES}/old.md`);
		assert.equal(result.code, 0, result.stderr);
		assert.doesNotMatch(result.stdout, /git mv/);

		if (!(await caseInsensitive())) {
			// A case-sensitive disk sees a plain delete and add, and git mv -f would fail.
			assert.doesNotMatch(result.stderr, /git mv/);
			return;
		}
		const line = result.stderr.match(/Run: (git -C .* mv -f .*)\n/)?.[1];
		assert.ok(line, result.stderr);
		assert.match(line, /^git -C '.*' mv -f 'src\/content\/notes\/Old\.md' 'src\/content\/notes\/old\.md'$/);

		// Run from somewhere else entirely: the line carries its own root.
		await run('sh', ['-c', line], { cwd: tmpdir() });
		const { stdout } = await git(root, 'ls-files');
		assert.match(stdout, /notes\/old\.md/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('the git mv line is gated on the disk having treated both names as one file', async () => {
	const root = await vault({ repo: true });
	const bare = await vault({ repo: false });
	try {
		const from = `${NOTES}/Old.md`;
		const to = `${NOTES}/old.md`;
		assert.equal(await caseOnlyMoveHint(root, from, to, false), undefined, 'case-sensitive disk');
		assert.equal(await caseOnlyMoveHint(root, from, `${NOTES}/Other.md`, true), undefined, 'not a case-only move');
		assert.equal(await caseOnlyMoveHint(bare, from, to, true), undefined, 'not a repository');
		assert.match(await caseOnlyMoveHint(root, from, to, true), /^git -C '.*' mv -f 'src\/content\/notes\/Old\.md' 'src\/content\/notes\/old\.md'$/);
	} finally {
		await Promise.all([root, bare].map((dir) => rm(dir, { recursive: true, force: true })));
	}
});

test('the git mv line survives a filename with $(x), a quote and a backtick', async () => {
	try {
		const from = "src/content/notes/A $(touch pwned) 'q' `id`.md";
		const to = from.toLowerCase();
		assert.equal(
			shellQuote(from),
			`'src/content/notes/A $(touch pwned) '\\''q'\\'' \`id\`.md'`
		);

		// Run the printed line through a shell, in a repository where it can succeed.
		const repo = await mkdtemp(path.join(tmpdir(), 'commune-quote-'));
		try {
			await put(repo, from, note());
			await git(repo, 'init', '-q');
			await git(repo, 'config', 'user.email', 'test@example.com');
			await git(repo, 'config', 'user.name', 'Test');
			await git(repo, 'add', '.');
			await git(repo, 'commit', '-q', '-m', 'init');
			if (await caseInsensitive()) await rename(path.join(repo, from), path.join(repo, to));
			const line = await caseOnlyMoveHint(repo, from, to, true);
			assert.ok(line);
			await run('sh', ['-c', line], { cwd: tmpdir() });
			const { stdout } = await git(repo, 'ls-files');
			assert.ok(stdout.includes(to), stdout);
			assert.equal(await run('test', ['-e', path.join(tmpdir(), 'pwned')]).then(() => true, () => false), false);
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	} finally {
		await rm(path.join(tmpdir(), 'pwned'), { force: true });
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

/** A repository holding `files` (path to text), committed, with `sub` as the project root. */
async function repoWith(files, sub = '') {
	const top = await mkdtemp(path.join(tmpdir(), 'commune-git-hints-'));
	for (const [file, text] of Object.entries(files)) await put(top, path.join(sub, file), text);
	await git(top, 'init', '-q');
	await git(top, 'config', 'user.email', 'test@example.com');
	await git(top, 'config', 'user.name', 'Test');
	await git(top, 'add', '.');
	await git(top, 'commit', '-q', '-m', 'init');
	return { top, root: path.join(top, sub) };
}

async function hints(root) {
	const { broken } = await brokenLinks(root);
	return Object.fromEntries(broken.map((finding) => [finding.target, finding.hint]));
}

async function exists(file) {
	return stat(file).then(() => true, () => false);
}

test('check reads a rename for non-ASCII names, .mdx files and a move to another directory', async () => {
	const { top, root } = await repoWith({
		[`${NOTES}/Ünï Café.md`]: note('Accents.'),
		[`${NOTES}/Page.mdx`]: note('Component.'),
		[`${NOTES}/Mover.md`]: note('Will move.'),
		[`${NOTES}/Linker.md`]: note('[[Ünï Café]] [[Page]] [[Mover]]'),
		'src/content/research/.keep': '',
	});
	try {
		await rename(path.join(root, NOTES, 'Ünï Café.md'), path.join(root, NOTES, 'Ñew Café.md'));
		await rename(path.join(root, NOTES, 'Page.mdx'), path.join(root, NOTES, 'Fresh.mdx'));
		await rename(path.join(root, NOTES, 'Mover.md'), path.join(root, 'src/content/research/Moved.md'));

		assert.deepEqual(await hints(root), {
			'Ünï Café': '`Ünï Café.md` looks renamed to `Ñew Café.md`',
			Page: '`Page.mdx` looks renamed to `Fresh.mdx`',
			Mover: '`Mover.md` looks renamed to `src/content/research/Moved.md`',
		});
	} finally {
		await rm(top, { recursive: true, force: true });
	}
});

test('check works when the project root is a subdirectory of the repository', async () => {
	const { top, root } = await repoWith(
		{ [`${NOTES}/Old.md`]: note('Old.'), [`${NOTES}/Linker.md`]: note('[[Old]]') },
		'site'
	);
	try {
		await rename(path.join(root, NOTES, 'Old.md'), path.join(root, NOTES, 'New.md'));
		assert.deepEqual(await hints(root), { Old: '`Old.md` looks renamed to `New.md`' });
	} finally {
		await rm(top, { recursive: true, force: true });
	}
});

test('check gives no hint when one old name was renamed to two places', async () => {
	const { top, root } = await repoWith({
		[`${NOTES}/Old.md`]: note('In notes.'),
		'src/content/research/Old.md': note('In research.'),
		[`${NOTES}/Linker.md`]: note('[[Old]]'),
	});
	try {
		await rename(path.join(root, NOTES, 'Old.md'), path.join(root, NOTES, 'A.md'));
		await rename(path.join(root, 'src/content/research/Old.md'), path.join(root, 'src/content/research/B.md'));
		assert.deepEqual(await hints(root), { Old: undefined });
	} finally {
		await rm(top, { recursive: true, force: true });
	}
});

/** Every path under `.git` except the object store, which a commit legitimately grows. */
async function gitListing(top) {
	const out = [];
	const walk = async (dir) => {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (full === path.join(top, '.git', 'objects')) continue;
			out.push(path.relative(top, full));
			if (entry.isDirectory()) await walk(full);
		}
	};
	await walk(path.join(top, '.git'));
	// Names alone miss a rewrite of the real index in place, so hash its bytes too.
	const index = await readFile(path.join(top, '.git', 'index')).catch(() => Buffer.alloc(0));
	out.push('index sha256 ' + createHash('sha256').update(index).digest('hex'));
	return out.sort();
}

test('check never runs a hook and leaves .git alone, split index included', async () => {
	const { top, root } = await repoWith({ [`${NOTES}/Old.md`]: note('Old.'), [`${NOTES}/Linker.md`]: note('[[Old]]') });
	try {
		await git(top, 'config', 'core.splitIndex', 'true');
		await git(top, 'update-index', '--split-index');
		const marker = path.join(top, 'hook-ran');
		const hook = path.join(top, '.git', 'hooks', 'post-index-change');
		await writeFile(hook, `#!/bin/sh\ntouch '${marker}'\n`);
		await chmod(hook, 0o755);

		await rename(path.join(root, NOTES, 'Old.md'), path.join(root, NOTES, 'New.md'));
		const before = await gitListing(top);
		assert.deepEqual(await hints(root), { Old: '`Old.md` looks renamed to `New.md`' });

		assert.equal(await exists(marker), false, 'the hook ran');
		assert.deepEqual(await gitListing(top), before, 'something under .git changed');
		assert.ok(before.some((file) => file.includes('sharedindex')), 'the repository really uses a split index');

		// Control: the same hook does fire when git is asked to change the index.
		await run('git', ['add', '-A'], { cwd: top });
		assert.equal(await exists(marker), true, 'the control hook never fires, so the test proves nothing');
	} finally {
		await rm(top, { recursive: true, force: true });
	}
});

const titled = (title, body = '') => `---\ntitle: ${title}\nvisibility: public\nstatus: seed\n---\n\n${body}\n`;

test('check matches the title the old file carried in frontmatter, in the starter layout, after a plain mv that changes it', async () => {
	const { top, root } = await repoWith({
		[`${NOTES}/connected-notes.md`]: titled('Connected notes', 'Old.'),
		[`${NOTES}/a.md`]: titled('A', '[[Connected notes]]'),
		[`${NOTES}/b.md`]: titled('B', '[[Connected notes]]'),
		[`${NOTES}/c.md`]: titled('C', '[[connected notes]] and [[Nowhere]]'),
	});
	try {
		await rename(path.join(root, NOTES, 'connected-notes.md'), path.join(root, NOTES, 'linked-ideas.md'));
		await put(root, `${NOTES}/linked-ideas.md`, titled('Linked ideas', 'Old.'));

		const { broken } = await brokenLinks(root);
		const named = broken.filter((finding) => /connected notes/i.test(finding.target));
		assert.equal(named.length, 3);
		for (const finding of named) assert.equal(finding.hint, '`connected-notes.md` looks renamed to `linked-ideas.md`');
		assert.equal(broken.find((finding) => finding.target === 'Nowhere').hint, undefined);
	} finally {
		await rm(top, { recursive: true, force: true });
	}
});

test('check reads the old title from HEAD~1 once the rename is committed', async () => {
	const { top, root } = await repoWith({
		[`${NOTES}/connected-notes.md`]: titled('Connected notes', 'Old.'),
		[`${NOTES}/a.md`]: titled('A', '[[Connected notes]]'),
	});
	try {
		await git(top, 'mv', `${NOTES}/connected-notes.md`, `${NOTES}/linked-ideas.md`);
		await put(root, `${NOTES}/linked-ideas.md`, titled('Linked ideas', 'Old.'));
		await git(top, 'add', '.');
		await git(top, 'commit', '-q', '-m', 'rename');
		assert.deepEqual(await hints(root), { 'Connected notes': '`connected-notes.md` looks renamed to `linked-ideas.md`' });
	} finally {
		await rm(top, { recursive: true, force: true });
	}
});

test('check gives no hint when an old title is claimed by two renames', async () => {
	const { top, root } = await repoWith({
		[`${NOTES}/one.md`]: titled('Shared', 'One.'),
		'src/content/research/two.md': titled('Shared', 'Two.'),
		[`${NOTES}/a.md`]: titled('A', '[[Shared]]'),
	});
	try {
		await rename(path.join(root, NOTES, 'one.md'), path.join(root, NOTES, 'uno.md'));
		await put(root, `${NOTES}/uno.md`, titled('Uno', 'One.'));
		await rename(path.join(root, 'src/content/research/two.md'), path.join(root, 'src/content/research/dos.md'));
		await put(root, 'src/content/research/dos.md', titled('Dos', 'Two.'));
		assert.deepEqual(await hints(root), { Shared: undefined });
	} finally {
		await rm(top, { recursive: true, force: true });
	}
});

test('check ignores an old file whose frontmatter is not valid YAML', async () => {
	const { top, root } = await repoWith({
		[`${NOTES}/bad.md`]: '---\ntitle: [unclosed\n---\n\nBody.\n',
		[`${NOTES}/a.md`]: titled('A', '[[Gone]]'),
	});
	try {
		await rename(path.join(root, NOTES, 'bad.md'), path.join(root, NOTES, 'worse.md'));
		await put(root, `${NOTES}/worse.md`, titled('Worse', 'Body.'));
		assert.deepEqual(await hints(root), { Gone: undefined });
	} finally {
		await rm(top, { recursive: true, force: true });
	}
});

test('check hints a broken url link from the old path, and from an old slug or url', async () => {
	const { top, root } = await repoWith({
		[`${NOTES}/plain.md`]: titled('Plain', 'P.'),
		[`${NOTES}/Pinned.md`]: `---\ntitle: Pinned\nslug: pin-me\nvisibility: public\nstatus: seed\n---\n\nP.\n`,
		'src/content/pages/about.md': `---\ntitle: About\nurl: /about-us/\nvisibility: public\nstatus: seed\n---\n\nA.\n`,
		[`${NOTES}/linker.md`]: titled('Linker', '[a](/notes/plain/) [b](/notes/pin-me/) [c](/about-us/) [d](/notes/never/)'),
	});
	try {
		await rename(path.join(root, NOTES, 'plain.md'), path.join(root, NOTES, 'fresh.md'));
		await rename(path.join(root, NOTES, 'Pinned.md'), path.join(root, NOTES, 'Moved.md'));
		await put(root, `${NOTES}/Moved.md`, titled('Pinned', 'P.'));
		await rename(path.join(root, 'src/content/pages/about.md'), path.join(root, 'src/content/pages/who.md'));
		await put(root, 'src/content/pages/who.md', titled('About', 'A.'));

		const { broken } = await brokenLinks(root);
		const byTarget = Object.fromEntries(broken.map((finding) => [finding.target, finding]));
		assert.equal(byTarget['/notes/plain/'].hint, '`plain.md` looks renamed to `fresh.md`');
		assert.equal(byTarget['/notes/pin-me/'].hint, '`Pinned.md` looks renamed to `Moved.md`');
		assert.equal(byTarget['/about-us/'].hint, '`about.md` looks renamed to `who.md`');
		assert.equal(byTarget['/notes/never/'].hint, undefined);
	} finally {
		await rm(top, { recursive: true, force: true });
	}
});

test('check reads old titles and urls when the project root is a subdirectory of the repository', async () => {
	const { top, root } = await repoWith(
		{
			[`${NOTES}/connected-notes.md`]: titled('Connected notes', 'Old.'),
			[`${NOTES}/Pinned.md`]: `---\ntitle: Pinned\nslug: pin-me\nvisibility: public\nstatus: seed\n---\n\nP.\n`,
			[`${NOTES}/linker.md`]: titled('Linker', '[[Connected notes]] [p](/notes/pin-me/)'),
		},
		'site'
	);
	try {
		await rename(path.join(root, NOTES, 'connected-notes.md'), path.join(root, NOTES, 'linked-ideas.md'));
		await put(root, `${NOTES}/linked-ideas.md`, titled('Linked ideas', 'Old.'));
		await rename(path.join(root, NOTES, 'Pinned.md'), path.join(root, NOTES, 'Moved.md'));
		await put(root, `${NOTES}/Moved.md`, titled('Pinned', 'P.'));

		assert.deepEqual(await hints(root), {
			'Connected notes': '`connected-notes.md` looks renamed to `linked-ideas.md`',
			'/notes/pin-me/': '`Pinned.md` looks renamed to `Moved.md`',
		});
	} finally {
		await rm(top, { recursive: true, force: true });
	}
});

/** A `git` on the PATH that logs its arguments, one line per process, then runs the real one. */
async function loggingGit() {
	const dir = await mkdtemp(path.join(tmpdir(), 'commune-fake-git-'));
	const log = path.join(dir, 'calls.log');
	const real = (await run('which', ['git'])).stdout.trim();
	const script = path.join(dir, 'git');
	await writeFile(script, `#!/bin/sh\necho "$@" >> '${log}'\nexec '${real}' "$@"\n`);
	await chmod(script, 0o755);
	return { dir, log };
}

test('check reads every old blob through one git process, however many renames there are', async () => {
	const files = { [`${NOTES}/linker.md`]: titled('Linker', '[[Nothing here]]') };
	for (let i = 0; i < 40; i++) files[`${NOTES}/n${i}.md`] = titled(`Note ${i}`, `Body ${i}.`);
	const { top, root } = await repoWith(files);
	const spy = await loggingGit();
	try {
		for (let i = 0; i < 40; i++) {
			await mkdir(path.join(root, NOTES, 'moved'), { recursive: true });
			await rename(path.join(root, NOTES, `n${i}.md`), path.join(root, NOTES, 'moved', `n${i}.md`));
		}
		const { stdout } = await run(process.execPath, [path.join(import.meta.dirname, '..', 'bin', 'commune.mjs'), '--root', root, 'check', '--json'], {
			env: { ...process.env, PATH: `${spy.dir}${path.delimiter}${process.env.PATH}` },
		});
		const broken = JSON.parse(stdout).findings.filter((finding) => finding.rule === 'broken-link');
		assert.equal(broken.length, 1);
		const calls = (await readFile(spy.log, 'utf8')).split('\n').filter(Boolean);
		assert.equal(calls.filter((call) => /\bcat-file\b/.test(call)).length, 1, calls.join('\n'));
		assert.equal(calls.filter((call) => /\bshow\b/.test(call)).length, 0, calls.join('\n'));
	} finally {
		await rm(top, { recursive: true, force: true });
		await rm(spy.dir, { recursive: true, force: true });
	}
});

test('check starts no read process when the filenames already explain every broken link', async () => {
	const { top, root } = await repoWith({
		[`${NOTES}/Old.md`]: titled('Elsewhere', 'Old.'),
		[`${NOTES}/Linker.md`]: titled('Linker', '[[Old]]'),
	});
	const spy = await loggingGit();
	try {
		await rename(path.join(root, NOTES, 'Old.md'), path.join(root, NOTES, 'New.md'));
		const { stdout } = await run(process.execPath, [path.join(import.meta.dirname, '..', 'bin', 'commune.mjs'), '--root', root, 'check', '--json'], {
			env: { ...process.env, PATH: `${spy.dir}${path.delimiter}${process.env.PATH}` },
		});
		const broken = JSON.parse(stdout).findings.filter((finding) => finding.rule === 'broken-link');
		assert.equal(broken[0].hint, '`Old.md` looks renamed to `New.md`');
		assert.doesNotMatch(await readFile(spy.log, 'utf8'), /cat-file|\bshow\b/);
	} finally {
		await rm(top, { recursive: true, force: true });
		await rm(spy.dir, { recursive: true, force: true });
	}
});

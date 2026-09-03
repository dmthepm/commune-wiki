/**
 * Tests for dates the author never wrote down.
 *
 * `updated:` is a claim, and the ticket that produced this file (#62) starts
 * from a claim that had gone stale: a note edited today still said yesterday,
 * because nothing moved the field. The engine's answer is the repository's own
 * record, so these tests are built on real git repositories in a temp
 * directory rather than on a fixture — a committed fixture cannot carry
 * commit dates, which is the whole thing under test.
 *
 * The fixture vault under `tests/fixtures/` deliberately is not used here: it
 * lives inside *this* repository's history, so its files would date from
 * whenever they were last committed here and every assertion would drift.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { loadContentEntries, SHALLOW_WARNING } from '../src/lib/graph.ts';
// The warning is emitted once per root per process; the tests below load several
// shallow roots in one process, so they reset that memory rather than assert on
// whichever of them happened to run first.
import { resetShallowWarnings } from '../src/lib/dates.ts';
import { commune } from './helpers.mjs';

const run = promisify(execFile);

/** A note, in the smallest form the loader accepts as public. */
function note(title, frontmatter = '') {
	return `---\ntitle: "${title}"\nvisibility: public\n${frontmatter}---\n\nBody of ${title}.\n`;
}

/**
 * A throwaway project root, cleaned up whatever the test does.
 *
 * Under the OS temp directory rather than this repository, because a project
 * nested inside this checkout would find *this* repository's history through
 * `git log` and date its files from commits that have nothing to do with it.
 */
async function withProject(body) {
	const dir = await mkdtemp(path.join(tmpdir(), 'commune-dates-'));
	try {
		await mkdir(path.join(dir, 'src/content/notes'), { recursive: true });
		return await body(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** `git`, in a project, with an identity so commits are possible on a bare CI box. */
async function git(dir, args, date) {
	await run('git', args, {
		cwd: dir,
		env: {
			...process.env,
			GIT_AUTHOR_NAME: 'Test',
			GIT_AUTHOR_EMAIL: 'test@example.com',
			GIT_COMMITTER_NAME: 'Test',
			GIT_COMMITTER_EMAIL: 'test@example.com',
			// Both, and with an explicit offset: `--date=short` renders a
			// commit in its own recorded timezone, so a bare `2026-01-02` would
			// read as a different day depending on where the test runs.
			...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
		},
	});
}

async function initRepo(dir) {
	await git(dir, ['init', '--quiet', '--initial-branch=main']);
}

async function commitAll(dir, message, date) {
	await git(dir, ['add', '-A']);
	await git(dir, ['commit', '--quiet', '--no-gpg-sign', '-m', message], date);
}

test('updated is the last commit date and created is the first, when frontmatter is silent', async () => {
	await withProject(async (dir) => {
		await initRepo(dir);
		await writeFile(path.join(dir, 'src/content/notes/Alpha.md'), note('Alpha'));
		await commitAll(dir, 'add Alpha', '2026-01-02T12:00:00+00:00');

		await writeFile(path.join(dir, 'src/content/notes/Alpha.md'), note('Alpha') + '\nMore.\n');
		await writeFile(path.join(dir, 'src/content/notes/Beta.md'), note('Beta'));
		await commitAll(dir, 'edit Alpha, add Beta', '2026-03-04T12:00:00+00:00');

		const entries = await loadContentEntries({ root: dir });
		const alpha = entries.find((entry) => entry.title === 'Alpha');
		const beta = entries.find((entry) => entry.title === 'Beta');

		assert.equal(alpha.updated, '2026-03-04');
		assert.equal(alpha.created, '2026-01-02');
		assert.equal(alpha.updatedSource, 'git');
		assert.equal(alpha.modifiedInGit, '2026-03-04');

		// A file touched by exactly one commit is created and updated the same day.
		assert.equal(beta.created, '2026-03-04');
		assert.equal(beta.updated, '2026-03-04');
	});
});

test('frontmatter wins, and the git date is still reported beside it', async () => {
	await withProject(async (dir) => {
		await initRepo(dir);
		await writeFile(
			path.join(dir, 'src/content/notes/Claimed.md'),
			note('Claimed', 'updated: 2025-12-25\ncreated: 2025-12-01\n')
		);
		await commitAll(dir, 'add Claimed', '2026-03-04T12:00:00+00:00');

		const [entry] = await loadContentEntries({ root: dir });

		assert.equal(entry.updated, '2025-12-25');
		assert.equal(entry.created, '2025-12-01');
		assert.equal(entry.updatedSource, 'frontmatter');
		// The half that makes a stale claim visible: the site can print both and
		// let a reader see that the file moved after the author stopped saying so.
		assert.equal(entry.modifiedInGit, '2026-03-04');
	});
});

test('a changelog entry dates itself from its own date field', async () => {
	await withProject(async (dir) => {
		await initRepo(dir);
		await mkdir(path.join(dir, 'src/content/updates'), { recursive: true });
		await writeFile(
			path.join(dir, 'src/content/updates/2026-02-14.md'),
			'---\ntitle: "Valentine"\ndate: 2026-02-14\nsummary: "A day of updates."\n---\n\nWhat changed.\n'
		);
		await commitAll(dir, 'add an update', '2026-03-04T12:00:00+00:00');

		const [entry] = await loadContentEntries({ root: dir });

		// `date` is the update's subject, not a guess about the file: an update
		// written on the 14th and committed on the 4th of March is still the
		// 14th's update.
		assert.equal(entry.collection, 'updates');
		assert.equal(entry.updated, '2026-02-14');
		assert.equal(entry.updatedSource, 'frontmatter');
	});
});

test('a directory outside any repository falls back to file mtimes', async () => {
	await withProject(async (dir) => {
		// No `git init`: an unversioned folder on somebody's disk, which is the
		// only place an mtime is an honest answer. A tarball or a Docker COPY of
		// a repository is *not* this case — see the shallow test below.
		const file = path.join(dir, 'src/content/notes/Unversioned.md');
		await writeFile(file, note('Unversioned'));
		// Local noon, so the day is the same one on every machine that runs this.
		const when = new Date(2026, 4, 6, 12, 0, 0);
		await utimes(file, when, when);

		const [entry] = await loadContentEntries({ root: dir });

		assert.equal(entry.updated, '2026-05-06');
		assert.equal(entry.created, '2026-05-06');
		assert.equal(entry.updatedSource, 'mtime');
		assert.equal(entry.modifiedInGit, undefined);
	});
});

test('an uncommitted file inside a repository has no date, not an mtime', async () => {
	await withProject(async (dir) => {
		await initRepo(dir);
		await writeFile(path.join(dir, 'src/content/notes/Committed.md'), note('Committed'));
		await commitAll(dir, 'add Committed', '2026-03-04T12:00:00+00:00');

		const draft = path.join(dir, 'src/content/notes/Draft.md');
		await writeFile(draft, note('Draft'));
		const when = new Date(2026, 5, 7, 12, 0, 0);
		await utimes(draft, when, when);

		const entries = await loadContentEntries({ root: dir });
		const drafted = entries.find((entry) => entry.title === 'Draft');
		const committed = entries.find((entry) => entry.title === 'Committed');

		// Inside a checkout an mtime is the day the file reached this disk, which
		// on CI is the day of the build and on a fresh clone is today. It would be
		// a confident wrong answer, so there is no answer: an author who wants a
		// date on an uncommitted draft writes one in frontmatter.
		assert.equal(drafted.updated, undefined);
		assert.equal(drafted.created, undefined);
		assert.equal(drafted.updatedSource, 'none');
		assert.equal(drafted.modifiedInGit, undefined);

		// Its committed neighbour is unaffected: one file being unknown does not
		// make the rest of the vault unknown.
		assert.equal(committed.updated, '2026-03-04');
		assert.equal(committed.updatedSource, 'git');
	});
});

test('a shallow checkout derives nothing, and says so once', async () => {
	await withProject(async (dir) => {
		await initRepo(dir);
		await writeFile(path.join(dir, 'src/content/notes/Old.md'), note('Old'));
		await commitAll(dir, 'add Old', '2026-01-02T12:00:00+00:00');
		await writeFile(path.join(dir, 'src/content/notes/New.md'), note('New'));
		await commitAll(dir, 'add New', '2026-03-04T12:00:00+00:00');

		// What `actions/checkout` does by default. `file://` because git ignores
		// `--depth` on a plain local path clone and says so.
		const clone = path.join(dir, 'clone');
		await run('git', ['clone', '--quiet', '--depth', '1', `file://${dir}`, clone]);
		assert.equal(
			(await run('git', ['rev-parse', '--is-shallow-repository'], { cwd: clone })).stdout.trim(),
			'true'
		);

		resetShallowWarnings();
		const entries = await loadContentEntries({ root: clone });

		// In this tree git would happily report 2026-03-04 for `Old.md`, whose
		// real last commit was January: the grafted boundary makes one commit
		// stand in for all of them. Refused rather than reported.
		assert.equal(entries.length, 2);
		for (const entry of entries) {
			assert.equal(entry.updated, undefined, entry.file);
			assert.equal(entry.created, undefined, entry.file);
			assert.equal(entry.updatedSource, 'none', entry.file);
			assert.equal(entry.modifiedInGit, undefined, entry.file);
		}
	});
});

test('frontmatter still answers in a shallow checkout', async () => {
	await withProject(async (dir) => {
		await initRepo(dir);
		await writeFile(
			path.join(dir, 'src/content/notes/Claimed.md'),
			note('Claimed', 'updated: 2025-12-25\n')
		);
		await writeFile(path.join(dir, 'src/content/notes/Silent.md'), note('Silent'));
		await commitAll(dir, 'add two', '2026-03-04T12:00:00+00:00');

		const clone = path.join(dir, 'clone');
		await run('git', ['clone', '--quiet', '--depth', '1', `file://${dir}`, clone]);

		resetShallowWarnings();
		const entries = await loadContentEntries({ root: clone });
		const claimed = entries.find((entry) => entry.title === 'Claimed');
		const silent = entries.find((entry) => entry.title === 'Silent');

		// A truncated history costs the derived dates, not the written ones.
		assert.equal(claimed.updated, '2025-12-25');
		assert.equal(claimed.updatedSource, 'frontmatter');
		assert.equal(silent.updatedSource, 'none');
	});
});

test('the shallow warning reaches stderr, once, leaving stdout a clean document', async () => {
	await withProject(async (dir) => {
		await initRepo(dir);
		await writeFile(path.join(dir, 'src/content/notes/Only.md'), note('Only'));
		await commitAll(dir, 'add Only', '2026-03-04T12:00:00+00:00');

		const clone = path.join(dir, 'clone');
		await run('git', ['clone', '--quiet', '--depth', '1', `file://${dir}`, clone]);

		const { code, stdout, stderr } = await commune('--root', clone, 'graph', 'query', '--json');

		assert.equal(code, 0);
		assert.equal(stderr.trimEnd(), SHALLOW_WARNING);
		// Said once, though the command loads the graph and builds it: a warning
		// repeated per entry is a warning nobody reads.
		assert.equal(stderr.trimEnd().split('\n').length, 1);

		// `--json` still means one document on stdout and nothing else.
		const payload = JSON.parse(stdout);
		assert.equal(payload.entries[0].updatedSource, 'none');
	});
});

test('a project nested inside a repository dates its own files', async () => {
	await withProject(async (dir) => {
		await initRepo(dir);
		// The project root is `site/`, not the repository root. `git log` reports
		// repository-relative paths unless told otherwise, so without `--relative`
		// every lookup here misses and every note falls back to its mtime.
		const project = path.join(dir, 'site');
		await mkdir(path.join(project, 'src/content/notes'), { recursive: true });
		await writeFile(path.join(project, 'src/content/notes/Nested.md'), note('Nested'));
		await commitAll(dir, 'add a nested project', '2026-04-05T12:00:00+00:00');

		const [entry] = await loadContentEntries({ root: project });

		assert.equal(entry.file, 'src/content/notes/Nested.md');
		assert.equal(entry.updated, '2026-04-05');
		assert.equal(entry.updatedSource, 'git');
	});
});

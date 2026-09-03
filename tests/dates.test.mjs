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
import { loadContentEntries } from '../src/lib/graph.ts';

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

test('a tree with no git history falls back to file mtimes rather than failing', async () => {
	await withProject(async (dir) => {
		// No `git init`: this is the consumer whose build runs from a tarball, a
		// Docker COPY, or a host that ships no git binary at all.
		const file = path.join(dir, 'src/content/notes/Tarball.md');
		await writeFile(file, note('Tarball'));
		const when = new Date('2026-05-06T12:00:00Z');
		await utimes(file, when, when);

		const [entry] = await loadContentEntries({ root: dir });

		assert.equal(entry.updated, '2026-05-06');
		assert.equal(entry.created, '2026-05-06');
		assert.equal(entry.updatedSource, 'mtime');
		assert.equal(entry.modifiedInGit, undefined);
	});
});

test('a file with no commit yet falls back to its mtime inside a repository', async () => {
	await withProject(async (dir) => {
		await initRepo(dir);
		await writeFile(path.join(dir, 'src/content/notes/Committed.md'), note('Committed'));
		await commitAll(dir, 'add Committed', '2026-03-04T12:00:00+00:00');

		const draft = path.join(dir, 'src/content/notes/Draft.md');
		await writeFile(draft, note('Draft'));
		const when = new Date('2026-06-07T12:00:00Z');
		await utimes(draft, when, when);

		const entries = await loadContentEntries({ root: dir });
		const drafted = entries.find((entry) => entry.title === 'Draft');

		// The note being written right now is the one an author most wants dated,
		// and it is exactly the one git has never heard of.
		assert.equal(drafted.updated, '2026-06-07');
		assert.equal(drafted.updatedSource, 'mtime');
		assert.equal(drafted.modifiedInGit, undefined);
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

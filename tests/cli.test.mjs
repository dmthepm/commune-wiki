/**
 * Tests for the `commune` binary.
 *
 * These spawn the real bin rather than importing the command modules, because
 * half of what the CLI promises is not a return value: the exit code, the
 * stdout/stderr split, and the rule that in `--json` mode stdout carries one
 * document and nothing else. A test that called `main()` directly would prove
 * none of it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BIN, commune, run, VAULT } from './helpers.mjs';
import { parseRecent } from '../src/cli/query.ts';

test('graph query returns the fixture vault as one JSON document', async () => {
	const { code, stdout, stderr } = await commune('--root', VAULT, 'graph', 'query', '--json');

	assert.equal(code, 0);
	assert.equal(stderr, '');
	const payload = JSON.parse(stdout);
	assert.equal(payload.schema, 1);
	assert.equal(payload.count, 12);
	assert.equal(payload.entries.length, 12);
	assert.match(payload.root, /tests\/fixtures\/vault$/);
});

test('a root is a project root, so file and slug are spelled from it', async () => {
	const { stdout } = await commune('--root', VAULT, 'graph', 'query', '--json');
	const alpha = JSON.parse(stdout).entries.find((entry) => entry.title === 'Alpha');

	assert.equal(alpha.file, 'src/content/notes/Alpha.md');
	assert.equal(alpha.urlPath, '/notes/alpha/');
	assert.deepEqual(alpha.outbound, ['/notes/beta/', '/notes/duplicate-two/']);
	assert.deepEqual(alpha.inbound, [
		'/notes/beta/',
		'/research/vault-research/',
		'/updates/2026-02-14/',
	]);
});

test('every entry says where its date came from', async () => {
	const { stdout } = await commune('--root', VAULT, 'graph', 'query', '--json');
	const entries = JSON.parse(stdout).entries;

	// Alpha is the one fixture note carrying an `updated:` field, so it is the
	// one entry whose date is a claim rather than a fact about the file.
	const alpha = entries.find((entry) => entry.title === 'Alpha');
	assert.equal(alpha.updated, '2026-01-02');
	assert.equal(alpha.updatedSource, 'frontmatter');

	// The rest are dated from this repository's own history — the fixture is
	// committed here — so they carry a git date and a source that says so.
	const beta = entries.find((entry) => entry.title === 'Beta');
	assert.equal(beta.updatedSource, 'git');
	assert.match(beta.updated, /^\d{4}-\d{2}-\d{2}$/);
	assert.equal(beta.modifiedInGit, beta.updated);

	// Every entry answers the question, whatever the answer is.
	for (const entry of entries) {
		assert.ok(
			['frontmatter', 'git', 'mtime', 'none'].includes(entry.updatedSource),
			`${entry.urlPath} has updatedSource ${entry.updatedSource}`
		);
	}
});

test('--root is accepted after the subcommand too', async () => {
	const before = await commune('--root', VAULT, 'graph', 'query', '--json');
	const after = await commune('graph', 'query', '--root', VAULT, '--json');

	assert.equal(after.code, 0);
	assert.equal(after.stdout, before.stdout);
});

test('filters are any-of within a flag and all-of across flags', async () => {
	const notes = await commune('--root', VAULT, 'graph', 'query', '--collection', 'notes', '--json');
	assert.equal(JSON.parse(notes.stdout).count, 8);

	const both = await commune(
		'--root', VAULT, 'graph', 'query',
		'--collection', 'research', '--collection', 'pages', '--json'
	);
	assert.equal(JSON.parse(both.stdout).count, 3);

	const crossed = await commune(
		'--root', VAULT, 'graph', 'query',
		'--collection', 'notes', '--status', 'live', '--json'
	);
	assert.deepEqual(
		JSON.parse(crossed.stdout).entries.map((entry) => entry.title),
		['Alpha', 'Beta']
	);

	const tagged = await commune('--root', VAULT, 'graph', 'query', '--tag', 'seed', '--json');
	assert.equal(JSON.parse(tagged.stdout).count, 2);
});

test('updates are a collection like any other', async () => {
	const { stdout } = await commune(
		'--root', VAULT, 'graph', 'query', '--collection', 'updates', '--json'
	);
	const { count, entries } = JSON.parse(stdout);

	assert.equal(count, 1);
	const [update] = entries;
	assert.equal(update.urlPath, '/updates/2026-02-14/');
	assert.equal(update.file, 'src/content/updates/2026-02-14.md');
	// One edge per page it rolls up: `Alpha` is named by title in `links:` and
	// again as `[[Alpha]]` in the body, and the research report by path.
	assert.deepEqual(update.outbound, ['/notes/alpha/', '/research/vault-research/']);
	// `date` is the update's subject, so it dates the entry.
	assert.equal(update.updated, '2026-02-14');
	assert.equal(update.updatedSource, 'frontmatter');
});

// `--recent` is what a weekly update job runs: "what changed since I last
// looked". The dates it filters on are mostly derived from this repository's
// own history, so these assert relationships and the reported cutoff rather
// than dates that would move with every commit here.

test('--recent takes a date and reports the cutoff it used', async () => {
	const all = await commune('--root', VAULT, 'graph', 'query', '--json');
	const since = await commune(
		'--root', VAULT, 'graph', 'query', '--recent', '2020-01-01', '--json'
	);

	const everything = JSON.parse(all.stdout);
	const recent = JSON.parse(since.stdout);

	assert.equal(recent.summary.since, '2020-01-01');
	// Every fixture entry is dated one way or another, and all of them postdate
	// 2020, so a cutoff that old returns the whole vault.
	assert.equal(recent.count, everything.count);

	// A summary without the flag does not invent a cutoff.
	assert.equal(everything.summary.since, undefined);
});

test('--recent excludes what is older, and what has no date at all', async () => {
	const { stdout } = await commune(
		'--root', VAULT, 'graph', 'query', '--recent', '2099-01-01', '--json'
	);
	const payload = JSON.parse(stdout);

	assert.equal(payload.count, 0);
	assert.equal(payload.summary.since, '2099-01-01');
});

test('--recent takes a duration, resolved to the day it means', async () => {
	const { code, stdout } = await commune(
		'--root', VAULT, 'graph', 'query', '--recent', '7d', '--json'
	);
	const { summary, entries } = JSON.parse(stdout);

	assert.equal(code, 0);

	// The same arithmetic the CLI does, in local days: `7d` means seven of the
	// reader's days, and the dates in content are calendar days.
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - 7);
	const expected = [
		cutoff.getFullYear(),
		String(cutoff.getMonth() + 1).padStart(2, '0'),
		String(cutoff.getDate()).padStart(2, '0'),
	].join('-');

	// The resolved day, not the string that was typed: a job that records what
	// it asked needs the day, because `7d` means something else tomorrow.
	assert.equal(summary.since, expected);
	for (const entry of entries) {
		assert.ok(entry.updated >= expected, `${entry.urlPath} is ${entry.updated}`);
	}
});

test('--recent parses days, weeks and dates, and nothing else', () => {
	// A fixed "today", so the arithmetic is asserted rather than recomputed.
	const today = new Date(2026, 8, 3);

	assert.equal(parseRecent('7d', today), '2026-08-27');
	assert.equal(parseRecent('2w', today), '2026-08-20');
	assert.equal(parseRecent('0d', today), '2026-09-03');
	// Across a month boundary, and a year one.
	assert.equal(parseRecent('10d', today), '2026-08-24');
	assert.equal(parseRecent('300d', today), '2025-11-07');
	// A date is taken as written; it is already the day it means.
	assert.equal(parseRecent('2026-09-01', today), '2026-09-01');

	for (const bad of ['lastweek', '7', 'd', '7m', '7 d', '', '2026-9-1', '-7d']) {
		assert.equal(parseRecent(bad, today), undefined, bad);
	}
});

test('a --recent that is neither a duration nor a date is exit 2', async () => {
	const { code, stdout, stderr } = await commune(
		'--root', VAULT, 'graph', 'query', '--recent', 'lastweek'
	);

	assert.equal(code, 2);
	assert.equal(stdout, '');
	assert.match(stderr, /--recent takes a number of days or weeks/);
});

test('--recent in text mode says which day it counted from', async () => {
	const { stdout } = await commune('--root', VAULT, 'graph', 'query', '--recent', '2020-01-01');

	assert.match(stdout.trimEnd().split('\n').at(-1), /updated since 2020-01-01$/);
});

test('orphans are isolated, not merely unlinked-to', async () => {
	const orphans = await commune('--root', VAULT, 'graph', 'query', '--orphans', '--json');
	assert.deepEqual(
		JSON.parse(orphans.stdout).entries.map((entry) => entry.urlPath),
		[
			'/notes/duplicate-one/',
			'/notes/index/',
			'/notes/isolated/',
			// Nested, isolated, and listed in scan order like any other note.
			'/notes/sub-dir/nested-note/',
			'/research/isolated/',
			'/vault-page/',
		]
	);

	// A dead end has inbound links; an orphan has none. Obsidian conflates them.
	const deadends = await commune('--root', VAULT, 'graph', 'query', '--deadends', '--json');
	assert.equal(JSON.parse(deadends.stdout).count, 8);
});

test('--unreferenced is zero inbound with any outbound, and hides updates', async () => {
	const { code, stdout } = await commune(
		'--root', VAULT, 'graph', 'query', '--unreferenced', '--json'
	);

	assert.equal(code, 0);
	const payload = JSON.parse(stdout);
	// The updates entry has zero inbound too, and is the one thing missing from
	// this list: a dated changelog entry is expected to have nothing pointing
	// at it, so it would be noise in every answer this filter is asked for.
	assert.deepEqual(
		payload.entries.map((entry) => entry.urlPath),
		[
			'/notes/duplicate-one/',
			'/notes/index/',
			'/notes/isolated/',
			'/notes/sub-dir/nested-note/',
			'/research/isolated/',
			'/vault-page/',
		]
	);
	assert.equal(payload.summary.unreferenced, payload.count);
});

test('--collection updates is how you say you meant the changelog', async () => {
	const { stdout } = await commune(
		'--root', VAULT, 'graph', 'query', '--unreferenced', '--collection', 'updates', '--json'
	);
	const payload = JSON.parse(stdout);

	assert.deepEqual(payload.entries.map((entry) => entry.urlPath), ['/updates/2026-02-14/']);
	// Two links out and nothing in: unreferenced, and emphatically not an
	// orphan. This entry is the difference between the two filters.
	assert.equal(payload.summary.orphans, 0);
	assert.equal(payload.summary.edges, 2);
	assert.equal(payload.summary.unreferenced, 1);
});

test('summary.unreferenced counts the result set, filter or no filter', async () => {
	const { stdout } = await commune('--root', VAULT, 'graph', 'query', '--json');
	const { summary } = JSON.parse(stdout);

	// Seven, not the six `--unreferenced` returns: the property is "nothing
	// points here", and the updates exclusion belongs to the filter rather than
	// to the property. Every other number in `summary` describes what came
	// back, and this one has to as well or they stop adding up together.
	assert.equal(summary.unreferenced, 7);
	assert.equal(summary.orphans, 6);
});

test('query and check answer "what did I get" in the same place', async () => {
	const query = await commune('--root', VAULT, 'graph', 'query', '--json');
	const check = await commune('--root', VAULT, 'check', '--json');

	const q = JSON.parse(query.stdout);
	const c = JSON.parse(check.stdout);

	// `count` predates `summary` and is kept as its alias, so a consumer written
	// against either spelling reads the same number.
	assert.equal(q.count, q.summary.entries);
	// An unfiltered query and a check see the same graph, so they must agree on
	// its size. They are computed from opposite ends — outbound on one side,
	// deduplicated inbound on the other — which is what makes this worth pinning.
	assert.equal(q.summary.entries, c.summary.entries);
	assert.equal(q.summary.edges, c.summary.edges);
	assert.deepEqual(q.summary, { entries: 12, edges: 7, orphans: 6, deadends: 8, unreferenced: 7 });
});

test('summary describes what was returned, not the whole corpus', async () => {
	const { stdout } = await commune(
		'--root', VAULT, 'graph', 'query', '--collection', 'notes', '--json'
	);
	const { count, summary } = JSON.parse(stdout);

	assert.equal(count, 8);
	// Four, not five: the research entry's edge into /notes/alpha/ is not an
	// edge *out of the notes collection*. Degrees on each entry stay
	// whole-graph — Alpha still reports both its inbound links — but the
	// summary counts only what was returned.
	assert.deepEqual(summary, { entries: 8, edges: 4, orphans: 4, deadends: 6, unreferenced: 4 });
});

test('a filtered query reports itself consistently', async () => {
	const { stdout } = await commune('--root', VAULT, 'graph', 'query', '--orphans', '--json');
	const { count, summary } = JSON.parse(stdout);

	// Every result is an orphan, so the filter and the count agree by construction.
	assert.equal(summary.orphans, count);
	assert.equal(summary.edges, 0);
});

test('text mode is line-per-entry with a summary last', async () => {
	const { code, stdout } = await commune('--root', VAULT, 'graph', 'query');
	const lines = stdout.trimEnd().split('\n');

	assert.equal(code, 0);
	assert.equal(lines.length, 13);
	assert.match(lines.at(-1), /^12 entries/);
});

test('an unknown flag is exit 2 with nothing on stdout', async () => {
	const { code, stdout, stderr } = await commune('--root', VAULT, 'graph', 'query', '--bogus');

	assert.equal(code, 2);
	assert.equal(stdout, '');
	assert.match(stderr, /--bogus/);
});

test('an invalid invocation in JSON mode puts the error object on stderr', async () => {
	const { code, stdout, stderr } = await commune('graph', 'wat', '--json');

	assert.equal(code, 2);
	assert.equal(stdout, '');
	assert.equal(JSON.parse(stderr).error.code, 'EUSAGE');
});

test('a root without src/content cannot be finished, which is exit 1', async () => {
	const { code, stdout, stderr } = await commune('--root', '/tmp', 'graph', 'query', '--json');

	assert.equal(code, 1);
	assert.equal(stdout, '');
	assert.equal(JSON.parse(stderr).error.code, 'ENOCONTENT');
});

test('--help exits 0 and prints usage on stdout', async () => {
	const { code, stdout } = await commune('--help');

	assert.equal(code, 0);
	assert.match(stdout, /graph query/);
	assert.match(stdout, /--root <dir>/);
});

test('--version prints package.json version, and only that', async () => {
	const { version } = JSON.parse(
		await readFile(new URL('../package.json', import.meta.url), 'utf8')
	);
	const { code, stdout, stderr } = await commune('--version');

	assert.equal(code, 0);
	assert.equal(stderr, '');
	// The whole of stdout, not a match inside it: this is what release-please
	// bumps and what a script reads, so a banner or a `v` prefix would be a
	// breaking change to a one-line contract.
	assert.equal(stdout, `${version}\n`);
	assert.match(version, /^\d+\.\d+\.\d+/);
});

test('--version answers from anywhere, unlike every verb', async () => {
	// `--root /tmp` is exit 1 (ENOCONTENT) for `graph query` and `check`,
	// which is the point: the version of an installed package is not a fact
	// about a project, and asking for it outside one has to work. Also pins
	// that the flag is read wherever it appears, not only first.
	const { code, stdout } = await commune('--root', '/tmp', '--version');

	assert.equal(code, 0);
	assert.match(stdout, /^\d+\.\d+\.\d+/);
});

test('--help lists --version', async () => {
	const { stdout } = await commune('--help');

	assert.match(stdout, /--version/);
});

test('no Astro module is loaded on the CLI path', async () => {
	const hook = fileURLToPath(new URL('./fixtures/no-astro-hook.mjs', import.meta.url));
	const { stdout } = await run(process.execPath, [
		'--import', hook, BIN, '--root', VAULT, 'graph', 'query', '--json',
	]);

	assert.equal(JSON.parse(stdout).count, 12);
});

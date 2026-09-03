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
import { fileURLToPath } from 'node:url';
import { BIN, commune, run, VAULT } from './helpers.mjs';

test('graph query returns the fixture vault as one JSON document', async () => {
	const { code, stdout, stderr } = await commune('--root', VAULT, 'graph', 'query', '--json');

	assert.equal(code, 0);
	assert.equal(stderr, '');
	const payload = JSON.parse(stdout);
	assert.equal(payload.schema, 1);
	assert.equal(payload.count, 11);
	assert.equal(payload.entries.length, 11);
	assert.match(payload.root, /tests\/fixtures\/vault$/);
});

test('a root is a project root, so file and slug are spelled from it', async () => {
	const { stdout } = await commune('--root', VAULT, 'graph', 'query', '--json');
	const alpha = JSON.parse(stdout).entries.find((entry) => entry.title === 'Alpha');

	assert.equal(alpha.file, 'src/content/notes/Alpha.md');
	assert.equal(alpha.urlPath, '/notes/alpha/');
	assert.deepEqual(alpha.outbound, ['/notes/beta/', '/notes/duplicate-two/']);
	assert.deepEqual(alpha.inbound, ['/notes/beta/', '/research/vault-research/']);
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
	assert.deepEqual(q.summary, { entries: 11, edges: 5, orphans: 6, deadends: 8 });
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
	assert.deepEqual(summary, { entries: 8, edges: 4, orphans: 4, deadends: 6 });
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
	assert.equal(lines.length, 12);
	assert.match(lines.at(-1), /^11 entries/);
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

test('no Astro module is loaded on the CLI path', async () => {
	const hook = fileURLToPath(new URL('./fixtures/no-astro-hook.mjs', import.meta.url));
	const { stdout } = await run(process.execPath, [
		'--import', hook, BIN, '--root', VAULT, 'graph', 'query', '--json',
	]);

	assert.equal(JSON.parse(stdout).count, 11);
});

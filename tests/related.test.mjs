/**
 * Tests for `graph related`.
 *
 * v1 is deterministic on purpose — `links` and `mentions`, no ranking — so
 * every case here is an exact expectation rather than a shape check. This is
 * the payload #19's connect step and #10's skills get written against, and a
 * test that only asserted "some mentions came back" would not notice the day
 * the ordering or the whole-word rule changed underneath them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIN, commune, run, VAULT } from './helpers.mjs';

test('a file source returns its links, its mentions and its inbound entries', async () => {
	const { code, stdout } = await commune(
		'--root', VAULT, 'graph', 'related', 'src/content/notes/Alpha.md', '--json'
	);

	assert.equal(code, 0);
	const payload = JSON.parse(stdout);
	assert.deepEqual(payload.source, {
		kind: 'file',
		file: 'src/content/notes/Alpha.md',
		urlPath: '/notes/alpha/',
	});
	assert.deepEqual(payload.summary, {
		links: 3,
		resolved: 2,
		unresolved: 1,
		mentions: 3,
		inbound: 2,
	});
	assert.deepEqual(
		payload.links.map((link) => [link.target, link.resolved?.urlPath ?? null]),
		[
			['Beta', '/notes/beta/'],
			['Nonexistent Note', null],
			['Shared Title', '/notes/duplicate-two/'],
		]
	);
	assert.deepEqual(
		payload.inbound.map((entry) => entry.urlPath),
		['/notes/beta/', '/research/vault-research/']
	);
});

test('mentions are whole-word, case-insensitive, and never the source itself', async () => {
	const { stdout } = await commune(
		'--root', VAULT, 'graph', 'related', 'src/content/notes/Alpha.md', '--json'
	);
	const { mentions } = JSON.parse(stdout);

	// "Beta" once and "beta note" once: two hits, one entry, count descending.
	assert.deepEqual(
		mentions.map((mention) => [mention.urlPath, mention.matched, mention.count]),
		[
			['/notes/beta/', 'beta', 2],
			['/notes/duplicate-one/', 'shared title', 1],
			['/notes/duplicate-two/', 'shared title', 1],
		]
	);
	assert.equal(
		mentions.some((mention) => mention.urlPath === '/notes/alpha/'),
		false
	);
});

test('literal text is a source with links but no inbound', async () => {
	const { code, stdout } = await commune(
		'--root', VAULT, 'graph', 'related', 'Some prose about Isolated and [[Beta]].', '--json'
	);

	assert.equal(code, 0);
	const payload = JSON.parse(stdout);
	assert.equal(payload.source.kind, 'text');
	assert.equal(payload.source.urlPath, undefined);
	assert.deepEqual(payload.inbound, []);
	assert.deepEqual(payload.links.map((link) => link.target), ['Beta']);
	assert.deepEqual(
		payload.mentions.map((mention) => mention.urlPath),
		['/notes/beta/', '/notes/isolated/']
	);
});

test('an alias shorter than three characters is not a mention', async () => {
	const { stdout } = await commune(
		'--root', VAULT, 'graph', 'related', 'A B C D, nothing to see here.', '--json'
	);

	// Beta's alias is "B". Matching it would make every capital B a connection.
	assert.deepEqual(JSON.parse(stdout).mentions, []);
});

test('- reads the draft from stdin', async () => {
	const child = run(process.execPath, [BIN, '--root', VAULT, 'graph', 'related', '-', '--json']);
	child.child.stdin.end('A draft that links [[Alpha]] and mentions Isolated.\n');
	const { stdout } = await child;

	const payload = JSON.parse(stdout);
	assert.equal(payload.source.kind, 'stdin');
	assert.deepEqual(payload.links.map((link) => link.resolved.urlPath), ['/notes/alpha/']);
	// Nothing is excluded for a stdin draft: it is not an entry, so the [[Alpha]]
	// it links to is also a mention of Alpha.
	assert.deepEqual(payload.mentions.map((mention) => mention.urlPath), [
		'/notes/alpha/',
		'/notes/isolated/',
	]);
});

test('code is not prose: a link in a fenced block is neither edge nor mention', async () => {
	const { stdout } = await commune(
		'--root', VAULT, 'graph', 'related', 'Write it as `[[Beta]]` in your note.', '--json'
	);
	const payload = JSON.parse(stdout);

	assert.deepEqual(payload.links, []);
	assert.deepEqual(payload.mentions, []);
});

test('an unquoted path with spaces is a usage error, not a silent wrong answer', async () => {
	const { code, stderr } = await commune(
		'--root', VAULT, 'graph', 'related', 'src/content/notes/Duplicate', 'One.md'
	);

	assert.equal(code, 2);
	assert.match(stderr, /has to be quoted/);
});

test('related runs on the engine with no Astro module on the path', async () => {
	const { code, stdout } = await commune(
		'graph', 'related', 'src/content/notes/Atomic Notes.md', '--json'
	);

	assert.equal(code, 0);
	const payload = JSON.parse(stdout);
	assert.equal(payload.source.urlPath, '/notes/atomic-notes/');
	assert.ok(payload.summary.resolved > 0, 'expected resolved links');
	assert.ok(payload.summary.inbound > 0, 'expected inbound entries');
});

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
import { BIN, commune, DICTATION, run, VAULT } from './helpers.mjs';

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
		mentions: 1,
		inbound: 3,
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
		['/notes/beta/', '/research/vault-research/', '/updates/2026-02-14/']
	);
});

test('mentions are whole-word, case-insensitive, and never the source itself', async () => {
	const { stdout } = await commune(
		'--root', VAULT, 'graph', 'related', 'src/content/notes/Alpha.md', '--json'
	);
	const { mentions } = JSON.parse(stdout);

	// `[[Beta|the beta note]]`: the target is the link, the label is prose, so
	// one hit. `[[Shared Title]]` is all target, so it names nothing in prose.
	assert.deepEqual(
		mentions.map((mention) => [mention.urlPath, mention.matched, mention.count, mention.linked]),
		[['/notes/beta/', 'beta', 1, true]]
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
		['/notes/isolated/']
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
	// The [[Alpha]] target is the link, not prose: only Isolated is mentioned.
	assert.deepEqual(payload.mentions.map((mention) => [mention.urlPath, mention.linked]), [
		['/notes/isolated/', false],
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

test('a dictated title split across a space still finds the note', async () => {
	const { code, stdout } = await commune(
		'--root', DICTATION, 'graph', 'related', 'I talked about noon tide today.', '--json'
	);

	assert.equal(code, 0);
	const { mentions } = JSON.parse(stdout);
	assert.deepEqual(
		mentions.map((mention) => [mention.title, mention.matched, mention.count]),
		[['Noontide', 'noon tide', 1]]
	);
});

test('a dictated title run together still finds the note', async () => {
	const { stdout } = await commune(
		'--root', DICTATION, 'graph', 'related', 'Merged it into mainbranch.', '--json'
	);

	// The title is "Main Branch"; `matched` reports the surface form, so the
	// connect step can show which phrase in the dump the link would replace.
	assert.deepEqual(
		JSON.parse(stdout).mentions.map((mention) => [mention.title, mention.matched]),
		[['Main Branch', 'mainbranch']]
	);
});

test('normalising whitespace does not dissolve the word boundary at a title\'s edges', async () => {
	const { stdout } = await commune(
		'--root', DICTATION, 'graph', 'related', 'I ate a pancake.', '--json'
	);

	// "pancake" contains "cake" but is one word, so it is not a mention of Cake.
	assert.deepEqual(JSON.parse(stdout).mentions, []);
});

test('a title inside a longer phrase is still a mention when the boundary is real', async () => {
	const { stdout } = await commune(
		'--root', DICTATION, 'graph', 'related', 'I ate a pan cake and some more cake.', '--json'
	);

	// "pan cake" normalises to "pancake", which contains "cake" at a real word
	// boundary in the original — dictation splitting a word is exactly the case
	// #69 exists for, and it cannot be told apart from a genuine two-word phrase.
	assert.deepEqual(
		JSON.parse(stdout).mentions.map((mention) => [mention.title, mention.matched, mention.count]),
		[['Cake', 'cake', 2]]
	);
});

test('a dictated draft on stdin finds both distorted titles at once', async () => {
	const child = run(process.execPath, [BIN, '--root', DICTATION, 'graph', 'related', '-', '--json']);
	child.child.stdin.end('---\ntitle: Draft\n---\n\nNoon Tide and Main Branch, dictated.\n');
	const { stdout } = await child;

	assert.deepEqual(
		JSON.parse(stdout).mentions.map((mention) => [mention.title, mention.matched]),
		[['Main Branch', 'main branch'], ['Noontide', 'noon tide']]
	);
});

const related = async (root, text) => {
	const { code, stdout } = await commune('--root', root, 'graph', 'related', text, '--json');
	assert.equal(code, 0);
	return JSON.parse(stdout);
};

test('a name that appears only inside a URL is not a mention', async () => {
	const { mentions } = await related(
		DICTATION,
		'See https://example.com/noontide/pull/20 and <https://example.com/cake> and www.example.com/main-branch.'
	);

	assert.deepEqual(mentions, []);
});

test('a URL with any scheme is not prose', async () => {
	const { mentions } = await related(
		DICTATION,
		'Sync over wss://sync.example.com/noontide/cake and ftp://files.example.com/main-branch.'
	);

	assert.deepEqual(mentions, []);
});

test('a markdown link destination is not prose, but its visible text is', async () => {
	const dest = await related(DICTATION, 'Read [the docs](./Noontide.md "Cake") first.');
	assert.deepEqual(dest.mentions, []);

	const text = await related(DICTATION, 'Read [Noontide](https://example.com/noontide) first.');
	assert.deepEqual(
		text.mentions.map((mention) => [mention.title, mention.count]),
		[['Noontide', 1]]
	);
});

test('a WikiLinked mention is marked linked and its brackets do not inflate the count', async () => {
	const { mentions } = await related(
		DICTATION,
		'[[Noontide]] came first. [[Cake#Icing]] too. Later, Noontide again.'
	);

	assert.deepEqual(
		mentions.map((mention) => [mention.title, mention.count, mention.linked]),
		[['Noontide', 1, true]]
	);
});

test('the display text of a WikiLink is prose; the target is not', async () => {
	const { mentions } = await related(DICTATION, 'The [[Noontide|noon tide]] and [[Cake|a treat]].');

	assert.deepEqual(
		mentions.map((mention) => [mention.title, mention.matched, mention.count, mention.linked]),
		[['Noontide', 'noon tide', 1, true]]
	);
});

test('a prose mention the text does not link is marked unlinked', async () => {
	const { mentions } = await related(DICTATION, 'Noontide matters, and so does [[Cake]] and cake.');

	assert.deepEqual(
		mentions.map((mention) => [mention.title, mention.linked]),
		[['Cake', true], ['Noontide', false]]
	);
});

test('an alias is a mention, and is linked when the text links its note', async () => {
	// "Beta's twin" names the note twice over: the title, then the alias.
	const bare = await related(VAULT, "Beta's twin is here.");
	assert.deepEqual(
		bare.mentions.map((mention) => [mention.urlPath, mention.count, mention.linked]),
		[['/notes/beta/', 2, false]]
	);

	const linked = await related(VAULT, "Beta's twin is here, and see [[Beta]].");
	assert.deepEqual(
		linked.mentions.map((mention) => [mention.urlPath, mention.count, mention.linked]),
		[['/notes/beta/', 2, true]]
	);
});

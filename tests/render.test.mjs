/**
 * Tests for `commune render`.
 *
 * The claim this verb makes is that its HTML is the site's HTML, so the cases
 * are the four link shapes whose rendering is decided by the engine's own
 * plugins — a wikilink, a piped wikilink, one that resolves to nothing, and an
 * external link — asserted as the exact anchors the built site emits. A shape
 * check would pass on a pipeline missing a plugin, which is the failure this
 * file exists to catch.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIN, commune, run, VAULT } from './helpers.mjs';

/** Render markdown from stdin, which is how a draft that is not a file is asked about. */
async function render(markdown, ...args) {
	const child = run(process.execPath, [BIN, '--root', VAULT, 'render', '-', ...args]);
	child.child.stdin.end(markdown);
	return child;
}

test('a wikilink renders as the anchor the site renders', async () => {
	const { stdout } = await render('[[Alpha]] is a note.\n');

	assert.equal(stdout.trim(), '<p><a href="/notes/alpha/" class="wikilink">Alpha</a> is a note.</p>');
});

test('a piped wikilink keeps the target and shows the label', async () => {
	const { stdout } = await render('See [[Beta|the beta note]].\n');

	assert.match(stdout, /<a href="\/notes\/beta\/" class="wikilink">the beta note<\/a>/);
});

test('a wikilink that resolves to nothing renders as plain text', async () => {
	const { stdout } = await render('A [[Nonexistent Note]] here.\n');

	// The site drops the brackets and renders the words. That is the behaviour
	// worth pinning: it is why `--json` has to report `unresolved` separately,
	// since by this point the broken link looks exactly like a sentence.
	assert.equal(stdout.trim(), '<p>A Nonexistent Note here.</p>');
});

test('an external link is marked, an internal one is not', async () => {
	const { stdout } = await render(
		'[out](https://elsewhere.example/) and [home](https://wiki.example/x)\n',
		'--site', 'https://wiki.example'
	);

	assert.match(
		stdout,
		/<a href="https:\/\/elsewhere\.example\/" target="_blank" rel="noopener noreferrer">out<\/a>/
	);
	assert.match(stdout, /<a href="https:\/\/wiki\.example\/x">home<\/a>/);
});

test('--json carries the html, the links and what resolved to nothing', async () => {
	const { stdout } = await render('[[Alpha]], [[Beta|b]] and [[Nowhere]].\n', '--json');
	const payload = JSON.parse(stdout);

	assert.equal(payload.schema, 1);
	assert.equal(payload.source.kind, 'stdin');
	assert.match(payload.html, /href="\/notes\/alpha\/"/);
	assert.deepEqual(
		payload.links.map((link) => [link.target, link.resolved?.urlPath ?? null]),
		[
			['Alpha', '/notes/alpha/'],
			['Beta', '/notes/beta/'],
			['Nowhere', null],
		]
	);
	assert.deepEqual(payload.unresolved, ['Nowhere']);
});

test('a path is read relative to the root, with its frontmatter split off', async () => {
	const { code, stdout } = await commune(
		'--root', VAULT, 'render', 'src/content/notes/Alpha.md', '--json'
	);

	assert.equal(code, 0);
	const payload = JSON.parse(stdout);
	assert.deepEqual(payload.source, { kind: 'file', file: 'src/content/notes/Alpha.md' });
	// The title would be the first thing in the HTML if frontmatter were
	// rendered as markdown, and `visibility: public` the second.
	assert.equal(payload.html.includes('visibility'), false);
	assert.match(payload.html, /<a href="\/notes\/beta\/" class="wikilink">the beta note<\/a>/);
	assert.deepEqual(payload.unresolved, ['Nonexistent Note']);
});

test('the site comes from the Astro config when the flag does not name one', async () => {
	// The engine's own config declares https://devonmeadows.com, so a link there
	// is internal without anyone passing --site.
	const child = run(process.execPath, [BIN, 'render', '-', '--json']);
	child.child.stdin.end('[home](https://devonmeadows.com/notes/) and [out](https://example.org/)\n');
	const { stdout, stderr } = await child;

	const { html, site } = JSON.parse(stdout);
	assert.equal(site, 'https://devonmeadows.com');
	assert.equal(html.includes('href="https://devonmeadows.com/notes/" target'), false);
	assert.match(html, /href="https:\/\/example\.org\/" target="_blank"/);
	// Nothing to warn about: an origin was found.
	assert.equal(stderr, '');
});

test('with no origin anywhere, the default is used and said out loud', async () => {
	const { stdout, stderr } = await render('[out](https://elsewhere.example/)\n', '--json');

	// The fixture vault has no astro.config, which is the case a draft rendered
	// from a bare directory hits.
	assert.equal(JSON.parse(stdout).site, 'https://example.com');
	assert.match(stderr, /rendering against https:\/\/example\.com/);
});

test('a path that names no file is exit 1, not silently rendered as its own name', async () => {
	const { code, stdout, stderr } = await commune('--root', VAULT, 'render', 'src/content/nope.md');

	assert.equal(code, 1);
	assert.equal(stdout, '');
	assert.match(stderr, /cannot read src\/content\/nope\.md/);
});

test('render with no argument is a usage error naming both spellings', async () => {
	const { code, stderr } = await commune('--root', VAULT, 'render');

	assert.equal(code, 2);
	assert.match(stderr, /render needs a path to a markdown file, or - for stdin/);
});

test('--site has to be an origin', async () => {
	const { code, stderr } = await commune('--root', VAULT, 'render', '-', '--site', 'devon.md');

	assert.equal(code, 2);
	assert.match(stderr, /--site takes an origin/);
});

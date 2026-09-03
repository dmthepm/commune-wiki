/**
 * Tests for the graph core's link extraction.
 *
 * Each case is one of the link forms Obsidian counts as an edge in
 * `resolvedLinks`. The table in issue #25 is the specification; every row of it
 * is locked here so a future regex tweak cannot silently drop an edge.
 *
 * Node strips the types for a local `.ts` import, so this `.mjs` file imports
 * the graph core directly — the same trick `astro.config.mjs` uses.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	buildLinkLookup,
	buildUrlLookup,
	extractLinks,
	loadContentEntries,
	resolveLink,
} from '../src/lib/graph.ts';

/** Resolve the single edge in a snippet against the real content tree. */
async function resolveOnly(markdown) {
	const entries = await loadContentEntries();
	const byName = buildLinkLookup(entries);
	const byUrl = buildUrlLookup(entries);
	const links = extractLinks(markdown);
	assert.equal(links.length, 1, `expected one edge in ${JSON.stringify(markdown)}`);
	return resolveLink(links[0], byName, byUrl);
}

test('wikilink is an edge', () => {
	assert.deepEqual(extractLinks('See [[Evergreen Notes]] for more.'), [
		{ kind: 'name', target: 'Evergreen Notes' },
	]);
});

test('piped wikilink links to the target, not the display text', () => {
	assert.deepEqual(extractLinks('See [[Evergreen Notes|these notes]].'), [
		{ kind: 'name', target: 'Evergreen Notes' },
	]);
});

test('embed is an edge', () => {
	assert.deepEqual(extractLinks('![[Evergreen Notes]]'), [
		{ kind: 'name', target: 'Evergreen Notes' },
	]);
});

test('attachment embed is an edge', () => {
	assert.deepEqual(extractLinks('![[diagram.png]]'), [
		{ kind: 'name', target: 'diagram.png' },
	]);
});

// BUG 1 — Obsidian stores the edge without the subpath, so `[[Note#Heading]]`
// and `[[Note]]` are the same edge. Keeping the subpath matched no title and
// was reported as a broken link.

test('heading subpath is stripped from a wikilink', () => {
	assert.deepEqual(extractLinks('[[Evergreen Notes#Why]]'), [
		{ kind: 'name', target: 'Evergreen Notes' },
	]);
});

test('block subpath is stripped from a wikilink', () => {
	assert.deepEqual(extractLinks('[[Evergreen Notes^abc123]]'), [
		{ kind: 'name', target: 'Evergreen Notes' },
	]);
});

test('a same-file subpath link is not an edge', () => {
	assert.deepEqual(extractLinks('Jump to [[#Why]] or [[^abc123]].'), []);
});

test('subpath and display text collapse to one edge', () => {
	assert.deepEqual(extractLinks('[[Evergreen Notes#Why|why]] and [[Evergreen Notes]]'), [
		{ kind: 'name', target: 'Evergreen Notes' },
	]);
});

// BUG 2 — an absolute path is path-shaped, not title-shaped. It kept its
// trailing slash, was handed to the title lookup, and resolved to nothing;
// the slashless spelling only resolved by the coincidence of a self-slug alias.

test('absolute markdown link is a url edge, trailing slash and all', () => {
	assert.deepEqual(extractLinks('[Atomic Notes](/notes/atomic-notes/)'), [
		{ kind: 'url', target: '/notes/atomic-notes/' },
	]);
});

test('absolute markdown link without a trailing slash normalises to the canonical url', () => {
	assert.deepEqual(extractLinks('[Atomic Notes](/notes/atomic-notes)'), [
		{ kind: 'url', target: '/notes/atomic-notes/' },
	]);
});

test('both spellings of an absolute link are one edge', () => {
	assert.deepEqual(
		extractLinks('[a](/notes/atomic-notes/) and [b](/notes/atomic-notes)'),
		[{ kind: 'url', target: '/notes/atomic-notes/' }]
	);
});

test('a url subpath does not change the edge', () => {
	assert.deepEqual(extractLinks('[why](/notes/atomic-notes/#why)'), [
		{ kind: 'url', target: '/notes/atomic-notes/' },
	]);
});

test('external links are not edges', () => {
	assert.deepEqual(
		extractLinks('[a](https://example.com/notes/x/) [b](mailto:x@example.com) [c](//example.com/y)'),
		[]
	);
});

// The regression that matters most: the canonical link this site's own pages
// emit must reach the same note as the wikilink spelling of it.
test('an absolute markdown link resolves to the same target as the wikilink', async () => {
	const viaWikilink = await resolveOnly('[[Atomic Notes]]');
	assert.ok(viaWikilink, 'Atomic Notes should exist in the content tree');
	assert.equal(viaWikilink.urlPath, '/notes/atomic-notes/');

	assert.deepEqual(await resolveOnly('[Atomic Notes](/notes/atomic-notes/)'), viaWikilink);
	assert.deepEqual(await resolveOnly('[Atomic Notes](/notes/atomic-notes)'), viaWikilink);
});

test('an absolute link to nothing does not resolve', async () => {
	assert.equal(await resolveOnly('[x](/notes/no-such-note/)'), undefined);
});

test('a url edge is never resolved through the title lookup', async () => {
	// `atomic-notes` is a title-shaped lookup key only because the note lists it
	// as an alias. A url-shaped target must not reach that table.
	assert.equal(await resolveOnly('[x](/atomic-notes/)'), undefined);
});

// BUG 3 — the old regex was hardcoded to `/notes/`, so research and page
// routes were not edges at all. Any absolute path is a candidate edge; whether
// it resolves is the lookup's business, not the regex's.

test('a research link is an edge', () => {
	assert.deepEqual(extractLinks('[x](/research/foo/)'), [
		{ kind: 'url', target: '/research/foo/' },
	]);
});

test('a page link is an edge', () => {
	assert.deepEqual(extractLinks('[x](/about-this-wiki/)'), [
		{ kind: 'url', target: '/about-this-wiki/' },
	]);
});

test('a link to a standalone page resolves', async () => {
	const target = await resolveOnly('[About this wiki](/about-this-wiki/)');
	assert.ok(target, 'About this wiki should exist in the content tree');
	assert.equal(target.collection, 'pages');
	assert.deepEqual(target, await resolveOnly('[[About this wiki]]'));
});

// BUG 4 — Obsidian writes a relative file link when a note is dragged in.
// Percent-encoded or not, it is an internal link and an edge.

// A raw space in an unbracketed destination is not a link in CommonMark, so it
// is not one here either — the graph must agree with what remark renders.
// Obsidian percent-encodes, and that form is the one that matters.
test('a raw space in a relative destination is not a link', () => {
	assert.deepEqual(extractLinks('[x](Evergreen Notes.md)'), []);
});

test('percent-encoding in a relative file link is decoded', () => {
	assert.deepEqual(extractLinks('[x](Evergreen%20Notes.md)'), [
		{ kind: 'name', target: 'Evergreen Notes' },
	]);
});

test('a relative file link keeps only its basename', () => {
	assert.deepEqual(extractLinks('[x](../notes/Evergreen%20Notes.md)'), [
		{ kind: 'name', target: 'Evergreen Notes' },
	]);
});

test('a subpath is stripped from a relative file link', () => {
	assert.deepEqual(extractLinks('[x](Evergreen%20Notes.md#Why)'), [
		{ kind: 'name', target: 'Evergreen Notes' },
	]);
});

test('a relative link to a non-markdown file is not an edge', () => {
	assert.deepEqual(extractLinks('[x](notes.csv) [y](#why)'), []);
});

test('a relative file link resolves to the same target as its wikilink', async () => {
	const viaWikilink = await resolveOnly('[[Evergreen Notes]]');
	assert.ok(viaWikilink, 'Evergreen Notes should exist in the content tree');
	assert.deepEqual(await resolveOnly('[x](Evergreen%20Notes.md)'), viaWikilink);
});

// BUG 5 — `loadContentEntries()` hands `extractLinks()` the body only, so a
// wikilink in a frontmatter value was invisible. Obsidian records those as
// `frontmatterLinks` and counts them as edges.

test('a wikilink in a frontmatter value is an edge', () => {
	assert.deepEqual(extractLinks('', { related: '[[Evergreen Notes]]' }), [
		{ kind: 'name', target: 'Evergreen Notes' },
	]);
});

test('frontmatter list and nested values are scanned', () => {
	assert.deepEqual(
		extractLinks('', { see: ['[[Atomic Notes]]', '[[Commune]]'], meta: { of: '[[Build in Public]]' } }),
		[
			{ kind: 'name', target: 'Atomic Notes' },
			{ kind: 'name', target: 'Commune' },
			{ kind: 'name', target: 'Build in Public' },
		]
	);
});

test('aliases and tags are not links', () => {
	assert.deepEqual(
		extractLinks('', { aliases: ['[[Evergreen Notes]]'], tags: ['[[Commune]]'] }),
		[]
	);
});

test('frontmatter edges deduplicate against body edges', () => {
	assert.deepEqual(extractLinks('[[Evergreen Notes]]', { related: '[[Evergreen Notes]]' }), [
		{ kind: 'name', target: 'Evergreen Notes' },
	]);
});

test('a frontmatter subpath is stripped like any other', () => {
	assert.deepEqual(extractLinks('', { related: '[[Evergreen Notes#Why]]' }), [
		{ kind: 'name', target: 'Evergreen Notes' },
	]);
});

// `links:` is how an update names the pages it rolls up. Everywhere else in
// frontmatter a link has to be spelled `[[like this]]`; here a bare string is
// the target, because the field means nothing else.

test('bare strings under links: are targets, by title or by path', () => {
	assert.deepEqual(extractLinks('', { links: ['Atomic Notes', '/notes/commune/'] }), [
		{ kind: 'name', target: 'Atomic Notes' },
		{ kind: 'url', target: '/notes/commune/' },
	]);
});

test('a links: entry can still be spelled as a wikilink', () => {
	assert.deepEqual(extractLinks('', { links: ['[[Atomic Notes]]'] }), [
		{ kind: 'name', target: 'Atomic Notes' },
	]);
});

test('an external URL under links: is not an edge', () => {
	assert.deepEqual(extractLinks('', { links: ['https://example.com/x', '//example.com/y'] }), []);
});

test('a bare string outside links: is prose, not a target', () => {
	// The rule that keeps a page's own `url:` from becoming a self-edge, and
	// every summary from becoming a link to a note that shares its first words.
	assert.deepEqual(extractLinks('', { url: '/about/', summary: 'Atomic Notes' }), []);
});

test('links: and the body naming the same page is one edge', () => {
	assert.deepEqual(extractLinks('[[Atomic Notes]] got a rewrite.', { links: ['Atomic Notes'] }), [
		{ kind: 'name', target: 'Atomic Notes' },
	]);
});

test('loaded entries carry their frontmatter, so the caller can pass it', async () => {
	const entries = await loadContentEntries();
	assert.ok(entries.length > 0);
	for (const entry of entries) {
		assert.equal(typeof entry.frontmatter, 'object');
		assert.equal(entry.frontmatter.title, entry.title);
	}
});

// A link written inside code is documentation about the syntax, not an edge.
// `stripCode()` already handled this; these lock it against a regex change.

test('a wikilink in a fenced block is not an edge', () => {
	const markdown = [
		'Write it like this:',
		'',
		'```markdown',
		'[[Evergreen Notes]]',
		'[x](/notes/atomic-notes/)',
		'```',
		'',
		'Then [[Atomic Notes]] is the real one.',
	].join('\n');

	assert.deepEqual(extractLinks(markdown), [{ kind: 'name', target: 'Atomic Notes' }]);
});

test('a wikilink in a tilde-fenced block is not an edge', () => {
	assert.deepEqual(extractLinks('~~~\n[[Evergreen Notes]]\n~~~\n'), []);
});

test('a link in inline code is not an edge', () => {
	assert.deepEqual(
		extractLinks('Use `[[Evergreen Notes]]` or `[x](/notes/atomic-notes/)` to link.'),
		[]
	);
});

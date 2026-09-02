/**
 * Tests for the graph core's link extraction.
 *
 * Each case is one of the link forms Obsidian counts as an edge in
 * `resolvedLinks`. The table in issue #25 is the specification; every row of it
 * is locked here so a future regex tweak cannot silently drop an edge.
 *
 * Node strips the types for a local `.ts` import, so this `.mjs` file imports
 * the graph core directly — the same trick `scripts/test-search-index.mjs` uses.
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

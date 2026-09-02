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
import { extractLinks } from '../src/lib/graph.ts';

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

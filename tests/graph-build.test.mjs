/**
 * Tests for graph construction in the core.
 *
 * `public/backlinks.json` is a committed runtime contract: four client scripts
 * and the note page read it. The strongest available check on moving its
 * construction out of the Astro integration is that the core reproduces the
 * committed bytes exactly — key order, property order and all — so this test
 * compares serialized output rather than a deep-equal on parsed objects.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGraph, loadContentEntries, toBacklinksJson } from '../src/lib/graph.ts';
import { VAULT } from './vault.test.mjs';

test('the core reproduces the committed backlinks.json byte for byte', async () => {
	const graph = buildGraph(await loadContentEntries());
	const rendered = JSON.stringify(toBacklinksJson(graph), null, 2) + '\n';

	assert.equal(rendered, await readFile('public/backlinks.json', 'utf8'));
});

test('graph construction reports broken links as data, not as log lines', async () => {
	const graph = buildGraph(await loadContentEntries());
	const broken = graph.diagnostics.filter((d) => d.rule === 'broken-link');

	assert.equal(broken.length, graph.diagnostics.length);
	assert.equal(broken.length, 32);
	assert.equal(broken[0].severity, 'warning');
	assert.match(broken[0].file, /^src\/content\//);
});

test('inbound and outbound stay resolved urlPaths only', async () => {
	const graph = buildGraph(await loadContentEntries());
	const urls = new Set(Object.keys(graph.nodes));

	for (const node of Object.values(graph.nodes)) {
		for (const url of [...node.outbound, ...node.inbound]) {
			assert.ok(urls.has(url), `${url} is not a node`);
		}
	}
	assert.equal(graph.totalBacklinks, 41);
});

test('the fixture vault resolves its links and reports its one broken edge', async () => {
	const graph = buildGraph(await loadContentEntries({ root: VAULT }));

	assert.equal(Object.keys(graph.nodes).length, 10);
	assert.deepEqual(
		graph.diagnostics.filter((d) => d.rule === 'broken-link').map((d) => d.target),
		['Nonexistent Note']
	);
	// Last claimant of a duplicated title wins resolution, unchanged.
	assert.deepEqual(graph.nodes['/notes/alpha/'].outbound, [
		'/notes/beta/',
		'/notes/duplicate-two/',
	]);
	assert.deepEqual(graph.nodes['/notes/isolated/'], {
		slug: '/notes/isolated/',
		title: 'Isolated',
		collection: 'notes',
		aliases: [],
		outbound: [],
		inbound: [],
		tags: [],
		status: 'seed',
	});
});

test('stars stay off in a corpus below the minimum note count', async () => {
	const graph = buildGraph(await loadContentEntries({ root: VAULT }));

	assert.equal(
		Object.values(graph.nodes).some((node) => node.isStarred),
		false
	);
});

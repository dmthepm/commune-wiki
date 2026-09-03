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
import {
	buildGraph,
	loadContentEntries,
	summarizeSite,
	toBacklinksJson,
} from '../src/lib/graph.ts';
import { VAULT } from './helpers.mjs';

test('the core reproduces the committed backlinks.json byte for byte', async () => {
	const graph = buildGraph(await loadContentEntries());
	const rendered = JSON.stringify(toBacklinksJson(graph), null, 2) + '\n';

	assert.equal(rendered, await readFile('public/backlinks.json', 'utf8'));
});

test('graph construction reports broken links as data, not as log lines', async () => {
	const graph = buildGraph(await loadContentEntries());
	const broken = graph.diagnostics.filter((d) => d.rule === 'broken-link');

	assert.equal(broken.length, graph.diagnostics.length);
	assert.equal(broken.length, 30);
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
	assert.equal(graph.totalBacklinks, 45);
});

test('the fixture vault resolves its links and reports its one broken edge', async () => {
	const graph = buildGraph(await loadContentEntries({ root: VAULT }));

	assert.equal(Object.keys(graph.nodes).length, 12);
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

// "When did this wiki last change" is a different question from "when did this
// page last change", and the site-wide answer is what a home page and an
// `llms.txt` need. It is written to `site.json` rather than into
// `backlinks.json`, whose every top-level key is a urlPath.

test('the site summary is the newest entry, named and sourced', () => {
	const site = summarizeSite([
		{ urlPath: '/notes/old/', updated: '2025-01-01', updatedSource: 'frontmatter' },
		{
			urlPath: '/notes/claimed/',
			updated: '2026-02-14',
			updatedSource: 'frontmatter',
			modifiedInGit: '2026-09-03',
		},
		{ urlPath: '/notes/derived/', updated: '2026-02-01', updatedSource: 'git' },
	]);

	assert.deepEqual(site, {
		lastUpdated: '2026-02-14',
		lastUpdatedPath: '/notes/claimed/',
		lastUpdatedSource: 'frontmatter',
		// The pair that matters: the site's newest *claim* is February, and the
		// repository says something changed in September. A home page can show
		// both instead of quietly showing the older one.
		lastModifiedInGit: '2026-09-03',
		entries: 3,
	});
});

test('the summary of a real vault is the newest date in it', async () => {
	const entries = await loadContentEntries({ root: VAULT });
	const site = summarizeSite(entries);

	// Not a fixed date: the fixture is committed in this repository, so most of
	// its entries are dated from history and every commit here would move the
	// number. What is fixed is the relationship.
	const newest = entries.reduce((a, b) => ((b.updated ?? '') > (a.updated ?? '') ? b : a));
	assert.equal(site.lastUpdated, newest.updated);
	assert.equal(site.lastUpdatedPath, newest.urlPath);
	assert.equal(site.entries, entries.length);
	assert.ok(site.lastModifiedInGit >= site.lastUpdated);
});

test('a site with no dated entries has no lastUpdated rather than a wrong one', () => {
	const site = summarizeSite([
		{ urlPath: '/notes/x/', updated: undefined, updatedSource: 'none' },
		{ urlPath: '/notes/y/', updated: undefined, updatedSource: 'none' },
	]);

	assert.deepEqual(site, { entries: 2 });
});

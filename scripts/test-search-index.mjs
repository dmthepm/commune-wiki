/**
 * Build check: standalone pages are searchable, and WikiLinks are canonical.
 *
 * Runs after `astro build`. Three assertions:
 *   1. every page in the `pages` collection is present in the search index
 *   2. every WikiLink that resolves uses the target's exact title (no pipes,
 *      no case drift) — the canonical-title rule
 *   3. WikiLinks pointing at standalone pages actually render as hrefs
 *
 * Reads the content graph from src/lib/graph.ts — the same resolver the remark
 * plugin and the backlinks integration use. Node strips the types natively for
 * a local .ts import, so there is no fourth copy of the content scan here.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { findNoncanonicalTitles, loadContentEntries, stripCode } from '../src/lib/graph.ts';

const FAIL = (message) => {
	console.error(`FAIL: ${message}`);
	process.exit(1);
};

const graph = JSON.parse(await readFile('public/backlinks.json', 'utf8'));
const entries = await loadContentEntries();
const pages = entries.filter((entry) => entry.collection === 'pages');

// 1. Every standalone page made it into the search index.
const missing = [];
for (const page of pages) {
	const indexed = graph[page.urlPath];
	if (!indexed || indexed.title !== page.title || indexed.collection !== 'pages') {
		missing.push(`${page.urlPath} (${page.title})`);
	}
}

if (missing.length) {
	FAIL(`standalone pages missing from search index: ${missing.join(', ')}`);
}

// 2. WikiLinks must name their target exactly. A piped link or a near-miss
//    title still renders, which is what makes this worth checking: it fails
//    silently and quietly decouples the vault from the site.
//
//    The rule itself lives in the graph core, where `commune check` reports it
//    as a `noncanonical-title` finding. This script is the *gate*: same rule,
//    same findings, but a build that violates it stops. Two copies of one rule
//    is the bug #3 was opened to kill, so there is only ever one.
const noncanonical = findNoncanonicalTitles(entries);

if (noncanonical.length) {
	FAIL(
		`WikiLinks must use exact page titles:\n${noncanonical
			.map((finding) => `${finding.file}: ${finding.message}`)
			.join('\n')}`
	);
}

// 3. A note that links to a standalone page must actually render that href.
//    This is the one assertion that catches a resolver regression rather than
//    a content mistake.
const pageTargets = new Map();
for (const page of pages) {
	pageTargets.set(page.title.toLowerCase(), page.urlPath);
	for (const alias of page.aliases) {
		pageTargets.set(alias.toLowerCase(), page.urlPath);
	}
}

const unresolved = [];
for (const entry of entries) {
	if (entry.collection !== 'notes') continue;

	const expected = new Set();
	for (const match of stripCode(entry.body).matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
		const url = pageTargets.get(match[1].trim().toLowerCase());
		if (url) expected.add(url);
	}
	if (!expected.size) continue;

	const html = await readFile(path.join('dist-site/notes', entry.slug, 'index.html'), 'utf8');
	for (const url of expected) {
		if (!html.includes(`href="${url}"`)) unresolved.push(`${entry.slug} -> ${url}`);
	}
}

if (unresolved.length) {
	FAIL(`WikiLinks to standalone pages did not render: ${unresolved.join(', ')}`);
}

console.log(
	`PASS: ${pages.length} standalone page${pages.length === 1 ? '' : 's'} indexed for search and linked from notes`
);

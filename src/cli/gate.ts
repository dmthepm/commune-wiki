/**
 * `commune gate` — the build check, as a verb.
 *
 * This is the one command in the CLI whose exit code answers a question about
 * your *content* rather than about the command. Everywhere else the contract is
 * "0 means I finished, findings or not", precisely so an agent can tell a dirty
 * vault from a broken tool. A gate inverts that on purpose: its whole job is to
 * stop a build, and a build stops on a non-zero exit. `usage.ts` says so out
 * loud, because a reader who has internalised the rule needs to be told where
 * the exception is.
 *
 * It was `scripts/test-search-index.mjs`, which imported the graph core by
 * relative path. That works from a checkout and is unreachable from
 * `node_modules`, so the one repo that most needs this check — a wiki built
 * with the package — was the one repo that could not run it. The three
 * assertions are unchanged; only the way you invoke them is.
 *
 * Three assertions:
 *   1. every page in the `pages` collection is present in the search index
 *   2. every WikiLink that resolves uses the target's exact title (no pipes,
 *      no case drift) — the canonical-title rule
 *   3. WikiLinks pointing at standalone pages actually render as hrefs
 *
 * The canonical-title rule itself lives in the graph core, where `commune
 * check` reports it as a `noncanonical-title` finding. This verb is the *gate*:
 * same rule, same findings, but a build that violates it stops. Two copies of
 * one rule is the bug #3 was opened to kill, so there is only ever one.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
	findNoncanonicalTitles,
	loadContentEntries,
	stripCode,
	type ContentEntry,
} from '../lib/graph.ts';
import { EXIT_FAILED, EXIT_OK, failure } from './errors.ts';
import { SCHEMA, writeJson } from './output.ts';

/** Which assertion failed, and what it saw. */
export interface GateFailure {
	assertion: 'pages-indexed' | 'canonical-titles' | 'page-links-rendered';
	message: string;
}

/** Only the fields of `backlinks.json` this check reads. */
interface IndexedNode {
	title: string;
	collection: string;
}

const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

async function readSearchIndex(root: string): Promise<Record<string, IndexedNode>> {
	// The public artifact, not the built one: `public/backlinks.json` is what
	// the site imports at build time and what both repos commit, so it is the
	// copy whose staleness would actually ship.
	const file = path.join(root, 'public', 'backlinks.json');
	try {
		return JSON.parse(await readFile(file, 'utf8')) as Record<string, IndexedNode>;
	} catch (error) {
		throw failure(
			'ENOCONTENT',
			`could not read the search index at ${file}: ${error instanceof Error ? error.message : String(error)}. ` +
				'`commune gate` runs after a build, which is what writes it.'
		);
	}
}

/** 1. Every standalone page made it into the search index. */
function pagesAreIndexed(pages: ContentEntry[], index: Record<string, IndexedNode>): GateFailure[] {
	const missing = [];
	for (const page of pages) {
		const indexed = index[page.urlPath];
		if (!indexed || indexed.title !== page.title || indexed.collection !== 'pages') {
			missing.push(`${page.urlPath} (${page.title})`);
		}
	}

	if (!missing.length) return [];
	return [
		{
			assertion: 'pages-indexed',
			message: `standalone pages missing from search index: ${missing.join(', ')}`,
		},
	];
}

/**
 * 2. WikiLinks must name their target exactly.
 *
 * A piped link or a near-miss title still renders, which is what makes this
 * worth checking: it fails silently and quietly decouples the vault from the
 * site.
 */
function titlesAreCanonical(entries: ContentEntry[]): GateFailure[] {
	const noncanonical = findNoncanonicalTitles(entries);
	if (!noncanonical.length) return [];

	return [
		{
			assertion: 'canonical-titles',
			message: `WikiLinks must use exact page titles:\n${noncanonical
				.map((finding) => `${finding.file}: ${finding.message}`)
				.join('\n')}`,
		},
	];
}

/**
 * 3. A note that links to a standalone page must actually render that href.
 *
 * The one assertion that catches a resolver regression rather than a content
 * mistake, and the only one that needs the built output.
 */
async function pageLinksRender(
	entries: ContentEntry[],
	pages: ContentEntry[],
	dist: string
): Promise<GateFailure[]> {
	const pageTargets = new Map<string, string>();
	for (const page of pages) {
		pageTargets.set(page.title.toLowerCase(), page.urlPath);
		for (const alias of page.aliases) {
			pageTargets.set(alias.toLowerCase(), page.urlPath);
		}
	}

	const unresolved = [];
	for (const entry of entries) {
		if (entry.collection !== 'notes') continue;

		const expected = new Set<string>();
		for (const match of stripCode(entry.body).matchAll(WIKILINK)) {
			const url = pageTargets.get(match[1].trim().toLowerCase());
			if (url) expected.add(url);
		}
		if (!expected.size) continue;

		const page = path.join(dist, 'notes', entry.slug, 'index.html');
		let html;
		try {
			html = await readFile(page, 'utf8');
		} catch {
			// A page that links to a standalone page and has no built output has
			// failed this assertion as surely as one whose href is wrong — and
			// saying which file is missing beats an ENOENT stack.
			unresolved.push(`${entry.slug} -> ${page} was not built`);
			continue;
		}

		for (const url of expected) {
			if (!html.includes(`href="${url}"`)) unresolved.push(`${entry.slug} -> ${url}`);
		}
	}

	if (!unresolved.length) return [];
	return [
		{
			assertion: 'page-links-rendered',
			message: `WikiLinks to standalone pages did not render: ${unresolved.join(', ')}`,
		},
	];
}

export async function gateCommand(root: string, dist: string, json: boolean): Promise<number> {
	const index = await readSearchIndex(root);
	const entries = await loadContentEntries({ root });
	const pages = entries.filter((entry) => entry.collection === 'pages');
	const distDir = path.resolve(root, dist);

	// All three run, rather than stopping at the first: a build that broke two
	// things should say so once, not across two rebuilds.
	const failures: GateFailure[] = [
		...pagesAreIndexed(pages, index),
		...titlesAreCanonical(entries),
		...(await pageLinksRender(entries, pages, distDir)),
	];

	const passed = failures.length === 0;
	const summary = `${pages.length} standalone page${pages.length === 1 ? '' : 's'} indexed for search and linked from notes`;

	if (json) {
		writeJson({ schema: SCHEMA, passed, failures });
	} else {
		// Both verdicts go to stderr, not just the failing one. A gate's output
		// is a diagnostic either way, and keeping stdout empty is what lets
		// `commune gate` sit in a build pipeline without polluting it.
		for (const found of failures) process.stderr.write(`FAIL: ${found.message}\n`);
		if (passed) process.stderr.write(`PASS: ${summary}\n`);
	}

	return passed ? EXIT_OK : EXIT_FAILED;
}

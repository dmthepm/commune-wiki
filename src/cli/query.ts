/**
 * `commune graph query` — the graph as a list of entries.
 *
 * Each entry carries its resolved `outbound` and `inbound` urlPaths, so a
 * consumer gets the whole neighbourhood in one document rather than one call
 * per note. Filters narrow which entries are *returned*; they never change how
 * links resolve, so an entry's degree is the same whether or not you filtered.
 */

import {
	buildGraph,
	loadContentEntries,
	type CollectionName,
	type ContentEntry,
	type Graph,
} from '../lib/graph.ts';
import { SCHEMA, writeJson, writeLines } from './render.ts';
import { EXIT_OK } from './errors.ts';

export interface QueryFilters {
	collections: string[];
	tags: string[];
	status?: string;
	orphans: boolean;
	deadends: boolean;
}

export interface QueryEntry {
	urlPath: string;
	title: string;
	collection: CollectionName;
	file: string;
	slug: string;
	tags: string[];
	status: string;
	aliases: string[];
	updated?: string;
	outbound: string[];
	inbound: string[];
}

/** Project one loaded entry against the built graph. */
function toQueryEntry(entry: ContentEntry, graph: Graph): QueryEntry {
	const node = graph.nodes[entry.urlPath];
	return {
		urlPath: entry.urlPath,
		title: entry.title,
		collection: entry.collection,
		file: entry.file,
		slug: entry.slug,
		tags: entry.tags,
		status: entry.status,
		aliases: entry.aliases,
		...(entry.updated ? { updated: entry.updated } : {}),
		outbound: node.outbound,
		inbound: node.inbound,
	};
}

/**
 * Isolated: nothing links here and this links nowhere.
 *
 * Not "nobody links to it" — a note that links out but is linked to by nothing
 * is a dead end read from the other direction, and conflating the two is what
 * makes Obsidian's orphan list useless on a vault where most notes link out.
 * One definition, used by both the filter and the summary, so `--orphans` can
 * never disagree with `summary.orphans`.
 */
function isOrphan(entry: QueryEntry): boolean {
	return entry.inbound.length === 0 && entry.outbound.length === 0;
}

/** Links to nothing. Whether anything links *here* is a separate question. */
function isDeadend(entry: QueryEntry): boolean {
	return entry.outbound.length === 0;
}

/**
 * Repeated values of one flag widen the match; different flags narrow it.
 *
 * `--collection notes --collection pages --tag seed` means "a note or a page,
 * which is also tagged seed" — the reading that lets a caller build up a query
 * without the flags fighting each other.
 */
function matches(entry: QueryEntry, filters: QueryFilters): boolean {
	if (filters.collections.length && !filters.collections.includes(entry.collection)) return false;
	if (filters.tags.length && !entry.tags.some((tag) => filters.tags.includes(tag))) return false;
	if (filters.status !== undefined && entry.status !== filters.status) return false;
	if (filters.orphans && !isOrphan(entry)) return false;
	if (filters.deadends && !isDeadend(entry)) return false;
	return true;
}

/**
 * What came back, counted.
 *
 * Describes the *result set*, not the corpus, so it never contradicts `count`
 * beside it. Degrees are still whole-graph — filtering changes which entries
 * are returned, never how their links resolved — so an unfiltered query's
 * `edges` is the same number `check` reports, counted from the outbound end
 * rather than the inbound one.
 *
 * Free to compute: `outbound` and `inbound` are already materialized on every
 * node by the time a query can be filtered at all.
 */
function summarize(results: QueryEntry[]) {
	return {
		entries: results.length,
		edges: results.reduce((total, entry) => total + entry.outbound.length, 0),
		orphans: results.filter(isOrphan).length,
		deadends: results.filter(isDeadend).length,
	};
}

export async function queryCommand(
	root: string,
	filters: QueryFilters,
	json: boolean
): Promise<number> {
	const entries = await loadContentEntries({ root });
	const graph = buildGraph(entries);
	const results = entries.map((entry) => toQueryEntry(entry, graph)).filter((entry) => matches(entry, filters));

	const summary = summarize(results);

	if (json) {
		// `count` predates `summary` and stays as its alias: the field shipped in
		// the contract #10 and #19 are written against, and removing it would be
		// a schema bump for no gain.
		writeJson({ schema: SCHEMA, root, count: summary.entries, summary, entries: results });
		return EXIT_OK;
	}

	writeLines([
		...results.map(
			(entry) =>
				`${entry.urlPath}\t${entry.title}\t${entry.collection}\t${entry.status}\t` +
				`→${entry.outbound.length} ←${entry.inbound.length}`
		),
		`${summary.entries} entries, ${summary.edges} edges, ${summary.orphans} orphans, ${summary.deadends} dead ends`,
	]);
	return EXIT_OK;
}

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
	// Isolated, not merely unlinked-to: a note nobody links to but which links
	// out is a dead end in the other direction, and calling it an orphan is the
	// bug that makes orphan lists useless in Obsidian.
	if (filters.orphans && (entry.inbound.length > 0 || entry.outbound.length > 0)) return false;
	if (filters.deadends && entry.outbound.length > 0) return false;
	return true;
}

export async function queryCommand(
	root: string,
	filters: QueryFilters,
	json: boolean
): Promise<number> {
	const entries = await loadContentEntries({ root });
	const graph = buildGraph(entries);
	const results = entries.map((entry) => toQueryEntry(entry, graph)).filter((entry) => matches(entry, filters));

	if (json) {
		writeJson({ schema: SCHEMA, root, count: results.length, entries: results });
		return EXIT_OK;
	}

	writeLines([
		...results.map(
			(entry) =>
				`${entry.urlPath}\t${entry.title}\t${entry.collection}\t${entry.status}\t` +
				`→${entry.outbound.length} ←${entry.inbound.length}`
		),
		`${results.length} entries`,
	]);
	return EXIT_OK;
}

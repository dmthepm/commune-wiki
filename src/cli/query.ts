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
	type DateSource,
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
	/** Inclusive `yyyy-mm-dd` cutoff from `--recent`. Entries older than it, and
	 *  entries with no date at all, are not returned. */
	since?: string;
}

/** A local calendar day as `yyyy-mm-dd` — the spelling every date in the graph uses. */
function toIsoDay(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Resolve `--recent` to the day it means.
 *
 * Two spellings, because the two questions are different: `7d` is "since I
 * last looked", which a weekly update job asks relative to now, and
 * `2026-09-01` is "since this happened", which a person asks about a date they
 * remember. `w` is offered because "the last two weeks" is a thing people say;
 * months are not, since `m` would read as minutes to half the people who type
 * it.
 *
 * Returns `undefined` for anything it cannot parse, so the caller can render
 * it as the usage error it is rather than silently querying the epoch. The day
 * is local: `7d` should mean seven of the reader's days, and the dates in
 * content are calendar days with no timezone of their own.
 */
export function parseRecent(value: string, today: Date = new Date()): string | undefined {
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

	const duration = /^(\d+)([dw])$/.exec(value);
	if (!duration) return undefined;

	const days = Number(duration[1]) * (duration[2] === 'w' ? 7 : 1);
	const cutoff = new Date(today);
	cutoff.setDate(cutoff.getDate() - days);
	return toIsoDay(cutoff);
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
	/** Where `updated` came from: frontmatter, git history, the file's mtime, or nowhere. */
	updatedSource: DateSource;
	created?: string;
	/** The file's last commit date, whatever `updated` ended up being. */
	modifiedInGit?: string;
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
		updatedSource: entry.updatedSource,
		...(entry.created ? { created: entry.created } : {}),
		...(entry.modifiedInGit ? { modifiedInGit: entry.modifiedInGit } : {}),
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
	// An entry with no date is not "unchanged since the cutoff", it is unknown —
	// and a list of what changed this week is worth less with unknowns in it.
	if (filters.since !== undefined && !(entry.updated && entry.updated >= filters.since)) {
		return false;
	}
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
function summarize(results: QueryEntry[], since?: string) {
	return {
		entries: results.length,
		edges: results.reduce((total, entry) => total + entry.outbound.length, 0),
		orphans: results.filter(isOrphan).length,
		deadends: results.filter(isDeadend).length,
		// The resolved cutoff, not the string the caller typed: `--recent 7d`
		// means a different day tomorrow, and a job that records what it asked
		// needs the day, not the duration.
		...(since !== undefined ? { since } : {}),
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

	const summary = summarize(results, filters.since);

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
		`${summary.entries} entries, ${summary.edges} edges, ${summary.orphans} orphans, ` +
			`${summary.deadends} dead ends` +
			(summary.since !== undefined ? `, updated since ${summary.since}` : ''),
	]);
	return EXIT_OK;
}

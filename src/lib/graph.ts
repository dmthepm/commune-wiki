/**
 * The content graph core.
 *
 * Every mechanism that needs to know "what content exists and where does it
 * live" reads from here: the remark WikiLinks plugin, the backlinks Astro
 * integration, and the search-index check. Before this module those three
 * carried hand-synced copies of the same directory scan, the same visibility
 * rules, and three subtly different opinions about trailing slashes.
 *
 * The rules this module owns:
 *   - which collections participate (notes, research, pages)
 *   - visibility (notes opt in with `visibility: public`; research and pages
 *     are always public)
 *   - canonical URLs, always with a trailing slash, matching Astro's
 *     directory build format
 *   - the title/alias lookup used to resolve `[[WikiLinks]]`
 */

import { globby } from 'globby';
import matter from 'gray-matter';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type CollectionName = 'notes' | 'research' | 'pages';

/** Where each collection's markdown lives, relative to the project root. */
export const CONTENT_DIRS: Record<CollectionName, string> = {
	notes: 'src/content/notes',
	research: 'src/content/research',
	pages: 'src/content/pages',
};

/** Collection scan order. Stable so derived artifacts are deterministic. */
export const COLLECTIONS: CollectionName[] = ['notes', 'research', 'pages'];

/** One piece of public content, as the graph sees it. */
export interface ContentEntry {
	/** Collection-relative slug, e.g. `evergreen-notes`. Not unique across collections. */
	slug: string;
	/** Canonical site path with a trailing slash, e.g. `/notes/evergreen-notes/`. Unique. */
	urlPath: string;
	title: string;
	collection: CollectionName;
	aliases: string[];
	tags: string[];
	status: string;
	summary?: string;
	updated?: string;
	/** Markdown body with frontmatter stripped. */
	body: string;
	/** Source file path, relative to the project root. */
	file: string;
}

/** What a resolved `[[WikiLink]]` points at. */
export interface LinkTarget {
	slug: string;
	collection: CollectionName;
	urlPath: string;
}

/**
 * Convert a content file path to its collection-relative slug and canonical URL.
 *
 * `pages` are the exception: they render through hand-written Astro routes, so
 * the page's own `url` frontmatter is authoritative and the slug-derived path is
 * only a fallback.
 */
export function toUrlPath(
	file: string,
	collection: CollectionName,
	configuredUrl?: unknown
): { slug: string; urlPath: string } {
	const slug = path
		.relative(CONTENT_DIRS[collection], file)
		.replace(/\\/g, '/')
		.replace(/\.(md|mdx)$/, '')
		.replace(/\/index$/, '');

	if (collection === 'pages') {
		return {
			slug,
			urlPath: typeof configuredUrl === 'string' ? configuredUrl : `/${slug}/`,
		};
	}

	// Trailing slash on every route: Astro's directory build format emits
	// `/notes/<slug>/index.html`, and the client-side graph lookups key off the
	// pathname the browser actually reports.
	return { slug, urlPath: `/${collection}/${slug}/` };
}

/** Coerce a frontmatter date to `yyyy-mm-dd`, so build output has no timestamp drift. */
export function normalizeDate(value: unknown): string | undefined {
	if (!value) return undefined;
	if (value instanceof Date) return value.toISOString().split('T')[0];
	if (typeof value === 'string') return value.split('T')[0];
	return undefined;
}

/** Is this entry publicly visible? Notes opt in; research and pages are always public. */
function isPublic(collection: CollectionName, data: Record<string, unknown>): boolean {
	if (collection !== 'notes') return true;
	return data.visibility === 'public';
}

/**
 * Read every public content entry, in a stable order.
 *
 * Deliberately uncached: the backlinks integration runs this on each build hook
 * and the dev server must see content edits without a restart.
 */
export async function loadContentEntries(): Promise<ContentEntry[]> {
	const entries: ContentEntry[] = [];

	for (const collection of COLLECTIONS) {
		const files = await globby(`${CONTENT_DIRS[collection]}/**/*.{md,mdx}`);
		files.sort();

		for (const file of files) {
			const source = await readFile(file, 'utf8');
			const { content, data } = matter(source);

			if (!isPublic(collection, data)) continue;

			const { slug, urlPath } = toUrlPath(file, collection, data.url);
			const summary = typeof data.summary === 'string' ? data.summary : undefined;
			const updated = normalizeDate(data.updated);

			entries.push({
				slug,
				urlPath,
				title: (data.title as string) || slug,
				collection,
				aliases: (data.aliases as string[]) || [],
				tags: (data.tags as string[]) || [],
				status: (data.status as string) || 'seed',
				...(summary ? { summary } : {}),
				...(updated ? { updated } : {}),
				body: content,
				file,
			});
		}
	}

	return entries;
}

/**
 * Build the `[[WikiLink]]` resolution table: lowercased title or alias → target.
 *
 * Titles win over aliases, and within each pass later entries win — which only
 * matters when two pieces of content claim the same name, and is a content bug
 * either way.
 */
export function buildLinkLookup(entries: ContentEntry[]): Map<string, LinkTarget> {
	const lookup = new Map<string, LinkTarget>();

	for (const entry of entries) {
		const target: LinkTarget = {
			slug: entry.slug,
			collection: entry.collection,
			urlPath: entry.urlPath,
		};
		for (const alias of entry.aliases) {
			lookup.set(alias.toLowerCase(), target);
		}
		lookup.set(entry.title.toLowerCase(), target);
	}

	return lookup;
}

let lookupCache: Map<string, LinkTarget> | null = null;

/**
 * The link lookup, built once per process.
 *
 * The remark plugin runs per markdown file, so rescanning the content tree on
 * every transform would make builds quadratic. Call `resetGraphCache()` if a
 * caller needs to see content written during the same process.
 */
export async function getLinkLookup(): Promise<Map<string, LinkTarget>> {
	if (lookupCache) return lookupCache;
	lookupCache = buildLinkLookup(await loadContentEntries());
	return lookupCache;
}

export function resetGraphCache(): void {
	lookupCache = null;
}

/**
 * Extract every outbound link target from a markdown body.
 *
 * Returns raw WikiLink text (unresolved titles or aliases) plus the slugs of
 * plain markdown links into `/notes/`.
 */
export function extractLinks(content: string): string[] {
	const links: string[] = [];

	for (const match of content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
		links.push(match[1].trim());
	}

	for (const match of content.matchAll(/\[([^\]]+)\]\(\/notes\/([^)]+)\/?/g)) {
		links.push(match[2].trim());
	}

	return [...new Set(links)];
}

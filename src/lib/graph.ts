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
 *   - which link forms count as an edge, and how each one resolves
 */

import { globby } from 'globby';
import { slug as githubSlug } from 'github-slugger';
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
	/** Parsed frontmatter. Kept because links can live in it. */
	frontmatter: Record<string, unknown>;
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
 * Files are named for their titles, so that `[[Evergreen Notes]]` resolves in
 * Obsidian (which matches on filename) and in Astro (which matches on title)
 * without a piped alias. The URL is therefore *derived* from the filename, not
 * equal to it, using the same `github-slugger` call Astro's own content layer
 * uses — so the graph and Astro's `entry.slug` can never disagree.
 *
 * Two escape hatches, in priority order:
 *   - `slug` frontmatter pins the URL when a rename would otherwise move it.
 *     Astro treats this key as reserved and strips it before Zod validation, so
 *     it must not appear in any collection schema.
 *   - `pages` declare a whole `url`, since they render at arbitrary routes.
 */
export function toUrlPath(
	file: string,
	collection: CollectionName,
	data: Record<string, unknown> = {}
): { slug: string; urlPath: string } {
	const relative = path
		.relative(CONTENT_DIRS[collection], file)
		.replace(/\\/g, '/')
		.replace(/\.(md|mdx)$/, '')
		.replace(/\/index$/, '');

	// Astro slugifies each path segment separately, so nested content keeps its
	// directory structure. Match that exactly.
	const derived = relative.split('/').map(githubSlug).join('/');
	const slug = typeof data.slug === 'string' && data.slug ? data.slug : derived;

	if (collection === 'pages') {
		return {
			slug,
			urlPath: typeof data.url === 'string' ? data.url : `/${slug}/`,
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

			const { slug, urlPath } = toUrlPath(file, collection, data);
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
				frontmatter: data,
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

/**
 * Build the url resolution table: canonical `urlPath` → target.
 *
 * Separate from the title/alias lookup on purpose. A path and a title are
 * different namespaces, and mixing them is what let `/notes/atomic-notes`
 * resolve through an alias rather than through the route it actually names.
 */
export function buildUrlLookup(entries: ContentEntry[]): Map<string, LinkTarget> {
	const lookup = new Map<string, LinkTarget>();

	for (const entry of entries) {
		lookup.set(entry.urlPath, {
			slug: entry.slug,
			collection: entry.collection,
			urlPath: entry.urlPath,
		});
	}

	return lookup;
}

/**
 * Resolve one extracted edge, using the table its kind belongs to.
 *
 * Deliberately does nothing clever: no basename fallback, no source-relative
 * disambiguation, no collision policy. Those are resolution questions, tracked
 * on #18; this is extraction's other half and nothing more.
 */
export function resolveLink(
	link: ExtractedLink,
	byName: Map<string, LinkTarget>,
	byUrl: Map<string, LinkTarget>
): LinkTarget | undefined {
	return link.kind === 'url'
		? byUrl.get(link.target)
		: byName.get(link.target.toLowerCase());
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
 * Blank out fenced blocks and inline code, preserving offsets.
 *
 * A `[[WikiLink]]` written inside backticks is documentation *about* the
 * syntax, not a link. The remark plugin gets this right for free because it
 * only visits `text` nodes and never `inlineCode` — anything scanning raw
 * markdown has to strip code itself or it reports phantom broken links.
 */
export function stripCode(content: string): string {
	return content
		.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
		.replace(/~~~[\s\S]*?~~~/g, (block) => block.replace(/[^\n]/g, ' '))
		.replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length));
}

/**
 * How a link target should be resolved.
 *
 * `name` is title-shaped: the raw text of a `[[WikiLink]]`, or the basename of
 * a relative file link, resolved against the title/alias lookup.
 * `url` is path-shaped: an absolute site path, resolved against `urlPath`.
 *
 * The two cannot be collapsed into one string. A bare `atomic-notes` is not a
 * title and matching it against one only works by coincidence; `/notes/atomic-notes/`
 * is not a title either and must never be looked up as one.
 */
export type LinkKind = 'name' | 'url';

/** One outbound edge, with enough information to resolve it. */
export interface ExtractedLink {
	kind: LinkKind;
	target: string;
}

/** Frontmatter keys whose values are vocabulary, not links. */
const NON_LINK_KEYS = new Set(['aliases', 'tags']);

/**
 * Extract every outbound link target from a markdown body and its frontmatter.
 *
 * Returns the edges Obsidian's `resolvedLinks` would record: wikilinks, embeds,
 * internal markdown links, and `frontmatterLinks`. Code is excluded.
 *
 * Frontmatter is passed separately because it is already parsed by the time it
 * reaches here — `loadContentEntries()` splits it off with gray-matter, so the
 * body alone can never contain it.
 */
export function extractLinks(
	content: string,
	frontmatter: Record<string, unknown> = {}
): ExtractedLink[] {
	const links: ExtractedLink[] = [];
	const prose = stripCode(content);

	for (const match of prose.matchAll(WIKILINK)) {
		const target = stripSubpath(match[1]);
		if (target) links.push({ kind: 'name', target });
	}

	for (const match of prose.matchAll(MARKDOWN_LINK)) {
		const link = classifyMarkdownTarget(match[1]);
		if (link) links.push(link);
	}

	links.push(...extractFrontmatterLinks(frontmatter));

	return dedupe(links);
}

/**
 * Wikilinks reachable from frontmatter values, at any nesting depth.
 *
 * Only wikilinks: a frontmatter value is not markdown, and Obsidian's
 * `frontmatterLinks` records the wikilink form. `aliases` and `tags` are names
 * this entry answers to, not links out of it.
 */
function extractFrontmatterLinks(frontmatter: Record<string, unknown>): ExtractedLink[] {
	const links: ExtractedLink[] = [];

	const walk = (value: unknown): void => {
		if (typeof value === 'string') {
			for (const match of value.matchAll(WIKILINK)) {
				const target = stripSubpath(match[1]);
				if (target) links.push({ kind: 'name', target });
			}
		} else if (Array.isArray(value)) {
			value.forEach(walk);
		} else if (value && typeof value === 'object') {
			for (const [key, nested] of Object.entries(value)) {
				if (!NON_LINK_KEYS.has(key)) walk(nested);
			}
		}
	};

	for (const [key, value] of Object.entries(frontmatter)) {
		if (!NON_LINK_KEYS.has(key)) walk(value);
	}

	return links;
}

/** A wikilink or embed, capturing the target and discarding any display text. */
const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/**
 * A markdown link or image, capturing the destination.
 *
 * The destination is either `<angle bracketed>` or unspaced, and may be
 * followed by a title in quotes. Link text is `[^\]]*` rather than `[^\]]+`
 * because an image embed can legitimately carry no alt text.
 */
const MARKDOWN_LINK = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^()\s]+)(?:\s+"[^"]*")?\s*\)/g;

/**
 * Turn a markdown link destination into an edge, or nothing if it leaves the site.
 *
 * Absolute paths are url-shaped and are normalised to the canonical spelling
 * the graph stores — query, fragment, and the presence or absence of a trailing
 * slash are all spellings of one edge, and `/notes/atomic-notes` must not be
 * handed to the title lookup, where it only ever resolved by the coincidence of
 * a note listing its own slug as an alias.
 */
function classifyMarkdownTarget(raw: string): ExtractedLink | null {
	const destination = raw.replace(/^<|>$/g, '').trim();

	// Anything with a scheme, and protocol-relative `//host`, leaves the site.
	if (!destination || /^[a-z][a-z0-9+.-]*:/i.test(destination)) return null;
	if (destination.startsWith('//')) return null;

	if (destination.startsWith('/')) {
		const pathname = destination.split(/[?#]/)[0];
		if (pathname === '/') return null;
		return { kind: 'url', target: pathname.endsWith('/') ? pathname : `${pathname}/` };
	}

	// A relative link to a markdown file — what Obsidian writes when a note is
	// dragged into another. Only the basename carries meaning here: the target
	// resolves by title, exactly as the wikilink spelling of the same edge does.
	// Which directory it came from is a resolution question, tracked on #18.
	const file = decodePath(stripSubpath(destination));
	if (!/\.mdx?$/i.test(file)) return null;

	const title = file.split('/').pop()!.replace(/\.mdx?$/i, '');
	return title ? { kind: 'name', target: title } : null;
}

/** Percent-decode a link destination, leaving a malformed one alone. */
function decodePath(destination: string): string {
	try {
		return decodeURIComponent(destination);
	} catch {
		return destination;
	}
}

/** Drop an Obsidian subpath: everything from the first `#` heading or `^` block id.
 *
 * `resolvedLinks` records `[[Note#Heading]]` as an edge to `Note`, so the
 * subpath must not survive into the target. What remains can be empty — a bare
 * `[[#Heading]]` points inside the current file and is not an edge at all.
 */
function stripSubpath(text: string): string {
	return text.split(/[#^]/)[0].trim();
}

/** Drop repeated edges, keeping first-seen order. */
function dedupe(links: ExtractedLink[]): ExtractedLink[] {
	const seen = new Set<string>();
	return links.filter((link) => {
		const key = `${link.kind}:${link.target}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

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

/** Where to read content from. */
export interface GraphOptions {
	/**
	 * The project root: the directory that *contains* `src/content`, not
	 * `src/content` itself.
	 *
	 * Every path the graph exposes is derived from this directory — `file` is
	 * relative to it, and `toUrlPath` strips `CONTENT_DIRS[collection]` off the
	 * front of `file` to get a slug. Point it one level too deep and every slug
	 * silently changes. Defaults to `process.cwd()`.
	 */
	root?: string;
}

/**
 * Read every public content entry, in a stable order.
 *
 * Deliberately uncached: the backlinks integration runs this on each build hook
 * and the dev server must see content edits without a restart.
 *
 * The root is a parameter rather than a `process.chdir`, so one process can
 * read several vaults — which is what the CLI does when it is pointed at
 * another wiki — without the cwd becoming shared mutable state.
 */
export async function loadContentEntries(options: GraphOptions = {}): Promise<ContentEntry[]> {
	const root = options.root ?? process.cwd();
	const entries: ContentEntry[] = [];

	for (const collection of COLLECTIONS) {
		// `cwd` keeps globby's results root-relative, which is exactly the
		// spelling `ContentEntry.file` promises; only the read needs the join.
		const files = await globby(`${CONTENT_DIRS[collection]}/**/*.{md,mdx}`, { cwd: root });
		files.sort();

		for (const file of files) {
			const source = await readFile(path.join(root, file), 'utf8');
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
 * Build the filename resolution table: lowercased basename → target.
 *
 * Not a resolution table — nothing resolves through it. It exists so `check`
 * can notice when a name means two different things depending on which table
 * you ask: `[[Index]]` resolves by *title*, but `[index](./Index.md)` names a
 * *file*, and in a vault where those disagree one of the two is silently wrong.
 * Obsidian resolves by filename and Astro by title, so this is the seam where
 * the two tools stop agreeing about what a link points at.
 */
export function buildBasenameLookup(entries: ContentEntry[]): Map<string, LinkTarget[]> {
	const lookup = new Map<string, LinkTarget[]>();

	for (const entry of entries) {
		const basename = entry.file
			.split('/')
			.pop()!
			.replace(/\.mdx?$/i, '')
			.toLowerCase();
		const targets = lookup.get(basename) ?? [];
		targets.push({ slug: entry.slug, collection: entry.collection, urlPath: entry.urlPath });
		lookup.set(basename, targets);
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

// =============================================================================
// Graph construction
// =============================================================================

/**
 * Star calculation strategy.
 *
 * Lives in the core rather than the Astro integration because `isStarred` is a
 * field of the public artifact, and the CLI has to be able to produce the same
 * artifact without loading Astro.
 */
export const STAR_CONFIG = {
	// Strategy: 'top-percent' | 'top-absolute' | 'threshold'
	strategy: 'top-percent' as const,

	// For 'top-percent': What percentage gets stars?
	topPercent: 5, // Top 5%

	// For 'top-absolute': How many notes get stars?
	topAbsolute: 3, // Top 3 notes

	// For 'threshold': Minimum backlinks to get a star
	threshold: 10, // 10+ backlinks

	// Minimum notes required before stars are enabled
	minNotesForStars: 20,

	// What metric to rank by?
	// 'backlinks' | 'revisions' | 'cross-theme' | 'weighted'
	rankBy: 'backlinks' as const,

	// For weighted ranking (future):
	weights: {
		backlinks: 0.5,
		revisions: 0.3,
		crossTheme: 0.2,
	},
};

/**
 * One node of the public graph, and one entry of `backlinks.json`.
 *
 * The property order here is a serialization contract: `backlinks.json` is
 * committed, and a reordered object is a diff on every build.
 */
export interface NoteMetadata {
	/** Canonical URL path. The graph is keyed by URL, so this is the identity. */
	slug: string;
	title: string;
	collection: CollectionName;
	aliases: string[];
	outbound: string[]; // urlPaths this note links to
	inbound: string[]; // urlPaths that link to this note
	tags: string[];
	status: string;
	summary?: string;
	updated?: string;
	isStarred?: boolean; // ⭐ indicator
}

/** Which rules the graph and `check` can report. */
export type DiagnosticRule =
	| 'broken-link'
	| 'ambiguous-target'
	| 'duplicate-name'
	| 'noncanonical-title';

/**
 * One finding, as data.
 *
 * The Astro integration used to print broken links inline, which meant the only
 * way to get at them was to scrape build logs. Findings are values now, so the
 * integration, `check` and the search-index gate can each render the same set
 * their own way.
 */
export interface Diagnostic {
	rule: DiagnosticRule;
	severity: 'error' | 'warning';
	/** Source file, relative to the project root. */
	file: string;
	/** Not tracked yet: `extractLinks` records no offsets. Added when #24 needs them. */
	line?: number;
	message: string;
	/** The link text or name involved. */
	target?: string;
	/** Canonical URL of the entry the finding is in. Carried so build output can name the route. */
	urlPath?: string;
	/** How the offending link was spelled, which decides `[[name]]` vs `(url)` rendering. */
	kind?: LinkKind;
	/** urlPaths in contention, for `ambiguous-target` and `duplicate-name`. */
	candidates?: string[];
	/** The spelling a `noncanonical-title` finding should have used. */
	canonical?: string;
}

/** The resolved content graph. */
export interface Graph {
	/** Keyed by urlPath; insertion order is entry order. */
	nodes: Record<string, NoteMetadata>;
	diagnostics: Diagnostic[];
	totalBacklinks: number;
}

/**
 * Calculate which notes get stars based on STAR_CONFIG.
 * Returns a Set of slugs that should be starred.
 */
export function calculateStars(notes: Map<string, NoteMetadata>): Set<string> {
	const starredSlugs = new Set<string>();

	// Standalone pages belong in search and WikiLinks, not note rankings.
	const notesArray = Array.from(notes.values()).filter((note) => note.collection !== 'pages');

	// Skip if too few notes
	if (notesArray.length < STAR_CONFIG.minNotesForStars) {
		return starredSlugs;
	}

	// Calculate score based on rankBy strategy
	const scored = notesArray.map((note) => {
		let score = 0;

		switch (STAR_CONFIG.rankBy) {
			case 'backlinks':
				score = note.inbound.length;
				break;

			case 'revisions':
				// Future: could track revision count in frontmatter or git history
				score = 0;
				break;

			case 'cross-theme':
				// Future: count unique tags across linked notes
				score = 0;
				break;

			case 'weighted':
				// Future: combine multiple metrics
				score = note.inbound.length * STAR_CONFIG.weights.backlinks;
				break;
		}

		return { slug: note.slug, score };
	});

	// Sort by score descending
	scored.sort((a, b) => b.score - a.score);

	// Determine which notes get stars based on strategy
	let cutoffIndex = 0;

	switch (STAR_CONFIG.strategy) {
		case 'top-percent':
			cutoffIndex = Math.ceil(notesArray.length * (STAR_CONFIG.topPercent / 100));
			break;

		case 'top-absolute':
			cutoffIndex = Math.min(STAR_CONFIG.topAbsolute, notesArray.length);
			break;

		case 'threshold':
			// All notes above threshold get stars
			for (const { slug, score } of scored) {
				if (score >= STAR_CONFIG.threshold) {
					starredSlugs.add(slug);
				}
			}
			return starredSlugs;
	}

	// Add top N notes to starred set
	for (let i = 0; i < cutoffIndex; i++) {
		starredSlugs.add(scored[i].slug);
	}

	// Handle ties at boundary
	if (cutoffIndex > 0 && cutoffIndex < scored.length) {
		const boundaryScore = scored[cutoffIndex - 1].score;
		// Include all notes tied with the boundary score
		for (let i = cutoffIndex; i < scored.length; i++) {
			if (scored[i].score === boundaryScore) {
				starredSlugs.add(scored[i].slug);
			} else {
				break;
			}
		}
	}

	return starredSlugs;
}

/**
 * Build the resolved graph from loaded entries.
 *
 * Pure: no filesystem, no logging, no Astro. Everything a caller might want to
 * print comes back in `diagnostics`, so the same construction serves the build
 * (which warns), `check` (which reports) and `related` (which does neither).
 */
export function buildGraph(entries: ContentEntry[]): Graph {
	const byName = buildLinkLookup(entries);
	const byUrl = buildUrlLookup(entries);

	const byBasename = buildBasenameLookup(entries);

	const notes = new Map<string, NoteMetadata>();
	// Raw extracted edges, kept beside the graph: `outbound` on NoteMetadata is
	// the public artifact and holds resolved urlPaths only.
	const extracted = new Map<string, ExtractedLink[]>();
	const files = new Map<string, string>();

	for (const entry of entries) {
		extracted.set(entry.urlPath, extractLinks(entry.body, entry.frontmatter));
		files.set(entry.urlPath, entry.file);
		notes.set(entry.urlPath, {
			slug: entry.urlPath,
			title: entry.title,
			collection: entry.collection,
			aliases: entry.aliases,
			outbound: [], // populated below, once links resolve
			inbound: [], // populated below
			tags: entry.tags,
			status: entry.status,
			...(entry.summary ? { summary: entry.summary } : {}),
			...(entry.updated ? { updated: entry.updated } : {}),
		});
	}

	const diagnostics: Diagnostic[] = [];

	// Resolve WikiLinks and compute inbound links
	for (const [fromUrl, note] of notes.entries()) {
		const resolvedOutbound: string[] = [];

		for (const link of extracted.get(fromUrl)!) {
			const resolved = resolveLink(link, byName, byUrl)?.urlPath;

			// A `name` link that means one entry by title and a different one by
			// filename resolves — it just may not resolve to what the author saw
			// in Obsidian. Reported, not repaired: picking a winner here would
			// make the two tools disagree quietly instead of loudly.
			if (link.kind === 'name') {
				const byFile = byBasename.get(link.target.toLowerCase());
				if (resolved && byFile?.length === 1 && byFile[0].urlPath !== resolved) {
					diagnostics.push({
						rule: 'ambiguous-target',
						severity: 'error',
						file: files.get(fromUrl)!,
						urlPath: fromUrl,
						kind: link.kind,
						target: link.target,
						candidates: [resolved, byFile[0].urlPath].sort(),
						message: `${spellLink(link)} resolves by title to ${resolved} but names the file ${byFile[0].urlPath}`,
					});
				}
			}

			if (resolved && notes.has(resolved)) {
				resolvedOutbound.push(resolved);
				const target = notes.get(resolved)!;
				if (!target.inbound.includes(fromUrl)) {
					target.inbound.push(fromUrl);
				}
			} else {
				// Link to a note that doesn't exist yet — fine, but worth saying
				diagnostics.push({
					rule: 'broken-link',
					severity: 'warning',
					file: files.get(fromUrl)!,
					urlPath: fromUrl,
					kind: link.kind,
					target: link.target,
					message: `${spellLink(link)} does not resolve`,
				});
			}
		}

		note.outbound = resolvedOutbound;
	}

	// Calculate which notes get stars
	const starredSlugs = calculateStars(notes);
	for (const slug of starredSlugs) {
		const note = notes.get(slug);
		if (note) {
			note.isStarred = true;
		}
	}

	const nodes: Record<string, NoteMetadata> = {};
	for (const [slug, note] of notes.entries()) {
		nodes[slug] = note;
	}

	const totalBacklinks = Array.from(notes.values()).reduce(
		(sum, note) => sum + note.inbound.length,
		0
	);

	return { nodes, diagnostics, totalBacklinks };
}

/** How a link was written, in the spelling its kind uses. */
function spellLink(link: Pick<ExtractedLink, 'kind' | 'target'>): string {
	return link.kind === 'url' ? `(${link.target})` : `[[${link.target}]]`;
}

/**
 * Render a diagnostic as the build has always rendered it.
 *
 * `public/backlinks.json` is not the only committed contract — build output is
 * read by humans and diffed by reviewers, so the warning line is kept exactly
 * as it was when the integration formatted it itself.
 */
export function formatDiagnostic(diagnostic: Diagnostic): string {
	if (diagnostic.rule === 'broken-link') {
		return `⚠️  Broken link in ${diagnostic.urlPath}: ${spellLink({
			kind: diagnostic.kind ?? 'name',
			target: diagnostic.target ?? '',
		})}`;
	}
	return `⚠️  ${diagnostic.rule} in ${diagnostic.file}: ${diagnostic.message}`;
}

/**
 * The public artifact, exactly as `public/backlinks.json` stores it.
 *
 * Separate from `Graph` because the file is a runtime contract with four
 * client-side readers: the graph can grow fields, the file cannot.
 */
export function toBacklinksJson(graph: Graph): Record<string, NoteMetadata> {
	return graph.nodes;
}

/**
 * Names claimed by more than one entry.
 *
 * Two triggers, because a name lives in two namespaces: a title or alias that
 * two entries both answer to, and a filename that two entries share. Neither
 * is an error the graph can resolve — `buildLinkLookup` keeps last-wins, which
 * is what it has always done — but both mean a `[[WikiLink]]` reaches somewhere
 * its author did not choose, and silently.
 *
 * Reported against the *first* claimant, because that is the entry the
 * collision makes unreachable.
 */
export function findDuplicateNames(entries: ContentEntry[]): Diagnostic[] {
	const byTitle = new Map<string, { entry: ContentEntry; name: string }[]>();
	const byBasename = new Map<string, ContentEntry[]>();

	for (const entry of entries) {
		for (const name of [entry.title, ...entry.aliases]) {
			const key = name.toLowerCase();
			byTitle.set(key, [...(byTitle.get(key) ?? []), { entry, name }]);
		}

		const basename = entry.file.split('/').pop()!.replace(/\.mdx?$/i, '').toLowerCase();
		byBasename.set(basename, [...(byBasename.get(basename) ?? []), entry]);
	}

	const diagnostics: Diagnostic[] = [];

	for (const [, all] of byBasename) {
		const claimants = distinct(all, (entry) => entry.urlPath);
		if (claimants.length < 2) continue;
		const [first] = claimants;
		diagnostics.push({
			rule: 'duplicate-name',
			severity: 'error',
			file: first.file,
			target: first.file.split('/').pop()!.replace(/\.mdx?$/i, ''),
			candidates: claimants.map((entry) => entry.urlPath).sort(),
			message: `${claimants.length} entries share the filename ${first.file
				.split('/')
				.pop()}: ${claimants.map((entry) => entry.urlPath).join(', ')}`,
		});
	}

	for (const [, all] of byTitle) {
		// One entry may answer to a name twice — a note titled `Commune` that
		// also lists `commune` as an alias is spelling the same claim twice, not
		// competing with itself.
		const claimants = distinct(all, ({ entry }) => entry.urlPath);
		if (claimants.length < 2) continue;
		const [first] = claimants;
		diagnostics.push({
			rule: 'duplicate-name',
			severity: 'error',
			file: first.entry.file,
			target: first.name,
			candidates: claimants.map(({ entry }) => entry.urlPath).sort(),
			message: `${claimants.length} entries answer to "${first.name}": ${claimants
				.map(({ entry }) => entry.urlPath)
				.join(', ')} — the last one wins`,
		});
	}

	return diagnostics;
}

/** Keep the first item per key, so an entry cannot collide with itself. */
function distinct<T>(items: T[], key: (item: T) => string): T[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		const id = key(item);
		if (seen.has(id)) return false;
		seen.add(id);
		return true;
	});
}

/**
 * WikiLinks that resolve but do not name their target exactly.
 *
 * The rule this implements used to live in `scripts/test-search-index.mjs`,
 * with its own lookup table and its own regex — a second copy of a rule the
 * graph core already had the ingredients for, which is the bug class #3 was
 * opened to kill. One implementation now, two callers: `check` reports it and
 * the build gate fails on it.
 *
 * Worth checking precisely because it is invisible: a piped link or a
 * near-miss title still renders, and the vault quietly decouples from the site.
 */
export function findNoncanonicalTitles(entries: ContentEntry[]): Diagnostic[] {
	const canonical = new Map<string, string>();
	for (const entry of entries) {
		canonical.set(entry.title.toLowerCase(), entry.title);
		for (const alias of entry.aliases) {
			canonical.set(alias.toLowerCase(), entry.title);
		}
	}

	const diagnostics: Diagnostic[] = [];

	for (const entry of entries) {
		for (const match of stripCode(entry.body).matchAll(LABELLED_WIKILINK)) {
			const linked = match[1].trim();
			const label = match[2]?.trim();
			const exact = canonical.get(linked.toLowerCase());
			if (!exact) continue; // unresolved links are `broken-link`'s business

			if (label || linked !== exact) {
				diagnostics.push({
					rule: 'noncanonical-title',
					severity: 'error',
					file: entry.file,
					urlPath: entry.urlPath,
					kind: 'name',
					target: exact,
					canonical: exact,
					message: `[[${linked}${label ? `|${label}` : ''}]] should be [[${exact}]]`,
				});
			}
		}
	}

	return diagnostics;
}

/** A wikilink keeping its display text, which the canonical-title rule needs to see. */
const LABELLED_WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Every finding `check` reports.
 *
 * The graph's own diagnostics come first and in entry order, so the list reads
 * the same way the build log does, then the two whole-corpus rules that need
 * every entry in hand before they can fire.
 */
export function checkEntries(entries: ContentEntry[], graph: Graph): Diagnostic[] {
	return [...graph.diagnostics, ...findDuplicateNames(entries), ...findNoncanonicalTitles(entries)];
}

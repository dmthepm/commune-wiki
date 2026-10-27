/**
 * Astro integration for building backlinks and graph data at build time, and
 * for writing each entry's source markdown beside its rendered page.
 *
 * Thin by design: it owns *when* the graph is built and *where* the artifacts
 * are written, and nothing else. Which content exists, how links resolve, how
 * stars are ranked and what counts as a finding are all decided by the graph
 * core in `src/lib/graph.ts`, so the `commune` CLI produces the same graph
 * without an Astro process anywhere in sight.
 */

import type { AstroIntegration } from 'astro';
import { access, copyFile, lstat, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
	buildGraph,
	formatDiagnostic,
	loadContentEntries,
	summarizeSite,
	toBacklinksJson,
	toMarkdownPath,
	type ContentEntry,
	type Graph,
	type NoteMetadata,
	type SiteSummary,
} from './lib/graph.ts';
import { findMarkdownTwin } from './lib/markdown-twin.ts';
import { PUBLIC_PREFIX, SNAPSHOT_DIR, isSafeMediaFile } from './lib/x-embeds.ts';

function buildBacklinksGraph(
	entries: ContentEntry[],
	logger: Pick<Console, 'info' | 'warn'>
): Graph {
	const graph = buildGraph(entries);

	logger.info(`📝 Found ${Object.keys(graph.nodes).length} public content entries`);

	for (const diagnostic of graph.diagnostics) {
		logger.warn(formatDiagnostic(diagnostic));
	}

	const starred = Object.values(graph.nodes).filter((note) => note.isStarred).length;
	if (starred > 0) {
		logger.info(`⭐ ${starred} notes starred (top 5%)`);
	}

	return graph;
}

async function writeJsonFile(filePath: string, value: unknown) {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function writeBacklinksFile(filePath: string, graph: Record<string, NoteMetadata>) {
	await writeJsonFile(filePath, graph);
}

/**
 * The site-wide summary, beside the graph rather than inside it.
 *
 * `backlinks.json` is keyed by urlPath and two of its readers walk it with
 * `Object.entries`, so a top-level `lastUpdated` there would be a malformed
 * node rather than a new field. It is also committed, and this value changes
 * on the same commit that changes it — a committed copy is stale exactly when
 * it matters. So: a sibling file, generated, gitignored.
 */
async function writeSiteFile(filePath: string, summary: SiteSummary) {
	await writeJsonFile(filePath, summary);
}

/**
 * Copy every entry's source file next to its rendered page, at `<url>.md`.
 *
 * `copyFile` rather than a re-serialization on purpose: the promise of the `.md`
 * URL is that it returns *the file*, frontmatter and `[[wikilinks]]` untouched,
 * so anything that reformats on the way through would break it. The graph
 * already decided which entries exist and where each one lives; this only moves
 * bytes.
 *
 * An entry that declares `routes:` also renders at each of them, so each gets
 * the same twin at its own `toMarkdownPath` (`/index.md` for `/`). The same
 * source file is copied again, not a second rendering of it.
 */
async function writeMarkdownFiles(
	entries: ContentEntry[],
	root: string,
	outDir: string
): Promise<number> {
	// Destination to the file it comes from. Two entries may not write one
	// twin: the second would replace the first without a word, and a note's
	// `.md` would quietly become another note's source. Canonical addresses go
	// first, so when this does throw, the message names the route that moved
	// onto an address rather than the address that moved onto the route.
	const sources = new Map<string, string>();
	const addresses = [
		...entries.map((entry) => ({ entry, urlPath: entry.urlPath })),
		...entries.flatMap((entry) => entry.routes.map((urlPath) => ({ entry, urlPath }))),
	];
	let written = 0;

	for (const { entry, urlPath } of addresses) {
		const twin = toMarkdownPath(urlPath);
		const claimed = sources.get(twin);
		if (claimed !== undefined && claimed !== entry.file) {
			throw new Error(
				`${entry.file} would write ${twin} for ${urlPath}, but ${claimed} already does. ` +
					'Two entries cannot share a markdown twin; change the route.'
			);
		}
		sources.set(twin, entry.file);

		const destination = path.join(outDir, twin);
		await mkdir(path.dirname(destination), { recursive: true });
		// `entry.file` is relative to the project root — the graph's promise —
		// so the read is joined to that root and not left to the cwd. They are
		// the same directory when someone runs `astro build` in their project
		// and different the moment they do not.
		await copyFile(path.join(root, entry.file), destination);
		written += 1;
	}

	return written;
}

/**
 * Warn about a route nothing renders.
 *
 * The integration writes the twin at a route but not the page: pages are the
 * consumer's. A route with no `<route>/index.html` (or `<route>.html`, for
 * `build.format: 'file'`) in the output is a declared address with a twin and
 * no page, which is easy to do by forgetting the route file.
 */
async function warnUnrenderedRoutes(
	entries: ContentEntry[],
	outDir: string,
	logger: Pick<Console, 'warn'>
) {
	for (const entry of entries) {
		for (const route of entry.routes) {
			const candidates = [path.join(outDir, route, 'index.html')];
			if (route !== '/') candidates.push(path.join(outDir, `${route.replace(/\/$/, '')}.html`));
			const rendered = await Promise.any(
				candidates.map((candidate) => access(candidate))
			).then(
				() => true,
				() => false
			);
			if (!rendered) {
				logger.warn(
					`${entry.file} declares the route ${route}, but the build has no page there. ` +
						'Add a route that renders the entry, as the README\'s "Alias routes" shows.'
				);
			}
		}
	}
}

function mimeOf(file: string): string {
	const ext = path.extname(file).slice(1);
	return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
}

function summarize(graph: Graph): string {
	return `📊 ${graph.totalBacklinks} total backlinks across ${Object.keys(graph.nodes).length} entries`;
}

/**
 * Options for the integration.
 *
 * Almost everything the graph needs is already in the consumer's
 * `defineConfig` — the root to read content from, the public directory to
 * write the index to — and reading it from there is what stops a second,
 * drifting copy of Astro's own configuration existing.
 *
 * X cards need no option here. `communeMarkdown({ embeds })` decides which
 * links get a card, and the build copies whatever images the built pages
 * point at, so there is nothing to keep in step between the two.
 */
export interface CommuneOptions {
	/** @deprecated No longer needed and does nothing; set `embeds` on `communeMarkdown` only. */
	embeds?: { x?: boolean };
}

/** Every `.html` file under `dir`. */
async function htmlFiles(dir: string): Promise<string[]> {
	const found: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) found.push(...(await htmlFiles(full)));
		else if (entry.name.endsWith('.html')) found.push(full);
	}
	return found;
}

/**
 * Whether `file` (already vetted by `isSafeMediaFile`) is a regular file in a
 * real folder under `base`. A symlink at either level could point anywhere on
 * the machine, and following it would publish whatever it names.
 */
async function isPlainSnapshotFile(base: string, file: string): Promise<boolean> {
	try {
		const folder = await lstat(path.join(base, file.split('/')[0]));
		const image = await lstat(path.join(base, file));
		return folder.isDirectory() && image.isFile();
	} catch {
		return false;
	}
}

/**
 * Copy the snapshot images the built pages use into the build, at
 * `/embeds/x/<id>/<n>.<ext>`.
 *
 * The pages are the source of truth: a card's `<img src>` is the only thing
 * that can 404, so the copy is driven by those `src` values and not by what
 * happens to be on disk. A site with no cards references nothing, so nothing
 * is copied and its output is untouched. A path that is not a plain image name
 * under a numeric id is ignored, so a page cannot ask for a file outside the
 * snapshot folder, and a referenced image that is not on disk is a card
 * without one, not a failed build.
 */
async function copyXImages(root: string, outDir: string): Promise<number> {
	const base = path.join(root, SNAPSHOT_DIR);
	// A site that never captured a post reads no HTML at all.
	try {
		await lstat(base);
	} catch {
		return 0;
	}
	const wanted = new Set<string>();
	const marker = `${PUBLIC_PREFIX}/`;
	// Deliberately loose. This can also match `data-src=` or quoted markup in a
	// code block, which is harmless: every match goes back through
	// `isSafeMediaFile`, and all it can cause is a copy of an image that already
	// exists in the snapshot folder.
	const pattern = /\bsrc=["']?\/embeds\/x\/([^"'\s>]+)/g;
	for (const page of await htmlFiles(outDir)) {
		const html = await readFile(page, 'utf8');
		// Most pages have no card, so skip the scan unless the path is there.
		if (!html.includes(marker)) continue;
		for (const match of html.matchAll(pattern)) {
			const file = match[1];
			if (isSafeMediaFile(file, file.split('/')[0])) wanted.add(file);
		}
	}
	let copied = 0;
	for (const file of wanted) {
		const destination = path.join(outDir, PUBLIC_PREFIX, file);
		try {
			// Checked before the folder is made, so a missing image leaves no empty one.
			if (!(await isPlainSnapshotFile(base, file))) continue;
			await mkdir(path.dirname(destination), { recursive: true });
			await copyFile(path.join(base, file), destination);
			copied += 1;
		} catch {
			// Vanished between the check and the copy. Nothing to copy.
		}
	}
	return copied;
}

export default function commune(_options: CommuneOptions = {}): AstroIntegration {
	// `astro:build:done` is not handed the resolved config, so the two paths
	// the graph needs are captured in `astro:config:setup` — which Astro always
	// runs first — and closed over. Per-instance rather than module-level: one
	// `commune()` call belongs to one Astro config, so two projects built in
	// one process do not overwrite each other's roots.
	let root: string;
	let publicBacklinks: string;
	let publicSite: string;

	return {
		name: 'commune-backlinks',
		hooks: {
			// Write the public artifact before pages render. Note pages import
			// backlinks.json at build time, so it has to be fresh on disk first —
			// otherwise the build bakes in whatever the previous run left behind.
			'astro:config:setup': async ({ config, logger }) => {
				logger.info('🔗 Building public backlinks index...');

				// Both are URLs, and `.pathname` percent-encodes: a project
				// checked out under a path with a space would read from a
				// literal `%20` directory and find no content at all.
				// `fileURLToPath` is what Astro's own docs use.
				root = fileURLToPath(config.root);
				publicBacklinks = fileURLToPath(new URL('./backlinks.json', config.publicDir));
				publicSite = fileURLToPath(new URL('./site.json', config.publicDir));

				try {
					const entries = await loadContentEntries({ root });
					const graph = buildBacklinksGraph(entries, logger);
					await writeBacklinksFile(publicBacklinks, toBacklinksJson(graph));
					await writeSiteFile(publicSite, summarizeSite(entries));
					logger.info(`✅ Backlinks index written to ${path.relative(root, publicBacklinks)}`);
					logger.info(summarize(graph));
				} catch (error) {
					logger.error('❌ Failed to build public backlinks index:');
					logger.error(String(error));
					throw error;
				}
			},
			'astro:server:setup': ({ server, logger }) => {
				server.middlewares.use((request, response, next) => {
					const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
					if (request.method !== 'GET' && request.method !== 'HEAD') return next();
					if (pathname.startsWith(`${PUBLIC_PREFIX}/`)) {
						const file = pathname.slice(PUBLIC_PREFIX.length + 1);
						const id = file.split('/')[0];
						if (!isSafeMediaFile(file, id)) return next();
						return isPlainSnapshotFile(path.join(root, SNAPSHOT_DIR), file)
							.then((plain) => (plain ? readFile(path.join(root, SNAPSHOT_DIR, file)) : Promise.reject(new Error('not a plain file'))))
							.then(
							(image) => {
								response.setHeader('Content-Type', mimeOf(file));
								response.end(request.method === 'HEAD' ? undefined : image);
							},
							() => next()
						);
					}
					if (!pathname.endsWith('.md')) return next();
					// Vite's own module and file requests are never twins, and each
					// lookup reads the whole vault, so they skip it.
					if (/^\/(?:src\/|node_modules\/|@)/.test(pathname)) return next();

					findMarkdownTwin(root, pathname)
						.then(async (file) => {
							if (!file) return next();
							const source = await readFile(file);
							response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
							response.setHeader('Content-Length', source.byteLength);
							response.end(request.method === 'HEAD' ? undefined : source);
						})
						.catch((error) => {
							logger.error(`Failed to serve ${pathname}: ${String(error)}`);
							next(error);
						});
				});
			},
			'astro:build:done': async ({ dir, logger }) => {
				logger.info('🔗 Building backlinks index...');

				try {
					const entries = await loadContentEntries({ root });
					const graph = buildBacklinksGraph(entries, logger);
					const json = toBacklinksJson(graph);

					await writeBacklinksFile(fileURLToPath(new URL('./backlinks.json', dir)), json);

					// Also written to the public directory, for dev server parity.
					await writeBacklinksFile(publicBacklinks, json);

					const site = summarizeSite(entries);
					await writeSiteFile(fileURLToPath(new URL('./site.json', dir)), site);
					await writeSiteFile(publicSite, site);

					const written = await writeMarkdownFiles(entries, root, fileURLToPath(dir));
					const images = await copyXImages(root, fileURLToPath(dir));
					if (images > 0) logger.info(`𝕏 ${images} embedded post images copied to ${PUBLIC_PREFIX}`);
					await warnUnrenderedRoutes(entries, fileURLToPath(dir), logger);

					logger.info(`✅ Backlinks index written to /backlinks.json (dist + public)`);
					logger.info(`📄 ${written} twins written as .md alongside their pages`);
					logger.info(summarize(graph));
					logger.info(
						site.lastUpdated
							? `🕒 Site last updated ${site.lastUpdated} (${site.lastUpdatedPath}, from ${site.lastUpdatedSource})`
							: '🕒 No entry carries a date, so site.json has no lastUpdated'
					);

				} catch (error) {
					logger.error('❌ Failed to build backlinks index:');
					logger.error(String(error));
					throw error;
				}
			},
		},
	};
}

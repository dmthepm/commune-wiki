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
import { copyFile, writeFile, mkdir } from 'node:fs/promises';
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
 */
async function writeMarkdownFiles(
	entries: ContentEntry[],
	root: string,
	outDir: string
): Promise<number> {
	for (const entry of entries) {
		const destination = path.join(outDir, toMarkdownPath(entry.urlPath));
		await mkdir(path.dirname(destination), { recursive: true });
		// `entry.file` is relative to the project root — the graph's promise —
		// so the read is joined to that root and not left to the cwd. They are
		// the same directory when someone runs `astro build` in their project
		// and different the moment they do not.
		await copyFile(path.join(root, entry.file), destination);
	}

	return entries.length;
}

function summarize(graph: Graph): string {
	return `📊 ${graph.totalBacklinks} total backlinks across ${Object.keys(graph.nodes).length} entries`;
}

/**
 * Options for the integration.
 *
 * Empty, and deliberately so: everything the graph needs is already in the
 * consumer's `defineConfig` — the root to read content from, the public
 * directory to write the index to — and reading it from there is what stops a
 * second, drifting copy of Astro's own configuration existing. The parameter
 * is here so that the day something *is* configurable, `commune({ … })` is
 * already the spelling in every consumer's config.
 */
export interface CommuneOptions {}

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

					logger.info(`✅ Backlinks index written to /backlinks.json (dist + public)`);
					logger.info(`📄 ${written} source files written as .md alongside their pages`);
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

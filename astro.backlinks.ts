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
	toBacklinksJson,
	toMarkdownPath,
	type ContentEntry,
	type Graph,
	type NoteMetadata,
} from './src/lib/graph.ts';

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

async function writeBacklinksFile(filePath: string, graph: Record<string, NoteMetadata>) {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(graph, null, 2) + '\n');
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
async function writeMarkdownFiles(entries: ContentEntry[], outDir: string): Promise<number> {
	for (const entry of entries) {
		const destination = path.join(outDir, toMarkdownPath(entry.urlPath));
		await mkdir(path.dirname(destination), { recursive: true });
		await copyFile(entry.file, destination);
	}

	return entries.length;
}

function summarize(graph: Graph): string {
	return `📊 ${graph.totalBacklinks} total backlinks across ${Object.keys(graph.nodes).length} entries`;
}

export default function backlinksIntegration(): AstroIntegration {
	return {
		name: 'commune-backlinks',
		hooks: {
			// Write the public artifact before pages render. Note pages import
			// backlinks.json at build time, so it has to be fresh on disk first —
			// otherwise the build bakes in whatever the previous run left behind.
			'astro:config:setup': async ({ logger }) => {
				logger.info('🔗 Building public backlinks index...');

				try {
					const graph = buildBacklinksGraph(await loadContentEntries(), logger);
					await writeBacklinksFile(path.join('public', 'backlinks.json'), toBacklinksJson(graph));
					logger.info(`✅ Backlinks index written to public/backlinks.json`);
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
					const entries = await loadContentEntries();
					const graph = buildBacklinksGraph(entries, logger);
					const json = toBacklinksJson(graph);

					// `dir` is a URL, and `dir.pathname` percent-encodes: a project
					// checked out under a path with a space writes to a literal
					// `%20` directory. `fileURLToPath` is what Astro's own docs use.
					await writeBacklinksFile(fileURLToPath(new URL('./backlinks.json', dir)), json);

					// Also write to /public for dev server parity
					// Use relative path from cwd to handle different build contexts
					await writeBacklinksFile(path.join('public', 'backlinks.json'), json);

					const written = await writeMarkdownFiles(entries, fileURLToPath(dir));

					logger.info(`✅ Backlinks index written to /backlinks.json (dist + public)`);
					logger.info(`📄 ${written} source files written as .md alongside their pages`);
					logger.info(summarize(graph));

				} catch (error) {
					logger.error('❌ Failed to build backlinks index:');
					logger.error(String(error));
					throw error;
				}
			},
		},
	};
}

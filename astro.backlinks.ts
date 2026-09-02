/**
 * Astro integration for building backlinks and graph data at build time.
 *
 * This integration:
 * - Reads the content graph from `src/lib/graph.ts` (the single resolver)
 * - Resolves WikiLinks to canonical URLs via titles and aliases
 * - Computes the bidirectional link graph (outbound + inbound)
 * - Outputs /backlinks.json for client-side consumption
 * - Enables Andy-style backlinks, related notes, and graph views
 *
 * Which content exists, where it lives, and how a URL is spelled are decided by
 * the graph core, not here. This file owns link resolution and star ranking.
 */

import type { AstroIntegration } from 'astro';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
	buildLinkLookup,
	extractLinks,
	loadContentEntries,
	type CollectionName,
} from './src/lib/graph.ts';

// =============================================================================
// STAR SYSTEM CONFIGURATION - Easy to modify!
// =============================================================================

/**
 * Star calculation strategy
 * Change this to experiment with different ranking algorithms
 */
const STAR_CONFIG = {
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
	}
};

// =============================================================================

/**
 * Calculate which notes get stars based on STAR_CONFIG
 * Returns a Set of slugs that should be starred
 */
function calculateStars(notes: Map<string, NoteMetadata>): Set<string> {
	const starredSlugs = new Set<string>();

	// Standalone pages belong in search and WikiLinks, not note rankings.
	const notesArray = Array.from(notes.values()).filter(note => note.collection !== 'pages');

	// Skip if too few notes
	if (notesArray.length < STAR_CONFIG.minNotesForStars) {
		return starredSlugs;
	}

	// Calculate score based on rankBy strategy
	const scored = notesArray.map(note => {
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

// =============================================================================

interface NoteMetadata {
	/** Canonical URL path. The graph is keyed by URL, so this is the identity. */
	slug: string;
	title: string;
	collection: CollectionName;
	aliases: string[];
	outbound: string[]; // urlPaths this note links to
	inbound: string[];  // urlPaths that link to this note
	tags: string[];
	status: string;
	summary?: string;
	updated?: string;
	isStarred?: boolean; // ⭐ indicator
}

async function buildBacklinksGraph(logger: Pick<Console, 'info' | 'warn'>) {
	const entries = await loadContentEntries();
	const lookup = buildLinkLookup(entries);

	const notes = new Map<string, NoteMetadata>();

	for (const entry of entries) {
		notes.set(entry.urlPath, {
			slug: entry.urlPath,
			title: entry.title,
			collection: entry.collection,
			aliases: entry.aliases,
			outbound: extractLinks(entry.body),
			inbound: [], // populated below
			tags: entry.tags,
			status: entry.status,
			...(entry.summary ? { summary: entry.summary } : {}),
			...(entry.updated ? { updated: entry.updated } : {}),
		});
	}

	logger.info(`📝 Found ${notes.size} public content entries`);

	// Resolve WikiLinks and compute inbound links
	for (const [fromUrl, note] of notes.entries()) {
		const resolvedOutbound: string[] = [];

		for (const link of note.outbound) {
			// Already a canonical URL, or resolvable by title/alias
			const resolved = notes.has(link)
				? link
				: lookup.get(link.toLowerCase())?.urlPath;

			if (resolved && notes.has(resolved)) {
				resolvedOutbound.push(resolved);
				const target = notes.get(resolved)!;
				if (!target.inbound.includes(fromUrl)) {
					target.inbound.push(fromUrl);
				}
			} else {
				// Link to a note that doesn't exist yet — fine, but worth saying
				logger.warn(`⚠️  Broken link in ${fromUrl}: [[${link}]]`);
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

	if (starredSlugs.size > 0) {
		logger.info(`⭐ ${starredSlugs.size} notes starred (top ${STAR_CONFIG.topPercent}%)`);
	}

	// Convert to plain object for JSON
	const graph: Record<string, NoteMetadata> = {};
	for (const [slug, note] of notes.entries()) {
		graph[slug] = note;
	}

	const totalBacklinks = Array.from(notes.values()).reduce(
		(sum, note) => sum + note.inbound.length,
		0
	);

	return { graph, totalBacklinks, entriesCount: notes.size };
}

async function writeBacklinksFile(filePath: string, graph: Record<string, NoteMetadata>) {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(graph, null, 2) + '\n');
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
					const { graph, totalBacklinks, entriesCount } = await buildBacklinksGraph(logger);
					await writeBacklinksFile(path.join('public', 'backlinks.json'), graph);
					logger.info(`✅ Backlinks index written to public/backlinks.json`);
					logger.info(`📊 ${totalBacklinks} total backlinks across ${entriesCount} entries`);
				} catch (error) {
					logger.error('❌ Failed to build public backlinks index:');
					logger.error(String(error));
					throw error;
				}
			},
			'astro:build:done': async ({ dir, logger }) => {
				logger.info('🔗 Building backlinks index...');

				try {
					const { graph, totalBacklinks, entriesCount } = await buildBacklinksGraph(logger);

					// Write to dist directory
					const distPath = path.join(dir.pathname, 'backlinks.json');
					await writeBacklinksFile(distPath, graph);

					// Also write to /public for dev server parity
					// Use relative path from cwd to handle different build contexts
					await writeBacklinksFile(path.join('public', 'backlinks.json'), graph);

					logger.info(`✅ Backlinks index written to /backlinks.json (dist + public)`);
					logger.info(`📊 ${totalBacklinks} total backlinks across ${entriesCount} entries`);

				} catch (error) {
					logger.error('❌ Failed to build backlinks index:');
					logger.error(String(error));
					throw error;
				}
			},
		},
	};
}

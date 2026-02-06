/**
 * Astro integration for building backlinks and graph data at build time.
 * 
 * This integration:
 * - Parses WikiLinks ([[Note Title]]) and markdown links in notes
 * - Resolves WikiLinks to actual note slugs via titles and aliases
 * - Computes bidirectional link graph (outbound + inbound)
 * - Outputs /backlinks.json for client-side consumption
 * - Enables Andy-style backlinks, related notes, and graph views
 */

import type { AstroIntegration } from 'astro';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { globby } from 'globby';
import matter from 'gray-matter';
import path from 'node:path';

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

	// Skip if too few notes
	if (notes.size < STAR_CONFIG.minNotesForStars) {
		return starredSlugs;
	}

	// Get all notes as array and calculate ranking scores
	const notesArray = Array.from(notes.values());

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
			cutoffIndex = Math.ceil(notes.size * (STAR_CONFIG.topPercent / 100));
			break;

		case 'top-absolute':
			cutoffIndex = Math.min(STAR_CONFIG.topAbsolute, notes.size);
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
	slug: string;
	title: string;
	collection: 'notes' | 'research'; // Track which collection this belongs to
	aliases: string[];
	outbound: string[]; // slugs this note links to
	inbound: string[];  // slugs that link to this note
	tags: string[];
	status: string;
	updated?: string;
	isStarred?: boolean; // ⭐ indicator
}

export default function backlinksIntegration(): AstroIntegration {
	return {
		name: 'commune-backlinks',
		hooks: {
			'astro:build:done': async ({ dir, logger }) => {
				logger.info('🔗 Building backlinks index...');

				try {
					const notes: Map<string, NoteMetadata> = new Map();
					const titleToSlug: Map<string, string> = new Map();
					const aliasToSlug: Map<string, string> = new Map();

					// First pass: collect all notes and research, titles, and aliases
					const noteFiles = await globby([
						'src/content/notes/**/*.{md,mdx}',
						'src/content/research/**/*.{md,mdx}'
					]);

					for (const file of noteFiles) {
						const src = await readFile(file, 'utf8');
						const { content, data } = matter(src);

						// Determine collection from file path
						const collection = file.includes('/notes/') ? 'notes' : 'research';

						// Skip private/draft notes (research is always public)
						if (collection === 'notes' && data.visibility !== 'public') continue;

						const { slug, urlPath } = pathToSlug(file, collection);
						const title = (data.title as string) || slug;
						const aliases = (data.aliases as string[]) || [];
						const tags = (data.tags as string[]) || [];
						const status = (data.status as string) || 'seed';
						const updated = data.updated as string | undefined;

						// Extract outbound links from content
						const outbound = extractLinks(content);

						notes.set(urlPath, {
							slug: urlPath,
							title,
							collection,
							aliases,
							outbound,
							inbound: [], // will be populated in second pass
							tags,
							status,
							updated,
						});

						// Build title -> slug map
						titleToSlug.set(title.toLowerCase(), urlPath);

						// Build alias -> slug map
						for (const alias of aliases) {
							aliasToSlug.set(alias.toLowerCase(), urlPath);
						}
					}

					logger.info(`📝 Found ${notes.size} public notes`);

					// Second pass: resolve WikiLinks and compute inbound links
					for (const [fromSlug, note] of notes.entries()) {
						const resolvedOutbound: string[] = [];

						for (const link of note.outbound) {
							// Try to resolve WikiLink to actual slug
							const resolved = 
								notes.has(link) ? link : // already a slug
								titleToSlug.get(link.toLowerCase()) || 
								aliasToSlug.get(link.toLowerCase());

							if (resolved && notes.has(resolved)) {
								resolvedOutbound.push(resolved);
								// Add inbound link to target note
								const targetNote = notes.get(resolved)!;
								if (!targetNote.inbound.includes(fromSlug)) {
									targetNote.inbound.push(fromSlug);
								}
							} else {
								// Link to non-existent note (that's ok for now)
								logger.warn(`⚠️  Broken link in ${fromSlug}: [[${link}]]`);
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

					// Write to dist directory
					const distPath = path.join(fileURLToPath(dir), 'backlinks.json');
					await writeFile(distPath, JSON.stringify(graph, null, 2));
					
					// Also write to /public for dev server parity
					// Use relative path from cwd to handle different build contexts
					const publicPath = path.join('public', 'backlinks.json');
					await mkdir(path.dirname(publicPath), { recursive: true });
					await writeFile(publicPath, JSON.stringify(graph, null, 2));

					logger.info(`✅ Backlinks index written to /backlinks.json (dist + public)`);

					// Log some stats
					const totalBacklinks = Array.from(notes.values()).reduce(
						(sum, note) => sum + note.inbound.length, 
						0
					);
					logger.info(`📊 ${totalBacklinks} total backlinks across ${notes.size} notes`);

				} catch (error) {
					logger.error('❌ Failed to build backlinks index:');
					logger.error(String(error));
					throw error;
				}
			},
		},
	};
}

/**
 * Convert file path to note slug (with collection prefix for URL)
 * Examples:
 *   src/content/notes/evergreen-notes.md → { slug: 'evergreen-notes', urlPath: '/notes/evergreen-notes/' }
 *   src/content/research/oss-business-models.md → { slug: 'oss-business-models', urlPath: '/research/oss-business-models' }
 */
function pathToSlug(filePath: string, collection: 'notes' | 'research'): { slug: string; urlPath: string } {
	const contentDir = collection === 'notes' ? 'src/content/notes' : 'src/content/research';
	const slug = path
		.relative(contentDir, filePath)
		.replace(/\\/g, '/')
		.replace(/\.(md|mdx)$/, '')
		.replace(/\/index$/, '');

	// Notes have trailing slash, research doesn't (to match Astro routes)
	const urlPath = collection === 'notes'
		? `/notes/${slug}/`
		: `/research/${slug}`;

	return { slug, urlPath };
}

/**
 * Extract WikiLinks [[Note Title]] and markdown links from content
 */
function extractLinks(content: string): string[] {
	const links: string[] = [];

	// WikiLinks: [[Note Title]] or [[Note Title|Display Text]]
	const wikiLinkMatches = content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g);
	for (const match of wikiLinkMatches) {
		links.push(match[1].trim());
	}

	// Markdown links to /notes/: [text](/notes/slug/)
	const mdLinkMatches = content.matchAll(/\[([^\]]+)\]\(\/notes\/([^)]+)\/?/g);
	for (const match of mdLinkMatches) {
		links.push(match[2].trim());
	}

	return [...new Set(links)]; // dedupe
}


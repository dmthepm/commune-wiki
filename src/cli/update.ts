/**
 * `commune update` — a dated update entry, scaffolded from what changed.
 *
 * The one verb here that can write. Everything else in this CLI answers
 * questions about a content tree; this one drafts a file into it, so the
 * writing is opt-in: without `--write` it prints the entry on stdout, which is
 * both a preview and a redirect away from a file of your choosing. With
 * `--write` it refuses to overwrite an existing entry — a scaffold that
 * clobbers a day's writing is worse than no scaffold.
 *
 * What it produces is a draft and says so: `summary` is empty, because a
 * one-line summary of a week is a judgement and this command has no taste.
 * The parts it can be trusted with — which pages moved, what they are called,
 * what date it is — are filled in.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONTENT_DIRS, loadContentEntries, type ContentEntry } from '../lib/graph.ts';
import { SCHEMA, writeJson, writeLines } from './render.ts';
import { EXIT_OK, failure } from './errors.ts';

/**
 * The entry, as markdown.
 *
 * `links:` carries the urlPaths and the body carries the titles, which is the
 * same edge written twice on purpose: the frontmatter is what the graph reads
 * without rendering anything, and the prose is what a reader reads. They
 * deduplicate into one edge, so writing both costs nothing.
 */
function scaffold(day: string, changed: ContentEntry[]): string {
	const lines = [
		'---',
		`title: "Updates for ${day}"`,
		`date: ${day}`,
		'summary: ""',
		'aiGenerated: false',
	];

	if (changed.length) {
		lines.push('links:', ...changed.map((entry) => `  - ${entry.urlPath}`));
	}

	lines.push('---', '');
	lines.push(
		...(changed.length
			? changed.map(
					(entry) => `- [[${entry.title}]]${entry.summary ? ` — ${entry.summary}` : ''}`
				)
			: ['Nothing changed in this window.'])
	);

	return `${lines.join('\n')}\n`;
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
}

export async function updateCommand(
	root: string,
	since: string,
	day: string,
	write: boolean,
	json: boolean
): Promise<number> {
	const entries = await loadContentEntries({ root });
	// Updates are excluded from their own roll-up: an update that lists last
	// week's update says nothing about the wiki.
	const changed = entries.filter(
		(entry) =>
			entry.collection !== 'updates' && entry.updated !== undefined && entry.updated >= since
	);

	const file = `${CONTENT_DIRS.updates}/${day}.md`;
	const content = scaffold(day, changed);

	if (write) {
		const destination = path.join(root, file);
		if (await exists(destination)) {
			throw failure(
				'EEXISTS',
				`${file} already exists. Edit it, or delete it first — this command does not overwrite an update that has been written.`
			);
		}
		await mkdir(path.dirname(destination), { recursive: true });
		await writeFile(destination, content);
	}

	if (json) {
		writeJson({
			schema: SCHEMA,
			root,
			since,
			date: day,
			file,
			written: write,
			entries: changed.map((entry) => ({
				urlPath: entry.urlPath,
				title: entry.title,
				collection: entry.collection,
				updated: entry.updated,
				updatedSource: entry.updatedSource,
			})),
			content,
		});
		return EXIT_OK;
	}

	writeLines(write ? [`wrote ${file} — ${changed.length} entries since ${since}`] : [content.trimEnd()]);
	return EXIT_OK;
}

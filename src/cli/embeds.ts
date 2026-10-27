/**
 * `commune embeds fetch` — capture the X posts a site links to.
 *
 * The one place a request to X is made. A build only reads what this wrote,
 * under `.commune/embeds/x/`, so running it is a deliberate act and the result
 * is committed. A post is fetched when it has no snapshot, or when its
 * snapshot is older than `--stale-days`; `--refresh` fetches every one. A post
 * that cannot be fetched keeps whatever snapshot it has, and is reported.
 */

import { loadContentEntries } from '../lib/graph.ts';
import {
	fetchSnapshot,
	findXStatusIds,
	readSnapshot,
	type FetchOutcome,
	type Fetcher,
} from '../lib/x-embeds.ts';
import { SCHEMA, writeJson, writeLines } from './output.ts';
import { EXIT_OK } from './errors.ts';

const DAY = 24 * 60 * 60 * 1000;

interface Row {
	id: string;
	result: 'saved' | 'removed' | 'failed' | 'fresh';
	detail?: string;
}

export async function embedsFetchCommand(
	root: string,
	options: { refresh: boolean; staleDays: number; json: boolean },
	fetcher?: Fetcher,
	now: Date = new Date()
): Promise<number> {
	const entries = await loadContentEntries({ root });
	const ids = [...new Set(entries.flatMap((entry) => findXStatusIds(entry.body)))].sort();

	const rows: Row[] = [];
	for (const id of ids) {
		const existing = await readSnapshot(root, id);
		const age = existing ? now.getTime() - new Date(existing.capturedAt).getTime() : Infinity;
		// A removed post is not asked about again unless someone asks for all.
		const skip = existing && !options.refresh && (existing.removedAt || age < options.staleDays * DAY);
		if (skip) {
			rows.push({ id, result: 'fresh' });
			continue;
		}
		const outcome: FetchOutcome = await fetchSnapshot(root, id, fetcher, now);
		rows.push(
			outcome.status === 'failed'
				? { id, result: 'failed', detail: outcome.reason }
				: { id, result: outcome.status }
		);
	}

	if (options.json) {
		writeJson({ schema: SCHEMA, posts: rows });
	} else {
		writeLines(
			rows.length
				? rows.map((row) => `${row.id}  ${row.result}${row.detail ? `  ${row.detail}` : ''}`)
				: ['No links to X posts found.']
		);
	}
	// A failed post is a finding, not a failed run: the site still builds.
	return EXIT_OK;
}

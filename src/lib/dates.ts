/**
 * Where a content entry's dates come from when nobody wrote them down.
 *
 * `updated:` in frontmatter is a hand-maintained field, and a hand-maintained
 * field is only true while somebody remembers to maintain it. The repository
 * already knows the answer — a file's last commit *is* the day it last
 * changed — so this module reads it from there and the graph prefers
 * frontmatter only when frontmatter exists.
 *
 * Two rules the rest of the engine depends on:
 *
 *   - **One walk, not one process per file.** `git log --name-only` over the
 *     content directories yields every file's whole history in a single
 *     child process. A vault has hundreds of notes; spawning `git` for each
 *     one turns a build into a minute of process creation.
 *   - **Never fatal.** A consumer's build can run from a tarball, a Docker
 *     `COPY`, or a host that ships no `git` binary. Every failure here
 *     degrades to file mtimes, which are wrong in a boring way rather than a
 *     build that dies on content it could have dated.
 */

import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * How an entry's `updated` was decided, so a site can show the honest one.
 *
 * `frontmatter` is an author's claim, `git` is the repository's record,
 * `mtime` is the filesystem's guess in a tree with no history, and `none`
 * means all three were silent.
 */
export type DateSource = 'frontmatter' | 'git' | 'mtime' | 'none';

/** The first and last commit dates of one file, as `yyyy-mm-dd`. */
export interface FileHistory {
	/** Date of the file's most recent commit. */
	updated: string;
	/** Date of the file's oldest commit. */
	created: string;
}

/**
 * Every content file's first and last commit date, from one `git log` walk.
 *
 * Returns `undefined` — not an empty map — when the tree is not a git
 * checkout or `git` is not on the PATH, because "this project has no history"
 * and "this project has history and these files are not in it" are different
 * facts and only the second one should reach for a file's mtime as an answer.
 *
 * `--relative` (with the child process's cwd set to `root`) is what keeps the
 * returned paths in the same spelling `ContentEntry.file` uses: a project root
 * nested inside a larger repository would otherwise get repository-relative
 * paths back and match nothing. `core.quotePath=false` keeps non-ASCII
 * filenames literal — notes are named for their titles, and titles have
 * accents.
 */
export async function readGitHistory(
	root: string,
	dirs: string[]
): Promise<Map<string, FileHistory> | undefined> {
	let stdout: string;
	try {
		({ stdout } = await run(
			'git',
			[
				'-c',
				'core.quotePath=false',
				'log',
				// A NUL before each commit's date: no date line can be confused
				// with a filename, whatever a file is called.
				'--format=%x00%cd',
				'--date=short',
				'--name-only',
				'--relative',
				'--',
				...dirs,
			],
			{ cwd: root, maxBuffer: 64 * 1024 * 1024 }
		));
	} catch {
		return undefined;
	}

	const history = new Map<string, FileHistory>();

	// `git log` walks newest first, so the first sighting of a file is its last
	// commit and every later sighting is an older one.
	for (const commit of stdout.split('\u0000')) {
		const [date, ...lines] = commit.split('\n');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

		for (const line of lines) {
			if (!line) continue;
			const file = unquotePath(line);
			const seen = history.get(file);
			if (seen) seen.created = date;
			else history.set(file, { updated: date, created: date });
		}
	}

	return history;
}

/**
 * Undo git's C-style quoting of a path.
 *
 * With `core.quotePath=false` only paths containing a quote, a backslash or a
 * control character are quoted at all, and JSON's escapes cover those. A path
 * git quoted some other way is returned as git printed it: a filename that odd
 * is better shown verbatim than silently mangled by a guess.
 */
function unquotePath(line: string): string {
	if (!line.startsWith('"')) return line;
	try {
		return JSON.parse(line) as string;
	} catch {
		return line;
	}
}

/** A file's modification time as `yyyy-mm-dd`, or `undefined` if it cannot be read. */
export async function readMtimeDate(root: string, file: string): Promise<string | undefined> {
	try {
		const stats = await stat(path.join(root, file));
		return stats.mtime.toISOString().split('T')[0];
	} catch {
		return undefined;
	}
}

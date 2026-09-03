/**
 * Where a content entry's dates come from when nobody wrote them down.
 *
 * `updated:` in frontmatter is a hand-maintained field, and a hand-maintained
 * field is only true while somebody remembers to maintain it. The repository
 * already knows the answer — a file's last commit *is* the day it last
 * changed — so this module reads it from there and the graph prefers
 * frontmatter only when frontmatter exists.
 *
 * Three rules the rest of the engine depends on:
 *
 *   - **One walk, not one process per file.** `git log --name-only` over the
 *     content directories yields every file's whole history in a single
 *     child process. A vault has hundreds of notes; spawning `git` for each
 *     one turns a build into a minute of process creation.
 *   - **A shallow clone has no dates to give.** `actions/checkout` fetches
 *     depth 1 by default, and in that tree every file's "first and last
 *     commit" is the same single commit — the day of the build. That is not a
 *     worse date, it is a false one, and it would be false on every entry at
 *     once. So a shallow checkout produces no derived dates at all, and says
 *     so once on stderr.
 *   - **Never fatal, and never a guess dressed as a fact.** A tree that is not
 *     in a repository at all falls back to file mtimes. A tree that *is* in one
 *     never does: inside a checkout an mtime is the day the files were written
 *     to disk, which on CI is the day of the build and on a fresh clone is
 *     today, so it would launder the same falsehood the shallow rule exists to
 *     refuse.
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
 * `mtime` is the filesystem's guess in a directory with no repository around
 * it, and `none` means nothing could answer — an uncommitted file, or any file
 * in a shallow checkout.
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
 * What the project's history can and cannot answer.
 *
 * Three states, because the two failures are not the same failure and the
 * graph has to treat them differently. `unversioned` means no repository, and
 * an mtime is the best honest answer available. `shallow` means a repository
 * whose history was truncated, where both a commit date and an mtime would say
 * "today" about every file at once.
 */
export type HistoryKind = 'history' | 'shallow' | 'unversioned';

export interface ContentHistory {
	kind: HistoryKind;
	/** Keyed by root-relative file path. Empty unless `kind` is `history`. */
	files: Map<string, FileHistory>;
}

/**
 * Said once, on stderr, when a build or a query runs in a truncated checkout.
 *
 * On stderr rather than in `Graph.diagnostics` because it is not a finding
 * about anyone's content — it is a fact about the environment the command ran
 * in, and the person who needs it is reading a build log. stderr also keeps it
 * out of the way of `--json`, whose stdout carries one document and nothing
 * else.
 */
export const SHALLOW_WARNING =
	'git history is shallow: dates come from frontmatter only. ' +
	'Fetch full history (fetch-depth: 0 / unshallow) to derive dates from commits.';

/** One warning per project root per process, however many times the graph is loaded. */
const warned = new Set<string>();

function warnShallow(root: string): void {
	const key = path.resolve(root);
	if (warned.has(key)) return;
	warned.add(key);
	process.stderr.write(`${SHALLOW_WARNING}\n`);
}

/** Test seam: forget which roots have been warned about. */
export function resetShallowWarnings(): void {
	warned.clear();
}

/** A local calendar day as `yyyy-mm-dd`.
 *
 * The one spelling of "what day is it" in the engine. Local rather than UTC on
 * purpose, and shared rather than reimplemented: `git log --date=short` renders
 * a commit in its own recorded timezone — the committer's local day — so an
 * mtime, a `--recent 7d` cutoff and the date a scaffolded update is filed under
 * all have to be local days too, or the four would disagree for the hours
 * either side of midnight.
 */
export function toIsoDay(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

/** Is this root a shallow checkout, a full one, or not a repository at all? */
async function classify(root: string): Promise<HistoryKind> {
	try {
		const { stdout } = await run('git', ['rev-parse', '--is-shallow-repository'], { cwd: root });
		return stdout.trim() === 'true' ? 'shallow' : 'history';
	} catch {
		// Not a repository, or no `git` on the PATH. The flag itself is not in
		// question: it has shipped since git 2.15 (2017).
		return 'unversioned';
	}
}

/**
 * Every content file's first and last commit date, from one `git log` walk.
 *
 * `--relative` (with the child process's cwd set to `root`) is what keeps the
 * returned paths in the same spelling `ContentEntry.file` uses: a project root
 * nested inside a larger repository would otherwise get repository-relative
 * paths back and match nothing. `core.quotePath=false` keeps non-ASCII
 * filenames literal — notes are named for their titles, and titles have
 * accents.
 *
 * `%D` rides along on each commit line as the second belt: `rev-parse` has
 * already answered whether the repository is shallow, and a walk that reaches
 * the grafted boundary anyway says the same thing from the other direction.
 * Either one means the same commit stands in for every commit before it, so
 * neither the dates nor a first-commit `created` can be trusted.
 */
export async function readContentHistory(
	root: string,
	dirs: string[]
): Promise<ContentHistory> {
	const kind = await classify(root);

	if (kind !== 'history') {
		if (kind === 'shallow') warnShallow(root);
		return { kind, files: new Map() };
	}

	let stdout: string;
	try {
		({ stdout } = await run(
			'git',
			[
				'-c',
				'core.quotePath=false',
				'log',
				// A NUL before each commit, then its date and its decoration: no
				// line of this can be confused with a filename, whatever a file is
				// called.
				'--format=%x00%cd%x09%D',
				'--date=short',
				'--name-only',
				'--relative',
				'--',
				...dirs,
			],
			{ cwd: root, maxBuffer: 64 * 1024 * 1024 }
		));
	} catch {
		// A repository the walk cannot read — most often one with no commits yet.
		// Still a repository, so still not a place to reach for an mtime: it has
		// nothing to say, and `none` is what "nothing to say" looks like.
		return { kind: 'history', files: new Map() };
	}

	const files = new Map<string, FileHistory>();

	// `git log` walks newest first, so the first sighting of a file is its last
	// commit and every later sighting is an older one.
	for (const commit of stdout.split('\u0000')) {
		const [header, ...lines] = commit.split('\n');
		const [date, decoration = ''] = header.split('\t');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

		if (decoration.includes('grafted')) {
			warnShallow(root);
			return { kind: 'shallow', files: new Map() };
		}

		for (const line of lines) {
			if (!line) continue;
			const file = unquotePath(line);
			const seen = files.get(file);
			if (seen) seen.created = date;
			else files.set(file, { updated: date, created: date });
		}
	}

	return { kind: 'history', files };
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

/** A file's modification time as a local `yyyy-mm-dd`, or `undefined` if unreadable. */
export async function readMtimeDate(root: string, file: string): Promise<string | undefined> {
	try {
		const stats = await stat(path.join(root, file));
		return toIsoDay(stats.mtime);
	} catch {
		return undefined;
	}
}

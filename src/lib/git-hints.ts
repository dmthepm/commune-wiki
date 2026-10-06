/**
 * What git can say about a note that was renamed outside `commune rename`.
 *
 * Two readers use this: `check`, to name the likely rename behind a
 * `broken-link`, and `rename`, to tell whether its root is a git work tree at
 * all. Both are advisory. Git is optional here: no `git` on the PATH, no
 * repository, no commits yet, a timeout or any other failure returns nothing
 * and the caller behaves exactly as it does without git. Nothing in this file
 * writes to the work tree, the real index or the history. Hooks are disabled
 * on every call, and nothing inside `.git` changes except, at most, the empty
 * blob object that an intent-to-add entry needs.
 *
 * `git` is always run with `execFile`, never through a shell, with `cwd` set to
 * the project root.
 */

import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { parseFrontmatter } from './frontmatter.ts';
import { CONTENT_DIRS, linkKey, toUrlPath, type CollectionName, type Diagnostic } from './graph.ts';

const run = promisify(execFile);

/** Long enough for a large vault, short enough that a hung git cannot stall `check`. */
const TIMEOUT_MS = 5000;

async function git(root: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
	// Hooks never run from here: a read-only look must not execute the user's scripts.
	const { stdout } = await run('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
		cwd: root,
		timeout: TIMEOUT_MS,
		maxBuffer: 16 * 1024 * 1024,
		env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', ...env },
	});
	return stdout;
}

/** Is `root` inside a git work tree? False for no repository, no `git` and any error. */
export async function insideGitWorkTree(root: string): Promise<boolean> {
	try {
		return (await git(root, ['rev-parse', '--is-inside-work-tree'])).trim() === 'true';
	} catch {
		return false;
	}
}

export interface RenamedFile {
	/** Root-relative path the note had in the last commit. */
	from: string;
	/** Root-relative path it has now. */
	to: string;
	/** The commit that still holds the old file: `HEAD` for the work tree, `HEAD~1` for the last commit. */
	rev?: 'HEAD' | 'HEAD~1';
}

/** Parse `git diff --name-status -z` output into its renames. */
function parseRenames(output: string, rev: RenamedFile['rev']): RenamedFile[] {
	const fields = output.split('\0');
	const renames: RenamedFile[] = [];
	for (let i = 0; i < fields.length; i++) {
		const status = fields[i];
		if (!status) continue;
		if (status[0] === 'R' || status[0] === 'C') {
			if (status[0] === 'R') renames.push({ from: fields[i + 1], to: fields[i + 2], rev });
			i += 2;
		} else {
			i += 1;
		}
	}
	return renames.filter((rename) => rename.from && rename.to);
}

const DIFF = ['-c', 'core.quotepath=off', 'diff', '--name-status', '-z', '-M', '--relative'];
const MARKDOWN = /\.mdx?$/i;

/**
 * Renames of content files, from git's own rename detection.
 *
 * Two diffs. The first is the work tree against HEAD, so a staged `git mv`, a
 * plain `mv` and an untracked new file all count. Git will not pair a deletion
 * with an untracked file, so the untracked files are registered as
 * intent-to-add in a scratch copy of the index, deleted afterwards. That
 * writes at most the empty blob, never the real index. The second is the last
 * commit, for a rename that has already been committed. The two run side by
 * side, and a rename seen in the work tree is listed first.
 *
 * Returns an empty list on any failure.
 */
export async function detectRenames(root: string): Promise<RenamedFile[]> {
	// `git add` refuses a pathspec that matches nothing, so only directories that exist.
	const dirs: string[] = [];
	for (const dir of Object.values(CONTENT_DIRS)) {
		if (await stat(path.join(root, dir)).then((s) => s.isDirectory(), () => false)) dirs.push(dir);
	}
	if (!dirs.length) return [];
	const workTree = async (): Promise<RenamedFile[]> => {
		const scratch = await mkdtemp(path.join(tmpdir(), 'commune-index-')).catch(() => undefined);
		if (!scratch) return [];
		try {
			const env = { GIT_INDEX_FILE: path.join(scratch, 'index') };
			// A copy of the real index, not a fresh one: it carries the stat cache, so
			// the diff does not re-read every note to learn it is unchanged.
			const index = path.resolve(root, (await git(root, ['rev-parse', '--git-path', 'index'])).trim());
			await copyFile(index, env.GIT_INDEX_FILE);
			// splitIndex off, or a split-index repository gets a sharedindex file written
			// beside the real one.
			await git(root, ['-c', 'core.splitIndex=false', 'add', '--intent-to-add', '--all', '--', ...dirs], env);
			return parseRenames(await git(root, [...DIFF, 'HEAD', '--', ...dirs], env), 'HEAD');
		} catch {
			// Not a repository, no commits yet, no git, or a git that refused.
			return [];
		} finally {
			await rm(scratch, { recursive: true, force: true }).catch(() => {});
		}
	};
	const lastCommit = async (): Promise<RenamedFile[]> => {
		try {
			return parseRenames(await git(root, [...DIFF, 'HEAD~1', 'HEAD', '--', ...dirs]), 'HEAD~1');
		} catch {
			// A single-commit history has no HEAD~1.
			return [];
		}
	};

	// Independent, so run side by side: `check` waits for the slower of the two.
	const [now, committed] = await Promise.all([workTree(), lastCommit()]);
	return [...now, ...committed].filter((rename) => MARKDOWN.test(rename.from) && MARKDOWN.test(rename.to));
}

const stemOf = (file: string) => path.posix.basename(file).replace(/\.mdx?$/i, '');

/** "`Old.md` looks renamed to `New.md`", naming the directory only when it changed. */
function describe(rename: RenamedFile): string {
	const sameDir = path.posix.dirname(rename.from) === path.posix.dirname(rename.to);
	const from = path.posix.basename(rename.from);
	const to = sameDir ? path.posix.basename(rename.to) : rename.to;
	return `\`${from}\` looks renamed to \`${to}\``;
}

/** The collection a root-relative path lives in, or undefined outside the content directories. */
function collectionOf(file: string): CollectionName | undefined {
	return (Object.keys(CONTENT_DIRS) as CollectionName[]).find((name) => file.startsWith(`${CONTENT_DIRS[name]}/`));
}

/**
 * The old file's frontmatter, read from the commit that still held it. One
 * `git show` per call. `./` makes the path relative to the project root, which
 * is where git runs. Empty on any failure, a missing block or invalid YAML.
 */
async function oldFrontmatter(root: string, rename: RenamedFile): Promise<Record<string, unknown>> {
	try {
		const blob = await git(root, ['show', `${rename.rev ?? 'HEAD'}:./${rename.from}`]);
		return parseFrontmatter(blob).data;
	} catch {
		return {};
	}
}

/**
 * Attach a `hint` to each broken link whose target names a renamed file,
 * matched the way the graph matches titles (`linkKey`). A name link matches the
 * old file's stem or the `title` its old frontmatter carried. A url link
 * matches the URL the old file had, computed by the graph's own `toUrlPath`
 * from the old path and old frontmatter.
 *
 * Does nothing, and never calls git, when there is no broken link to explain.
 * The old blob is read only while some broken link is still unexplained by the
 * filenames, and then once per rename.
 */
export async function addRenameHints(root: string, findings: Diagnostic[]): Promise<void> {
	const broken = findings.filter((finding) => finding.rule === 'broken-link' && finding.target !== undefined);
	if (!broken.length) return;

	const renames = await detectRenames(root);
	if (!renames.length) return;

	// A name shared by renames in two places (two collections, say) is ambiguous:
	// the finding does not say which collection it meant, so it gets no hint
	// rather than a guess. The same rename seen twice is not ambiguous.
	const claim = (table: Map<string, RenamedFile | null>, key: string, rename: RenamedFile) => {
		const seen = table.get(key);
		if (seen === undefined) table.set(key, rename);
		else if (seen && (seen.from !== rename.from || seen.to !== rename.to)) table.set(key, null);
	};

	const byName = new Map<string, RenamedFile | null>();
	const byUrl = new Map<string, RenamedFile | null>();
	for (const rename of renames) claim(byName, linkKey(stemOf(rename.from)), rename);

	// A `git show` is worth it only for a name link the stems left unexplained,
	// or for a url link, which a filename cannot explain at all.
	const wantsName = broken.some((f) => f.kind !== 'url' && !byName.get(linkKey(f.target!)));
	const wantsUrl = broken.some((f) => f.kind === 'url');
	if (wantsName || wantsUrl) {
		const read = new Set<string>();
		for (const rename of renames) {
			const collection = collectionOf(rename.from);
			const id = `${rename.from}\0${rename.to}`;
			if (!collection || read.has(id)) continue;
			read.add(id);
			const data = await oldFrontmatter(root, rename);
			if (wantsName && typeof data.title === 'string' && data.title.trim()) claim(byName, linkKey(data.title), rename);
			if (wantsUrl) claim(byUrl, toUrlPath(rename.from, collection, data).urlPath, rename);
		}
	}

	for (const finding of broken) {
		const rename = finding.kind === 'url' ? byUrl.get(finding.target!) : byName.get(linkKey(finding.target!));
		if (rename) finding.hint = describe(rename);
	}
}

/** Single-quote a string for a POSIX shell: nothing inside it is expanded. */
export function shellQuote(text: string): string {
	return `'${text.replace(/'/g, `'\\''`)}'`;
}

/**
 * The `git mv -f` line for a case-only rename, or undefined when none is due.
 *
 * Only when the disk treated both names as one file (`caseOnly`, from the
 * rename itself): on a case-sensitive disk git sees a plain delete and add,
 * and `git mv -f` would fail with "bad source". `-C` carries the root, so the
 * line works from any directory.
 */
export async function caseOnlyMoveHint(
	root: string,
	from: string,
	to: string,
	caseOnly: boolean
): Promise<string | undefined> {
	if (!caseOnly || from.toLowerCase() !== to.toLowerCase()) return undefined;
	if (!(await insideGitWorkTree(root))) return undefined;
	return `git -C ${shellQuote(path.resolve(root))} mv -f ${shellQuote(from)} ${shellQuote(to)}`;
}

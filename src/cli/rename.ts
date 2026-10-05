/**
 * `commune rename` — move a note and rewrite every link that points at it.
 *
 * The second verb that writes. A file's name is its link target (#17), so a
 * rename done any other way, with `mv`, `git mv`, an editor or `obsidian
 * rename`, leaves every `[[Old]]` in the vault pointing at nothing, with no
 * warning. This verb is the only sanctioned way to do it.
 *
 * Nothing here parses markdown a second time. Link spans are found with the
 * graph core's own patterns (`WIKILINK`, `MARKDOWN_LINK`) over text with code
 * and HTML comments blanked (`maskNonProse`), each span is read back through
 * `extractLinks`, and it is rewritten only if it points at the file being
 * renamed. Blanked text is never touched.
 *
 * The order is plan, then write. Everything that will change is computed in
 * memory first, refusals happen there, and `--dry-run` prints the plan and
 * stops. The write phase stages every file beside its destination and renames
 * them into place, and puts things back if one of them fails.
 *
 * A rename is also a URL decision. By default the URL stays: when the new
 * filename would move it, a `slug:` pin holding the old slug is added. With
 * `--move-url` the URL follows the name and `public/_redirects` gets a 301 for
 * the old URL and its `.md` twin.
 */

import { chmod, mkdir, readFile, stat, unlink, writeFile, rename as renameFile } from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'tinyglobby';
import matter from 'gray-matter';
import {
	CONTENT_DIRS,
	COLLECTIONS,
	MARKDOWN_LINK,
	WIKILINK,
	buildLinkLookup,
	buildUrlLookup,
	extractLinks,
	findDuplicateNames,
	linkKey,
	loadContentEntries,
	resolveLink,
	stripCode,
	toMarkdownHref,
	toUrlPath,
	type CollectionName,
	type ContentEntry,
	type ExtractedLink,
} from '../lib/graph.ts';
import { SCHEMA, writeJson, writeLines } from './output.ts';
import { EXIT_OK, failure } from './errors.ts';

const REDIRECTS_FILE = 'public/_redirects';

/** One changed line, as the plan reports it. */
interface LineChange {
	line: number;
	before: string;
	after: string;
}

interface FileEdit {
	/** Path the content ends up at. */
	file: string;
	/** Path it was read from. Differs for the renamed file only. */
	source: string;
	before: string;
	after: string;
	changes: LineChange[];
	/** Permission bits of the file this replaces, so the replacement keeps them. */
	mode?: number;
}

type UrlDecision = 'unchanged' | 'pinned' | 'moved' | 'unpublished';

interface UrlPlan {
	decision: UrlDecision;
	old?: string;
	new?: string;
	pinnedSlug?: string;
	removedPin: boolean;
	redirects: string[];
	message: string;
}

/** Split a raw file into its frontmatter block and the rest, without parsing either. */
function splitFrontmatter(raw: string): { head: string; fm: string; tail: string; body: string } | undefined {
	const match = /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/.exec(raw);
	if (!match) return undefined;
	return { head: match[1], fm: match[2], tail: match[3], body: raw.slice(match[0].length) };
}

const lineOf = (text: string, index: number, offset = 1): number =>
	offset + (text.slice(0, index).match(/\n/g)?.length ?? 0);

/** Percent-encode a filename the way a markdown destination needs it. */
function encodeDestination(name: string): string {
	return encodeURIComponent(name).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/** Everything the rewriting needs to know about the rename. */
interface Rewrite {
	oldUrl: string;
	/** Set only when the URL is moving; absolute links are rewritten only then. */
	newUrl?: string;
	oldStem: string;
	newStem: string;
	newExt: string;
	isOurs: (link: ExtractedLink, site: Site) => boolean;
	/** Relative file links that name this file's basename but cannot be told apart from another's. */
	ambiguous: string[];
}

/** Where a link sits. `destination` is set for a file link, which names a path. */
interface Site {
	file: string;
	line: number;
	destination?: string;
}

/**
 * Blank what is not prose, keeping every offset.
 *
 * Rename-local on purpose: `stripCode` is the extractor's, and changing it
 * would change what the graph sees. This one also blanks HTML comments, and
 * closes a fence only with a marker of the same character that is at least as
 * long as the one that opened it, so a four-backtick fence can wrap a
 * three-backtick one. Inline code goes through `stripCode` afterwards.
 */
export function maskNonProse(text: string): string {
	const blank = (value: string) => value.replace(/[^\n\r]/g, ' ');
	let fence: { char: string; length: number } | undefined;
	let comment = false;

	const masked = text.split('\n').map((line) => {
		if (fence) {
			const close = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/.exec(line);
			if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = undefined;
			return blank(line);
		}

		let out = '';
		let rest = line;
		if (comment) {
			const end = rest.indexOf('-->');
			if (end < 0) return blank(line);
			out = blank(rest.slice(0, end + 3));
			rest = rest.slice(end + 3);
			comment = false;
		} else {
			const open = /^ {0,3}(`{3,}|~{3,})/.exec(rest);
			// An info string after a backtick fence may not contain a backtick.
			if (open && !(open[1][0] === '`' && rest.slice(open[0].length).includes('`'))) {
				fence = { char: open[1][0], length: open[1].length };
				return blank(line);
			}
		}

		// Inline code first, so a `<!--` written inside backticks starts nothing.
		rest = rest.replace(/`[^`\n]*`/g, blank);
		for (;;) {
			const start = rest.indexOf('<!--');
			if (start < 0) break;
			const end = rest.indexOf('-->', start + 4);
			if (end < 0) {
				out += rest.slice(0, start) + blank(rest.slice(start));
				rest = '';
				comment = true;
				break;
			}
			out += rest.slice(0, start) + blank(rest.slice(start, end + 3));
			rest = rest.slice(end + 3);
		}
		return out + rest;
	});

	return stripCode(masked.join('\n'));
}

/** Replace the name in `Name#Heading` or `Name^block`, keeping the subpath and any padding. */
function renameInTarget(raw: string, newStem: string): string {
	const cut = raw.search(/[#^]/);
	const head = cut < 0 ? raw : raw.slice(0, cut);
	const subpath = cut < 0 ? '' : raw.slice(cut);
	const [, lead, , trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(head)!;
	return `${lead}${newStem}${trail}${subpath}`;
}

/**
 * Rewrite one markdown destination, or one bare `links:` value.
 *
 * `raw` says a space may be written as is, which holds in YAML and inside
 * `<angle brackets>` but not in a plain markdown destination.
 */
function rewriteDestination(
	destination: string,
	link: ExtractedLink,
	rewrite: Rewrite,
	raw: boolean
): string {
	const angled = destination.startsWith('<');
	const inner = destination.replace(/^<|>$/g, '');
	const cut = inner.search(/[#?]/);
	const pathPart = cut < 0 ? inner : inner.slice(0, cut);
	const tail = cut < 0 ? '' : inner.slice(cut);

	let next: string;
	if (link.kind === 'url') {
		next = pathPart.endsWith('/') ? rewrite.newUrl! : rewrite.newUrl!.replace(/\/$/, '');
	} else {
		const segments = pathPart.split('/');
		const last = segments.pop()!;
		const encode = last.includes('%') || (!raw && !angled && /[\s()]/.test(rewrite.newStem));
		segments.push(`${encode ? encodeDestination(rewrite.newStem) : rewrite.newStem}${rewrite.newExt}`);
		next = segments.join('/');
	}

	return angled ? `<${next}${tail}>` : `${next}${tail}`;
}

/** Rewrite wikilinks and markdown links in free text. Code is never touched. */
function rewriteText(text: string, rewrite: Rewrite, site: Site): string {
	const prose = maskNonProse(text);
	const edits: { start: number; end: number; value: string }[] = [];

	for (const match of prose.matchAll(WIKILINK)) {
		const start = match.index!;
		const original = text.slice(start, start + match[0].length);
		const [link] = extractLinks(original);
		if (!link || link.kind !== 'name' || !rewrite.isOurs(link, { file: site.file, line: lineOf(text, start, site.line) })) continue;

		const parts = /^\[\[([^\]|]+)([\s\S]*)\]\]$/.exec(original);
		if (!parts) continue;
		edits.push({
			start,
			end: start + original.length,
			value: `[[${renameInTarget(parts[1], rewrite.newStem)}${parts[2]}]]`,
		});
	}

	const markdown = new RegExp(MARKDOWN_LINK.source, 'gd');
	for (const match of prose.matchAll(markdown)) {
		const [from, to] = (match as RegExpMatchArray & { indices: [number, number][] }).indices[1];
		const destination = text.slice(from, to);
		const [link] = extractLinks(`[](${destination})`);
		if (!link) continue;

		const here = { file: site.file, line: lineOf(text, from, site.line) };
		if (!rewrite.isOurs(link, link.kind === 'name' ? { ...here, destination } : here)) continue;
		edits.push({ start: from, end: to, value: rewriteDestination(destination, link, rewrite, false) });
	}

	return applyEdits(text, edits);
}

function applyEdits(text: string, edits: { start: number; end: number; value: string }[]): string {
	let out = text;
	for (const edit of edits.sort((a, b) => b.start - a.start)) {
		out = out.slice(0, edit.start) + edit.value + out.slice(edit.end);
	}
	return out;
}

/** Keys whose values are vocabulary, never links. Mirrors the extractor. */
const VOCABULARY_KEYS = new Set(['aliases', 'tags']);

/** Rewrite one bare `links:` item, keeping its quotes. */
function rewriteBareItem(item: string, rewrite: Rewrite, site: Site): string {
	const [, lead, quote, value, trail] = /^(\s*)(["']?)([\s\S]*?)\2(\s*)$/.exec(item)!;
	if (!value || value.includes('[[')) return item;

	const [link] = extractLinks('', { links: [value] });
	if (!link) return item;

	const isFile = link.kind === 'name' && /\.mdx?$/i.test(value);
	if (!rewrite.isOurs(link, isFile ? { ...site, destination: value } : site)) return item;

	const next =
		link.kind === 'url' || isFile
			? rewriteDestination(value, link, rewrite, true)
			: renameInTarget(value, rewrite.newStem);
	return `${lead}${quote}${next}${quote}${trail}`;
}

/**
 * Rewrite frontmatter links, a line at a time so the YAML keeps its formatting.
 *
 * Wikilinks are rewritten anywhere outside `aliases` and `tags`. Bare strings
 * are rewritten only under `links:`, which is the one key the extractor reads
 * them from.
 */
function rewriteFrontmatter(fm: string, rewrite: Rewrite, file: string, firstLine: number): string {
	let key = '';

	return fm
		.split('\n')
		.map((rawLine, index) => {
			const site = { file, line: firstLine + index };
			const cr = rawLine.endsWith('\r') ? '\r' : '';
			let line = cr ? rawLine.slice(0, -1) : rawLine;

			const top = /^([A-Za-z_][\w-]*):/.exec(line);
			if (top) key = top[1];
			if (VOCABULARY_KEYS.has(key)) return rawLine;

			line = rewriteText(line, rewrite, site);

			if (key === 'links') {
				const item = /^(\s*-\s+)(.*?)(\s+#.*)?$/.exec(line);
				const scalar = /^(links:\s*)(.*?)(\s+#.*)?$/.exec(line);
				if (item) {
					line = `${item[1]}${rewriteBareItem(item[2], rewrite, site)}${item[3] ?? ''}`;
				} else if (scalar && scalar[2]) {
					const value = scalar[2];
					const next = value.startsWith('[')
						? value.replace(/[^[\],]+/g, (piece) => rewriteBareItem(piece, rewrite, site))
						: rewriteBareItem(value, rewrite, site);
					line = `${scalar[1]}${next}${scalar[3] ?? ''}`;
				}
			}

			return line + cr;
		})
		.join('\n');
}

function rewriteFile(raw: string, rewrite: Rewrite, file: string): string {
	const split = splitFrontmatter(raw);
	if (!split) return rewriteText(raw, rewrite, { file, line: 1 });
	const fmLine = lineOf(split.head, split.head.length);
	const bodyLine = lineOf(raw, raw.length - split.body.length);
	return (
		split.head +
		rewriteFrontmatter(split.fm, rewrite, file, fmLine) +
		split.tail +
		rewriteText(split.body, rewrite, { file, line: bodyLine })
	);
}

/** Which lines differ, for the plan. Rewriting never adds or removes a line. */
function diffLines(before: string, after: string): LineChange[] {
	const a = before.split('\n');
	const b = after.split('\n');
	const changes: LineChange[] = [];
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) changes.push({ line: i + 1, before: a[i].replace(/\r$/, ''), after: b[i].replace(/\r$/, '') });
	}
	return changes;
}

/** A YAML scalar that parses back to exactly `value`. */
function yamlString(value: string, quote: string): string {
	if (quote === "'") return `'${value.replace(/'/g, "''")}'`;
	if (quote === '"') return JSON.stringify(value);

	const plain = value;
	try {
		const parsed = matter(`---\nk: ${plain}\n---\n`).data.k;
		if (parsed === value && /^[\w(]/.test(value)) return plain;
	} catch {
		// Not valid plain; quote it.
	}
	return JSON.stringify(value);
}

/** Set `title:` in the frontmatter text, keeping the author's quoting. */
function setTitle(fm: string, title: string): string {
	return fm.replace(/^title:[ \t]*(["']?)(.*?)\1[ \t]*(\r?)$/m, (_, quote, _value, cr) => {
		return `title: ${yamlString(title, quote)}${cr}`;
	});
}

/** Add `slug:` after the title line, or at the top. */
function addSlug(fm: string, slug: string): string {
	const line = `slug: ${yamlString(slug, '')}`;
	const title = /^title:.*$/m.exec(fm);
	if (!title) return fm ? `${line}\n${fm}` : line;
	const end = title.index + title[0].length;
	return `${fm.slice(0, end)}\n${line}${fm.slice(end)}`;
}

function removeSlug(fm: string): string {
	return fm.replace(/^slug:.*(?:\r?\n|$)/m, '');
}

/** Normalize a user-supplied path to a root-relative, forward-slash path, or refuse. */
function relativeToRoot(root: string, value: string, label: string): string {
	const absolute = path.resolve(root, value);
	const relative = path.relative(root, absolute).split(path.sep).join('/');
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
		throw failure('EREFUSED', `<${label}> ${value} is outside the project root`);
	}
	return relative;
}

function collectionOf(file: string): CollectionName | undefined {
	return COLLECTIONS.find((name) => file.startsWith(`${CONTENT_DIRS[name]}/`));
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
}

/** Is `a` the very same file as `b`? True for a case-only rename on a case-insensitive disk. */
async function sameFile(a: string, b: string): Promise<boolean> {
	try {
		const [x, y] = await Promise.all([stat(a), stat(b)]);
		return x.ino === y.ino && x.dev === y.dev;
	} catch {
		return false;
	}
}

interface RedirectPlan {
	file: string;
	before: string | undefined;
	after: string;
	added: string[];
	removed: string[];
	mode?: number;
}

/** A file's permission bits, or undefined when it does not exist. */
async function modeOf(filePath: string): Promise<number | undefined> {
	try {
		return (await stat(filePath)).mode & 0o7777;
	} catch {
		return undefined;
	}
}

async function planRedirects(root: string, rules: string[], newUrls: string[]): Promise<RedirectPlan> {
	const target = path.join(root, REDIRECTS_FILE);
	let before: string | undefined;
	try {
		before = await readFile(target, 'utf8');
	} catch {
		before = undefined;
	}

	const lines = (before ?? '').split('\n');
	if (lines.at(-1) === '') lines.pop();

	// A rule whose source is the URL the page now lives at would loop.
	const removed = lines.filter((line) => newUrls.includes(line.trim().split(/\s+/)[0]));
	const kept = lines.filter((line) => !removed.includes(line));
	const added = rules.filter((rule) => !kept.some((line) => line.trim() === rule));

	return {
		file: REDIRECTS_FILE,
		mode: await modeOf(target),
		before,
		after: [...kept, ...added].join('\n') + '\n',
		added,
		removed,
	};
}

export async function renameCommand(
	root: string,
	fromArg: string,
	toArg: string,
	moveUrl: boolean,
	dryRun: boolean,
	json: boolean
): Promise<number> {
	const from = relativeToRoot(root, fromArg, 'from');
	const to = relativeToRoot(root, toArg, 'to');

	const entries = await loadContentEntries({ root });
	const entry = entries.find((candidate) => candidate.file === from);
	const collection = entry?.collection ?? collectionOf(from);

	if (!collection || !/\.mdx?$/i.test(from) || !(await exists(path.join(root, from)))) {
		throw failure(
			'EREFUSED',
			`${from} is not a content entry. rename takes a markdown file under ${COLLECTIONS.map((name) => CONTENT_DIRS[name]).join(', ')}.`
		);
	}

	if (!to.startsWith(`${CONTENT_DIRS[collection]}/`) || !/\.mdx?$/i.test(to)) {
		throw failure(
			'EREFUSED',
			`${to} is not a markdown file inside ${CONTENT_DIRS[collection]}/. A rename stays in its collection; moving between collections changes what the note is.`
		);
	}
	if (to === from) throw failure('EREFUSED', `${to} is already the name of this file`);
	if ((await exists(path.join(root, to))) && !(await sameFile(path.join(root, from), path.join(root, to)))) {
		throw failure('EEXISTS', `${to} already exists. rename never overwrites.`);
	}

	const oldStem = path.posix.basename(from).replace(/\.mdx?$/i, '');
	const newStem = path.posix.basename(to).replace(/\.mdx?$/i, '');
	const newExt = path.posix.extname(to);
	if (!newStem || newStem.trim() !== newStem) {
		throw failure(
			'EREFUSED',
			`${path.posix.basename(to)} is not a usable name: the part before the extension is ${newStem ? 'padded with whitespace' : 'empty'}`
		);
	}
	if (/[[\]|#^]/.test(newStem)) {
		throw failure(
			'EREFUSED',
			`${newStem} contains one of [ ] | # ^, which cannot be written inside a [[link]]`
		);
	}

	const source = await readFile(path.join(root, from), 'utf8');
	const data = matter(source).data as Record<string, unknown>;
	const hasPin = typeof data.slug === 'string' && data.slug !== '';

	// Title: follow the filename only when it was the filename.
	const oldTitle = typeof data.title === 'string' ? data.title : undefined;
	const titleFollows = oldTitle === oldStem;
	const title = {
		updated: titleFollows,
		from: oldTitle,
		to: titleFollows ? newStem : oldTitle,
		message: titleFollows
			? `title updated to "${newStem}", so it still matches the filename`
			: oldTitle === undefined
				? 'title left alone: the file has none, so the filename is the title'
				: `title left as "${oldTitle}": it differs from the old filename "${oldStem}"`,
	};

	// A page can declare its URL outright, and then no filename sets it.
	const declaresUrl = collection === 'pages' && typeof data.url === 'string';
	const unchangedBecause = declaresUrl
		? 'this page declares its own url: in frontmatter, so the filename does not set it'
		: 'the new filename does not change it';

	// The URL decision.
	let url: UrlPlan;
	if (!entry) {
		url = {
			decision: 'unpublished',
			removedPin: false,
			redirects: [],
			message: 'not published, so no URL is involved',
		};
	} else if (!moveUrl) {
		const resulting = toUrlPath(to, collection, data).urlPath;
		if (resulting === entry.urlPath) {
			url = {
				decision: 'unchanged',
				old: entry.urlPath,
				new: entry.urlPath,
				removedPin: false,
				redirects: [],
				message: `URL stays ${entry.urlPath}; ${unchangedBecause}`,
			};
		} else {
			url = {
				decision: 'pinned',
				old: entry.urlPath,
				new: entry.urlPath,
				pinnedSlug: entry.slug,
				removedPin: false,
				redirects: [],
				message: `URL stays ${entry.urlPath}; added slug: ${entry.slug} to hold it (use --move-url to let the URL follow the name)`,
			};
		}
	} else {
		const { urlPath } = toUrlPath(to, collection, { ...data, slug: undefined });
		const moved = urlPath !== entry.urlPath;
		url = {
			decision: moved ? 'moved' : 'unchanged',
			old: entry.urlPath,
			new: urlPath,
			removedPin: hasPin,
			redirects: moved
				? [
						`${entry.urlPath} ${urlPath} 301`,
						`${toMarkdownHref(entry.urlPath)} ${toMarkdownHref(urlPath)} 301`,
					]
				: [],
			message: moved
				? `URL moves from ${entry.urlPath} to ${urlPath}${hasPin ? ' (slug pin removed)' : ''}; 301 redirects added for it and its .md twin`
				: `URL stays ${entry.urlPath}; ${unchangedBecause}${hasPin ? ' (slug pin removed)' : ''}`,
		};
	}

	// Every markdown file under the content directories, published or not. A
	// private note is invisible to the graph but its links go stale all the same,
	// and its name can collide all the same.
	const files = (
		await Promise.all(
			COLLECTIONS.map((name) =>
				glob(`${CONTENT_DIRS[name]}/**/*.{md,mdx}`, { cwd: root, expandDirectories: false })
			)
		)
	)
		.flat()
		.sort();
	const published = new Set(entries.map((candidate) => candidate.file));
	const everyone: ContentEntry[] = [...entries];
	for (const file of files) {
		if (published.has(file)) continue;
		const fileCollection = collectionOf(file)!;
		const { content, data: fm } = matter(file === from ? source : await readFile(path.join(root, file), 'utf8'));
		const { slug, urlPath } = toUrlPath(file, fileCollection, fm);
		everyone.push({
			slug,
			urlPath,
			title: (fm.title as string) || slug,
			collection: fileCollection,
			aliases: (fm.aliases as string[]) || [],
			tags: [],
			status: 'seed',
			updatedSource: 'none',
			body: content,
			frontmatter: fm,
			file,
		});
	}
	const subject = everyone.find((candidate) => candidate.file === from)!;

	// Collisions: ask the graph's own duplicate-name rule what the rename would add.
	{
		const renamed: ContentEntry = {
			...subject,
			file: to,
			title: title.to ?? subject.title,
			urlPath: url.new ?? subject.urlPath,
			slug: path.posix.basename(url.new ?? subject.urlPath),
		};
		const key = (d: { rule: string; target?: string }) => `${d.rule}|${d.target?.toLowerCase()}`;
		const existing = new Set(findDuplicateNames(everyone).map(key));
		const introduced = findDuplicateNames(everyone.map((e) => (e === subject ? renamed : e))).filter(
			(d) => !existing.has(key(d))
		);
		if (introduced.length) {
			throw failure(
				'EREFUSED',
				`renaming to ${to} would make links ambiguous. ${introduced.map((d) => d.message).join(' ')}`
			);
		}
	}

	// Plan every edit in memory.
	const byName = buildLinkLookup(entries);
	const byUrl = buildUrlLookup(entries);
	const named = new Map<string, string[]>();
	for (const file of files) {
		const stem = path.posix.basename(file).replace(/\.mdx?$/i, '').toLowerCase();
		named.set(stem, [...(named.get(stem) ?? []), file]);
	}
	const oldUrl = entry?.urlPath ?? '';
	const stemKey = linkKey(oldStem);
	const lowerFiles = new Map(files.map((file) => [file.toLowerCase(), file]));

	const rewrite: Rewrite = {
		oldUrl,
		...(url.decision === 'moved' ? { newUrl: url.new } : {}),
		oldStem,
		newStem,
		newExt,
		ambiguous: [],
		isOurs(link, site) {
			if (link.kind === 'url') {
				return url.decision === 'moved' && byUrl.get(link.target)?.urlPath === oldUrl;
			}
			if (linkKey(link.target) !== stemKey) return false;

			const sharing = named.get(oldStem.toLowerCase()) ?? [];

			if (site.destination !== undefined) {
				// A relative file link names a path: read it against the directory of
				// the file it is written in, and only then fall back to the basename.
				let decoded = site.destination.replace(/^<|>$/g, '').split(/[#?]/)[0];
				try {
					decoded = decodeURIComponent(decoded);
				} catch {
					// keep the raw spelling
				}
				const joined = path.posix.normalize(path.posix.join(path.posix.dirname(site.file), decoded));
				const exact = lowerFiles.get(joined.toLowerCase());
				if (exact) return exact === from;
				if (sharing.length === 1) return sharing[0] === from;
				if (sharing.includes(from)) rewrite.ambiguous.push(`${site.file}:${site.line} ${site.destination}`);
				return false;
			}

			const resolved = resolveLink({ kind: 'name', target: stemKey }, byName, byUrl);
			if (resolved) return entry !== undefined && resolved.urlPath === oldUrl;
			return sharing.length === 1 && sharing[0] === from;
		},
	};

	const edits: FileEdit[] = [];
	for (const file of files) {
		const before = file === from ? source : await readFile(path.join(root, file), 'utf8');
		let after = rewriteFile(before, rewrite, file);
		const changes = diffLines(before, after);

		if (file === from) {
			const split = splitFrontmatter(after);
			let fm = split?.fm ?? '';
			if (title.updated) fm = setTitle(fm, newStem);
			if (url.pinnedSlug) fm = addSlug(fm, url.pinnedSlug);
			if (url.removedPin) fm = removeSlug(fm);
			after = split
				? split.head + fm + split.tail + split.body
				: url.pinnedSlug
					? `---\n${fm}\n---\n${after}`
					: after;

			// Whatever was edited by line has to parse back to what the plan says.
			const parsed = matter(after).data as Record<string, unknown>;
			const wantTitle = title.updated ? newStem : data.title;
			const wantSlug = url.pinnedSlug ?? (url.removedPin ? undefined : data.slug);
			if (parsed.title !== wantTitle || parsed.slug !== wantSlug) {
				throw failure('EPARSE', `could not edit the frontmatter of ${from} safely; nothing was written`);
			}
			edits.push({ file: to, source: from, before, after, changes, mode: await modeOf(path.join(root, from)) });
		} else if (changes.length) {
			edits.push({ file, source: file, before, after, changes, mode: await modeOf(path.join(root, file)) });
		}
	}

	if (rewrite.ambiguous.length) {
		throw failure(
			'EREFUSED',
			`${oldStem}.md shares its name with another file, so these relative links cannot be told apart. Make each one name its folder, or rename the other file first:\n  ${rewrite.ambiguous.join('\n  ')}`
		);
	}

	const urlPairs = url.decision === 'moved' ? [url.new!, toMarkdownHref(url.new!)] : [];
	const redirects = url.redirects.length ? await planRedirects(root, url.redirects, urlPairs) : undefined;

	// Never write over a file the author made read-only.
	const protectedFiles = [
		...edits.filter((edit) => edit.mode !== undefined && (edit.mode & 0o200) === 0).map((edit) => edit.source),
		...(redirects?.mode !== undefined && (redirects.mode & 0o200) === 0 ? [redirects.file] : []),
	];
	if (protectedFiles.length) {
		throw failure('EREFUSED', `${protectedFiles.join(', ')} ${protectedFiles.length === 1 ? 'is' : 'are'} read-only, so rename will not write over ${protectedFiles.length === 1 ? 'it' : 'them'}. Nothing was written.`);
	}

	// The same file under both names means a case-only rename on a case-insensitive disk.
	const caseOnly = await sameFile(path.join(root, from), path.join(root, to));

	const linkCount = edits.reduce((sum, edit) => sum + edit.changes.length, 0);

	if (!dryRun) {
		await applyPlan(root, from, to, edits, redirects, caseOnly);
	}

	if (json) {
		writeJson({
			schema: SCHEMA,
			root,
			dryRun,
			written: !dryRun,
			from,
			to,
			collection,
			title,
			url: {
				decision: url.decision,
				old: url.old,
				new: url.new,
				...(url.pinnedSlug ? { pinnedSlug: url.pinnedSlug } : {}),
				removedPin: url.removedPin,
				redirects: url.redirects,
				message: url.message,
			},
			links: {
				lines: linkCount,
				files: edits.filter((edit) => edit.changes.length).length,
			},
			edits: edits
				.filter((edit) => edit.changes.length)
				.map((edit) => ({ file: edit.file, changes: edit.changes })),
			redirects: redirects
				? { file: redirects.file, added: redirects.added, removed: redirects.removed }
				: null,
		});
		return EXIT_OK;
	}

	const lines = [
		dryRun ? 'dry run: nothing was written' : 'renamed',
		`move   ${from} -> ${to}`,
		`title  ${title.message}`,
		`url    ${url.message}`,
	];
	for (const edit of edits) {
		for (const change of edit.changes) {
			lines.push(
				`link   ${edit.source}:${change.line}`,
				`         - ${change.before.trim()}`,
				`         + ${change.after.trim()}`
			);
		}
	}
	if (redirects) {
		for (const rule of redirects.added) lines.push(`redirect  ${REDIRECTS_FILE}: ${rule}`);
		for (const rule of redirects.removed) lines.push(`redirect  ${REDIRECTS_FILE}: dropped ${rule.trim()}, it would loop`);
	}
	const touched = edits.filter((edit) => edit.changes.length).length;
	lines.push(
		`${linkCount} link ${linkCount === 1 ? 'line' : 'lines'} rewritten in ${touched} ${touched === 1 ? 'file' : 'files'}`
	);
	writeLines(lines);
	return EXIT_OK;
}

/** The filesystem calls the write phase makes, so a test can watch which ones it does. */
export interface WriteOps {
	chmod: typeof chmod;
	mkdir: typeof mkdir;
	rename: typeof renameFile;
	unlink: typeof unlink;
	writeFile: typeof writeFile;
}

const REAL_OPS: WriteOps = { chmod, mkdir, rename: renameFile, unlink, writeFile };

/**
 * Write the plan: stage every file beside its destination, rename the stages
 * into place, then remove the old file. Anything that fails undoes what was
 * already done, in reverse, so a half-done rename is not left behind.
 *
 * `caseOnly` is the one path that never unlinks the source. When `from` and
 * `to` are one file under two spellings of its name, removing the old name
 * removes the new one too, so the file is moved aside under a temporary name,
 * moved to its new name, and then given its new content.
 */
export async function applyPlan(
	root: string,
	from: string,
	to: string,
	edits: FileEdit[],
	redirects: RedirectPlan | undefined,
	caseOnly: boolean,
	ops: WriteOps = REAL_OPS
): Promise<void> {
	const writes = edits.map((edit) => ({
		path: path.join(root, edit.file),
		before: edit.before,
		content: edit.after,
		mode: edit.mode,
		isNew: edit.file !== edit.source,
	}));
	if (redirects) {
		writes.push({
			path: path.join(root, redirects.file),
			before: redirects.before ?? '',
			content: redirects.after,
			mode: redirects.mode,
			isNew: redirects.before === undefined,
		});
	}

	const stages: string[] = [];
	const undo: (() => Promise<void>)[] = [];
	const fromPath = path.join(root, from);
	const toPath = path.join(root, to);

	try {
		for (const write of writes) {
			await ops.mkdir(path.dirname(write.path), { recursive: true });
			const stage = `${write.path}.commune-rename-${process.pid}`;
			await ops.writeFile(stage, write.content);
			stages.push(stage);
			if (write.mode !== undefined) await ops.chmod(stage, write.mode);
		}

		for (const [index, write] of writes.entries()) {
			const moved = write.path === toPath;
			if (moved && caseOnly) {
				const aside = `${fromPath}.commune-rename-aside-${process.pid}`;
				await ops.rename(fromPath, aside);
				undo.push(() => ops.rename(aside, fromPath));
				await ops.rename(aside, toPath);
				undo.push(() => ops.rename(toPath, fromPath));
				await ops.rename(stages[index], toPath);
				undo.push(() => ops.writeFile(toPath, write.before));
				continue;
			}
			await ops.rename(stages[index], write.path);
			undo.push(() => (write.isNew ? ops.unlink(write.path) : ops.writeFile(write.path, write.before)));
		}

		if (!caseOnly) {
			await ops.unlink(fromPath);
			const original = edits.find((edit) => edit.source === from)!;
			undo.push(async () => {
				await ops.writeFile(fromPath, original.before);
				if (original.mode !== undefined) await ops.chmod(fromPath, original.mode);
			});
		}
	} catch (error) {
		for (const stage of stages) await ops.unlink(stage).catch(() => {});
		for (const step of undo.reverse()) await step().catch(() => {});
		throw failure('EINTERNAL', `rename failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`);
	}
}

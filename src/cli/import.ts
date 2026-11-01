/**
 * `commune import` — copy an existing vault into a wiki's notes.
 *
 * The third verb that writes, and the only one that reads a folder it does not
 * own. The vault is opened for reading and nothing else, so no path under it is
 * ever created, changed or removed. A test holds that promise by making the
 * vault read-only and comparing every byte and mtime before and after.
 *
 * Privacy decides the default. A note with no `visibility` is left without one,
 * which the starter schema reads as private, so an import publishes nothing
 * unless `--public` is given, and `--public` only fills the gap. A note that
 * already says `private` or `draft` is never changed.
 *
 * A real vault holds values the starter schema refuses, and one of them fails
 * the whole build. Each note is checked against that schema. A value with one
 * obvious meaning is repaired, and anything else skips the note. Both are
 * listed in the output. Frontmatter is edited as text at the position of the
 * value, so everything the author wrote around it, and the whole body, stays
 * byte for byte.
 *
 * The order is plan, then write. Every note is read and checked in memory, a
 * target that already exists refuses the whole import, and `--dry-run` stops
 * after the plan.
 */

import { lstat, mkdir, readFile, readdir, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isMap, isScalar, parseDocument, stringify } from 'yaml';
import type { Pair } from 'yaml';
import { CONTENT_DIRS, linkKey, toRoutePath } from '../lib/graph.ts';
import { SCHEMA, writeJson, writeLines } from './output.ts';
import { EXIT_OK, failure } from './errors.ts';

const VISIBILITY = ['public', 'private', 'draft'] as const;
const STATUS = ['seedling', 'budding', 'evergreen'] as const;
type Visibility = (typeof VISIBILITY)[number];

export interface Repair {
	file: string;
	field: string;
	message: string;
}

interface Skip {
	file: string;
	reason: string;
}

interface Planned {
	/** Vault-relative, forward slashes. */
	file: string;
	/** Root-relative, forward slashes. */
	target: string;
	text: string;
	visibility: Visibility;
	title: string;
	/** Keys the import added because the note had none. */
	added: string[];
}

type Outcome = { skip: string } | { text: string; visibility: Visibility; title: string; added: string[]; repairs: string[] };

interface Edit {
	start: number;
	end: number;
	text: string;
}

/** A value as YAML text, on one line, quoted only when it has to be. */
const yamlValue = (value: unknown, flow = false): string =>
	stringify(value, { lineWidth: 0, schema: 'core', ...(flow ? { collectionStyle: 'flow' as const } : {}) })
		.trimEnd();

const quote = (text: string) => JSON.stringify(text);

/** The note's block, split the way `parseFrontmatter` splits it. */
function splitBlock(text: string): { open: string; block: string; rest: string } | 'none' | 'unclosed' {
	if (!text.startsWith('---') || text.charAt(3) === '-') return 'none';
	let after = text.slice(3);
	let open = '---';
	const lineEnd = after.indexOf('\n');
	const firstLine = lineEnd === -1 ? after : after.slice(0, lineEnd);
	if (/^[ \t]*[A-Za-z][\w-]*[ \t]*\r?$/.test(firstLine)) {
		open += firstLine;
		after = after.slice(firstLine.length);
	}
	const close = after.indexOf('\n---');
	if (close === -1) return 'unclosed';
	return { open, block: after.slice(0, close + 1), rest: after.slice(close + 1) };
}

/** Tags and aliases written as one string. `null` when it is not clear what was meant. */
function splitList(value: string, whitespaceIsOneItem: boolean): string[] | null {
	const text = value.trim();
	if (!text) return [];
	const items = text.includes(',') ? text.split(',') : /\s/.test(text) && !whitespaceIsOneItem ? null : [text];
	if (!items) return null;
	return items.map((item) => item.trim().replace(/^#/, '')).filter(Boolean);
}

const describe = (value: unknown): string => {
	const text = JSON.stringify(value);
	return text === undefined ? String(value) : text.length > 40 ? `${text.slice(0, 37)}...` : text;
};

/** Check one note against the starter schema, and say what to change in it. */
export function planNote(raw: string, name: string, makePublic: boolean): Outcome {
	const bom = raw.charCodeAt(0) === 0xfeff ? '﻿' : '';
	const text = raw.slice(bom.length);
	const stem = name.replace(/\.md$/, '');
	const firstEol = text.indexOf('\n');
	const eol = firstEol > 0 && text.charAt(firstEol - 1) === '\r' ? '\r\n' : '\n';
	const split = splitBlock(text);

	if (split === 'unclosed') return { skip: 'the frontmatter starts with --- but never closes' };

	if (split === 'none') {
		const lines = [`title: ${yamlValue(stem)}`, ...(makePublic ? ['visibility: public'] : [])];
		return {
			text: `${bom}---${eol}${lines.join(eol)}${eol}---${eol}${text}`,
			visibility: makePublic ? 'public' : 'private',
			title: stem,
			added: makePublic ? ['title', 'visibility'] : ['title'],
			repairs: [],
		};
	}

	const { open, block, rest } = split;
	const doc = parseDocument(block, { customTags: ['timestamp'], merge: true, schema: 'core' });
	if (doc.errors[0]) {
		const why = doc.errors[0].message.split('\n')[0].replace(/ at line \d+, column \d+:?$/, '').replace(/:$/, '');
		return { skip: `the frontmatter is not valid YAML (${why}${doc.errors[0].linePos ? `, line ${doc.errors[0].linePos[0].line}` : ''})` };
	}
	if (doc.contents !== null && !isMap(doc.contents)) {
		return { skip: 'the frontmatter is a list or plain text, not key: value pairs' };
	}
	const data = (doc.toJS() ?? {}) as Record<string, unknown>;
	const pairs = new Map<string, Pair>();
	if (isMap(doc.contents)) {
		for (const pair of doc.contents.items as Pair[]) pairs.set(String(isScalar(pair.key) ? pair.key.value : pair.key), pair);
	}

	const edits: Edit[] = [];
	const appended: string[] = [];
	const added: string[] = [];
	const repairs: string[] = [];
	const problems: string[] = [];
	const sourceOf = (pair: Pair): string => {
		const range = (pair.value as { range?: [number, number, number] }).range!;
		return block.slice(range[0], range[1]);
	};
	const replace = (key: string, value: string) => {
		const pair = pairs.get(key)!;
		const range = (pair.value as { range?: [number, number, number] } | null)?.range;
		if (range && range[1] > range[0]) edits.push({ start: range[0], end: range[1], text: value });
		else {
			// `key:` with nothing after it: the value goes after the colon.
			const keyRange = (pair.key as { range: [number, number, number] }).range;
			const colon = block.indexOf(':', keyRange[1]) + 1;
			edits.push({ start: colon, end: colon, text: ` ${value}` });
		}
	};
	const remove = (key: string) => {
		const pair = pairs.get(key)!;
		const keyStart = (pair.key as { range: [number, number, number] }).range[0];
		const valueEnd = (pair.value as { range?: [number, number, number] } | null)?.range?.[2] ?? keyStart;
		const from = block.lastIndexOf('\n', keyStart - 1) + 1;
		const next = block.indexOf('\n', Math.max(valueEnd, block.indexOf(':', keyStart)));
		edits.push({ start: from, end: next === -1 ? block.length : next + 1, text: '' });
	};
	const unset = (key: string) => data[key] === undefined || data[key] === null;

	// title
	let title: string;
	if (!pairs.has('title')) {
		title = stem;
		appended.push(`title: ${yamlValue(stem)}`);
		added.push('title');
	} else if (unset('title') || data.title === '') {
		title = stem;
		replace('title', yamlValue(stem));
		repairs.push(`title was empty, now the file name ${quote(stem)}`);
	} else if (typeof data.title === 'string') {
		title = data.title;
	} else if (typeof data.title === 'number' || typeof data.title === 'boolean' || data.title instanceof Date) {
		title = sourceOf(pairs.get('title')!);
		replace('title', yamlValue(title));
		repairs.push(`title was ${describe(data.title)}, not text, now ${quote(title)}`);
	} else {
		title = stem;
		problems.push('title is a list or a map, and it is not clear which text is the title');
	}

	// visibility
	let visibility: Visibility;
	const rawVisibility = data.visibility;
	if (pairs.has('visibility') && unset('visibility')) {
		remove('visibility');
		repairs.push('visibility was empty, so it is treated as missing');
	}
	if (unset('visibility')) {
		visibility = makePublic ? 'public' : 'private';
		if (makePublic) {
			appended.push('visibility: public');
			added.push('visibility');
		}
	} else if (typeof rawVisibility === 'string' && (VISIBILITY as readonly string[]).includes(rawVisibility)) {
		visibility = rawVisibility as Visibility;
	} else if (typeof rawVisibility === 'string' && (VISIBILITY as readonly string[]).includes(rawVisibility.trim().toLowerCase())) {
		visibility = rawVisibility.trim().toLowerCase() as Visibility;
		replace('visibility', visibility);
		repairs.push(`visibility was ${quote(rawVisibility)}, now ${visibility}`);
	} else {
		visibility = 'private';
		problems.push(`visibility is ${describe(rawVisibility)}, and the choices are public, private or draft`);
	}

	// status
	if (pairs.has('status')) {
		const status = data.status;
		if (status === null || status === undefined) {
			remove('status');
			repairs.push('status was empty, so it is treated as missing');
		} else if (typeof status === 'string' && !(STATUS as readonly string[]).includes(status)) {
			const key = status.trim().toLowerCase();
			const fixed = key === 'seed' ? 'seedling' : (STATUS as readonly string[]).find((value) => value === key);
			if (fixed) {
				replace('status', fixed);
				repairs.push(`status was ${quote(status)}, now ${fixed}`);
			} else problems.push(`status is ${quote(status)}, and the choices are seedling, budding or evergreen`);
		} else if (typeof status !== 'string') {
			problems.push(`status is ${describe(status)}, and the choices are seedling, budding or evergreen`);
		}
	}

	// summary
	if (pairs.has('summary')) {
		const summary = data.summary;
		if (summary === null || summary === undefined) {
			remove('summary');
			repairs.push('summary was empty, so it is treated as missing');
		} else if (typeof summary === 'number' || typeof summary === 'boolean' || summary instanceof Date) {
			const asText = sourceOf(pairs.get('summary')!);
			replace('summary', yamlValue(asText));
			repairs.push(`summary was ${describe(summary)}, not text, now ${quote(asText)}`);
		} else if (typeof summary !== 'string') {
			problems.push('summary is a list or a map, and it should be text');
		}
	}

	// tags and aliases: a list of text
	for (const key of ['tags', 'aliases']) {
		if (!pairs.has(key)) continue;
		const value = data[key];
		let list: string[] | null | undefined;
		if (value === null || value === undefined) {
			remove(key);
			repairs.push(`${key} was empty, so it is treated as missing`);
			continue;
		} else if (typeof value === 'string') {
			list = splitList(value, key === 'aliases');
			if (list === null) problems.push(`${key} is the text ${quote(value)}, and it is not clear whether that is one ${key === 'tags' ? 'tag' : 'alias'} or several`);
			else repairs.push(`${key} was the text ${quote(value)}, now a list of ${list.length}`);
		} else if (typeof value === 'number' || typeof value === 'boolean') {
			list = [String(value)];
			repairs.push(`${key} was ${describe(value)}, now a list of 1`);
		} else if (Array.isArray(value)) {
			if (value.every((item) => typeof item === 'string')) continue;
			if (value.every((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')) {
				list = value.map(String);
				repairs.push(`${key} held numbers or booleans, now all text`);
			} else problems.push(`${key} holds an item that is not text, a number or a boolean`);
		} else problems.push(`${key} is a map, and it should be a list of text`);
		if (list) replace(key, yamlValue(list, true));
	}

	// routes: the engine refuses the whole project on a bad one
	if (data.routes !== undefined && data.routes !== null) {
		try {
			if (!Array.isArray(data.routes)) throw new Error('not a list');
			data.routes.forEach(toRoutePath);
		} catch {
			problems.push('routes is not a list of site paths such as /about/');
		}
	}

	if (problems.length) return { skip: problems.join('; ') };
	if (!edits.length && !appended.length) return { text: raw, visibility, title, added, repairs };

	if ((doc.contents as { flow?: boolean } | null)?.flow) {
		return { skip: 'the frontmatter is written as one {...} map and cannot be edited in place' };
	}
	let edited = block;
	for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
		edited = edited.slice(0, edit.start) + edit.text + edited.slice(edit.end);
	}
	const blockEol = block.includes('\r\n') ? '\r\n' : '\n';
	if (appended.length) edited += appended.map((line) => line + blockEol).join('');
	return { text: `${bom}${open}${edited}${rest}`, visibility, title, added, repairs };
}

interface Found {
	notes: string[];
	attachments: number;
	/** Notes that are links to somewhere else, which are not followed. */
	links: string[];
}

/** Every `.md` file under `dir`, skipping dot folders, dot files and node_modules. */
async function walk(dir: string, relative: string, found: Found): Promise<void> {
	const entries = await readdir(path.join(dir, relative), { withFileTypes: true });
	entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue;
		const rel = relative ? `${relative}/${entry.name}` : entry.name;
		if (entry.isSymbolicLink()) {
			if (entry.name.endsWith('.md')) found.links.push(rel);
		} else if (entry.isDirectory()) {
			if (entry.name !== 'node_modules') await walk(dir, rel, found);
		} else if (entry.isFile()) {
			if (entry.name.endsWith('.md')) found.notes.push(rel);
			else found.attachments++;
		}
	}
}

const exists = (file: string) => lstat(file).then(() => true, () => false);

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = [];
	for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
	return out;
}

export async function importCommand(
	root: string,
	vaultArg: string,
	makePublic: boolean,
	dryRun: boolean,
	json: boolean
): Promise<number> {
	const vault = path.resolve(vaultArg);
	const info = await stat(vault).catch(() => undefined);
	if (!info?.isDirectory()) throw failure('ENOCONTENT', `${vault} is not a folder`);

	const inside = path.relative(await realpath(vault), await realpath(root));
	if (!inside.startsWith('..') && !path.isAbsolute(inside)) {
		throw failure('EREFUSED', `the wiki at ${root} is inside the vault at ${vault}. Import from a vault that does not contain the wiki.`);
	}

	const found: Found = { notes: [], attachments: 0, links: [] };
	await walk(vault, '', found);
	if (!found.notes.length && !found.links.length) throw failure('ENOCONTENT', `found no .md files under ${vault}`);

	const skipped: Skip[] = found.links.map((file) => ({ file, reason: 'a symbolic link, which is not followed' }));
	const repairs: Repair[] = [];
	const planned: Planned[] = [];
	const notesDir = CONTENT_DIRS.notes;

	await inBatches(found.notes, 64, async (file) => {
		const bytes = await readFile(path.join(vault, ...file.split('/')));
		let raw: string;
		try {
			raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		} catch {
			skipped.push({ file, reason: 'the file is not valid UTF-8' });
			return;
		}
		const outcome = planNote(raw, path.posix.basename(file), makePublic);
		if ('skip' in outcome) {
			skipped.push({ file, reason: outcome.skip });
			return;
		}
		for (const message of outcome.repairs) repairs.push({ file, field: message.split(' ')[0], message });
		planned.push({ file, target: `${notesDir}/${file}`, text: outcome.text, visibility: outcome.visibility, title: outcome.title, added: outcome.added });
	});
	const byFile = (a: { file: string }, b: { file: string }) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
	planned.sort(byFile);
	repairs.sort(byFile);
	skipped.sort(byFile);

	// Refuse before writing anything.
	const taken = (await inBatches(planned, 64, async (note) => ((await exists(path.join(root, ...note.target.split('/')))) ? note.target : ''))).filter(Boolean);
	if (taken.length) {
		const shown = taken.slice(0, 10).join(', ');
		throw failure(
			'EEXISTS',
			`${taken.length} ${taken.length === 1 ? 'file' : 'files'} would be overwritten, so nothing was written: ${shown}${taken.length > 10 ? ', and more' : ''}. Import into a wiki that does not have these notes yet.`
		);
	}

	const groups = new Map<string, Planned[]>();
	for (const note of planned) groups.set(linkKey(note.title), [...(groups.get(linkKey(note.title)) ?? []), note]);
	const duplicateTitles = [...groups.values()]
		.filter((group) => group.length > 1)
		.map((group) => ({ title: group[0].title, files: group.map((note) => note.file) }))
		.sort((a, b) => (a.title < b.title ? -1 : 1));

	if (!dryRun) {
		const made: string[] = [];
		try {
			await inBatches(planned, 64, async (note) => {
				const target = path.join(root, ...note.target.split('/'));
				await mkdir(path.dirname(target), { recursive: true });
				// `wx` fails rather than overwrite a file that appeared since the plan.
				await writeFile(target, note.text, { flag: 'wx' });
				made.push(target);
			});
		} catch (error) {
			await Promise.all(made.map((file) => unlink(file).catch(() => {})));
			throw error;
		}
	}

	const count = (visibility: Visibility) => planned.filter((note) => note.visibility === visibility).length;
	const summary = {
		found: found.notes.length + found.links.length,
		imported: planned.length,
		skipped: skipped.length,
		repaired: new Set(repairs.map((repair) => repair.file)).size,
		titled: planned.filter((note) => note.added.includes('title')).length,
		public: count('public'),
		private: count('private'),
		draft: count('draft'),
		attachments: found.attachments,
		duplicateTitles: duplicateTitles.length,
	};
	const hint = `${summary.public === 0 ? 'Nothing is public yet, so the site will look empty. ' : ''}To publish a note, set visibility: public in its frontmatter. To publish every imported note that has no visibility, import into a fresh wiki with --public.`;

	if (json) {
		writeJson({
			schema: SCHEMA,
			root,
			vault,
			dryRun,
			public: makePublic,
			summary,
			imports: planned.map((note) => ({ file: note.file, target: note.target, visibility: note.visibility, added: note.added })),
			repairs,
			skipped,
			duplicateTitles,
			hint,
		});
		return EXIT_OK;
	}

	const lines: string[] = [];
	if (dryRun) lines.push(...planned.map((note) => `copy\t${note.file}\t${note.target}\t${note.visibility}`));
	lines.push(...repairs.map((repair) => `repair\t${repair.file}\t${repair.message}`));
	lines.push(...skipped.map((skip) => `skip\t${skip.file}\t${skip.reason}`));
	lines.push(
		`${dryRun ? 'Dry run, nothing written. Would import' : 'Imported'} ${summary.imported} of ${summary.found} notes into ${notesDir}.`,
		`${summary.public} public, ${summary.private} private${summary.draft ? `, ${summary.draft} draft` : ''}. ${summary.titled} got a title from the file name. ${repairs.length} ${repairs.length === 1 ? 'value was' : 'values were'} repaired in ${summary.repaired} ${summary.repaired === 1 ? 'note' : 'notes'}. ${summary.skipped} skipped.`
	);
	if (summary.attachments) lines.push(`${summary.attachments} other files (images and attachments) were not copied.`);
	for (const group of duplicateTitles.slice(0, 10)) {
		lines.push(`Shared title "${group.title}" in ${group.files.join(', ')}. A [[link]] to it is ambiguous.`);
	}
	if (duplicateTitles.length > 10) lines.push(`${duplicateTitles.length - 10} more shared titles.`);
	lines.push(hint);
	if (summary.public) {
		lines.push('Run commune check next. npm run build stops at its gate on a link such as [[Name|label]], or one spelled differently from the note\'s title, in a public note. check lists each one.');
	}
	writeLines(lines);
	return EXIT_OK;
}

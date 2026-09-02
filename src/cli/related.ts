/**
 * `commune graph related` — what a piece of text connects to.
 *
 * This is the primitive the connect step (#19) and the authoring skills (#10)
 * are written against, so v1 is deliberately deterministic: two buckets, both
 * computable from what the core already does, and no ranking.
 *
 *   `links`    — every edge the text actually contains, with its resolution.
 *   `mentions` — entries whose title or alias appears as a whole word in the
 *                prose, which is the "you wrote about this without linking it"
 *                signal a connect step needs.
 *
 * Fuzzy and semantic similarity are out of scope on purpose. They are product
 * direction, not a build decision, and inventing a ranking here would freeze it
 * into the contract before anyone chose it.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import {
	buildGraph,
	buildLinkLookup,
	buildUrlLookup,
	extractLinks,
	loadContentEntries,
	resolveLink,
	stripCode,
	type CollectionName,
	type ContentEntry,
} from '../lib/graph.ts';
import { SCHEMA, writeJson, writeLines } from './render.ts';
import { EXIT_OK, failure } from './errors.ts';

/** Shortest name worth matching. Below this, a mention is noise. */
const MIN_MENTION_LENGTH = 3;

interface Reference {
	urlPath: string;
	title: string;
	collection: CollectionName;
	file: string;
}

interface Source {
	kind: 'file' | 'text' | 'stdin';
	file?: string;
	urlPath?: string;
	text: string;
	frontmatter: Record<string, unknown>;
}

function toReference(entry: ContentEntry): Reference {
	return {
		urlPath: entry.urlPath,
		title: entry.title,
		collection: entry.collection,
		file: entry.file,
	};
}

/**
 * Work out whether the positional is a path, stdin, or literal prose.
 *
 * A path is tried against the root before the cwd, because the root is the
 * vault being asked about and the cwd is wherever the operator happens to be
 * standing. `-` is stdin, which is how a draft that is not a file yet gets
 * asked "what does this connect to".
 */
async function readSource(input: string, root: string): Promise<Source> {
	if (input === '-') {
		const text = await readStdin();
		const { content, data } = matter(text);
		return { kind: 'stdin', text: content, frontmatter: data };
	}

	const candidates = path.isAbsolute(input)
		? [input]
		: [path.join(root, input), path.resolve(input)];

	for (const candidate of candidates) {
		if (!(await isFile(candidate))) continue;

		let source: string;
		try {
			source = await readFile(candidate, 'utf8');
		} catch (error) {
			throw failure('EPARSE', `cannot read ${candidate}: ${(error as Error).message}`);
		}

		let parsed;
		try {
			parsed = matter(source);
		} catch (error) {
			throw failure('EPARSE', `cannot parse frontmatter in ${candidate}: ${(error as Error).message}`);
		}

		const relative = path.relative(root, candidate).split(path.sep).join('/');
		return {
			kind: 'file',
			file: relative,
			text: parsed.content,
			frontmatter: parsed.data,
		};
	}

	return { kind: 'text', text: input, frontmatter: {} };
}

async function isFile(candidate: string): Promise<boolean> {
	try {
		return (await stat(candidate)).isFile();
	} catch {
		return false;
	}
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString('utf8');
}

/** Escape a title so it can be matched literally: real titles contain `,`, `'`, `(`. */
function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Count whole-word occurrences of `name` in `text`.
 *
 * Lookarounds rather than `\b`, because `\b` is defined relative to the
 * character next to it: a title ending in `?` or `)` puts a non-word character
 * where `\b` expects a word one, and the match silently stops happening.
 */
function countMentions(text: string, name: string): number {
	const pattern = new RegExp(`(?<!\\w)${escapeRegExp(name)}(?!\\w)`, 'gi');
	return text.match(pattern)?.length ?? 0;
}

export async function relatedCommand(root: string, input: string, json: boolean): Promise<number> {
	const entries = await loadContentEntries({ root });
	const graph = buildGraph(entries);
	const byName = buildLinkLookup(entries);
	const byUrl = buildUrlLookup(entries);
	const byUrlPath = new Map(entries.map((entry) => [entry.urlPath, entry]));

	const source = await readSource(input, root);
	// A file that happens to be a graph entry gets its inbound links too; a
	// draft outside the vault, or raw text, has none by definition.
	const self = source.file ? entries.find((entry) => entry.file === source.file) : undefined;

	const links = extractLinks(source.text, source.frontmatter).map((link) => {
		const target = resolveLink(link, byName, byUrl);
		const entry = target ? byUrlPath.get(target.urlPath) : undefined;
		return {
			kind: link.kind,
			target: link.target,
			resolved: entry ? toReference(entry) : null,
		};
	});

	const prose = stripCode(source.text);
	const mentions = entries
		.filter((entry) => entry.urlPath !== self?.urlPath)
		.map((entry) => {
			const names = [entry.title, ...entry.aliases].filter(
				(name) => name.length >= MIN_MENTION_LENGTH
			);
			let count = 0;
			let matched: string | undefined;
			for (const name of names) {
				const hits = countMentions(prose, name);
				if (!hits) continue;
				count += hits;
				matched ??= name.toLowerCase();
			}
			return { ...toReference(entry), matched, count };
		})
		.filter((mention) => mention.count > 0)
		.sort(
			(a, b) =>
				b.count - a.count || a.title.localeCompare(b.title) || a.urlPath.localeCompare(b.urlPath)
		);

	const inbound = (self ? graph.nodes[self.urlPath].inbound : [])
		.map((urlPath) => byUrlPath.get(urlPath))
		.filter((entry): entry is ContentEntry => Boolean(entry))
		.map(toReference);

	const summary = {
		links: links.length,
		resolved: links.filter((link) => link.resolved).length,
		unresolved: links.filter((link) => !link.resolved).length,
		mentions: mentions.length,
		inbound: inbound.length,
	};

	if (json) {
		writeJson({
			schema: SCHEMA,
			root,
			source: {
				kind: source.kind,
				...(source.file ? { file: source.file } : {}),
				...(self ? { urlPath: self.urlPath } : {}),
			},
			links,
			mentions,
			inbound,
			summary,
		});
		return EXIT_OK;
	}

	writeLines([
		...links.map(
			(link) => `link\t${link.target}\t${link.resolved ? link.resolved.urlPath : 'UNRESOLVED'}`
		),
		...mentions.map((mention) => `mention\t${mention.urlPath}\t${mention.count}`),
		...inbound.map((entry) => `inbound\t${entry.urlPath}`),
		`${summary.links} links (${summary.resolved} resolved), ${summary.mentions} mentions, ${summary.inbound} inbound`,
	]);
	return EXIT_OK;
}

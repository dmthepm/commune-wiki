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
 * into the contract before anyone chose it. What #69 added is not similarity:
 * whitespace inside a name is not information, so a dictated "noon tide" and a
 * written `Noontide` are the same name spelled two ways, and matching them is
 * still an exact match — just of the right string.
 */

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
import { SCHEMA, writeJson, writeLines } from './output.ts';
import { EXIT_OK } from './errors.ts';
import { readSource } from './source.ts';

/**
 * Shortest name worth matching, measured after normalisation. Below this, a
 * mention is noise — `B` would make every capital B a connection.
 */
const MIN_MENTION_LENGTH = 3;

interface Reference {
	urlPath: string;
	title: string;
	collection: CollectionName;
	file: string;
}

function toReference(entry: ContentEntry): Reference {
	return {
		urlPath: entry.urlPath,
		title: entry.title,
		collection: entry.collection,
		file: entry.file,
	};
}

const WHITESPACE = /\s/;
const WORD = /\w/;

/** A string reduced to the form names are matched in, with a way back. */
interface Normalized {
	/** Lowercased, with every whitespace character removed. */
	text: string;
	/** For each character of `text`, the index it came from in the original. */
	offsets: number[];
}

/**
 * Reduce a string to the form mentions are matched in.
 *
 * Whitespace is removed rather than collapsed, which is what makes "noon tide"
 * and `Noontide` the same string — the distortion dictation reliably produces
 * (#69), and the reason a whole-word matcher over the raw text missed the
 * titles it most needed to find. The offsets are what keep the answer honest:
 * the word boundaries removed *inside* a name are still there in the original
 * at its *edges*, so `Cake` can be found in "pan cake" and refused in
 * "pancake".
 *
 * Built one output character at a time because `toLowerCase()` is not always
 * length-preserving (`'İ'.toLowerCase()` is two code units), and one offset per
 * emitted unit is what keeps the map exact for any input.
 */
function normalize(text: string): Normalized {
	let normalized = '';
	const offsets: number[] = [];

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (WHITESPACE.test(char)) continue;
		const lowered = char.toLowerCase();
		for (let unit = 0; unit < lowered.length; unit += 1) {
			normalized += lowered[unit];
			offsets.push(index);
		}
	}

	return { text: normalized, offsets };
}

/** How often a name occurs in the prose, and how it was spelled the first time. */
interface Hits {
	count: number;
	/** The surface form as it appeared, lowercased and with runs of whitespace collapsed. */
	matched?: string;
}

/**
 * Find every whole-word occurrence of `name`, across whitespace and case.
 *
 * The search runs on the normalised text and the boundary check on the original,
 * because the two questions want different strings: "is this the same name"
 * ignores the spaces, "is this a whole word" is only about the characters
 * outside it. A character index either side is enough — `\w` is asked directly
 * rather than through `\b`, which is defined relative to its neighbour and so
 * silently stops matching a title that ends in `?` or `)`.
 */
function findMentions(prose: string, haystack: Normalized, name: string): Hits {
	const needle = normalize(name).text;
	if (needle.length < MIN_MENTION_LENGTH) return { count: 0 };

	let count = 0;
	let matched: string | undefined;

	for (
		let at = haystack.text.indexOf(needle);
		at !== -1;
		at = haystack.text.indexOf(needle, at + 1)
	) {
		const start = haystack.offsets[at];
		const end = haystack.offsets[at + needle.length - 1];
		if (WORD.test(prose[start - 1] ?? '')) continue;
		if (WORD.test(prose[end + 1] ?? '')) continue;

		count += 1;
		// The surface form, not the title: the connect step offers the candidate
		// back with the words Devon actually said, so he can see which phrase in
		// his dump the link would replace. Lowercased because that is what the
		// field has always carried, and case is not what distinguishes one
		// surface form from another here.
		matched ??= prose
			.slice(start, end + 1)
			.toLowerCase()
			.replace(/\s+/g, ' ');
	}

	return { count, matched };
}

export async function relatedCommand(root: string, input: string, json: boolean): Promise<number> {
	const entries = await loadContentEntries({ root });
	const graph = buildGraph(entries);
	const byName = buildLinkLookup(entries);
	const byUrl = buildUrlLookup(entries);
	const byUrlPath = new Map(entries.map((entry) => [entry.urlPath, entry]));

	const source = await readSource(input, root, { allowText: true });
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
	const haystack = normalize(prose);
	const mentions = entries
		.filter((entry) => entry.urlPath !== self?.urlPath)
		.map((entry) => {
			let count = 0;
			let matched: string | undefined;
			for (const name of [entry.title, ...entry.aliases]) {
				const hits = findMentions(prose, haystack, name);
				if (!hits.count) continue;
				count += hits.count;
				matched ??= hits.matched;
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

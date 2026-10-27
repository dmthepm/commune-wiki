/**
 * Rehype plugin that turns a link to an X post into a link with a hover card.
 *
 * Runs after `rehype-external-links`, so the link already opens in a new tab.
 * It adds the `x-link` class (the icon) and, straight after the link, a hidden
 * static card built from the post's committed snapshot, tied to the link with
 * `aria-describedby`. Nothing here makes a request: no snapshot means the
 * link is left exactly as it was, and the missing or unreadable snapshot is
 * warned about.
 *
 * The card is built out of hast text nodes only. Post text is someone else's
 * words, so it is never put anywhere it could be read as markup, and the only
 * `src` it can produce is a same-site `/embeds/x/...` path.
 */

import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { visit } from 'unist-util-visit';
import type { Element, ElementContent, Root } from 'hast';
import {
	PUBLIC_PREFIX,
	isHandle,
	isSafeMediaFile,
	parseXStatusUrl,
	readSnapshot,
	snapshotPath,
	type XSnapshot,
} from './lib/x-embeds.ts';

export interface XCardsOptions {
	/** The project root the snapshots live under. Defaults to `process.cwd()`. */
	root?: string;
}

const warned = new Set<string>();

/**
 * What to say about a post that gets no card. `readSnapshot` answers `null`
 * both when there is no file and when the file is there but unusable (not
 * JSON, or not the shape a card needs), and those want different advice: a
 * missing post wants fetching, a broken file wants looking at, since it may
 * be the only copy of a post that has since gone from X. `commune embeds
 * fetch` replaces it only when X still has the post; for one that is gone it
 * reports a failure and leaves the file alone, so fixing it by hand is the
 * only way back to the captured text.
 */
async function missingSnapshotWarning(root: string, id: string): Promise<string> {
	const file = snapshotPath(root, id);
	try {
		await access(file);
	} catch {
		return `x embeds: no snapshot for post ${id}; leaving a plain link. Run \`commune embeds fetch\`.`;
	}
	return (
		`x embeds: the snapshot for post ${id} at ${path.relative(root, file)} is not valid JSON or not a snapshot; ` +
		`leaving a plain link. Fix it by hand, or run \`commune embeds fetch\` to capture the post again if X still has it.`
	);
}

function el(tagName: string, className: string, children: ElementContent[], properties: Element['properties'] = {}): Element {
	return { type: 'element', tagName, properties: { className: [className], ...properties }, children };
}

const text = (value: string): ElementContent => ({ type: 'text', value });

/** The calendar day of a stored timestamp, so a card reads the same in every locale. */
function day(value: string): string {
	return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
}

function postText(value: string): ElementContent[] {
	const nodes: ElementContent[] = [];
	value.split('\n').forEach((line, i) => {
		if (i > 0) nodes.push({ type: 'element', tagName: 'br', properties: {}, children: [] });
		if (line) nodes.push(text(line));
	});
	return nodes;
}

/**
 * Where "Open on X" goes. The snapshot's `url` is used only when it is a
 * status URL for this very post; anything else is rebuilt from the id, so a
 * snapshot cannot put another scheme or another post behind the link.
 */
function postHref(snapshot: XSnapshot): string {
	if (parseXStatusUrl(snapshot.url)?.id === snapshot.id) return snapshot.url;
	const handle = isHandle(snapshot.author.handle) ? snapshot.author.handle : 'i';
	return `https://x.com/${handle}/status/${snapshot.id}`;
}

export function buildCard(snapshot: XSnapshot, cardId: string): Element {
	const children: ElementContent[] = [
		el('span', 'x-card-head', [
			el('span', 'x-card-name', [text(snapshot.author.name)]),
			...(snapshot.author.handle
				? [el('span', 'x-card-handle', [text(`@${snapshot.author.handle}`)])]
				: []),
		]),
		el('span', 'x-card-text', postText(snapshot.text)),
	];

	const images = snapshot.media.filter((m) => m.file && isSafeMediaFile(m.file, snapshot.id));
	if (images.length) {
		children.push(
			el(
				'span',
				'x-card-media',
				images.map((m) => ({
					type: 'element',
					tagName: 'img',
					properties: { src: `${PUBLIC_PREFIX}/${m.file}`, alt: m.alt ?? '', loading: 'lazy', decoding: 'async' },
					children: [],
				}))
			)
		);
	}

	const foot: ElementContent[] = [];
	if (snapshot.createdAt) {
		foot.push({
			type: 'element',
			tagName: 'time',
			properties: { dateTime: snapshot.createdAt },
			children: [text(day(snapshot.createdAt))],
		});
	}
	if (snapshot.removedAt) {
		foot.push(el('span', 'x-card-removed', [text(`Removed from X, captured ${day(snapshot.capturedAt)}`)]));
	}
	foot.push(
		el('a', 'x-card-open', [text('Open on X')], {
			href: postHref(snapshot),
			target: '_blank',
			rel: ['noopener', 'noreferrer'],
		})
	);
	children.push(el('span', 'x-card-foot', foot));

	return el('span', 'x-card', children, { id: cardId, hidden: true });
}

export default function rehypeXCards({ root = process.cwd() }: XCardsOptions = {}) {
	return async function transformer(tree: Root, file?: { path?: string }) {
		const found: { node: Element; parent: Element | Root; index: number; id: string }[] = [];

		// A card inside a heading would be slugged into the heading's id and
		// into its table-of-contents text, which moves every `[[Note#Heading]]`
		// link to it. Those links keep the icon and get no card.
		const inHeading = new Set<Element>();
		visit(tree, 'element', (node) => {
			if (!/^h[1-6]$/.test(node.tagName)) return;
			visit(node, 'element', (inner) => {
				inHeading.add(inner);
			});
		});

		visit(tree, 'element', (node, index, parent) => {
			if (node.tagName !== 'a' || parent === undefined || index === undefined) return;
			const href = node.properties?.href;
			if (typeof href !== 'string') return;
			const parsed = parseXStatusUrl(href);
			if (parsed) found.push({ node, parent: parent as Element | Root, index, id: parsed.id });
		});

		// Scope ids to the document: panes put several notes in one page.
		const scope = createHash('sha1').update(file?.path ?? '').digest('hex').slice(0, 6);

		const cards: { parent: Element | Root; index: number; card: Element }[] = [];
		let count = 0;
		for (const { node, parent, index, id } of found) {
			const snapshot = await readSnapshot(root, id);
			if (!snapshot) {
				if (!warned.has(id)) {
					warned.add(id);
					console.warn(await missingSnapshotWarning(root, id));
				}
				continue;
			}
			const classes = Array.isArray(node.properties.className) ? node.properties.className : [];
			node.properties.className = [...classes, 'x-link'] as string[];
			if (inHeading.has(node)) continue;

			count += 1;
			const cardId = `x-card-${scope}-${id}-${count}`;
			node.properties.ariaDescribedBy = [cardId];
			cards.push({ parent, index, card: buildCard(snapshot, cardId) });
		}

		// Back to front, so inserting a card does not move the next link's index.
		for (const { parent, index, card } of cards.reverse()) parent.children.splice(index + 1, 0, card);
	};
}

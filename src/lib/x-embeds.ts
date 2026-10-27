/**
 * X post snapshots: the data half of the hover cards.
 *
 * A build never talks to X. It reads one JSON file per post from
 * `.commune/embeds/x/<id>.json` in the site root, with the post's images in a
 * folder beside it (`<id>/<n>.<ext>`). `commune embeds fetch` is the only code
 * that makes a request, and it is explicit: a snapshot is committed, so a
 * build is repeatable and an endpoint that breaks only affects posts nobody
 * has captured yet.
 *
 * Two sources, in order. The syndication endpoint carries text, date, author
 * and media but is undocumented and can change without notice. oEmbed is
 * stable but has no media and a day-precision date, so it is the text-only
 * fallback. Post text is untrusted input everywhere in this file: it is kept
 * as plain text, and it only ever reaches a page as a hast text node.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Where snapshots live, relative to the site root. */
export const SNAPSHOT_DIR = path.join('.commune', 'embeds', 'x');

/** Where a snapshot's images are served from in the built site. */
export const PUBLIC_PREFIX = '/embeds/x';

export interface XMedia {
	kind: 'photo' | 'video' | 'gif';
	/** Path relative to the snapshot directory, e.g. `1234/1.jpg`. Absent when the image could not be saved. */
	file?: string;
	alt?: string;
}

export interface XSnapshot {
	id: string;
	/** Canonical URL of the post as it was captured. */
	url: string;
	source: 'syndication' | 'oembed';
	author: { name: string; handle: string };
	text: string;
	/** ISO timestamp from syndication, or a day (`YYYY-MM-DD`) from oEmbed. */
	createdAt?: string;
	media: XMedia[];
	/** When the text was last captured. A removed post keeps this date. */
	capturedAt: string;
	/** Set once a refetch finds the post gone. Never clears the text. */
	removedAt?: string;
}

const STATUS_HOSTS = new Set(['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);

/** The post id of an X status URL, or null for anything else. */
export function parseXStatusUrl(href: string): { id: string; handle: string } | null {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || !STATUS_HOSTS.has(url.hostname)) return null;
	const match = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})\/?$/.exec(url.pathname);
	return match ? { handle: match[1], id: match[2] } : null;
}

/** Every distinct post id linked from a piece of markdown or HTML. */
export function findXStatusIds(text: string): string[] {
	const ids = new Set<string>();
	for (const match of text.matchAll(/https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{1,25}/g)) {
		const parsed = parseXStatusUrl(match[0]);
		if (parsed) ids.add(parsed.id);
	}
	return [...ids];
}

export function snapshotPath(root: string, id: string): string {
	return path.join(root, SNAPSHOT_DIR, `${id}.json`);
}

/** A snapshot, or null when there is none or it is not one. Never throws. */
export async function readSnapshot(root: string, id: string): Promise<XSnapshot | null> {
	try {
		const data = JSON.parse(await readFile(snapshotPath(root, id), 'utf8'));
		return isSnapshot(data, id) ? data : null;
	} catch {
		return null;
	}
}

function isSnapshot(value: unknown, id: string): value is XSnapshot {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	const author = v.author as Record<string, unknown> | undefined;
	return (
		v.id === id &&
		typeof v.text === 'string' &&
		typeof v.capturedAt === 'string' &&
		Array.isArray(v.media) &&
		!!author &&
		typeof author.name === 'string' &&
		typeof author.handle === 'string'
	);
}

/** Image files may only be plain names under the snapshot folder; anything else is not served. */
export function isSafeMediaFile(file: string, id: string): boolean {
	return new RegExp(`^${id}/\\d{1,2}\\.(?:jpg|jpeg|png|webp|gif)$`).test(file);
}

// --- Fetching --------------------------------------------------------------

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type FetchOutcome =
	| { status: 'saved'; snapshot: XSnapshot }
	| { status: 'removed'; snapshot: XSnapshot }
	| { status: 'failed'; reason: string };

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function decodeEntities(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
		.replace(/&amp;/g, '&');
}

/** Syndication JSON to a snapshot, or null when the payload has no post in it. */
export function fromSyndication(id: string, data: any, capturedAt: string): XSnapshot | null {
	if (!data || typeof data !== 'object' || typeof data.text !== 'string' || !data.user) return null;

	let text: string = data.text;
	// Syndication `text` is the post with t.co links; entities say what they
	// stand for. Media links are dropped, because the media is shown.
	for (const entity of data.entities?.urls ?? []) {
		if (typeof entity?.url === 'string') text = text.split(entity.url).join(entity.display_url ?? entity.expanded_url ?? '');
	}
	for (const entity of data.entities?.media ?? []) {
		if (typeof entity?.url === 'string') text = text.split(entity.url).join('');
	}
	text = decodeEntities(text).replace(/[ \t]+\n/g, '\n').trim();

	const media: XMedia[] = [];
	for (const item of data.mediaDetails ?? []) {
		if (typeof item?.media_url_https !== 'string') continue;
		media.push({
			kind: item.type === 'video' ? 'video' : item.type === 'animated_gif' ? 'gif' : 'photo',
			...(typeof item.ext_alt_text === 'string' ? { alt: item.ext_alt_text } : {}),
			// Only used by the fetcher to download the image; replaced by `file`.
			...({ _src: item.media_url_https } as object),
		});
	}

	return {
		id,
		url: `https://x.com/${data.user.screen_name}/status/${id}`,
		source: 'syndication',
		author: { name: String(data.user.name ?? data.user.screen_name), handle: String(data.user.screen_name) },
		text,
		...(typeof data.created_at === 'string' ? { createdAt: data.created_at } : {}),
		media,
		capturedAt,
	};
}

/** The text-only snapshot oEmbed can give. Parses the blockquote with no HTML parser, on purpose. */
export function fromOembed(id: string, data: any, capturedAt: string): XSnapshot | null {
	if (!data || typeof data.html !== 'string' || typeof data.author_name !== 'string') return null;
	const html: string = data.html;
	const paragraph = /<p[^>]*>([\s\S]*?)<\/p>/.exec(html);
	if (!paragraph) return null;
	const text = decodeEntities(
		paragraph[1]
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<[^>]*>/g, '')
	).trim();
	const date = /<\/p>[\s\S]*?<a [^>]*>([^<]+)<\/a>\s*<\/blockquote>/.exec(html);
	const parsed = date ? new Date(`${decodeEntities(date[1])} UTC`) : null;
	const handle = /twitter\.com\/([A-Za-z0-9_]{1,15})(?:\/|$|\?)/.exec(String(data.author_url ?? ''))?.[1] ?? '';
	return {
		id,
		url: `https://x.com/${handle}/status/${id}`,
		source: 'oembed',
		author: { name: data.author_name, handle },
		text,
		...(parsed && !Number.isNaN(parsed.getTime()) ? { createdAt: parsed.toISOString().slice(0, 10) } : {}),
		media: [],
		capturedAt,
	};
}

async function getJson(fetcher: Fetcher, url: string): Promise<{ status: number; body: any }> {
	const response = await fetcher(url, { redirect: 'follow', headers: { 'user-agent': 'commune-embeds-fetch' } });
	let body: any = null;
	try {
		body = await response.json();
	} catch {
		body = null;
	}
	return { status: response.status, body };
}

/**
 * Fetch one post and write its snapshot and images.
 *
 * Never throws: a failed fetch is a `failed` outcome, and the caller keeps any
 * snapshot it already has. A removed post keeps its text, author and date.
 */
export async function fetchSnapshot(
	root: string,
	id: string,
	fetcher: Fetcher = fetch,
	now: Date = new Date()
): Promise<FetchOutcome> {
	const capturedAt = now.toISOString();
	const previous = await readSnapshot(root, id);

	try {
		const synd = await getJson(
			fetcher,
			`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${Math.floor(Math.random() * 1e9).toString(36)}`
		);
		let snapshot = synd.status === 200 ? fromSyndication(id, synd.body, capturedAt) : null;
		const goneHint =
			synd.status === 404 ||
			(synd.status === 200 &&
				!snapshot &&
				(synd.body?.__typename === 'TweetTombstone' || (synd.body && Object.keys(synd.body).length === 0)));

		let oembedStatus = 0;
		if (!snapshot) {
			const handle = previous?.author.handle ?? 'i';
			const embed = await getJson(
				fetcher,
				`https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(`https://twitter.com/${handle}/status/${id}`)}`
			);
			oembedStatus = embed.status;
			if (embed.status === 200) snapshot = fromOembed(id, embed.body, capturedAt);
		}

		if (!snapshot) {
			if (goneHint && oembedStatus === 404) {
				if (!previous) return { status: 'failed', reason: 'the post is gone and nothing was captured before' };
				const removed: XSnapshot = { ...previous, removedAt: previous.removedAt ?? capturedAt };
				await writeSnapshot(root, removed);
				return { status: 'removed', snapshot: removed };
			}
			return { status: 'failed', reason: `no source answered (syndication ${synd.status}, oembed ${oembedStatus || 'not tried'})` };
		}

		// A text-only refetch must not throw away images already saved.
		if (snapshot.source === 'oembed' && previous?.media.length) snapshot.media = previous.media;
		snapshot.media = await saveMedia(root, id, snapshot.media, fetcher, previous?.media);
		await writeSnapshot(root, snapshot);
		return { status: 'saved', snapshot };
	} catch (error) {
		return { status: 'failed', reason: String((error as Error)?.message ?? error) };
	}
}

async function saveMedia(
	root: string,
	id: string,
	media: XMedia[],
	fetcher: Fetcher,
	previous: XMedia[] | undefined
): Promise<XMedia[]> {
	const saved: XMedia[] = [];
	let n = 0;
	for (const item of media) {
		n += 1;
		const { _src, ...rest } = item as XMedia & { _src?: string };
		if (!_src) {
			saved.push(rest);
			continue;
		}
		try {
			const source = new URL(_src);
			if (source.protocol !== 'https:' || !/(^|\.)twimg\.com$/.test(source.hostname)) throw new Error('not a twimg URL');
			const response = await fetcher(source.href, { redirect: 'follow' });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const buffer = Buffer.from(await response.arrayBuffer());
			if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('image too large');
			const type = response.headers.get('content-type') ?? '';
			const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'jpg';
			const file = `${id}/${n}.${ext}`;
			await mkdir(path.join(root, SNAPSHOT_DIR, id), { recursive: true });
			await writeFile(path.join(root, SNAPSHOT_DIR, file), buffer);
			saved.push({ ...rest, file });
		} catch {
			// An image that will not download leaves a text-only card, and a
			// previously saved copy of the same slot is kept.
			const old = previous?.[n - 1];
			saved.push(old?.file ? old : rest);
		}
	}
	return saved;
}

async function writeSnapshot(root: string, snapshot: XSnapshot): Promise<void> {
	await mkdir(path.join(root, SNAPSHOT_DIR), { recursive: true });
	await writeFile(snapshotPath(root, snapshot.id), JSON.stringify(snapshot, null, 2) + '\n');
}

/** Ids that already have a snapshot on disk. */
export async function listSnapshotIds(root: string): Promise<string[]> {
	try {
		return (await readdir(path.join(root, SNAPSHOT_DIR)))
			.filter((name) => /^\d+\.json$/.test(name))
			.map((name) => name.slice(0, -5));
	} catch {
		return [];
	}
}

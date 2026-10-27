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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

const HANDLE = '[A-Za-z0-9_]{1,15}';
// One pattern for "this is a post", shared by the link scan and the card. The
// `/i/web/status/<id>` form is what X's own share sheet produces; a `/photo/1`
// tail is a link to one image of the same post.
const POST_PATH = `/(i/web|${HANDLE})/status/(\\d{1,25})(?:/(?:photo|video)/\\d{1,2})?/?`;
const POST_URL = new RegExp(`^${POST_PATH}$`);

/** Whether a string can stand for a handle in a URL. */
export function isHandle(value: unknown): value is string {
	return typeof value === 'string' && new RegExp(`^${HANDLE}$`).test(value);
}

/** The post id of an X status URL, or null for anything else. */
export function parseXStatusUrl(href: string): { id: string; handle: string } | null {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || !STATUS_HOSTS.has(url.hostname)) return null;
	const match = POST_URL.exec(url.pathname);
	return match ? { handle: match[1] === 'i/web' ? 'i' : match[1], id: match[2] } : null;
}

/** Every distinct post id linked from a piece of markdown or HTML. */
export function findXStatusIds(text: string): string[] {
	const ids = new Set<string>();
	const scan = new RegExp(`https://(?:www\\.|mobile\\.)?(?:x|twitter)\\.com${POST_PATH}`, 'g');
	for (const match of text.matchAll(scan)) {
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
	const optionalString = (x: unknown) => x === undefined || typeof x === 'string';
	return (
		v.id === id &&
		typeof v.url === 'string' &&
		(v.source === 'syndication' || v.source === 'oembed') &&
		typeof v.text === 'string' &&
		typeof v.capturedAt === 'string' &&
		optionalString(v.createdAt) &&
		optionalString(v.removedAt) &&
		!!author &&
		typeof author === 'object' &&
		typeof author.name === 'string' &&
		typeof author.handle === 'string' &&
		Array.isArray(v.media) &&
		v.media.every((item) => {
			if (!item || typeof item !== 'object') return false;
			const m = item as Record<string, unknown>;
			return typeof m.kind === 'string' && optionalString(m.file) && optionalString(m.alt);
		})
	);
}

/**
 * Image files may only be plain names under the snapshot folder; anything else is not served.
 *
 * `id` is checked as digits before anything else: it comes from a request path
 * in the dev server and from directory names on disk, and it is compared as a
 * string, never built into a pattern.
 */
export function isSafeMediaFile(file: string, id: string): boolean {
	if (!/^\d{1,25}$/.test(id) || !file.startsWith(`${id}/`)) return false;
	return /^\d{1,2}\.(?:jpg|jpeg|png|webp|gif)$/.test(file.slice(id.length + 1));
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
export function fromSyndication(
	id: string,
	data: any,
	capturedAt: string
): { snapshot: XSnapshot; sources: string[] } | null {
	if (!data || typeof data !== 'object' || typeof data.text !== 'string' || !data.user) return null;
	if (!isHandle(data.user.screen_name)) return null;

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

	// `sources` runs parallel to `media`: where to download each image from.
	// It is not part of the snapshot, so it can never reach the committed JSON.
	const media: XMedia[] = [];
	const sources: string[] = [];
	for (const item of data.mediaDetails ?? []) {
		if (typeof item?.media_url_https !== 'string') continue;
		media.push({
			kind: item.type === 'video' ? 'video' : item.type === 'animated_gif' ? 'gif' : 'photo',
			...(typeof item.ext_alt_text === 'string' ? { alt: item.ext_alt_text } : {}),
		});
		sources.push(item.media_url_https);
	}

	const snapshot: XSnapshot = {
		id,
		url: `https://x.com/${data.user.screen_name}/status/${id}`,
		source: 'syndication',
		author: { name: String(data.user.name ?? data.user.screen_name), handle: String(data.user.screen_name) },
		text,
		...(typeof data.created_at === 'string' ? { createdAt: data.created_at } : {}),
		media,
		capturedAt,
	};
	return { snapshot, sources };
}

/** The text-only snapshot oEmbed can give. Parses the blockquote with no HTML parser, on purpose. */
export function fromOembed(id: string, data: any, capturedAt: string, fallbackHandle = ''): XSnapshot | null {
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
	// X answers with x.com URLs today and twitter.com ones before; the post's
	// own URL is the best source, then the author's, then what the caller knew.
	const fromAuthor = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/.exec(String(data.author_url ?? ''))?.[1];
	const candidates = [parseXStatusUrl(String(data.url ?? ''))?.handle, fromAuthor, fallbackHandle];
	const handle = candidates.find((h) => isHandle(h) && h !== 'i') ?? '';
	return {
		id,
		url: `https://x.com/${handle || 'i'}/status/${id}`,
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
		const parsedSynd = synd.status === 200 ? fromSyndication(id, synd.body, capturedAt) : null;
		let snapshot: XSnapshot | null = parsedSynd?.snapshot ?? null;
		let sources = parsedSynd?.sources ?? [];
		const goneHint =
			synd.status === 404 ||
			(synd.status === 200 &&
				!snapshot &&
				(synd.body?.__typename === 'TweetTombstone' || (synd.body && Object.keys(synd.body).length === 0)));

		let oembedStatus = 0;
		if (!snapshot) {
			const handle = previous?.author.handle || 'i';
			const embed = await getJson(
				fetcher,
				`https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(`https://twitter.com/${handle}/status/${id}`)}`
			);
			oembedStatus = embed.status;
			if (embed.status === 200) snapshot = fromOembed(id, embed.body, capturedAt, previous?.author.handle);
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
		snapshot.media = await saveMedia(root, id, snapshot.media, sources, fetcher, previous?.media);
		await writeSnapshot(root, snapshot);
		return { status: 'saved', snapshot };
	} catch (error) {
		return { status: 'failed', reason: String((error as Error)?.message ?? error) };
	}
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * The extension for an image, read from its first bytes. A server's
 * content-type can be wrong, and the extension is what the dev server and the
 * built site serve the file as, so the bytes decide. Anything that is not
 * JPEG, PNG, WebP or GIF gets no extension and is not saved.
 */
export function imageExtension(bytes: Uint8Array): string | undefined {
	const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
	if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
	if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
	if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'gif';
	return undefined;
}

/** The body of a response, refusing to hold more than `max` bytes. */
async function readCapped(response: Response, max: number): Promise<Buffer> {
	const declared = Number(response.headers.get('content-length'));
	if (declared > max) throw new Error('image too large');
	if (!response.body) throw new Error('no body');
	const chunks: Uint8Array[] = [];
	let total = 0;
	for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
		total += chunk.byteLength;
		if (total > max) throw new Error('image too large');
		chunks.push(chunk);
	}
	return Buffer.concat(chunks);
}

async function saveMedia(
	root: string,
	id: string,
	media: XMedia[],
	sources: string[],
	fetcher: Fetcher,
	previous: XMedia[] | undefined
): Promise<XMedia[]> {
	const saved: XMedia[] = [];
	for (const [index, item] of media.entries()) {
		const n = index + 1;
		const from = sources[index];
		if (!from) {
			saved.push(item);
			continue;
		}
		try {
			const source = new URL(from);
			if (source.protocol !== 'https:' || !/(^|\.)twimg\.com$/.test(source.hostname)) throw new Error('not a twimg URL');
			// Media URLs do not redirect; one that does is not followed, so the
			// host check above cannot be walked around.
			const response = await fetcher(source.href, { redirect: 'error' });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			// The header only screens out what is plainly not an image before the
			// body is read; the bytes pick the extension.
			if (!IMAGE_TYPES.has((response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase())) {
				throw new Error('not an image');
			}
			const buffer = await readCapped(response, MAX_IMAGE_BYTES);
			const ext = imageExtension(buffer);
			if (!ext) throw new Error('not an image');
			const file = `${id}/${n}.${ext}`;
			await mkdir(path.join(root, SNAPSHOT_DIR, id), { recursive: true });
			await writeFile(path.join(root, SNAPSHOT_DIR, file), buffer);
			saved.push({ ...item, file });
		} catch {
			// An image that will not download leaves a text-only card, and a
			// previously saved copy of the same slot is kept.
			const old = previous?.[index];
			saved.push(old?.file ? old : item);
		}
	}
	return saved;
}

async function writeSnapshot(root: string, snapshot: XSnapshot): Promise<void> {
	await mkdir(path.join(root, SNAPSHOT_DIR), { recursive: true });
	await writeFile(snapshotPath(root, snapshot.id), JSON.stringify(snapshot, null, 2) + '\n');
}

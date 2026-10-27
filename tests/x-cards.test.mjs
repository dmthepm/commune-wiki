/**
 * Tests for the X post hover cards.
 *
 * The cards are built at render time from committed snapshots, so every case
 * runs on fixtures in `tests/fixtures/x-embeds/` and none touches the network.
 * What matters is what a stranger's words can do to a page (nothing), what a
 * reader's browser is told to load (only the site's own files), and that a
 * site without the option, or without a snapshot, is left exactly as it was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import commune from '../src/integration.ts';
import { communeMarkdown } from '../src/markdown.ts';
import {
	fetchSnapshot,
	findXStatusIds,
	fromOembed,
	fromSyndication,
	imageExtension,
	isSafeMediaFile,
	parseXStatusUrl,
} from '../src/lib/x-embeds.ts';

const ROOT = fileURLToPath(new URL('./fixtures/x-embeds/', import.meta.url));
const SITE = 'https://wiki.example';
const LIVE = '1111111111111111111';
const GONE = '2222222222222222222';
const EVIL = '3333333333333333333';

async function render(markdown, embeds) {
	const renderer = await communeMarkdown({ site: SITE, root: ROOT, embeds }).createRenderer({});
	return (await renderer.render(markdown, { frontmatter: {} })).code;
}

const post = (id, handle = 'example') => `[a post](https://x.com/${handle}/status/${id})`;

test('status URLs on x.com and twitter.com, with www and mobile, are detected', () => {
	for (const host of ['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']) {
		assert.deepEqual(parseXStatusUrl(`https://${host}/example/status/123`), { handle: 'example', id: '123' });
	}
	assert.deepEqual(parseXStatusUrl('https://x.com/example/status/123/'), { handle: 'example', id: '123' });
});

test('other X URLs, other hosts and lookalikes are not posts', () => {
	for (const href of [
		'https://x.com/example',
		'https://x.com/example/status/abc',
		'https://x.com/i/status/123?x=1#y',
		'https://evilx.com/example/status/123',
		'https://x.com.evil.example/example/status/123',
		'http://x.com/example/status/123',
		'https://example.com/x.com/example/status/123',
		'not a url',
	]) {
		const result = parseXStatusUrl(href);
		// A query string or fragment is allowed on a real post link; the rest are not.
		if (href === 'https://x.com/i/status/123?x=1#y') assert.deepEqual(result, { handle: 'i', id: '123' });
		else assert.equal(result, null, href);
	}
	assert.deepEqual(findXStatusIds(`${post('1')} and https://twitter.com/a/status/2 and https://x.com/a`), ['1', '2']);
});

test('the link scan and the card agree on what a post link is', () => {
	for (const [href, id] of [
		['https://x.com/i/web/status/77', '77'],
		['https://x.com/example/status/78/photo/1', '78'],
		['https://x.com/example/status/79/video/1', '79'],
	]) {
		assert.equal(parseXStatusUrl(href)?.id, id, href);
		assert.deepEqual(findXStatusIds(href), [id], href);
	}
	assert.equal(parseXStatusUrl('https://x.com/example/status/80/analytics'), null);
});

test('with the option off the output is the same as a pipeline that never heard of it', async () => {
	const markdown = `Look: ${post(LIVE)}\n\nAnd https://x.com/example/status/${GONE}\n`;
	const plain = await render(markdown, undefined);

	assert.equal(await render(markdown, {}), plain);
	assert.equal(await render(markdown, { x: false }), plain);
	assert.doesNotMatch(plain, /x-card|x-link/);
});

test('a linked post with a snapshot gets the icon class, a description and a hidden card', async () => {
	const html = await render(`Look: ${post(LIVE)}\n`, { x: true });

	assert.match(html, /<a [^>]*class="x-link"/);
	assert.match(html, /target="_blank"/);
	const described = /aria-describedby="(x-card-[^"]+)"/.exec(html);
	assert.ok(described, 'the link names its card');
	assert.match(html, new RegExp(`<span class="x-card" id="${described[1]}" hidden>`));
	assert.match(html, /Example Person/);
	assert.match(html, /@example/);
	assert.match(html, /First line<br>Second line/);
	assert.match(html, /<time datetime="2026-10-20T09:30:00.000Z">2026-10-20<\/time>/);
	assert.match(html, /<a class="x-card-open" href="https:\/\/x\.com\/example\/status\/1111111111111111111"[^>]*>Open on X<\/a>/);
	assert.match(html, /<img src="\/embeds\/x\/1111111111111111111\/1\.jpg" alt="A chart"/);
});

test('a removed post keeps its text and says when it was captured', async () => {
	const html = await render(post(GONE, 'gone'), { x: true });

	assert.match(html, /A post that was deleted later\./);
	assert.match(html, /Removed from X, captured 2026-09-02/);
});

test('hostile post text and names come out as text, never as markup', async () => {
	const html = await render(post(EVIL, 'evil'), { x: true });
	const card = html.slice(html.indexOf('<span class="x-card"'));

	assert.doesNotMatch(card, /<script/i);
	assert.doesNotMatch(card, /<img src=x/i);
	assert.doesNotMatch(card, /<img[^>]*onerror/i);
	assert.match(card, /&#x3C;script>alert\(1\)&#x3C;\/script>|&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('no card image points at X, twimg, or anything but the site itself', async () => {
	const html = await render(`${post(LIVE)}\n\n${post(GONE, 'gone')}\n\n${post(EVIL, 'evil')}\n`, { x: true });

	const sources = [...html.matchAll(/<img\b[^>]*?\bsrc="([^"]*)"/g)].map((m) => m[1]);
	assert.deepEqual(sources, [`/embeds/x/${LIVE}/1.jpg`]);
	assert.doesNotMatch(html, /<(?:img|script|iframe|link|source|video)\b[^>]*(?:x\.com|twitter\.com|twimg\.com)/i);
});

test('a post with no snapshot stays a plain link', async () => {
	const markdown = post('9999999999999999999', 'nobody');
	const on = await render(markdown, { x: true });
	const off = await render(markdown, undefined);

	assert.equal(on, off);
	assert.doesNotMatch(on, /x-card|x-link/);
});

// --- fetching, with the network replaced -----------------------------------

const json = (status, body) => new Response(JSON.stringify(body), { status });

test('syndication JSON becomes a snapshot with links expanded and media links removed', () => {
	const { snapshot, sources } = fromSyndication('5', {
		text: 'Hello &amp; welcome https://t.co/aaa https://t.co/bbb',
		created_at: '2026-10-01T00:00:00.000Z',
		user: { name: 'N', screen_name: 'n' },
		entities: {
			urls: [{ url: 'https://t.co/aaa', display_url: 'example.com/x' }],
			media: [{ url: 'https://t.co/bbb' }],
		},
		mediaDetails: [{ type: 'photo', media_url_https: 'https://pbs.twimg.com/media/a.jpg' }],
	}, '2026-10-02T00:00:00.000Z');

	assert.equal(snapshot.text, 'Hello & welcome example.com/x');
	assert.equal(snapshot.author.handle, 'n');
	assert.equal(snapshot.media.length, 1);
	assert.deepEqual(sources, ['https://pbs.twimg.com/media/a.jpg']);
	assert.equal(JSON.stringify(snapshot).includes('pbs.twimg.com'), false);
});

test('a syndication handle that is not a handle is refused', () => {
	assert.equal(fromSyndication('5', { text: 't', user: { name: 'N', screen_name: '../x' } }, 'now'), null);
});

test('the live x.com oEmbed payload gives a handle and a working URL', async () => {
	const data = JSON.parse(await readFile(path.join(ROOT, 'oembed-x-com.json'), 'utf8'));
	const snapshot = fromOembed('20', data, '2026-10-26T00:00:00.000Z');

	assert.equal(snapshot.author.handle, 'jack');
	assert.equal(snapshot.url, 'https://x.com/jack/status/20');
	assert.equal(snapshot.text, 'just setting up my twttr');
	assert.equal(snapshot.createdAt, '2006-03-21');
});

test('an oEmbed payload with no usable handle falls back, never to an empty one', () => {
	const data = { author_name: 'N', author_url: 'https://x.com/', html: '<blockquote><p>t</p>&mdash; N <a href="x">March 21, 2006</a></blockquote>' };

	assert.equal(fromOembed('20', data, 'now', 'kept').author.handle, 'kept');
	const bare = fromOembed('20', data, 'now');
	assert.equal(bare.author.handle, '');
	assert.equal(bare.url, 'https://x.com/i/status/20');
});

test('media file names are checked as digits and plain names, with no pattern built from the id', () => {
	assert.equal(isSafeMediaFile('12/1.jpg', '12'), true);
	assert.equal(isSafeMediaFile('12/1.svg', '12'), false);
	assert.equal(isSafeMediaFile('12/a/b/1.jpg', '12'), false);
	assert.equal(isSafeMediaFile('(a+)+b/1.jpg', '(a+)+b'), false);
	assert.equal(isSafeMediaFile('./1.jpg', '.*'), false);
	assert.equal(isSafeMediaFile('12/1.jpg', '13'), false);
});

test('a post link inside a heading keeps the heading id and gets no card', async () => {
	const withCard = await render(`## Heading with ${post(LIVE)}\n`, { x: true });
	const without = await render(`## Heading with ${post(LIVE)}\n`, undefined);

	const id = (html) => /<h2 id="([^"]*)"/.exec(html)?.[1];
	assert.ok(id(without));
	assert.equal(id(withCard), id(without));
	assert.doesNotMatch(withCard, /x-card"/);
	assert.match(withCard, /class="x-link"/);
});

// --- hostile snapshots -----------------------------------------------------

async function renderWithSnapshot(snapshot) {
	const dir = await mkdtemp(path.join(tmpdir(), 'x-embeds-'));
	await mkdir(path.join(dir, '.commune/embeds/x'), { recursive: true });
	await writeFile(path.join(dir, '.commune/embeds/x/44.json'), JSON.stringify(snapshot));
	const renderer = await communeMarkdown({ site: SITE, root: dir, embeds: { x: true } }).createRenderer({});
	return (await renderer.render(post('44'), { frontmatter: {} })).code;
}

const good = {
	id: '44', url: 'https://x.com/a/status/44', source: 'syndication', author: { name: 'A', handle: 'a' },
	text: 'hi', media: [], capturedAt: '2026-10-25T00:00:00.000Z',
};

test('a malformed snapshot is a plain link, never a failed build', async () => {
	for (const bad of [
		{ ...good, media: [null] },
		{ ...good, media: ['x'] },
		{ ...good, createdAt: 12345 },
		{ ...good, removedAt: {} },
		{ ...good, source: 'other' },
		{ ...good, url: 5 },
		{ ...good, author: null },
		[],
		'text',
	]) {
		const html = await renderWithSnapshot(bad);
		assert.doesNotMatch(html, /x-card/, JSON.stringify(bad));
	}
});

test('"Open on X" never carries another scheme or another post', async () => {
	for (const url of ['javascript:alert(document.domain)', 'https://evil.example/a/status/44', 'https://x.com/a/status/45']) {
		const html = await renderWithSnapshot({ ...good, url });
		assert.match(html, /class="x-card-open" href="https:\/\/x\.com\/a\/status\/44"/, url);
	}
	const odd = await renderWithSnapshot({ ...good, url: 'javascript:1', author: { name: 'A', handle: '"><b>' } });
	assert.match(odd, /class="x-card-open" href="https:\/\/x\.com\/i\/status\/44"/);
});

// --- media download ---------------------------------------------------------

const synd = (src) => ({
	text: 't', created_at: '2026-10-01T00:00:00.000Z', user: { name: 'N', screen_name: 'n' },
	mediaDetails: [{ type: 'photo', media_url_https: src }],
});
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const image = (type, body = PNG) => new Response(body, { status: 200, headers: { 'content-type': type } });

async function fetchWithImage(src, answer) {
	const dir = await mkdtemp(path.join(tmpdir(), 'x-embeds-'));
	const seen = [];
	const outcome = await fetchSnapshot(dir, '55', async (url, init) => {
		if (url.includes('syndication')) return json(200, synd(src));
		seen.push({ url, init });
		return answer();
	});
	return { outcome, seen, dir };
}

test('a PNG is saved as .png, and redirects are refused', async () => {
	const { outcome, seen } = await fetchWithImage('https://pbs.twimg.com/media/a', () => image('image/png; charset=x'));

	assert.equal(outcome.snapshot.media[0].file, '55/1.png');
	assert.equal(seen[0].init.redirect, 'error');
});

test('the saved extension comes from the image bytes, not the content-type', async () => {
	const { outcome } = await fetchWithImage('https://pbs.twimg.com/media/a', () => image('image/jpeg'));
	assert.equal(outcome.snapshot.media[0].file, '55/1.png');

	const html = await fetchWithImage('https://pbs.twimg.com/media/a', () => image('image/png', '<!doctype html><p>blocked</p>'));
	assert.equal(html.outcome.snapshot.media[0].file, undefined);
});

test('each supported image format is recognised by its first bytes', () => {
	const bytes = (...parts) => Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
	assert.equal(imageExtension(bytes([0xff, 0xd8, 0xff, 0xe0], 'JFIF')), 'jpg');
	assert.equal(imageExtension(PNG), 'png');
	assert.equal(imageExtension(bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 ')), 'webp');
	assert.equal(imageExtension(bytes('GIF89a', [1, 0])), 'gif');
	assert.equal(imageExtension(bytes('GIF87a', [1, 0])), 'gif');
	assert.equal(imageExtension(bytes('RIFF', [1, 2, 3, 4], 'WAVEfmt ')), undefined);
	assert.equal(imageExtension(bytes('<svg')), undefined);
	assert.equal(imageExtension(new Uint8Array(0)), undefined);
});

test('a non-image answer and a foreign host leave a text-only card', async () => {
	assert.equal((await fetchWithImage('https://pbs.twimg.com/a', () => image('text/html'))).outcome.snapshot.media[0].file, undefined);
	const foreign = await fetchWithImage('https://evil.example/a.jpg', () => image('image/jpeg'));
	assert.equal(foreign.outcome.snapshot.media[0].file, undefined);
	assert.equal(foreign.seen.length, 0);
});

test('an image over the size cap is refused, declared or streamed', async () => {
	// Every body starts as a real image, so only the cap can refuse it.
	const big = 10 * 1024 * 1024 + 1;
	const small = await fetchWithImage('https://pbs.twimg.com/a', () => image('image/jpeg', PNG));
	assert.equal(small.outcome.snapshot.media[0].file, '55/1.png');

	const declared = await fetchWithImage('https://pbs.twimg.com/a', () =>
		new Response(PNG, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(big) } }));
	assert.equal(declared.outcome.snapshot.media[0].file, undefined);

	const body = new Uint8Array(big);
	body.set(PNG);
	const streamed = await fetchWithImage('https://pbs.twimg.com/a', () => image('image/jpeg', body));
	assert.equal(streamed.outcome.snapshot.media[0].file, undefined);
});

// Shapes seen in live syndication answers, with made-up text.
const syndText = (fields) => fromSyndication('7', { user: { name: 'N', screen_name: 'n' }, ...fields }, 'now').snapshot.text;

test('a reply drops the leading @mentions X does not show', () => {
	assert.equal(syndText({ text: '@alice @bob_2 Agreed, and thanks', display_text_range: [14, 32] }), 'Agreed, and thanks');
	// A mention inside the shown part stays.
	assert.equal(syndText({ text: '@alice ask @carol', display_text_range: [7, 17] }), 'ask @carol');
});

test('a long post, which syndication cuts short, is marked as cut', () => {
	const text = 'The first part of a long post that X cut here. '.repeat(6).trim();
	const range = [0, text.length];
	assert.equal(syndText({ text, display_text_range: range, note_tweet: { id: 'x' } }), `${text}…`);
	assert.equal(syndText({ text, display_text_range: range }), text);
	// A short post can carry note_tweet and is whole; one ending in … is not marked twice.
	assert.equal(syndText({ text: 'Short and whole', note_tweet: { id: 'x' } }), 'Short and whole');
	assert.equal(syndText({ text: `${text}…`, note_tweet: { id: 'x' } }), `${text}…`);
});

test('the range counts UTF-16 units over the text as sent', () => {
	// Each 𝕏 is two UTF-16 units, so code points would end two characters late.
	assert.equal(syndText({ text: '@a 𝕏𝕏 ok https://t.co/z', display_text_range: [3, 10] }), '𝕏𝕏 ok');
	// &amp; counts as five characters, as sent, not as the one it decodes to.
	assert.equal(syndText({ text: '@a x &amp; me https://t.co/z', display_text_range: [3, 13] }), 'x & me');
});

test('a reply with an expanded link and a trailing media link', () => {
	const text = '@a see https://t.co/aaa for more https://t.co/mmm';
	assert.equal(syndText({
		text,
		display_text_range: [3, 32],
		entities: { urls: [{ url: 'https://t.co/aaa', display_url: 'example.com/x' }], media: [{ url: 'https://t.co/mmm' }] },
	}), 'see example.com/x for more');
});

test('a range that does not fit the text is ignored', () => {
	for (const display_text_range of [[0, 99], [5, 2], [-1, 3], ['0', '3'], null, 'x']) {
		assert.equal(syndText({ text: '@a hi', display_text_range }), '@a hi', JSON.stringify(display_text_range));
	}
});

test('oEmbed HTML gives text and a day, with tags removed', () => {
	const snapshot = fromOembed('6', {
		author_name: 'Name',
		author_url: 'https://twitter.com/name',
		html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Hi<br>there <a href="https://t.co/x">pic.twitter.com/x</a> &lt;3</p>&mdash; Name (@name) <a href="https://twitter.com/name/status/6?ref_src=twsrc">October 1, 2026</a></blockquote>',
	}, '2026-10-02T00:00:00.000Z');

	assert.equal(snapshot.text, 'Hi\nthere pic.twitter.com/x <3');
	assert.equal(snapshot.createdAt, '2026-10-01');
	assert.equal(snapshot.author.handle, 'name');
});

test('fetch falls back to oEmbed, and writes nothing it cannot read back', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'x-embeds-'));
	const calls = [];
	const fetcher = async (url) => {
		calls.push(url);
		if (url.includes('syndication')) return json(500, {});
		return json(200, {
			author_name: 'Name',
			author_url: 'https://twitter.com/name',
			html: '<blockquote><p>Just text</p>&mdash; Name <a href="x">October 1, 2026</a></blockquote>',
		});
	};

	const outcome = await fetchSnapshot(dir, '7', fetcher);
	assert.equal(outcome.status, 'saved');
	assert.equal(outcome.snapshot.source, 'oembed');
	assert.deepEqual((await readdir(path.join(dir, '.commune/embeds/x'))), ['7.json']);
	assert.ok(calls.every((url) => /syndication\.twimg\.com|publish\.twitter\.com/.test(url)));
});

test('fetch with no working source fails without throwing and writes nothing', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'x-embeds-'));
	const outcome = await fetchSnapshot(dir, '8', async () => {
		throw new Error('offline');
	});

	assert.equal(outcome.status, 'failed');
	await assert.rejects(readdir(path.join(dir, '.commune')));
});

test('a refetch that finds the post gone keeps the text and marks it removed', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'x-embeds-'));
	const saved = await fetchSnapshot(dir, '9', async (url) =>
		url.includes('syndication')
			? json(200, { text: 'Original words', created_at: '2026-10-01T00:00:00.000Z', user: { name: 'N', screen_name: 'n' } })
			: json(404, {})
	, new Date('2026-10-02T00:00:00Z'));
	assert.equal(saved.status, 'saved');

	const gone = await fetchSnapshot(dir, '9', async () => json(404, {}), new Date('2026-10-20T00:00:00Z'));
	assert.equal(gone.status, 'removed');
	assert.equal(gone.snapshot.text, 'Original words');
	assert.equal(gone.snapshot.capturedAt, '2026-10-02T00:00:00.000Z');
	assert.equal(gone.snapshot.removedAt, '2026-10-20T00:00:00.000Z');

	const onDisk = JSON.parse(await readFile(path.join(dir, '.commune/embeds/x/9.json'), 'utf8'));
	assert.equal(onDisk.text, 'Original words');
});

// --- Copying images into the build -----------------------------------------

/**
 * Run a throwaway site through the integration's build hooks. `pages` is
 * `{ 'index.html': '...' }` written into `dist/` first, standing in for what
 * Astro rendered; `commune()` gets no options, as the one-switch design intends.
 */
async function buildWithPages(pages, snapshots = {}, { options, setup } = {}) {
	const dir = await mkdtemp(path.join(tmpdir(), 'x-copy-'));
	await mkdir(path.join(dir, 'src/content/notes'), { recursive: true });
	await writeFile(path.join(dir, 'src/content/notes/A.md'), '---\ntitle: A\nvisibility: public\n---\n\nA.\n');
	for (const [file, body] of Object.entries(snapshots)) {
		await mkdir(path.dirname(path.join(dir, '.commune/embeds/x', file)), { recursive: true });
		await writeFile(path.join(dir, '.commune/embeds/x', file), body);
	}
	for (const [file, body] of Object.entries(pages)) {
		await mkdir(path.dirname(path.join(dir, 'dist', file)), { recursive: true });
		await writeFile(path.join(dir, 'dist', file), body);
	}
	const messages = [];
	const logger = { info: (m) => messages.push(m), warn() {}, error() {} };
	if (setup) await setup(dir);
	const integration = commune(options);
	await integration.hooks['astro:config:setup']({
		config: { root: pathToFileURL(dir + '/'), publicDir: pathToFileURL(path.join(dir, 'public/')) },
		logger,
	});
	await integration.hooks['astro:build:done']({ dir: pathToFileURL(path.join(dir, 'dist/')), logger });
	return { dir, messages };
}

const listed = async (dir) => {
	try {
		return (await readdir(path.join(dir, 'dist/embeds'), { recursive: true })).sort();
	} catch {
		return [];
	}
};

test('the images a built page uses are copied with only the markdown option set', async () => {
	// The pipeline alone turns the cards on, as a real site's config does.
	const html = await render(`Look: ${post(LIVE)}\n`, { x: true });
	const src = /<img [^>]*src="(\/embeds\/x\/[^"]+)"/.exec(html)?.[1];
	assert.ok(src, 'the card has an image');

	const { dir, messages } = await buildWithPages(
		{ 'notes/a/index.html': html },
		{ [src.replace('/embeds/x/', '')]: 'IMAGE', 'unused/1.jpg': 'no' }
	);
	assert.equal(await readFile(path.join(dir, 'dist', src), 'utf8'), 'IMAGE');
	assert.ok(messages.some((m) => /1 embedded post images/.test(m)));
});

test('a site with no card copies nothing, even with snapshots on disk', async () => {
	const { dir, messages } = await buildWithPages(
		{ 'index.html': '<p>Hello</p>' },
		{ '1111111111111111111/1.jpg': 'IMAGE', '1111111111111111111.json': '{}' }
	);
	assert.deepEqual(await listed(dir), []);
	assert.ok(!messages.some((m) => /embedded post images/.test(m)));
});

test('an unsafe or missing image path in a page is not copied and does not fail the build', async () => {
	const pages = `
		<img src="/embeds/x/../../x">
		<img src="/embeds/x/abc/1.jpg">
		<img src="/embeds/x/1111111111111111111/1.svg">
		<img src="/embeds/x/1111111111111111111/../2.jpg">
		<img src="/embeds/x/1111111111111111111/9.jpg">`;
	const { dir } = await buildWithPages(
		{ 'index.html': pages },
		{ '1111111111111111111/1.svg': 'x', '2.jpg': 'x', 'abc/1.jpg': 'x' }
	);
	assert.deepEqual(await listed(dir), []);
});

test('a symlinked image or folder in the snapshots is never published', async (t) => {
	const page = '<img src="/embeds/x/1111111111111111111/1.png"><img src="/embeds/x/2222222222222222222/1.png">';
	let outcome;
	try {
		outcome = await buildWithPages({ 'index.html': page }, { '1111111111111111111/0.png': 'x' }, {
			setup: async (dir) => {
				const secret = path.join(dir, 'secret.txt');
				await writeFile(secret, 'SECRET');
				await symlink(secret, path.join(dir, '.commune/embeds/x/1111111111111111111/1.png'));
				await mkdir(path.join(dir, 'elsewhere'));
				await writeFile(path.join(dir, 'elsewhere/1.png'), 'SECRET');
				await symlink(path.join(dir, 'elsewhere'), path.join(dir, '.commune/embeds/x/2222222222222222222'));
			},
		});
	} catch (error) {
		if (error?.syscall === 'symlink') return t.skip('this platform cannot create symlinks');
		throw error;
	}
	assert.deepEqual(await listed(outcome.dir), []);
});

test('a site with no snapshot folder reads no HTML', async () => {
	// A page directory that cannot be read would throw if the walk began.
	const { dir } = await buildWithPages({ 'index.html': '<img src="/embeds/x/1111111111111111111/1.png">' });
	assert.deepEqual(await listed(dir), []);
});

test('the deprecated integration option changes nothing', async () => {
	const pages = { 'index.html': '<img src="/embeds/x/1111111111111111111/1.png">' };
	const snapshots = { '1111111111111111111/1.png': 'IMAGE' };
	const plain = await buildWithPages(pages, snapshots);
	const old = await buildWithPages(pages, snapshots, { options: { embeds: { x: true } } });
	assert.deepEqual(await listed(old.dir), await listed(plain.dir));
	assert.equal(await readFile(path.join(old.dir, 'dist/embeds/x/1111111111111111111/1.png'), 'utf8'), 'IMAGE');
});

test('a broken snapshot file is warned about as broken, not as missing', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'x-embeds-'));
	await mkdir(path.join(dir, '.commune/embeds/x'), { recursive: true });
	await writeFile(path.join(dir, '.commune/embeds/x/4401.json'), '{ not json');
	await writeFile(path.join(dir, '.commune/embeds/x/4402.json'), JSON.stringify({ ...good, id: '4402', source: 'other' }));
	const renderer = await communeMarkdown({ site: SITE, root: dir, embeds: { x: true } }).createRenderer({});

	const warnings = [];
	const original = console.warn;
	console.warn = (message) => warnings.push(String(message));
	try {
		for (const id of ['4401', '4402', '4403']) {
			const html = (await renderer.render(post(id), { frontmatter: {} })).code;
			assert.doesNotMatch(html, /x-card|x-link/);
		}
	} finally {
		console.warn = original;
	}

	// Ids 4401 and 4402 have a file that is no use; 4403 has none.
	assert.equal(warnings.length, 3, warnings.join('\n'));
	for (const [i, id] of ['4401', '4402'].entries()) {
		assert.match(warnings[i], new RegExp(`snapshot for post ${id} at \\.commune/embeds/x/${id}\\.json is not valid JSON or not a snapshot`));
		assert.match(warnings[i], /Fix it by hand/);
	}
	assert.match(warnings[2], /no snapshot for post 4403; leaving a plain link\. Run `commune embeds fetch`\./);
});

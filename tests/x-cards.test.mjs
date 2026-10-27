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
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeMarkdown } from '../src/markdown.ts';
import {
	fetchSnapshot,
	findXStatusIds,
	fromOembed,
	fromSyndication,
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
		'https://x.com/example/status/123/photo/1',
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
	const snapshot = fromSyndication('5', {
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

/**
 * Tests for `routes:`, the frontmatter key that lets one entry render at extra
 * URLs (#66) — the home note at `/` being the case that asked for it.
 *
 * `aliases` was taken: it is the names a `[[WikiLink]]` resolves, and nothing
 * to do with URLs. Each test builds its own small vault in a temp directory,
 * because the committed fixture vaults' counts are asserted exactly elsewhere
 * and a route added to one would move every one of those numbers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import commune from '../src/integration.ts';
import {
	buildGraph,
	checkEntries,
	loadContentEntries,
	toBacklinksJson,
	toCanonicalUrl,
	toRoutePath,
} from '../src/lib/graph.ts';
import { commune as runCommune, VAULT } from './helpers.mjs';

/** A vault of `{ 'notes/Name.md': source }` files under `src/content/`. */
async function makeVault(files) {
	const dir = await mkdtemp(join(tmpdir(), 'commune-routes-'));
	for (const [name, source] of Object.entries(files)) {
		await mkdir(join(dir, 'src/content', name, '..'), { recursive: true });
		await writeFile(join(dir, 'src/content', name), source);
	}
	return dir;
}

const note = (title, extra = '') =>
	`---\ntitle: "${title}"\nvisibility: public\n${extra}---\n\nBody of ${title}. [[Other]]\n`;

async function withVault(files, body) {
	const dir = await makeVault(files);
	try {
		return await body(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test('a route is accepted in the form toUrlPath returns', () => {
	assert.equal(toRoutePath('/'), '/');
	assert.equal(toRoutePath('/start/'), '/start/');
	assert.equal(toRoutePath('/a/b/'), '/a/b/');
});

test('a route that is not a normalized site path is rejected', () => {
	assert.throws(() => toRoutePath('start/'), /site-absolute/);
	assert.throws(() => toRoutePath('https://example.com/'), /site-absolute/);
	assert.throws(() => toRoutePath('/a/../b/'), /"\.\."/);
	assert.throws(() => toRoutePath('/../etc/'), /"\.\."/);
	assert.throws(() => toRoutePath('/./'), /"\."/);
	assert.throws(() => toRoutePath('/start'), /written as "\/start\/"/);
	assert.throws(() => toRoutePath('//start/'), /written as "\/start\/"/);
	assert.throws(() => toRoutePath('/a?b=1/'), /plain path/);
	assert.throws(() => toRoutePath('/a#b/'), /plain path/);
	assert.throws(() => toRoutePath('/a b/'), /plain path/);
	assert.throws(() => toRoutePath(''), /site-absolute/);
	assert.throws(() => toRoutePath(7), /must be a string/);
});

test('loading names the file whose routes are invalid', async () => {
	await withVault({ 'notes/Bad.md': note('Bad', 'routes: ["/a/../b/"]\n') }, async (dir) => {
		await assert.rejects(loadContentEntries({ root: dir }), /src\/content\/notes\/Bad\.md: route "\/a\/\.\.\/b\/"/);
	});
	await withVault({ 'notes/Bad.md': note('Bad', 'routes: /start/\n') }, async (dir) => {
		await assert.rejects(loadContentEntries({ root: dir }), /Bad\.md: routes must be a list/);
	});
});

test('an entry carries its routes, repeats dropped, and none when it declares none', async () => {
	await withVault(
		{
			'notes/Home.md': note('Home', 'routes: ["/", "/start/", "/"]\n'),
			'notes/Plain.md': note('Plain'),
		},
		async (dir) => {
			const entries = await loadContentEntries({ root: dir });
			assert.deepEqual(entries.find((e) => e.title === 'Home').routes, ['/', '/start/']);
			assert.deepEqual(entries.find((e) => e.title === 'Plain').routes, []);
		}
	);
});

test('a route is not a link: it adds no edge and no self-reference', async () => {
	await withVault({ 'notes/Home.md': note('Home', 'routes: ["/"]\n') }, async (dir) => {
		const graph = buildGraph(await loadContentEntries({ root: dir }));
		assert.deepEqual(graph.nodes['/notes/home/'].outbound, []);
	});
});

test('the graph keeps one node at the canonical URL, and query lists the routes', async () => {
	await withVault(
		{
			'notes/Home.md': note('Home', 'routes: ["/", "/start/"]\n'),
			'notes/Plain.md': note('Plain'),
		},
		async (dir) => {
			const entries = await loadContentEntries({ root: dir });
			const nodes = toBacklinksJson(buildGraph(entries));

			assert.deepEqual(Object.keys(nodes).sort(), ['/notes/home/', '/notes/plain/']);
			assert.equal('routes' in nodes['/notes/home/'], false);

			const { code, stdout } = await runCommune('--root', dir, 'graph', 'query', '--json');
			assert.equal(code, 0);
			const result = JSON.parse(stdout);
			assert.equal(result.count, 2);
			const byUrl = Object.fromEntries(result.entries.map((e) => [e.urlPath, e]));
			assert.deepEqual(byUrl['/notes/home/'].routes, ['/', '/start/']);
			assert.deepEqual(byUrl['/notes/plain/'].routes, []);
		}
	);
});

test('the integration writes the twin at every route, byte for byte', async () => {
	const source = note('Home', 'routes: ["/", "/start/"]\n') + '\nA [[wikilink]]  and trailing spaces  \n';
	await withVault({ 'notes/Home.md': source }, async (dir) => {
		const integration = commune();
		const logger = { info() {}, warn() {}, error() {} };
		const publicDir = pathToFileURL(join(dir, 'public/'));
		const dist = pathToFileURL(join(dir, 'dist/'));

		await integration.hooks['astro:config:setup']({
			config: { root: pathToFileURL(dir + '/'), publicDir },
			logger,
		});
		await integration.hooks['astro:build:done']({ dir: dist, logger });

		for (const twin of ['notes/home.md', 'index.md', 'start.md']) {
			assert.equal(await readFile(join(dir, 'dist', twin), 'utf8'), source, twin);
		}

		const backlinks = JSON.parse(await readFile(join(dir, 'dist/backlinks.json'), 'utf8'));
		assert.deepEqual(Object.keys(backlinks), ['/notes/home/']);
		const site = JSON.parse(await readFile(join(dir, 'dist/site.json'), 'utf8'));
		assert.equal(site.entries, 1);
	});
});

test('check reports a route that is another entry\'s URL', async () => {
	await withVault(
		{
			'notes/Home.md': note('Home', 'routes: ["/about/"]\n'),
			'pages/About.md': `---\ntitle: About\nurl: "/about/"\nvisibility: public\n---\n\nAbout.\n`,
		},
		async (dir) => {
			const entries = await loadContentEntries({ root: dir });
			const found = checkEntries(entries, buildGraph(entries)).filter((f) => f.rule === 'route-collision');

			assert.equal(found.length, 1);
			assert.equal(found[0].severity, 'error');
			assert.equal(found[0].file, 'src/content/notes/Home.md');
			assert.equal(found[0].target, '/about/');
			assert.deepEqual(found[0].candidates, ['/about/', '/notes/home/']);

			const { stdout } = await runCommune('--root', dir, 'check', '--json');
			assert.equal(JSON.parse(stdout).summary.byRule['route-collision'], 1);
		}
	);
});

test('check reports a route two entries both declare, once', async () => {
	await withVault(
		{
			'notes/A.md': note('A', 'routes: ["/"]\n'),
			'notes/B.md': note('B', 'routes: ["/"]\n'),
			'notes/C.md': note('C', 'routes: ["/c/"]\n'),
		},
		async (dir) => {
			const entries = await loadContentEntries({ root: dir });
			const found = checkEntries(entries, buildGraph(entries)).filter((f) => f.rule === 'route-collision');

			assert.equal(found.length, 1);
			assert.equal(found[0].target, '/');
			assert.deepEqual(found[0].candidates, ['/notes/a/', '/notes/b/']);
		}
	);
});

test('an entry repeating its own URL as a route is not a collision', async () => {
	await withVault({ 'notes/A.md': note('A', 'routes: ["/notes/a/"]\n') }, async (dir) => {
		const entries = await loadContentEntries({ root: dir });
		assert.deepEqual(checkEntries(entries, buildGraph(entries)).filter((f) => f.rule === 'route-collision'), []);
	});
});

test('the engine\'s own content has no route findings and declares no routes', async () => {
	const entries = await loadContentEntries();
	assert.ok(entries.length > 0);
	assert.ok(entries.every((entry) => entry.routes.length === 0));
	assert.deepEqual(checkEntries(entries, buildGraph(entries)).filter((f) => f.rule === 'route-collision'), []);

	const vault = await loadContentEntries({ root: VAULT });
	assert.deepEqual(checkEntries(vault, buildGraph(vault)).filter((f) => f.rule === 'route-collision'), []);
});

test('a canonical URL is absolute, and is the entry\'s own, not the route\'s', () => {
	assert.equal(toCanonicalUrl('/notes/hello/', 'https://example.com'), 'https://example.com/notes/hello/');
	assert.equal(toCanonicalUrl('/notes/hello/', new URL('https://example.com/')), 'https://example.com/notes/hello/');
});

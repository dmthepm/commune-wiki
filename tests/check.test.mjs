/**
 * Tests for `check`'s rules.
 *
 * The fixture vault carries exactly one instance of each, because neither real
 * corpus carries any: both have zero duplicate titles, zero basename
 * collisions and zero non-canonical WikiLinks, and devon-wiki has zero broken
 * links too. A rule with nothing to fire on is a rule nobody has tested.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, checkEntries, findBrokenAnchors, findNoncanonicalTitles, loadContentEntries } from '../src/lib/graph.ts';
import { communeMarkdown } from '../src/markdown.ts';
import { mkdtemp, cp, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIN, commune, run, VAULT } from './helpers.mjs';

async function findings(root) {
	const entries = await loadContentEntries(root ? { root } : {});
	return checkEntries(entries, buildGraph(entries));
}

function byRule(list, rule) {
	return list.filter((finding) => finding.rule === rule);
}

test('every rule but broken-anchor fires on the fixture vault, which has no heading links', async () => {
	const list = await findings(VAULT);

	assert.deepEqual(
		Object.fromEntries(
			['broken-link', 'ambiguous-target', 'duplicate-name', 'noncanonical-title', 'broken-anchor'].map((rule) => [
				rule,
				byRule(list, rule).length,
			])
		),
		{ 'broken-link': 1, 'ambiguous-target': 1, 'duplicate-name': 2, 'noncanonical-title': 1, 'broken-anchor': 0 }
	);
});

test('a broken link is a warning; everything else is an error', async () => {
	const list = await findings(VAULT);

	assert.equal(byRule(list, 'broken-link')[0].severity, 'warning');
	for (const rule of ['ambiguous-target', 'duplicate-name', 'noncanonical-title']) {
		for (const finding of byRule(list, rule)) assert.equal(finding.severity, 'error');
	}
});

test('a name that resolves to one entry by title and another by filename is ambiguous', async () => {
	const [finding] = byRule(await findings(VAULT), 'ambiguous-target');

	assert.equal(finding.target, 'Index');
	assert.equal(finding.file, 'src/content/notes/Beta.md');
	assert.deepEqual(finding.candidates, ['/notes/directory/', '/notes/index/']);
});

test('duplicate names cover both a shared title and a shared filename', async () => {
	const list = byRule(await findings(VAULT), 'duplicate-name');

	assert.deepEqual(
		list.map((finding) => [finding.target, finding.candidates]),
		[
			['Isolated', ['/notes/isolated/', '/research/isolated/']],
			['Shared Title', ['/notes/duplicate-one/', '/notes/duplicate-two/']],
		]
	);
});

test('a piped wikilink is non-canonical even though it renders', async () => {
	const [finding] = byRule(await findings(VAULT), 'noncanonical-title');

	assert.equal(finding.file, 'src/content/notes/Alpha.md');
	assert.equal(finding.target, 'Beta');
	assert.equal(finding.canonical, 'Beta');
	assert.match(finding.message, /\[\[Beta\|the beta note\]\]/);
});

test('the engine has 30 broken links and no errors', async () => {
	const list = await findings();

	assert.equal(byRule(list, 'broken-link').length, 30);
	assert.equal(list.filter((finding) => finding.severity === 'error').length, 0);
});

test('check --json reports counts by rule and exits 0 despite findings', async () => {
	const { code, stdout, stderr } = await commune('--root', VAULT, 'check', '--json');

	assert.equal(code, 0);
	assert.equal(stderr, '');
	const payload = JSON.parse(stdout);
	assert.equal(payload.schema, 1);
	assert.deepEqual(payload.summary.byRule, {
		'broken-link': 1,
		'ambiguous-target': 1,
		'duplicate-name': 2,
		'noncanonical-title': 1,
		'broken-anchor': 0,
		'route-collision': 0,
		'frontmatter-warning': 0,
	});
	assert.equal(payload.summary.errors, 4);
	assert.equal(payload.summary.warnings, 1);
	assert.equal(payload.summary.entries, 12);
	assert.equal(payload.findings.length, 5);
});

test('check on the engine reports 30 warnings and 0 errors', async () => {
	const { code, stdout } = await commune('check', '--json');
	const { summary } = JSON.parse(stdout);

	assert.equal(code, 0);
	assert.equal(summary.warnings, 30);
	assert.equal(summary.errors, 0);
	assert.equal(summary.byRule['broken-link'], 30);
	assert.equal(summary.entries, 12);
	assert.equal(summary.edges, 45);
});

test('a heading link is held to the canonical title like any other link', () => {
	// Two entries are enough: the rule reads only titles, aliases and the body.
	const entry = (title, body, aliases = []) => ({
		file: `src/content/notes/${title}.md`, title, aliases, body, urlPath: `/notes/${title.toLowerCase()}/`,
	});
	const found = findNoncanonicalTitles([
		entry('Beta', '[[Beta#Intro]] [[#Here]] [[Beta^abc]]', ['B']),
		entry('Gamma', '[[beta#Intro]] [[B#Intro]] [[Beta#Intro|start]] [[Beta |x]]'),
	]);

	assert.deepEqual(
		found.map((finding) => finding.message),
		[
			'[[beta#Intro]] should be [[Beta#Intro]]',
			'[[B#Intro]] should be [[Beta#Intro]]',
			'[[Beta#Intro|start]] should be [[Beta#Intro]]',
			'[[Beta|x]] should be [[Beta]]',
		]
	);
});

// Headings are read off the rendered page, with the processor `commune render`
// uses, so these cases check the real ids and not a second reading of markdown.
const renderer = await communeMarkdown({ root: VAULT, site: 'https://example.com' }).createRenderer({});

async function headingIds(entry) {
	const { code } = await renderer.render(entry.body, { frontmatter: entry.frontmatter });
	return new Set([...code.matchAll(/<h[1-6]\b[^>]*?\sid="([^"]*)"/g)].map((match) => match[1]));
}

function anchorEntry(title, body) {
	return {
		file: `src/content/notes/${title}.md`, title, aliases: [], body, frontmatter: {},
		urlPath: `/notes/${title.toLowerCase()}/`,
	};
}

function anchors(beta, alpha = '', ids = headingIds) {
	return findBrokenAnchors([anchorEntry('Beta', beta), anchorEntry('Alpha', alpha)], ids);
}

test('a link to a heading that is not there warns, and one to a real heading does not', async () => {
	const [finding, ...rest] = await anchors('## Intro\n', '[[Beta#Intro]] [[Beta#No such heading]] [[Beta#intro]]');

	assert.equal(rest.length, 0);
	assert.equal(finding.rule, 'broken-anchor');
	assert.equal(finding.severity, 'warning');
	assert.equal(finding.file, 'src/content/notes/Alpha.md');
	assert.equal(finding.target, 'Beta#No such heading');
	assert.equal(finding.message, '[[Beta#No such heading]] points at a heading that does not exist (#no-such-heading)');
});

test('a repeated heading is reached by name at its first occurrence', async () => {
	assert.equal((await anchors('## Intro\n\n## Intro\n', '[[Beta#Intro]]')).length, 0);
});

test('a heading the page gives an id never warns, whatever markup it is written in', async () => {
	const headings = [
		['## The `__init__` method', 'The __init__ method'],
		['## The `<details>` element', 'The <details> element'],
		['## `a &amp; b`', 'a &amp; b'],
		['## _id field', '_id field'],
		['## Underscore_in_middle_', 'Underscore_in_middle_'],
		['> ## Quoted', 'Quoted'],
		['- ## List heading', 'List heading'],
		['Heading\n===', 'Heading'],
		['Sub heading\n---', 'Sub heading'],
		['## Autolink <https://example.com> here', 'Autolink <https://example.com> here'],
		['## Fish &copy; chips', 'Fish © chips'],
		['## *Really* **very** ~~bad~~ idea', 'Really very bad idea'],
		['## A [link](https://example.com/x_y) here', 'A link here'],
		['## Café au lait', 'Café au lait'],
		['## 日本語の見出し', '日本語の見出し'],
	];

	for (const [markdown, text] of headings) {
		assert.deepEqual(await anchors(`${markdown}\n`, `[[Beta#${text}]]`), [], markdown);
	}
});

test('a heading that is not on the page warns, including one only inside a code fence', async () => {
	assert.equal((await anchors('## Real\n', '[[Beta#Cafe]]')).length, 1);
	assert.equal((await anchors('```sh\n# not a heading\n```\n\n## Real\n', '[[Beta#not a heading]]')).length, 1);
});

test('block refs, embeds, code, unresolved notes and same-note links', async () => {
	assert.equal((await anchors('## Real\n', '[[Beta^abc]] [[Beta#^abc]] ![[Beta#Missing]] `[[Beta#Missing]]` [[Nowhere#Missing]]')).length, 0);
	assert.deepEqual(
		(await findBrokenAnchors([anchorEntry('Alpha', '## Here\n\n[[#Here]] [[#Gone]]')], headingIds)).map((finding) => finding.target),
		['#Gone']
	);
});

test('only notes an anchored link points at are rendered, each once, and one that throws is skipped', async () => {
	const rendered = [];
	const ids = async (entry) => {
		rendered.push(entry.title);
		if (entry.title === 'Beta') throw new Error('boom');
		return headingIds(entry);
	};

	assert.deepEqual(await anchors('## Real\n', '[[Beta#A]] [[Beta#B]] [[Alpha]] [[Beta]]', ids), []);
	assert.deepEqual(rendered, ['Beta']);
});

test('findBrokenAnchors says how many notes it could not read', async () => {
	const told = [];
	const ids = async (entry) => {
		if (entry.title === 'Beta') throw new Error('boom');
		return headingIds(entry);
	};
	const entries = [anchorEntry('Beta', '## Real\n'), anchorEntry('Alpha', '[[Beta#A]] [[Alpha#B]]')];

	await findBrokenAnchors(entries, ids, (notes) => told.push(notes));
	assert.deepEqual(told, [1]);
});

test('check says on stderr that anchors went unchecked when the renderer cannot load, and exits as before', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'commune-anchor-'));
	try {
		await cp(join(VAULT, 'src'), join(dir, 'src'), { recursive: true });
		await appendFile(join(dir, 'src/content/notes/Beta.md'), '\n[[Beta#Gone]] [[Alpha#Gone]]\n');
		const hook = fileURLToPath(new URL('./fixtures/no-renderer-hook.mjs', import.meta.url));
		const args = ['--root', dir, 'check', '--json'];
		const normal = await run(process.execPath, [BIN, ...args]);
		const broken = await run(process.execPath, ['--import', hook, BIN, ...args]);

		// `run` rejects on a non-zero exit, so reaching here means both exited 0.
		assert.match(broken.stderr, /^broken-anchor: 2 notes not checked \(the markdown renderer could not load\)$/m);
		assert.equal(JSON.parse(broken.stdout).summary.byRule['broken-anchor'], 0);
		assert.doesNotMatch(broken.stdout, /not checked/);
		assert.doesNotMatch(normal.stderr, /not checked/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('check finds a broken heading link with no Astro runtime module loaded', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'commune-anchor-'));
	try {
		await cp(join(VAULT, 'src'), join(dir, 'src'), { recursive: true });
		await appendFile(join(dir, 'src/content/notes/Beta.md'), '\n[[Beta#Gone]] [[Beta#Gone]] [[Beta]]\n');
		const hook = fileURLToPath(new URL('./fixtures/no-astro-hook.mjs', import.meta.url));
		const { stdout } = await run(process.execPath, ['--import', hook, BIN, '--root', dir, 'check', '--json']);

		const { summary, findings } = JSON.parse(stdout);
		assert.equal(summary.byRule['broken-anchor'], 1);
		assert.equal(findings.find((finding) => finding.rule === 'broken-anchor').target, 'Beta#Gone');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

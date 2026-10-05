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
import { buildGraph, checkEntries, findBrokenAnchors, findNoncanonicalTitles, headingSlugs, loadContentEntries } from '../src/lib/graph.ts';
import { commune, VAULT } from './helpers.mjs';

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

function anchorEntry(title, body) {
	return { file: `src/content/notes/${title}.md`, title, aliases: [], body, urlPath: `/notes/${title.toLowerCase()}/` };
}

function anchors(beta, alpha = '') {
	return findBrokenAnchors([anchorEntry('Beta', beta), anchorEntry('Alpha', alpha)]);
}

test('a link to a heading that is not there warns, and one to a real heading does not', () => {
	const [finding, ...rest] = anchors('## Intro\n', '[[Beta#Intro]] [[Beta#No such heading]] [[Beta#intro]]');

	assert.equal(rest.length, 0);
	assert.equal(finding.rule, 'broken-anchor');
	assert.equal(finding.severity, 'warning');
	assert.equal(finding.file, 'src/content/notes/Alpha.md');
	assert.equal(finding.target, 'Beta#No such heading');
	assert.equal(finding.message, '[[Beta#No such heading]] points at a heading that does not exist (#no-such-heading)');
});

test('a repeated heading is reached by name at its first occurrence', () => {
	assert.deepEqual(headingSlugs('## Intro\n\n## Intro\n\n## Intro\n'), ['intro', 'intro-1', 'intro-2']);
	assert.equal(anchors('## Intro\n\n## Intro\n', '[[Beta#Intro]]').length, 0);
});

test('a heading is slugged from its text, not its markup', () => {
	const body = [
		'## The `commune check` command',
		'## *Really* **very** ~~bad~~ idea',
		'## A [link](https://example.com/x_y) and ![image](a.png)',
		'## snake_case and _emphasis_ ##',
		'## Q&amp;A',
	].join('\n\n');

	assert.deepEqual(headingSlugs(body), [
		'the-commune-check-command',
		'really-very-bad-idea',
		'a-link-and-image',
		'snake_case-and-emphasis',
		'qa',
	]);
	assert.equal(anchors(body, '[[Beta#The commune check command]] [[Beta#snake_case and emphasis]]').length, 0);
});

test('non-ASCII headings match the id the page gives them', () => {
	const body = '## Café au lait\n\n## 日本語の見出し\n\n## Über-cool\n';

	assert.equal(anchors(body, '[[Beta#Café au lait]] [[Beta#日本語の見出し]] [[Beta#Über-cool]]').length, 0);
	assert.equal(anchors(body, '[[Beta#Cafe au lait]]').length, 1);
});

test('only real headings count: code fences, block refs, embeds and same-note links', () => {
	const body = '```sh\n# not a heading\n```\n\n## Real\n';

	assert.equal(anchors(body, '[[Beta#not a heading]]').length, 1);
	assert.equal(anchors(body, '[[Beta^abc]] [[Beta#^abc]] ![[Beta#Missing]] `[[Beta#Missing]]` [[Nowhere#Missing]]').length, 0);
	assert.deepEqual(
		findBrokenAnchors([anchorEntry('Alpha', '## Here\n\n[[#Here]] [[#Gone]]')]).map((finding) => finding.target),
		['#Gone']
	);
});

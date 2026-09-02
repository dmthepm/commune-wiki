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
import { buildGraph, checkEntries, loadContentEntries } from '../src/lib/graph.ts';
import { commune, VAULT } from './helpers.mjs';

async function findings(root) {
	const entries = await loadContentEntries(root ? { root } : {});
	return checkEntries(entries, buildGraph(entries));
}

function byRule(list, rule) {
	return list.filter((finding) => finding.rule === rule);
}

test('every rule fires exactly once on the fixture vault', async () => {
	const list = await findings(VAULT);

	assert.deepEqual(
		Object.fromEntries(
			['broken-link', 'ambiguous-target', 'duplicate-name', 'noncanonical-title'].map((rule) => [
				rule,
				byRule(list, rule).length,
			])
		),
		{ 'broken-link': 1, 'ambiguous-target': 1, 'duplicate-name': 2, 'noncanonical-title': 1 }
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

test('the engine has 32 broken links and no errors', async () => {
	const list = await findings();

	assert.equal(byRule(list, 'broken-link').length, 32);
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
	});
	assert.equal(payload.summary.errors, 4);
	assert.equal(payload.summary.warnings, 1);
	assert.equal(payload.summary.entries, 10);
	assert.equal(payload.findings.length, 5);
});

test('check on the engine reports 32 warnings and 0 errors', async () => {
	const { code, stdout } = await commune('check', '--json');
	const { summary } = JSON.parse(stdout);

	assert.equal(code, 0);
	assert.equal(summary.warnings, 32);
	assert.equal(summary.errors, 0);
	assert.equal(summary.byRule['broken-link'], 32);
	assert.equal(summary.entries, 11);
	assert.equal(summary.edges, 41);
});

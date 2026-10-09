/**
 * `check` reports what `yaml` warns about in frontmatter (#150), without
 * changing how any value is read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGraph, checkEntries, loadContentEntries } from '../src/lib/graph.ts';
import { parseFrontmatter } from '../src/lib/frontmatter.ts';
import { commune } from './helpers.mjs';

async function makeVault(files) {
	const dir = await mkdtemp(join(tmpdir(), 'commune-fm-warn-'));
	await mkdir(join(dir, 'src/content/notes'), { recursive: true });
	for (const [name, source] of Object.entries(files)) await writeFile(join(dir, 'src/content/notes', name), source);
	return dir;
}

const TAGGED = '---\ntitle: Tagged\nvisibility: public\nsrc: !include x.md\n---\nBody.\n';
const CLEAN = '---\ntitle: Clean\nvisibility: public\n---\nBody.\n';

test('an unresolved tag is one frontmatter-warning naming the file and the line', async () => {
	const root = await makeVault({ 'Tagged.md': TAGGED, 'Clean.md': CLEAN });
	try {
		const entries = await loadContentEntries({ root });
		const found = checkEntries(entries, buildGraph(entries)).filter((f) => f.rule === 'frontmatter-warning');

		assert.equal(found.length, 1);
		assert.equal(found[0].severity, 'warning');
		assert.equal(found[0].file, 'src/content/notes/Tagged.md');
		assert.equal(found[0].line, 4);
		assert.match(found[0].message, /Unresolved tag: !include/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('a clean file has no frontmatter-warning', async () => {
	const root = await makeVault({ 'Clean.md': CLEAN });
	try {
		const entries = await loadContentEntries({ root });
		assert.deepEqual(checkEntries(entries, buildGraph(entries)).filter((f) => f.rule === 'frontmatter-warning'), []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('the value still reads as the plain string', () => {
	const parsed = parseFrontmatter(TAGGED);

	assert.equal(parsed.data.src, 'x.md');
	assert.equal(parsed.warnings.length, 1);
	assert.equal(parsed.warnings[0].line, 4);
	assert.deepEqual(parseFrontmatter(CLEAN).warnings, []);
});

test('check --json counts it as a warning and still exits 0', async () => {
	const root = await makeVault({ 'Tagged.md': TAGGED });
	try {
		const { code, stdout } = await commune('--root', root, 'check', '--json');
		const { summary } = JSON.parse(stdout);

		assert.equal(code, 0);
		assert.equal(summary.byRule['frontmatter-warning'], 1);
		assert.equal(summary.warnings, 1);
		assert.equal(summary.errors, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

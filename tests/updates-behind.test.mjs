/**
 * `check` nudges when the updates feed has fallen behind the pages (#updates-behind).
 *
 * The rule is a warning and never changes an exit code. It writes nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGraph, checkEntries, loadContentEntries } from '../src/lib/graph.ts';
import { commune } from './helpers.mjs';

function entry(collection, name, updated, updatedSource = 'frontmatter') {
	return {
		slug: name,
		urlPath: `/${collection}/${name}/`,
		title: name,
		collection,
		aliases: [],
		routes: [],
		tags: [],
		status: 'published',
		...(updated ? { updated } : {}),
		updatedSource,
		body: '',
		frontmatter: {},
		file: `src/content/${collection}/${name}.md`,
	};
}

const behind = (entries) => checkEntries(entries, buildGraph(entries)).filter((f) => f.rule === 'updates-behind');

test('pages changed after the newest update entry give one warning with the count, the date and the next step', () => {
	const found = behind([
		entry('updates', 'old', '2026-08-01'),
		entry('updates', 'last', '2026-09-08'),
		entry('notes', 'a', '2026-09-09'),
		entry('pages', 'b', '2026-10-01'),
		entry('research', 'c', '2026-09-08'),
	]);
	assert.equal(found.length, 1);
	assert.equal(found[0].severity, 'warning');
	assert.equal(
		found[0].message,
		'2 public pages changed since the last update entry on 2026-09-08. Run commune update --recent 2026-09-08 to draft one.'
	);
});

test('a page changed on the same day as the newest update entry does not count', () => {
	assert.deepEqual(behind([entry('updates', 'last', '2026-09-08'), entry('notes', 'a', '2026-09-08')]), []);
});

test('a wiki with no updates collection gets no finding', () => {
	assert.deepEqual(behind([entry('notes', 'a', '2026-10-01'), entry('pages', 'b', '2026-10-02')]), []);
});

test('an entry whose date source is none is skipped', () => {
	assert.deepEqual(behind([entry('updates', 'last', '2026-09-08'), entry('notes', 'a', undefined, 'none')]), []);
	// A stray date on a none-source entry is not trusted either.
	assert.deepEqual(behind([entry('updates', 'last', '2026-09-08'), entry('notes', 'a', '2026-10-01', 'none')]), []);
});

test('an update entry with no date source is not the newest one', () => {
	const found = behind([
		entry('updates', 'dated', '2026-09-08'),
		entry('updates', 'undated', undefined, 'none'),
		entry('notes', 'a', '2026-09-09'),
	]);
	assert.equal(found.length, 1);
	assert.match(found[0].message, /^1 public page changed since the last update entry on 2026-09-08\./);
});

test('many changed pages still give one finding', () => {
	const pages = Array.from({ length: 11 }, (_, i) => entry('notes', `n${i}`, '2026-09-20'));
	const found = behind([entry('updates', 'last', '2026-09-08'), ...pages]);
	assert.equal(found.length, 1);
	assert.match(found[0].message, /^11 public pages changed/);
});

async function makeWiki(files) {
	const root = await mkdtemp(join(tmpdir(), 'commune-updates-behind-'));
	for (const [file, source] of Object.entries(files)) {
		await mkdir(join(root, file, '..'), { recursive: true });
		await writeFile(join(root, file), source);
	}
	return root;
}

const note = (title, date, visibility) =>
	`---\ntitle: ${title}\nvisibility: ${visibility}\nupdated: ${date}\n---\nBody.\n`;

test('private notes are not counted, and check --json carries the finding with exit 0', async () => {
	const root = await makeWiki({
		'src/content/updates/2026-09-08.md': '---\ntitle: Last\ndate: 2026-09-08\n---\nDone.\n',
		'src/content/notes/Shown.md': note('Shown', '2026-09-20', 'public'),
		'src/content/notes/Hidden.md': note('Hidden', '2026-09-21', 'private'),
	});
	try {
		const result = await commune('check', '--root', root, '--json');
		assert.equal(result.code, 0);
		const payload = JSON.parse(result.stdout);
		const found = payload.findings.filter((f) => f.rule === 'updates-behind');
		assert.equal(found.length, 1);
		assert.match(found[0].message, /^1 public page changed since the last update entry on 2026-09-08\./);
		assert.equal(payload.summary.byRule['updates-behind'], 1);
		assert.equal(payload.summary.errors, 0);
		// Writes nothing.
		const again = await loadContentEntries({ root });
		assert.equal(again.filter((e) => e.collection === 'updates').length, 1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

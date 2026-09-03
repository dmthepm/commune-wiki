/**
 * Tests for `commune update`, the one verb that can write.
 *
 * Which is why the default is asserted first and hardest: run without
 * `--write`, it must leave the content tree exactly as it found it. The
 * writing tests all run against a copy of the fixture vault in a temp
 * directory — a test that scaffolds an update into `tests/fixtures/vault`
 * would leave a file behind and change every count in every other suite.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commune, VAULT } from './helpers.mjs';

/** Today, the way the CLI files an update: a local calendar day. */
function today() {
	const now = new Date();
	return [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, '0'),
		String(now.getDate()).padStart(2, '0'),
	].join('-');
}

/** A disposable copy of the fixture vault, so a write test can write. */
async function withVaultCopy(body) {
	const dir = await mkdtemp(path.join(tmpdir(), 'commune-update-'));
	try {
		await cp(VAULT, dir, { recursive: true });
		return await body(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test('without --write it prints the entry and touches nothing', async () => {
	const before = await readdir(path.join(VAULT, 'src/content/updates'));
	const { code, stdout } = await commune(
		'--root', VAULT, 'update', '--recent', '2020-01-01'
	);
	const after = await readdir(path.join(VAULT, 'src/content/updates'));

	assert.equal(code, 0);
	assert.deepEqual(after, before);

	assert.match(stdout, new RegExp(`^---\\ntitle: "Updates for ${today()}"`));
	assert.match(stdout, new RegExp(`\\ndate: ${today()}\\n`));
	// A draft says it is a draft: summarizing a week is a judgement.
	assert.match(stdout, /\nsummary: ""\n/);
	// Both spellings of the same edge — the frontmatter for the graph, the prose
	// for a reader — and they deduplicate into one edge when it renders.
	assert.match(stdout, /\n  - \/notes\/alpha\/\n/);
	assert.match(stdout, /\n- \[\[Alpha\]\]/);
});

test('an update does not roll up other updates', async () => {
	const { stdout } = await commune(
		'--root', VAULT, 'update', '--recent', '2020-01-01', '--json'
	);
	const payload = JSON.parse(stdout);

	assert.equal(
		payload.entries.some((entry) => entry.collection === 'updates'),
		false
	);
	assert.equal(payload.written, false);
	assert.equal(payload.since, '2020-01-01');
	assert.equal(payload.file, `src/content/updates/${today()}.md`);
});

test('--recent narrows what gets rolled up', async () => {
	const { stdout } = await commune(
		'--root', VAULT, 'update', '--recent', '2099-01-01', '--json'
	);
	const payload = JSON.parse(stdout);

	assert.deepEqual(payload.entries, []);
	// An empty week is still a valid entry: it says so rather than emitting a
	// `links:` key with nothing under it, which is not valid frontmatter.
	assert.doesNotMatch(payload.content, /links:/);
	assert.match(payload.content, /Nothing changed in this window\./);
});

test('--write files the entry under today, and the graph then sees it', async () => {
	await withVaultCopy(async (root) => {
		const { code, stdout } = await commune(
			'--root', root, 'update', '--recent', '2020-01-01', '--write'
		);

		assert.equal(code, 0);
		assert.match(stdout, /^wrote src\/content\/updates\//);

		const written = await readFile(
			path.join(root, `src/content/updates/${today()}.md`),
			'utf8'
		);
		assert.match(written, new RegExp(`\\ndate: ${today()}\\n`));

		// The point of writing it there: it is content, so the graph picks it up
		// on the next query with its edges already resolved.
		const query = await commune(
			'--root', root, 'graph', 'query', '--collection', 'updates', '--json'
		);
		const updates = JSON.parse(query.stdout).entries;
		assert.equal(updates.length, 2);
		const scaffolded = updates.find((entry) => entry.urlPath === `/updates/${today()}/`);
		assert.ok(scaffolded.outbound.includes('/notes/alpha/'));
	});
});

test('--write refuses to overwrite an update that already exists', async () => {
	await withVaultCopy(async (root) => {
		const file = path.join(root, `src/content/updates/${today()}.md`);
		await writeFile(file, '---\ntitle: "Mine"\ndate: 2026-01-01\nsummary: "x"\n---\n\nWords.\n');

		const { code, stdout, stderr } = await commune(
			'--root', root, 'update', '--write', '--json'
		);

		assert.equal(code, 1);
		assert.equal(stdout, '');
		assert.equal(JSON.parse(stderr).error.code, 'EEXISTS');

		// A day's writing survives the command that would have replaced it.
		assert.match(await readFile(file, 'utf8'), /Words\./);
	});
});

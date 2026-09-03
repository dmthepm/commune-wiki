/**
 * Tests for `commune gate`.
 *
 * The gate is the one verb whose exit code is a finding, so every test here
 * asserts the code as well as the output — a gate that printed `FAIL:` and
 * exited 0 would pass a build it was supposed to stop.
 *
 * Each case writes a whole miniature project into a temp directory: content,
 * the `public/backlinks.json` a build would have written, and the `dist/` HTML
 * it would have rendered. That is more setup than pointing at
 * `tests/fixtures/vault`, and it buys the thing the fixture cannot give —
 * *built* output, which two of the three assertions read. Nothing is committed
 * for it, and each case can be wrong in exactly one way.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commune } from './helpers.mjs';

const PAGE = `---
title: About
url: /about/
status: live
---

A standalone page.
`;

const note = (link) => `---
title: Hello
visibility: public
status: live
---

Links to ${link}.
`;

const RENDERED = '<html><body><a href="/about/" class="wikilink">About</a></body></html>';
const INDEX = { '/about/': { title: 'About', collection: 'pages' } };

/**
 * Write a built project and hand its root to `body`.
 *
 * `overrides` replaces one of the three inputs, which is how each test breaks
 * exactly one assertion.
 */
async function withProject({ link = '[[About]]', index = INDEX, html = RENDERED }, body) {
	const root = await mkdtemp(path.join(tmpdir(), 'commune-gate-'));
	try {
		await mkdir(path.join(root, 'src/content/pages'), { recursive: true });
		await mkdir(path.join(root, 'src/content/notes'), { recursive: true });
		await mkdir(path.join(root, 'public'), { recursive: true });
		await mkdir(path.join(root, 'dist/notes/hello'), { recursive: true });

		await writeFile(path.join(root, 'src/content/pages/About.md'), PAGE);
		await writeFile(path.join(root, 'src/content/notes/Hello.md'), note(link));
		await writeFile(path.join(root, 'public/backlinks.json'), JSON.stringify(index, null, 2));
		await writeFile(path.join(root, 'dist/notes/hello/index.html'), html);

		return await body(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

test('a built project that satisfies all three assertions passes', async () => {
	await withProject({}, async (root) => {
		const { code, stdout, stderr } = await commune('--root', root, 'gate');

		assert.equal(code, 0);
		assert.equal(stdout, '');
		assert.equal(stderr, 'PASS: 1 standalone page indexed for search and linked from notes\n');
	});
});

test('a piped WikiLink fails the canonical-title assertion', async () => {
	await withProject({ link: '[[About|the about page]]' }, async (root) => {
		const { code, stderr } = await commune('--root', root, 'gate');

		assert.equal(code, 1);
		assert.match(stderr, /^FAIL: WikiLinks must use exact page titles:/);
		assert.match(stderr, /About\|the about page/);
		// The verdict is one or the other, never both.
		assert.doesNotMatch(stderr, /PASS:/);
	});
});

test('a page missing from the search index fails', async () => {
	await withProject({ index: {} }, async (root) => {
		const { code, stderr } = await commune('--root', root, 'gate');

		assert.equal(code, 1);
		assert.match(stderr, /^FAIL: standalone pages missing from search index: \/about\/ \(About\)/);
	});
});

test('a WikiLink that did not render as an href fails', async () => {
	await withProject({ html: '<html><body>About</body></html>' }, async (root) => {
		const { code, stderr } = await commune('--root', root, 'gate');

		assert.equal(code, 1);
		assert.match(stderr, /^FAIL: WikiLinks to standalone pages did not render: hello -> \/about\//);
	});
});

test('--json puts the verdict in the payload and leaves stderr empty', async () => {
	await withProject({ link: '[[About|the about page]]' }, async (root) => {
		const { code, stdout, stderr } = await commune('--root', root, 'gate', '--json');

		assert.equal(code, 1);
		assert.equal(stderr, '');
		const payload = JSON.parse(stdout);
		assert.equal(payload.schema, 1);
		assert.equal(payload.passed, false);
		assert.equal(payload.failures.length, 1);
		assert.equal(payload.failures[0].assertion, 'canonical-titles');
	});
});

test('--dist names the built output, so a gate can check any build', async () => {
	await withProject({}, async (root) => {
		// The engine's own site builds to `dist-site/`, because `dist/` is the
		// compiled package. A gate that could not be pointed elsewhere would be
		// unusable in the very repo that ships it.
		const missing = await commune('--root', root, 'gate', '--dist', 'somewhere-else');
		assert.equal(missing.code, 1);
		assert.match(missing.stderr, /somewhere-else/);

		const found = await commune('--root', root, 'gate', '--dist', 'dist');
		assert.equal(found.code, 0);
	});
});

test('a project with no search index cannot be gated at all', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'commune-gate-'));
	try {
		await mkdir(path.join(root, 'src/content/notes'), { recursive: true });
		const { code, stderr } = await commune('--root', root, 'gate');

		// Exit 1 either way — but the message says the build never ran, rather
		// than blaming the content.
		assert.equal(code, 1);
		assert.match(stderr, /could not read the search index/);
		assert.match(stderr, /runs after a build/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('an unknown flag is an invocation error, not a finding', async () => {
	const { code, stdout } = await commune('gate', '--bogus');

	assert.equal(code, 2);
	assert.equal(stdout, '');
});

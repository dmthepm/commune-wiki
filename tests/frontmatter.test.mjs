/**
 * Pins what `parseFrontmatter` returns for the shapes of file the engine meets.
 *
 * The expectations were recorded from gray-matter 4.0.3, which the engine used
 * until it was dropped (#131), so these tests are the parity contract: the
 * split point, the body's exact bytes and the parsed values must not move when
 * the parser underneath does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseFrontmatter } from '../src/lib/frontmatter.ts';
import { commune } from './helpers.mjs';

/** [name, source, data, content] */
const CASES = [
	['a block and a body', '---\ntitle: A\n---\nbody\n', { title: 'A' }, 'body\n'],
	['no block', 'just body\n', {}, 'just body\n'],
	['an empty file', '', {}, ''],
	['an empty block', '---\n---\nbody\n', {}, 'body\n'],
	['a blank block', '---\n\n---\nbody', {}, 'body'],
	['only comments in the block', '---\n# hi\n---\nb', {}, 'b'],
	['a file that is only frontmatter, no newline', '---\ntitle: A\n---', { title: 'A' }, ''],
	['a file that is only frontmatter, newline', '---\ntitle: A\n---\n', { title: 'A' }, ''],
	['a closing fence at end of file after a value', '---\na: 1\n---', { a: 1 }, ''],
	['a leading BOM', '﻿---\ntitle: A\n---\nbody\n', { title: 'A' }, 'body\n'],
	['a leading BOM and no block', '﻿body', {}, 'body'],
	[
		'CRLF line endings',
		'---\r\ntitle: A\r\ntags:\r\n  - x\r\n---\r\nbody\r\nmore\r\n',
		{ title: 'A', tags: ['x'] },
		'body\r\nmore\r\n',
	],
	['a blank line before the body', '---\ntitle: A\n---\n\nbody\n', { title: 'A' }, '\nbody\n'],
	['a fence of four dashes', '----\ntitle: A\n---\nbody\n', {}, '----\ntitle: A\n---\nbody\n'],
	['an indented opening fence', ' ---\ntitle: A\n---\nbody\n', {}, ' ---\ntitle: A\n---\nbody\n'],
	['a blank line before the opening fence', '\n---\ntitle: A\n---\nbody\n', {}, '\n---\ntitle: A\n---\nbody\n'],
	['trailing spaces on the opening fence', '---  \ntitle: A\n---\nbody\n', { title: 'A' }, 'body\n'],
	['trailing spaces on the closing fence', '---\ntitle: A\n---  \nbody\n', { title: 'A' }, '  \nbody\n'],
	['text glued to the closing fence', '---\ntitle: A\n---x\nbody\n', { title: 'A' }, 'x\nbody\n'],
	['a rule in the body', '---\ntitle: A\n---\nbody\n\n---\n\nmore\n', { title: 'A' }, 'body\n\n---\n\nmore\n'],
	['a fence line inside a block scalar', '---\na: |\n  x\n  ---\n  y\n---\nb', { a: 'x\n---\ny\n' }, 'b'],
	['nested values', '---\na:\n  b: [1, 2]\n  c: {d: e}\nbool: yes\n---\nb', {
		a: { b: [1, 2], c: { d: 'e' } },
		bool: 'yes',
	}, 'b'],
	['a null document', '---\n~\n---\nb', {}, 'b'],
	['a language tag on the opening fence', '---yaml\ntitle: A\n---\nb', { title: 'A' }, 'b'],
	['comments only, no blank lines', '---\n# one\n# two\n---\nb', {}, 'b'],
];

for (const [name, source, data, content] of CASES) {
	test(`frontmatter: ${name}`, () => {
		const parsed = parseFrontmatter(source);
		assert.deepEqual(parsed.data, data);
		assert.equal(parsed.content, content);
	});
}

test('frontmatter: YAML timestamps come back as Date objects', () => {
	const { data } = parseFrontmatter('---\nd: 2024-01-02\nt: 2024-01-02T03:04:05Z\n---\nb');
	assert.ok(data.d instanceof Date);
	assert.ok(data.t instanceof Date);
	assert.equal(data.d.toISOString(), '2024-01-02T00:00:00.000Z');
	assert.equal(data.t.toISOString(), '2024-01-02T03:04:05.000Z');
});

test('frontmatter: invalid YAML throws', () => {
	assert.throws(() => parseFrontmatter('---\na: [1\n---\nb'));
});

test('frontmatter: an unclosed block takes the whole file and throws on prose', () => {
	assert.throws(() => parseFrontmatter('---\ntitle: A\nbody\n'));
});

test('frontmatter: duplicate keys throw', () => {
	assert.throws(() => parseFrontmatter('---\na: 1\na: 2\n---\nb'));
});

test('frontmatter: an unparseable file reaches the user as "cannot parse frontmatter in"', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'commune-fm-'));
	try {
		await mkdir(path.join(dir, 'src/content/notes'), { recursive: true });
		await writeFile(path.join(dir, 'src/content/notes/Bad.md'), '---\na: [1\n---\nb\n');
		const result = await commune('--root', dir, 'render', 'src/content/notes/Bad.md');
		assert.notEqual(result.code, 0);
		assert.match(String(result.stderr), /cannot parse frontmatter in .*Bad\.md/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

// A title that follows the filename is written plain when that is safe. Text a
// YAML 1.1 reader takes for a number is not safe, whatever js-yaml 4 says.
for (const title of ['1_000', '1:20', '08']) {
	test(`frontmatter: rename quotes the title ${title}, which looks numeric`, async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'commune-fm-'));
		try {
			await mkdir(path.join(dir, 'src/content/notes'), { recursive: true });
			await writeFile(
				path.join(dir, 'src/content/notes/Old name.md'),
				'---\ntitle: Old name\nvisibility: public\n---\nBody.\n'
			);
			const target = `src/content/notes/${title}.md`;
			const { code } = await commune('--root', dir, 'rename', 'src/content/notes/Old name.md', target);
			assert.equal(code, 0);
			const written = await readFile(path.join(dir, target), 'utf8');
			assert.match(written, new RegExp(`^title: ["']${title}["']$`, 'm'));
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
}

test('frontmatter: rename writes the same bytes as it did with gray-matter', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'commune-fm-'));
	try {
		await mkdir(path.join(dir, 'src/content/notes'), { recursive: true });
		await writeFile(
			path.join(dir, 'src/content/notes/Old name.md'),
			'---\r\ntitle: Old name\r\nvisibility: public\r\ndate: 2024-01-02\r\ntags:\r\n  - a\r\n---\r\nSee [[Old name]].\r\n'
		);
		const { code } = await commune('--root', dir, 'rename', 'src/content/notes/Old name.md', 'src/content/notes/New name.md');
		assert.equal(code, 0);
		const written = await readFile(path.join(dir, 'src/content/notes/New name.md'), 'utf8');
		// The bare `\n` after the title is how rename has always written it into CRLF
		// frontmatter. This test pins the bytes, not an endorsement of them.
		assert.equal(
			written,
			'---\r\ntitle: New name\nslug: old-name\r\nvisibility: public\r\ndate: 2024-01-02\r\ntags:\r\n  - a\r\n---\r\nSee [[New name]].\r\n'
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

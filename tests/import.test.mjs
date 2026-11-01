/**
 * Tests for `commune import`, the verb that copies an existing vault into a wiki.
 *
 * Every test builds a throwaway vault and a throwaway wiki in a temp directory.
 * The promises under test are the ones a stranger relies on. The vault is only
 * read, a body is never touched, nothing is published unless asked, nothing is
 * overwritten, and every repair and every skip is named in the output.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commune } from './helpers.mjs';
import { parseFrontmatter } from '../src/lib/frontmatter.ts';

const NOTES = 'src/content/notes';

async function put(dir, file, text) {
	await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
	await writeFile(path.join(dir, file), text);
}

/** A vault dir and an empty wiki root, both removed afterwards. */
async function withDirs(files, run) {
	const base = await mkdtemp(path.join(tmpdir(), 'commune-import-'));
	const vault = path.join(base, 'My Vault');
	const wiki = path.join(base, 'wiki');
	try {
		await mkdir(path.join(wiki, 'src/content'), { recursive: true });
		await mkdir(vault, { recursive: true });
		for (const [file, text] of Object.entries(files)) await put(vault, file, text);
		return await run({ vault, wiki, read: (file) => readFile(path.join(wiki, NOTES, file), 'utf8') });
	} finally {
		await chmod(vault, 0o755).catch(() => {});
		await rm(base, { recursive: true, force: true });
	}
}

async function tree(dir) {
	const out = {};
	for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile()) continue;
		const file = path.join(entry.parentPath, entry.name);
		const info = await stat(file);
		out[path.relative(dir, file)] = `${info.mtimeMs}:${await readFile(file, 'utf8')}`;
	}
	return out;
}

const importJson = async (wiki, vault, ...flags) => {
	const result = await commune('--root', wiki, 'import', vault, '--json', ...flags);
	return { ...result, json: result.stdout ? JSON.parse(result.stdout) : undefined };
};

test('copies every .md file, keeping folders and spaces, and skips dot folders and node_modules', async () => {
	await withDirs(
		{
			'Top note.md': 'hello\n',
			'Projects/Deep Work/Plan one.md': 'plan\n',
			'.obsidian/workspace.md': 'no',
			'.trash/Old.md': 'no',
			'node_modules/pkg/readme.md': 'no',
			'Projects/.hidden/secret.md': 'no',
			'Pics/photo.png': 'png',
			'Projects/data.csv': 'a,b',
		},
		async ({ vault, wiki, read }) => {
			const { code, json } = await importJson(wiki, vault);
			assert.equal(code, 0);
			assert.equal(json.summary.imported, 2);
			assert.equal(json.summary.attachments, 2);
			assert.match(await read('Projects/Deep Work/Plan one.md'), /plan\n$/);
			assert.match(await read('Top note.md'), /^---\ntitle: Top note\n---\nhello\n$/);
			const found = await readdir(path.join(wiki, NOTES), { recursive: true });
			assert.ok(!found.some((f) => /obsidian|trash|node_modules|hidden/.test(f)), found.join(','));
			assert.ok(json.imports.every((i) => !i.target.includes('\\')), 'paths use forward slashes');
		}
	);
});

test('a missing title comes from the file name, other frontmatter and the body stay byte for byte', async () => {
	const body = '\n\nBody with [[Link]]\r\nand CRLF, ünïcode, no final newline';
	const withFm = `---\r\ntitle: Kept\r\naliases: [a, b]\r\n# a comment\r\ncustom:   {x: 1}\r\n---\r\n${body}`;
	const noTitle = `---\nvisibility: private\nfoo:   bar  # keep spacing\n---\n${body}`;
	await withDirs({ 'a.md': withFm, 'Needs Title.md': noTitle, 'plain.md': body }, async ({ vault, wiki, read }) => {
		const { code } = await importJson(wiki, vault);
		assert.equal(code, 0);
		assert.equal(await read('a.md'), withFm);
		assert.equal(await read('Needs Title.md'), noTitle.replace('---\nvisibility', '---\nvisibility').replace('\n---\n', '\ntitle: Needs Title\n---\n'));
		assert.equal(await read('plain.md'), `---\ntitle: plain\n---\n${body}`);
		assert.equal(parseFrontmatter(await read('Needs Title.md')).content, body);
	});
});

test('a title with characters YAML would misread is quoted', async () => {
	await withDirs({ 'Why: a "test" #1.md': 'x', '2024.md': 'x', 'true.md': 'x' }, async ({ vault, wiki, read }) => {
		await importJson(wiki, vault);
		assert.equal(parseFrontmatter(await read('Why: a "test" #1.md')).data.title, 'Why: a "test" #1');
		assert.equal(parseFrontmatter(await read('2024.md')).data.title, '2024');
		assert.equal(parseFrontmatter(await read('true.md')).data.title, 'true');
	});
});

test('without --public nothing is published and the summary says how to publish', async () => {
	await withDirs(
		{
			'none.md': 'x',
			'priv.md': '---\ntitle: P\nvisibility: private\n---\nx',
			'draft.md': '---\ntitle: D\nvisibility: draft\n---\nx',
			'pub.md': '---\ntitle: U\nvisibility: public\n---\nx',
		},
		async ({ vault, wiki, read }) => {
			const { code, json, stderr } = await importJson(wiki, vault);
			assert.equal(code, 0, stderr);
			assert.deepEqual(
				[json.summary.public, json.summary.private, json.summary.draft],
				[1, 2, 1]
			);
			assert.equal(parseFrontmatter(await read('none.md')).data.visibility, undefined);
			assert.match(json.hint, /visibility: public/);
			assert.match(json.hint, /--public/);
			// A second, empty wiki: the first one now holds the notes.
			await mkdir(path.join(wiki, '../wiki2/src/content'), { recursive: true });
			const text = await commune('--root', path.join(wiki, '../wiki2'), 'import', vault, '--dry-run');
			assert.match(text.stdout, /1 public, 2 private/);
			assert.match(text.stdout, /--public/);
		}
	);
});

test('--public sets public only on notes with no visibility, never on private or draft', async () => {
	await withDirs(
		{
			'none.md': 'x',
			'nofm-null.md': '---\ntitle: N\nvisibility:\n---\nx',
			'priv.md': '---\ntitle: P\nvisibility: private\n---\nx',
			'draft.md': '---\ntitle: D\nvisibility: draft\n---\nx',
		},
		async ({ vault, wiki, read }) => {
			const { code, json } = await importJson(wiki, vault, '--public');
			assert.equal(code, 0);
			const v = async (f) => parseFrontmatter(await read(f)).data.visibility;
			assert.equal(await v('none.md'), 'public');
			assert.equal(await v('nofm-null.md'), 'public');
			assert.equal(await v('priv.md'), 'private');
			assert.equal(await v('draft.md'), 'draft');
			assert.deepEqual([json.summary.public, json.summary.private, json.summary.draft], [2, 1, 1]);
		}
	);
});

test('repairs what has one obvious meaning and lists every repair', async () => {
	await withDirs(
		{
			'tags-string.md': '---\ntitle: T\ntags: solo\n---\nb',
			'tags-commas.md': '---\ntitle: T\ntags: "one, #two ,three"\n---\nb',
			'tags-null.md': '---\ntitle: T\ntags:\nstatus:\n---\nb',
			'tags-numbers.md': '---\ntitle: T\ntags: [2024, x]\n---\nb',
			'status-case.md': '---\ntitle: T\nstatus: Evergreen\n---\nb',
			'title-number.md': '---\ntitle: 2024\n---\nb',
			'title-empty.md': '---\ntitle:\n---\nb',
			'vis-case.md': '---\ntitle: T\nvisibility: Private\n---\nb',
			'aliases-string.md': '---\ntitle: T\naliases: Other name\n---\nb',
		},
		async ({ vault, wiki, read }) => {
			const { code, json } = await importJson(wiki, vault);
			assert.equal(code, 0);
			const d = async (f) => parseFrontmatter(await read(f)).data;
			assert.deepEqual((await d('tags-string.md')).tags, ['solo']);
			assert.deepEqual((await d('tags-commas.md')).tags, ['one', 'two', 'three']);
			const tn = await d('tags-null.md');
			assert.ok(!('tags' in tn) && !('status' in tn));
			assert.deepEqual((await d('tags-numbers.md')).tags, ['2024', 'x']);
			assert.equal((await d('status-case.md')).status, 'evergreen');
			assert.equal((await d('title-number.md')).title, '2024');
			assert.equal((await d('title-empty.md')).title, 'title-empty');
			assert.equal((await d('vis-case.md')).visibility, 'private');
			assert.deepEqual((await d('aliases-string.md')).aliases, ['Other name']);
			const files = new Set(json.repairs.map((r) => r.file));
			for (const f of ['tags-string.md', 'tags-commas.md', 'tags-null.md', 'tags-numbers.md', 'status-case.md', 'title-number.md', 'title-empty.md', 'vis-case.md', 'aliases-string.md']) {
				assert.ok(files.has(f), `${f} has a listed repair`);
			}
		}
	);
});

test('skips what has no single obvious meaning, and says why', async () => {
	await withDirs(
		{
			'ok.md': '---\ntitle: Ok\n---\nb',
			'status-odd.md': '---\ntitle: T\nstatus: done\n---\nb',
			'title-list.md': '---\ntitle: [a, b]\n---\nb',
			'bad-yaml.md': '---\ntitle: [unclosed\nfoo: : :\n---\nb',
			'dup-key.md': '---\ntitle: A\ntitle: B\n---\nb',
			'vis-odd.md': '---\ntitle: T\nvisibility: maybe\n---\nb',
			'tags-spaces.md': '---\ntitle: T\ntags: two words here\n---\nb',
			'tags-nested.md': '---\ntitle: T\ntags: [[a], b]\n---\nb',
			'unclosed.md': '---\ntitle: T\nbody never closes\n',
			'not-map.md': '---\n- a\n- b\n---\nb',
			'routes.md': '---\ntitle: T\nroutes: nope\n---\nb',
		},
		async ({ vault, wiki }) => {
			const { code, json } = await importJson(wiki, vault);
			assert.equal(code, 0);
			assert.equal(json.summary.imported, 1);
			const skipped = Object.fromEntries(json.skipped.map((s) => [s.file, s.reason]));
			assert.deepEqual(Object.keys(skipped).sort(), [
				'bad-yaml.md', 'dup-key.md', 'not-map.md', 'routes.md', 'status-odd.md',
				'tags-nested.md', 'tags-spaces.md', 'title-list.md', 'unclosed.md', 'vis-odd.md',
			]);
			assert.match(skipped['status-odd.md'], /status/);
			assert.match(skipped['bad-yaml.md'], /YAML/);
			assert.match(skipped['title-list.md'], /title/);
			const found = await readdir(path.join(wiki, NOTES));
			assert.deepEqual(found, ['ok.md']);
			await mkdir(path.join(wiki, '../wiki2/src/content'), { recursive: true });
			const text = await commune('--root', path.join(wiki, '../wiki2'), 'import', vault, '--dry-run');
			assert.match(text.stdout, /skip\s+status-odd\.md/);
		}
	);
});

test('refuses before writing anything when a target exists', async () => {
	await withDirs({ 'a.md': 'a', 'sub/b.md': 'b', 'c.md': 'c' }, async ({ vault, wiki }) => {
		await put(wiki, `${NOTES}/sub/b.md`, 'mine');
		const { code, stderr } = await importJson(wiki, vault);
		assert.equal(code, 1);
		assert.match(stderr, /EEXISTS/);
		assert.match(stderr, /sub\/b\.md/);
		assert.deepEqual((await readdir(path.join(wiki, NOTES), { recursive: true })).sort(), ['sub', 'sub/b.md']);
		assert.equal(await readFile(path.join(wiki, NOTES, 'sub/b.md'), 'utf8'), 'mine');
	});
});

test('--dry-run prints the plan and writes nothing; --json is one document', async () => {
	await withDirs({ 'a.md': 'a', 'Deep/Dive.md': '---\ntitle: D\ntags: x\n---\nb' }, async ({ vault, wiki }) => {
		const text = await commune('--root', wiki, 'import', vault, '--dry-run');
		assert.equal(text.code, 0);
		assert.match(text.stdout, /Deep\/Dive\.md/);
		assert.match(text.stdout, /dry run/i);
		assert.deepEqual(await readdir(path.join(wiki, 'src/content')), []);
		const { code, json } = await importJson(wiki, vault, '--dry-run');
		assert.equal(code, 0);
		assert.equal(json.schema, 1);
		assert.equal(json.dryRun, true);
		assert.equal(json.summary.imported, 2);
		assert.deepEqual(await readdir(path.join(wiki, 'src/content')), []);
	});
});

test('only reads the vault: its files, bytes and mtimes are unchanged, even when it is read-only', async () => {
	await withDirs(
		{ 'a.md': 'a', 'Deep/Dive.md': '---\ntags: x\n---\nb', '.obsidian/app.json': '{}', 'img.png': 'x' },
		async ({ vault, wiki }) => {
			const before = await tree(vault);
			await importJson(wiki, vault, '--dry-run');
			assert.deepEqual(await tree(vault), before);
			await chmod(path.join(vault, 'Deep'), 0o555);
			await chmod(vault, 0o555);
			const { code } = await importJson(wiki, vault, '--public');
			assert.equal(code, 0);
			assert.deepEqual(await tree(vault), before);
			await chmod(path.join(vault, 'Deep'), 0o755);
		}
	);
});

test('two notes with the same name in different folders are both copied and the shared title is reported', async () => {
	await withDirs({ 'A/Ideas.md': 'a', 'B/Ideas.md': 'b' }, async ({ vault, wiki }) => {
		const { code, json } = await importJson(wiki, vault, '--public');
		assert.equal(code, 0);
		assert.equal(json.summary.imported, 2);
		assert.deepEqual(json.duplicateTitles, [{ title: 'Ideas', files: ['A/Ideas.md', 'B/Ideas.md'] }]);
		const check = await commune('--root', wiki, 'check', '--json');
		assert.equal(check.code, 0);
		assert.ok(JSON.parse(check.stdout).findings.some((f) => f.rule === 'duplicate-name'));
	});
});

test('what it writes loads and checks clean', async () => {
	await withDirs(
		{ 'One.md': 'See [[Two]]', 'sub dir/Two.md': '---\ntags: t\nstatus: Seedling\n---\nBack to [[One]]' },
		async ({ vault, wiki }) => {
			await importJson(wiki, vault, '--public');
			const check = await commune('--root', wiki, 'check', '--json');
			assert.equal(check.code, 0);
			const out = JSON.parse(check.stdout);
			assert.equal(out.summary.entries, 2);
			assert.equal(out.summary.errors, 0);
			assert.equal(out.summary.edges, 2);
		}
	);
});

test('usage errors and bad vaults', async () => {
	await withDirs({ 'a.md': 'a' }, async ({ vault, wiki }) => {
		assert.equal((await commune('--root', wiki, 'import')).code, 2);
		assert.equal((await commune('--root', wiki, 'import', vault, 'extra')).code, 2);
		assert.equal((await commune('--root', wiki, 'import', vault, '--nope')).code, 2);
		assert.equal((await commune('--root', wiki, 'import', path.join(vault, 'missing'))).code, 1);
		await mkdir(path.join(vault, 'empty'));
		assert.equal((await commune('--root', wiki, 'import', path.join(vault, 'empty'))).code, 1);
		assert.equal((await commune('--root', wiki, 'import', path.join(vault, 'a.md'))).code, 1);
		assert.equal((await commune('--root', path.dirname(wiki), 'import', vault)).code, 1);
		const help = await commune('--help');
		assert.match(help.stdout, /import\s+<vault>/);
	});
});

test('refuses a vault that contains the wiki', async () => {
	await withDirs({ 'a.md': 'a' }, async ({ vault }) => {
		await mkdir(path.join(vault, 'wiki/src/content'), { recursive: true });
		const { code, stderr } = await commune('--root', path.join(vault, 'wiki'), 'import', vault);
		assert.equal(code, 1);
		assert.match(stderr, /inside the vault/);
	});
});

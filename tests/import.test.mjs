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
				'bad-yaml.md', 'dup-key.md', 'not-map.md', 'routes.md',
				'tags-nested.md', 'tags-spaces.md', 'title-list.md', 'unclosed.md', 'vis-odd.md',
			]);
			assert.match(skipped['bad-yaml.md'], /YAML/);
			assert.match(skipped['title-list.md'], /title/);
			const found = await readdir(path.join(wiki, NOTES));
			assert.deepEqual(found, ['ok.md']);
			await mkdir(path.join(wiki, '../wiki2/src/content'), { recursive: true });
			const text = await commune('--root', path.join(wiki, '../wiki2'), 'import', vault, '--dry-run');
			assert.match(text.stdout, /skip\s+title-list\.md/);
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

// ---- round 2 ----

import { parse as parseYaml } from 'yaml';

/** What Astro's content layer reads, with its own options. */
const astroRead = (file) => {
	const block = file.split(/\n---/)[0].replace(/^---\n/, '');
	return parseYaml(block, { schema: 'core', merge: true, customTags: ['timestamp'] });
};

const TRICKY_STEMS = [
	'2024-01-15', '2024-01-15 10.30', '2024-01-15T10:30:00', '2024-01-15 10:30:00', '2024-01-15T10:30:00Z',
	'1234', '1.5', '0x1F', 'null', 'Null', 'true', 'False', '~', 'yes', 'no', 'on', 'off', 'y', 'n', '-12', '1_000',
];

test('every title the import writes reads back as the same text under both parsers', async () => {
	const files = Object.fromEntries(TRICKY_STEMS.map((stem) => [`${stem}.md`, 'body\n']));
	await withDirs(files, async ({ vault, wiki, read }) => {
		const { code, json } = await importJson(wiki, vault);
		assert.equal(code, 0);
		assert.equal(json.summary.imported, TRICKY_STEMS.length);
		for (const stem of TRICKY_STEMS) {
			const text = await read(`${stem}.md`);
			assert.strictEqual(astroRead(text).title, stem, `astro reads ${stem}`);
			assert.strictEqual(parseFrontmatter(text).data.title, stem, `graph reads ${stem}`);
		}
		const check = await commune('--root', wiki, 'check', '--json');
		assert.equal(check.code, 0, check.stderr);
	});
});

test('a daily note with no frontmatter checks clean', async () => {
	await withDirs({ '2024-01-15.md': 'Today I [[2024-01-16]].\n', '2024-01-16.md': 'x\n' }, async ({ vault, wiki }) => {
		await importJson(wiki, vault, '--public');
		const check = await commune('--root', wiki, 'check', '--json');
		assert.equal(check.code, 0, check.stderr);
		assert.equal(JSON.parse(check.stdout).summary.errors, 0);
	});
});

test('repairs of title and summary write text that reads back as text', async () => {
	await withDirs(
		{
			'a.md': '---\ntitle: 2024-01-15\nsummary: 2024-01-16\n---\nb',
			'b.md': '---\ntitle: 2024-01-15T10:30:00Z\nsummary: 12\n---\nb',
			'c.md': '---\ntitle: true\nsummary: false\n---\nb',
			'd.md': '---\ntitle:\nsummary: 1e3\n---\nb',
		},
		async ({ vault, wiki, read }) => {
			const { code } = await importJson(wiki, vault);
			assert.equal(code, 0);
			const expect = { 'a.md': ['2024-01-15', '2024-01-16'], 'b.md': ['2024-01-15T10:30:00Z', '12'], 'c.md': ['true', 'false'], 'd.md': ['d', '1e3'] };
			for (const [file, [title, summary]] of Object.entries(expect)) {
				const text = await read(file);
				for (const data of [astroRead(text), parseFrontmatter(text).data]) {
					assert.strictEqual(data.title, title, file);
					assert.strictEqual(data.summary, summary, file);
				}
			}
		}
	);
});

test('--public never publishes a note that says publish: false, draft: true or private: true', async () => {
	await withDirs(
		{
			'Off.md': '---\ntitle: Off\npublish: false\n---\nPUBLISHFALSEMARKER',
			'Off2.md': '---\ntitle: Off2\npublish: False\n---\nx',
			'Off3.md': '---\ntitle: Off3\nPublish: "FALSE"\n---\nx',
			'Drafty.md': '---\ntitle: Drafty\ndraft: true\n---\nDRAFTTRUEMARKER',
			'Drafty2.md': '---\ntitle: Drafty2\nDRAFT: TRUE\n---\nx',
			'Priv.md': '---\ntitle: Priv\nprivate: true\n---\nx',
			'Priv2.md': '---\ntitle: Priv2\nprivate: "True"\n---\nx',
			'Fine.md': '---\ntitle: Fine\npublish: true\ndraft: false\nprivate: false\n---\nx',
			'Explicit.md': '---\ntitle: Explicit\nvisibility: public\npublish: false\n---\nx',
		},
		async ({ vault, wiki, read }) => {
			const { code, json } = await importJson(wiki, vault, '--public');
			assert.equal(code, 0);
			const vis = async (f) => parseFrontmatter(await read(f)).data.visibility;
			for (const f of ['Off', 'Off2', 'Off3', 'Drafty', 'Drafty2', 'Priv', 'Priv2']) {
				assert.notEqual(await vis(`${f}.md`), 'public', f);
			}
			assert.equal(await vis('Fine.md'), 'public');
			assert.equal(await vis('Explicit.md'), 'public', 'an explicit visibility is the author\'s word');
			const held = Object.fromEntries(json.heldPrivate.map((h) => [h.file, h.reason]));
			assert.deepEqual(Object.keys(held).sort(), ['Drafty.md', 'Drafty2.md', 'Off.md', 'Off2.md', 'Off3.md', 'Priv.md', 'Priv2.md']);
			assert.match(held['Off.md'], /publish: false/);
			assert.match(held['Drafty.md'], /draft: true/);
			assert.match(held['Priv.md'], /private: true/);
		}
	);
});

test('the text output lists a note that was held private, with its reason', async () => {
	await withDirs({ 'Off.md': '---\ntitle: Off\npublish: false\n---\nx', 'Ok.md': 'x' }, async ({ vault, wiki }) => {
		const out = await commune('--root', wiki, 'import', vault, '--public', '--dry-run');
		assert.match(out.stdout, /kept private\tOff\.md\tpublish: false/);
		assert.match(out.stdout, /1 public, 1 private/);
	});
});

test('--public keeps a note private when it holds an Obsidian comment outside code', async () => {
	const body = '\nVisible %%SECRETCOMMENTMARKER like this%% text\r\n';
	await withDirs(
		{
			'Commented.md': body,
			'Block.md': 'a\n%%\nhidden\nlines\n%%\nb\n',
			'InFence.md': 'a\n```\n%%not a comment%%\n```\nb\n',
			'InSpan.md': 'a `%%x%%` b\n',
			'Plain.md': '100% sure\n',
		},
		async ({ vault, wiki, read }) => {
			const { code, json } = await importJson(wiki, vault, '--public');
			assert.equal(code, 0);
			const vis = async (f) => parseFrontmatter(await read(f)).data.visibility;
			assert.notEqual(await vis('Commented.md'), 'public');
			assert.notEqual(await vis('Block.md'), 'public');
			assert.equal(await vis('InFence.md'), 'public');
			assert.equal(await vis('InSpan.md'), 'public');
			assert.equal(await vis('Plain.md'), 'public');
			assert.equal(parseFrontmatter(await read('Commented.md')).content, body, 'body is byte for byte');
			const held = Object.fromEntries(json.heldPrivate.map((h) => [h.file, h.reason]));
			assert.deepEqual(Object.keys(held).sort(), ['Block.md', 'Commented.md']);
			assert.match(held['Commented.md'], /%% comment/);
		}
	);
});

test('a note held private is still private without --public, and the folder warning prints when private notes exist', async () => {
	await withDirs({ 'a.md': 'x', 'b.md': '---\ntitle: B\nvisibility: public\n---\nx' }, async ({ vault, wiki }) => {
		const out = await commune('--root', wiki, 'import', vault, '--dry-run');
		assert.match(out.stdout, /Visibility controls the site, not the folder\. Private notes are still files in the wiki, so if the wiki is pushed to a public repo they are public\./);
	});
	await withDirs({ 'b.md': '---\ntitle: B\nvisibility: public\n---\nx' }, async ({ vault, wiki }) => {
		const out = await commune('--root', wiki, 'import', vault, '--dry-run');
		assert.doesNotMatch(out.stdout, /Visibility controls the site/);
	});
});

test('the closing line is true about the gate and tells older wikis what to change', async () => {
	await withDirs({ 'a.md': '---\ntitle: A\nvisibility: public\n---\nx' }, async ({ vault, wiki }) => {
		const out = await commune('--root', wiki, 'import', vault, '--dry-run');
		assert.doesNotMatch(out.stdout, /stops at its gate/);
		assert.match(out.stdout, /commune gate --allow-labels/);
		assert.match(out.stdout, /made before this release/);
	});
});

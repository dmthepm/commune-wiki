/**
 * What two real public vaults (Obsidian's help and a personal vault) showed
 * that the first `commune import` could not handle. Every case builds its own
 * small wiki and vault in a temp directory, so no real note is copied here.
 *
 *  - an embedded image is a real image, and privacy decides which files ship;
 *  - `[[Folder/Note]]` resolves by path;
 *  - `[[Name\|label]]`, as Obsidian writes it inside a table, is a link;
 *  - a status outside the schema costs a value, not a note;
 *  - template frontmatter like `{{date}}` does not print a node warning.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { BIN, commune, run } from './helpers.mjs';
import { dropMapKeyWarning } from '../src/lib/frontmatter.ts';

const NOTES = 'src/content/notes';
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

async function put(dir, file, data) {
	await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
	await writeFile(path.join(dir, file), data);
}

const note = (title, body, extra = '') => `---\ntitle: ${title}\nvisibility: public\n${extra}---\n${body}\n`;

/** A wiki with the given files (paths from the root), removed afterwards. */
async function withWiki(files, fn) {
	const base = await mkdtemp(path.join(tmpdir(), 'commune-real-'));
	const wiki = path.join(base, 'wiki');
	try {
		await mkdir(path.join(wiki, 'src/content'), { recursive: true });
		for (const [file, data] of Object.entries(files)) await put(wiki, file, data);
		return await fn(wiki, base);
	} finally {
		await rm(base, { recursive: true, force: true });
	}
}

const check = async (wiki) => JSON.parse((await commune('--root', wiki, 'check', '--json')).stdout);
const broken = (report) => report.findings.filter((f) => f.rule === 'broken-link').map((f) => f.target);

async function render(wiki, markdown, file) {
	const args = [BIN, '--root', wiki, 'render', file ?? '-', '--site', 'https://example.test'];
	const child = run(process.execPath, args);
	if (!file) child.child.stdin.end(markdown);
	return (await child).stdout.trim();
}

// ---------------------------------------------------------------- images

test('an embedded image that exists is not broken, and one that does not is', async () => {
	await withWiki(
		{
			[`${NOTES}/A.md`]: note('A', '![[photo.png]] and ![[photo.png|300]] and ![[gone.png]]'),
			'public/attachments/photo.png': PNG,
		},
		async (wiki) => {
			assert.deepEqual(broken(await check(wiki)), ['gone.png']);
		}
	);
});

test('an embedded image renders as an img, with a width when the pipe holds a number', async () => {
	await withWiki(
		{
			[`${NOTES}/A.md`]: note('A', 'x'),
			'public/attachments/Pics/my photo.png': PNG,
		},
		async (wiki) => {
			const html = await render(wiki, '![[my photo.png]]\n\n![[Pics/my photo.png|300]]\n\n![[my photo.png|a caption]]\n');
			assert.match(html, /<img src="\/attachments\/Pics\/my%20photo\.png" alt="my photo\.png">/);
			assert.match(html, /<img src="\/attachments\/Pics\/my%20photo\.png" alt="my photo\.png" width="300">/);
			assert.match(html, /<img src="\/attachments\/Pics\/my%20photo\.png" alt="a caption">/);
			assert.doesNotMatch(html, /!|\[\[/);
		}
	);
});

test('an image name that repeats resolves to the nearest folder to the note', async () => {
	await withWiki(
		{
			[`${NOTES}/Alpha/Sub/Note.md`]: note('Note', '![[logo.png]]'),
			[`${NOTES}/Beta/Other.md`]: note('Other', '![[logo.png]]'),
			'public/attachments/Alpha/logo.png': PNG,
			'public/attachments/Beta/logo.png': PNG,
			'public/attachments/Zed/logo.png': PNG,
		},
		async (wiki) => {
			assert.match(await render(wiki, '', `${NOTES}/Alpha/Sub/Note.md`), /src="\/attachments\/Alpha\/logo\.png"/);
			assert.match(await render(wiki, '', `${NOTES}/Beta/Other.md`), /src="\/attachments\/Beta\/logo\.png"/);
		}
	);
});

test('an unresolved image embed renders as it did, as plain text', async () => {
	await withWiki({ [`${NOTES}/A.md`]: note('A', 'x') }, async (wiki) => {
		assert.doesNotMatch(await render(wiki, '![[gone.png]]\n'), /<img/);
	});
});

test('a resolved image is not a graph edge', async () => {
	await withWiki(
		{
			[`${NOTES}/A.md`]: note('A', '![[photo.png]] [[B]]'),
			[`${NOTES}/B.md`]: note('B', 'b'),
			'public/attachments/photo.png': PNG,
		},
		async (wiki) => {
			const report = await check(wiki);
			assert.equal(report.summary.edges, 1);
			assert.equal(report.summary.byRule['broken-link'], 0);
		}
	);
});

// ------------------------------------------------------------ path links

const PATHS = {
	[`${NOTES}/Plugins/Templates.md`]: note('Templates', 'plugin'),
	[`${NOTES}/Core/Templates.md`]: note('Templates', 'core'),
	[`${NOTES}/Top.md`]: note('Top', '[[Plugins/Templates]] [[core/templates.md]] [[Plugins/Missing]]'),
};

test('a link that names a path resolves, with or without .md and in any case', async () => {
	await withWiki(PATHS, async (wiki) => {
		assert.deepEqual(broken(await check(wiki)), ['Plugins/Missing']);
		const html = await render(wiki, '', `${NOTES}/Top.md`);
		assert.match(html, /href="\/notes\/plugins\/templates\/"/);
		assert.match(html, /href="\/notes\/core\/templates\/"/);
	});
});

test('the path picks one of two notes that share a title', async () => {
	await withWiki(PATHS, async (wiki) => {
		const report = await check(wiki);
		// Top reaches both Templates notes, one per path, though the title is shared.
		assert.equal(report.summary.edges, 2);
	});
});

test('a title that holds a slash still wins over a path', async () => {
	await withWiki(
		{
			[`${NOTES}/Odd.md`]: note('Plugins/Templates', 'title wins'),
			[`${NOTES}/Plugins/Templates.md`]: note('Templates', 'file'),
			[`${NOTES}/Top.md`]: note('Top', '[[Plugins/Templates]]'),
		},
		async (wiki) => {
			assert.match(await render(wiki, '', `${NOTES}/Top.md`), /href="\/notes\/odd\/"/);
		}
	);
});

test('a path link is another spelling, so the strict check reports it', async () => {
	await withWiki(PATHS, async (wiki) => {
		const report = await check(wiki);
		const spelled = report.findings.filter((f) => f.rule === 'noncanonical-title').map((f) => f.message);
		assert.ok(spelled.some((m) => m.startsWith('[[Plugins/Templates]]')), spelled.join('\n'));
	});
});

// ----------------------------------------------------------- table links

const TABLE = '| a | b |\n| - | - |\n| [[Target\\|the label]] | x |\n';

test('an escaped pipe in a table is a labelled link, not a broken one', async () => {
	await withWiki(
		{ [`${NOTES}/Target.md`]: note('Target', 't'), [`${NOTES}/A.md`]: note('A', TABLE) },
		async (wiki) => {
			assert.deepEqual(broken(await check(wiki)), []);
			const html = await render(wiki, TABLE);
			assert.match(html, /<a href="\/notes\/target\/" class="wikilink">the label<\/a>/);
		}
	);
});

test('an escaped pipe with a heading and an unlabelled escaped link both resolve', async () => {
	const body = '| a |\n| - |\n| [[Target#Part\\|see]] [[Target\\]] |\n\n## Part\n';
	await withWiki(
		{ [`${NOTES}/Target.md`]: note('Target', '## Part\n'), [`${NOTES}/A.md`]: note('A', body) },
		async (wiki) => {
			assert.deepEqual(broken(await check(wiki)), []);
		}
	);
});

// ---------------------------------------------------------------- import

async function withVault(files, fn, wikiFiles = {}) {
	return withWiki(wikiFiles, async (wiki, base) => {
		const vault = path.join(base, 'Vault');
		await mkdir(vault, { recursive: true });
		for (const [file, data] of Object.entries(files)) await put(vault, file, data);
		const imp = async (...flags) => {
			const r = await commune('--root', wiki, 'import', vault, '--json', ...flags);
			return { ...r, json: r.stdout ? JSON.parse(r.stdout) : undefined };
		};
		try {
			return await fn({ vault, wiki, imp });
		} finally {
			await chmod(vault, 0o755).catch(() => {});
		}
	});
}

const exists = (file) => stat(file).then(() => true, () => false);

test('import copies an image only when a note it leaves public embeds it', async () => {
	await withVault(
		{
			'Public.md': 'see ![[Pics/open.png]] and ![[near.png|200]]\n',
			'Pics/open.png': PNG,
			'Pics/near.png': PNG,
			'Secret.md': '---\nvisibility: private\n---\n![[private-photo.png]] MARKER-7741\n',
			'Draft.md': '---\nvisibility: draft\n---\n![[draft-photo.png]]\n',
			'private-photo.png': PNG,
			'draft-photo.png': PNG,
			'unused.png': PNG,
			'Docs/manual.pdf': 'pdf',
		},
		async ({ wiki, imp }) => {
			const { code, json } = await imp('--public');
			assert.equal(code, 0);
			const att = path.join(wiki, 'public/attachments');
			assert.ok(await exists(path.join(att, 'Pics/open.png')));
			assert.ok(await exists(path.join(att, 'Pics/near.png')));
			assert.ok(!(await exists(path.join(att, 'private-photo.png'))));
			assert.ok(!(await exists(path.join(att, 'draft-photo.png'))));
			assert.ok(!(await exists(path.join(att, 'unused.png'))));
			assert.ok(!(await exists(path.join(att, 'Docs/manual.pdf'))));
			assert.equal(json.images.copied, 2);
			assert.equal(json.images.heldBack, 2);
			assert.equal(json.images.unused, 1);
			assert.equal(json.images.tooLarge.length, 0);
			assert.equal(json.summary.attachments, 6);
			assert.deepEqual(json.images.files.map((f) => f.target).sort(), ['public/attachments/Pics/near.png', 'public/attachments/Pics/open.png']);

			// Nothing is broken and the secret is nowhere under the wiki's public folder.
			const report = await check(wiki);
			assert.deepEqual(broken(report), []);
			const list = await readdir(path.join(wiki, 'public'), { recursive: true });
			assert.ok(!list.some((f) => /private-photo|draft-photo/.test(f)), list.join(','));
		}
	);
});

test('a private note that alone embeds an image copies nothing', async () => {
	await withVault({ 'Secret.md': '---\nvisibility: private\n---\n![[private-photo.png]]\n', 'private-photo.png': PNG }, async ({ wiki, imp }) => {
		await imp('--public');
		assert.ok(!(await exists(path.join(wiki, 'public/attachments'))));
	});
});

test('a note --public leaves private does not count as public for its images', async () => {
	await withVault(
		{ 'Held.md': 'hidden %%comment%% ![[held.png]]\n', 'Drafty.md': 'x\n', 'held.png': PNG },
		async ({ wiki, imp }) => {
			const { json } = await imp('--public');
			assert.equal(json.heldPrivate.length, 1);
			assert.ok(!(await exists(path.join(wiki, 'public/attachments/held.png'))));
			assert.equal(json.images.heldBack, 1);
		}
	);
});

test('an image over 10 MB is listed and not copied', async () => {
	await withVault(
		{ 'A.md': '![[big.png]] ![[small.png]]\n', 'big.png': Buffer.alloc(10 * 1024 * 1024 + 1), 'small.png': PNG },
		async ({ vault, wiki, imp }) => {
			const text = await commune('--root', wiki, 'import', vault, '--public', '--dry-run');
			assert.match(text.stdout, /not copied\tbig\.png\t10\.0 MB/);
			const { json } = await imp('--public');
			assert.equal(json.images.copied, 1);
			assert.deepEqual(json.images.tooLarge.map((f) => f.file), ['big.png']);
			assert.ok(json.images.tooLarge[0].bytes > 10 * 1024 * 1024);
			assert.ok(!(await exists(path.join(wiki, 'public/attachments/big.png'))));
		}
	);
});

test('dry run plans the images and writes nothing', async () => {
	await withVault({ 'A.md': '![[a.png]]\n', 'a.png': PNG }, async ({ wiki, imp }) => {
		const { json } = await imp('--public', '--dry-run');
		assert.equal(json.images.copied, 1);
		assert.ok(!(await exists(path.join(wiki, 'public'))));
		assert.ok(!(await exists(path.join(wiki, NOTES))));
	});
});

test('import never overwrites a file in public, and writes nothing when one is in the way', async () => {
	await withVault(
		{ 'A.md': '![[a.png]]\n', 'a.png': PNG },
		async ({ wiki, imp }) => {
			const { code, stderr } = await imp('--public');
			assert.equal(code, 1);
			assert.match(stderr, /EEXISTS/);
			assert.equal(await readFile(path.join(wiki, 'public/attachments/a.png'), 'utf8'), 'mine');
			assert.ok(!(await exists(path.join(wiki, NOTES))));
		},
		{ 'public/attachments/a.png': 'mine' }
	);
});

test('an image the vault holds in two places is the nearest one to the note', async () => {
	await withVault(
		{ 'Deep/Note.md': '![[x.png]]\n', 'Deep/x.png': PNG, 'Other/x.png': Buffer.concat([PNG, PNG]) },
		async ({ wiki, imp }) => {
			await imp('--public');
			assert.ok(await exists(path.join(wiki, 'public/attachments/Deep/x.png')));
			assert.ok(!(await exists(path.join(wiki, 'public/attachments/Other/x.png'))));
			assert.deepEqual(broken(await check(wiki)), []);
		}
	);
});

test('a status outside the schema loses the value, keeps the note and names the old value', async () => {
	await withVault(
		{
			'One.md': '---\ntitle: One\nstatus:\n  - "[[Published]]"\n---\nbody\n',
			'Two.md': '---\ntitle: Two\nstatus: ["[[Published]]"]\nsummary: s\n---\nbody\n',
			'Three.md': '---\ntitle: Three\nstatus: done\n---\nbody\n',
		},
		async ({ wiki, imp }) => {
			const { json } = await imp('--public');
			assert.equal(json.summary.imported, 3);
			assert.equal(json.summary.skipped, 0);
			const repairs = json.repairs.filter((r) => r.field === 'status');
			assert.equal(repairs.length, 3);
			assert.match(repairs.find((r) => r.file === 'Two.md').message, /\[\[Published\]\]/);
			assert.match(repairs.find((r) => r.file === 'Three.md').message, /"done"/);
			const read = (f) => readFile(path.join(wiki, NOTES, f), 'utf8');
			assert.equal(await read('One.md'), '---\ntitle: One\nvisibility: public\n---\nbody\n');
			assert.equal(await read('Two.md'), '---\ntitle: Two\nsummary: s\nvisibility: public\n---\nbody\n');
			assert.equal(await read('Three.md'), '---\ntitle: Three\nvisibility: public\n---\nbody\n');
		}
	);
});

// ------------------------------------------------- markdown image links

const MD = '![alt](img/mdstyle.png) and ![](img/mdstyle.png) and ![ext](https://example.test/x.png) and ![abs](/abs/x.png)';

test('a markdown image that resolves through the attachments is not broken, one that resolves nowhere is', async () => {
	await withWiki(
		{
			[`${NOTES}/A.md`]: note('A', '![a](img/mdstyle.png) ![b](img/gone.png) ![c](https://example.test/x.png)'),
			'public/attachments/img/mdstyle.png': PNG,
		},
		async (wiki) => {
			const report = await check(wiki);
			assert.deepEqual(broken(report), ['img/gone.png']);
			const finding = report.findings.find((f) => f.rule === 'broken-link');
			assert.equal(finding.file, `${NOTES}/A.md`);
		}
	);
});

test('a relative image beside the note on disk is not broken and is left to Astro', async () => {
	await withWiki(
		{ [`${NOTES}/Dir/A.md`]: note('A', '![a](pics/here%20now.png)'), [`${NOTES}/Dir/pics/here now.png`]: PNG },
		async (wiki) => {
			assert.deepEqual(broken(await check(wiki)), []);
			const html = await render(wiki, '', `${NOTES}/Dir/A.md`);
			// Astro's own marker, with the path as written, means it is left for Astro.
			assert.match(html, /__ASTRO_IMAGE_=.*pics\/here now\.png/);
		}
	);
});

test('a markdown image renders from the attachments, as alt text when it is nowhere, and external ones are untouched', async () => {
	await withWiki({ [`${NOTES}/A.md`]: note('A', 'x'), 'public/attachments/img/mdstyle.png': PNG }, async (wiki) => {
		const html = await render(wiki, `${MD} ![](gone.png) ![lost](gone.png)\n`);
		assert.match(html, /<img src="\/attachments\/img\/mdstyle\.png" alt="alt">/);
		assert.match(html, /<img src="https:\/\/example\.test\/x\.png" alt="ext">/);
		assert.match(html, /<img src="\/abs\/x\.png" alt="abs">/);
		assert.match(html, /lost/);
		assert.doesNotMatch(html, /gone\.png/);
	});
});

test('render and related list a missing markdown image as unresolved, and not one that is there', async () => {
	await withWiki({ [`${NOTES}/A.md`]: note('A', '![a](img/mdstyle.png) ![b](gone.png)'), 'public/attachments/img/mdstyle.png': PNG }, async (wiki) => {
		const rendered = JSON.parse((await commune('--root', wiki, 'render', `${NOTES}/A.md`, '--site', 'https://example.test', '--json')).stdout);
		assert.deepEqual(rendered.unresolved, ['gone.png']);
		const related = JSON.parse((await commune('--root', wiki, 'graph', 'related', `${NOTES}/A.md`, '--json')).stdout);
		assert.equal(related.summary.unresolved, 1);
	});
});

test('import copies a markdown-linked image only when a public note links it, and decodes the path', async () => {
	await withVault(
		{
			'Public.md': '![a](Pics/my%20photo.png) ![b](../outside-missing.png)\n',
			'Pics/my photo.png': PNG,
			'Secret.md': '---\nvisibility: private\n---\n![s](secret-photo.png)\n',
			'secret-photo.png': PNG,
			'unused.png': PNG,
		},
		async ({ wiki, imp }) => {
			const { json } = await imp('--public');
			assert.deepEqual(json.images.files.map((f) => f.target), ['public/attachments/Pics/my photo.png']);
			assert.equal(json.images.heldBack, 1);
			assert.ok(!(await exists(path.join(wiki, 'public/attachments/secret-photo.png'))));
			assert.deepEqual(broken(await check(wiki)), ['../outside-missing.png']);
		}
	);
});

// ------------------------------------------------------ a title that is not text

test('a hand-written title: {{title}} fails check and names the file', async () => {
	await withWiki({ [`${NOTES}/Tpl.md`]: `---\nvisibility: public\ntitle: {{title}}\n---\nbody\n` }, async (wiki) => {
		const result = await commune('--root', wiki, 'check', '--json');
		assert.notEqual(result.code, 0);
		assert.match(result.stderr, /src\/content\/notes\/Tpl\.md/);
		assert.match(result.stderr, /title must be text/);
		assert.doesNotMatch(result.stderr, /trim is not a function/);
	});
});

// ------------------------------------------------- removal keeps its neighbours

const REMOVE_SHAPES = {
	'a block list': 'status:\n  - "[[Published]]"\ncreated: 2024-01-01\n',
	'a block list that is not indented': 'status:\n- "[[Published]]"\ncreated: 2024-01-01\n',
	'a flow list': 'status: ["[[Published]]"]\ncreated: 2024-01-01\n',
	'a scalar': 'status: done\ncreated: 2024-01-01\n',
	'an empty value': 'status:\ncreated: 2024-01-01\n',
	'a block map': 'status:\n  a: 1\n  b: 2\ncreated: 2024-01-01\n',
	'a literal block': 'status: |\n  one\n  two\ncreated: 2024-01-01\n',
	'a value then a blank line': 'status:\n  - x\n\ncreated: 2024-01-01\n',
	'a value then a comment': 'status: [x]\n# note\ncreated: 2024-01-01\n',
	'a trailing comment': 'status: done # why\ncreated: 2024-01-01\n',
};

for (const [shape, yaml] of Object.entries(REMOVE_SHAPES)) {
	for (const eol of ['\n', '\r\n']) {
		test(`removing a bad status keeps every other key: ${shape}${eol === '\r\n' ? ', CRLF' : ''}`, async () => {
			const fm = `title: T\n${yaml}author: me\n`.replace(/\n/g, eol);
			await withVault({ 'N.md': `---${eol}${fm}---${eol}body${eol}` }, async ({ wiki, imp }) => {
				const { json } = await imp('--public');
				assert.equal(json.summary.imported, 1);
				const out = await readFile(path.join(wiki, NOTES, 'N.md'), 'utf8');
				assert.doesNotMatch(out, /status/);
				assert.match(out, /^title: T\r?$/m);
				assert.match(out, /^created: 2024-01-01\r?$/m);
				assert.match(out, /^author: me\r?$/m);
				if (shape.includes('comment') && !shape.includes('trailing')) assert.match(out, /^# note\r?$/m);
			});
		});
	}
}

test('removing the last key keeps the keys before it', async () => {
	await withVault({ 'N.md': '---\ntitle: T\ncreated: 2024-01-01\nstatus:\n  - x\n---\nbody\n' }, async ({ wiki, imp }) => {
		await imp('--public');
		assert.equal(await readFile(path.join(wiki, NOTES, 'N.md'), 'utf8'), '---\ntitle: T\ncreated: 2024-01-01\nvisibility: public\n---\nbody\n');
	});
});

// ------------------------------------------------------- frontmatter noise

const TEMPLATE = '---\ntitle: T\ncreated: {{date}}\n---\nbody\n';

test('template frontmatter prints no node warning, and check still says so', async () => {
	await withWiki({ [`${NOTES}/T.md`]: `---\nvisibility: public\ntitle: T\ncreated: {{date}}\n---\nbody\n` }, async (wiki) => {
		const result = await commune('--root', wiki, 'check', '--json');
		assert.doesNotMatch(result.stderr, /Warning|collection values/);
		const report = JSON.parse(result.stdout);
		const found = report.findings.filter((f) => f.rule === 'frontmatter-warning');
		assert.equal(found.length, 1);
		assert.match(found[0].message, /key/);
	});
});

test('import of template frontmatter prints no node warning either', async () => {
	await withVault({ 'T.md': TEMPLATE }, async ({ wiki }) => {
		const result = await commune('--root', wiki, 'import', path.join(wiki, '..', 'Vault'), '--dry-run');
		assert.doesNotMatch(result.stderr, /Warning|collection values/);
	});
});

test('the build drops yaml\'s map-key warning from Astro\'s own parse, and no other warning', async () => {
	const seen = [];
	const listener = (warning) => seen.push(warning.message);
	process.on('warning', listener);
	try {
		dropMapKeyWarning();
		dropMapKeyWarning();
		parseDocument('date: {{date}}\n').toJS();
		process.emitWarning('a different warning');
		await new Promise((resolve) => setImmediate(resolve));
	} finally {
		process.off('warning', listener);
	}
	assert.deepEqual(seen, ['a different warning']);
});

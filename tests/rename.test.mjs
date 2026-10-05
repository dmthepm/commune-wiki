/**
 * Tests for `commune rename`, the verb that moves a note and rewrites its links.
 *
 * Every test that writes runs against a disposable vault in a temp directory,
 * never `tests/fixtures/vault`. The link-form tests use a purpose-built vault
 * (`withRenameVault`) because the shared fixture has no embeds, block refs or
 * code fences, and adding them there would move counts asserted in other suites.
 * The `check` test is the exception: it runs on a copy of the shared fixture, as
 * that is the vault whose findings are already pinned.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commune, VAULT } from './helpers.mjs';
import { applyPlan } from '../src/cli/rename.ts';

const NOTES = 'src/content/notes';

/** A note, public by default. */
const note = (title, body = '', extra = '') =>
	`---\ntitle: ${title}\nvisibility: public\nstatus: seed\n${extra}---\n\n${body}\n`;

async function put(root, file, text) {
	await mkdir(path.dirname(path.join(root, file)), { recursive: true });
	await writeFile(path.join(root, file), text);
}

const read = (root, file) => readFile(path.join(root, file), 'utf8');

async function exists(file) {
	try {
		await stat(file);
		return true;
	} catch {
		return false;
	}
}

/** A vault with one link of every form pointing at `Old Title`. */
async function withRenameVault(body, extra = {}) {
	const dir = await mkdtemp(path.join(tmpdir(), 'commune-rename-'));
	try {
		await put(dir, `${NOTES}/Old Title.md`, note('Old Title', 'Body of the old note.', extra.frontmatter));
		await put(
			dir,
			`${NOTES}/Linker.md`,
			note(
				'Linker',
				[
					'Plain [[Old Title]] and piped [[Old Title|the label]].',
					'Heading [[Old Title#Some Heading]] and block [[Old Title^abc123]].',
					'Embed ![[Old Title]] and embed with heading ![[Old Title#Some Heading]].',
					'Lowercase [[old title]] too.',
					'Absolute [link](/notes/old-title/) and [fragment](/notes/old-title/#frag) and [bare](/notes/old-title).',
					'Relative [file](./Old%20Title.md) and [angled](<./Old Title.md#Some Heading>).',
					'Through the alias [[Ancient]] stays.',
					'Inline code `[[Old Title]]` stays.',
					'',
					'```md',
					'[[Old Title]] and [x](/notes/old-title/) in a fence',
					'```',
					'',
					'~~~',
					'[[Old Title|tilde fence]]',
					'~~~',
				].join('\n'),
				'links:\n  - Old Title\n  - /notes/old-title/\n  - "[[Old Title#Some Heading]]"\nrelated: "[[Old Title|shown]]"\n'
			)
		);
		await put(dir, `${NOTES}/Other.md`, note('Other', 'Nothing to see.', 'links: [Old Title, Other Thing]\n'));
		await put(dir, `${NOTES}/Private.md`, '---\ntitle: Private\n---\n\nA private note linking [[Old Title]].\n');
		await put(
			dir,
			`${NOTES}/Old Title.md`,
			note('Old Title', 'Self link [[Old Title]].', `aliases:\n  - Ancient\n${extra.frontmatter ?? ''}`)
		);
		await put(dir, 'src/content/updates/2026-10-01.md', `---\ntitle: Update\ndate: 2026-10-01\nlinks:\n  - /notes/old-title/\n---\n\nSee [[Old Title]].\n`);
		return await body(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function graph(root) {
	const { stdout } = await commune('--root', root, 'graph', 'query', '--json');
	return JSON.parse(stdout);
}

const OLD = `${NOTES}/Old Title.md`;
const NEW = `${NOTES}/New Title.md`;

test('every link form is rewritten, and labels, subpaths and embeds are kept', async () => {
	await withRenameVault(async (dir) => {
		const { code, stderr } = await commune('--root', dir, 'rename', OLD, NEW, '--move-url');
		assert.equal(code, 0, stderr);

		const linker = await read(dir, `${NOTES}/Linker.md`);
		assert.match(linker, /Plain \[\[New Title\]\] and piped \[\[New Title\|the label\]\]\./);
		assert.match(linker, /Heading \[\[New Title#Some Heading\]\] and block \[\[New Title\^abc123\]\]\./);
		assert.match(linker, /Embed !\[\[New Title\]\] and embed with heading !\[\[New Title#Some Heading\]\]\./);
		assert.match(linker, /Lowercase \[\[New Title\]\] too\./);
		assert.match(linker, /\[link\]\(\/notes\/new-title\/\)/);
		assert.match(linker, /\[fragment\]\(\/notes\/new-title\/#frag\)/);
		assert.match(linker, /\[bare\]\(\/notes\/new-title\)/);
		assert.match(linker, /\[file\]\(\.\/New%20Title\.md\)/);
		assert.match(linker, /\[angled\]\(<\.\/New Title\.md#Some Heading>\)/);

		// Frontmatter: a bare name, a bare path, a wikilink with a heading, a labelled wikilink.
		assert.match(linker, /links:\n {2}- New Title\n {2}- \/notes\/new-title\/\n {2}- "\[\[New Title#Some Heading\]\]"\n/);
		assert.match(linker, /related: "\[\[New Title\|shown\]\]"/);

		// Other files: inline flow list, a private note, an update.
		assert.match(await read(dir, `${NOTES}/Other.md`), /links: \[New Title, Other Thing\]/);
		assert.match(await read(dir, `${NOTES}/Private.md`), /\[\[New Title\]\]/);
		const update = await read(dir, 'src/content/updates/2026-10-01.md');
		assert.match(update, /- \/notes\/new-title\//);
		assert.match(update, /\[\[New Title\]\]/);

		// The renamed file's own link follows it, and its title.
		const renamed = await read(dir, NEW);
		assert.match(renamed, /^---\ntitle: New Title\n/);
		assert.match(renamed, /Self link \[\[New Title\]\]\./);
		assert.equal(await exists(path.join(dir, OLD)), false);
	});
});

test('code is untouched, and so is a link spelled through an alias', async () => {
	await withRenameVault(async (dir) => {
		await commune('--root', dir, 'rename', OLD, NEW, '--move-url');
		const linker = await read(dir, `${NOTES}/Linker.md`);

		assert.match(linker, /Through the alias \[\[Ancient\]\] stays\./);
		assert.match(linker, /Inline code `\[\[Old Title\]\]` stays\./);
		assert.match(linker, /```md\n\[\[Old Title\]\] and \[x\]\(\/notes\/old-title\/\) in a fence\n```/);
		assert.match(linker, /~~~\n\[\[Old Title\|tilde fence\]\]\n~~~/);
	});
});

test('by default the URL stays, held by a slug pin, and graph query agrees before and after', async () => {
	await withRenameVault(async (dir) => {
		const before = await graph(dir);
		const old = before.entries.find((entry) => entry.file === OLD);

		const { code, stdout } = await commune('--root', dir, 'rename', OLD, NEW);
		assert.equal(code, 0);
		assert.match(stdout, /URL stays \/notes\/old-title\/.*slug: old-title/);

		const after = await graph(dir);
		const moved = after.entries.find((entry) => entry.file === NEW);
		assert.equal(moved.urlPath, old.urlPath);
		assert.equal(moved.title, 'New Title');
		assert.equal(after.entries.some((entry) => entry.file === OLD), false);

		// The inbound edges survived: the same files still link here.
		assert.deepEqual(moved.inbound, old.inbound);
		assert.ok(old.inbound.length >= 3);

		assert.match(await read(dir, NEW), /^---\ntitle: New Title\nslug: old-title\n/);
		// Absolute links to the unchanged URL are not rewritten.
		assert.match(await read(dir, `${NOTES}/Linker.md`), /\[link\]\(\/notes\/old-title\/\)/);
		assert.equal(await exists(path.join(dir, 'public/_redirects')), false);
	});
});

test('--move-url lets the URL follow, removes an existing pin, and writes both redirects', async () => {
	await withRenameVault(async (dir) => {
		await put(dir, OLD, note('Old Title', 'x', 'slug: pinned-slug\n'));
		await put(dir, 'public/_redirects', '/legacy/ /notes/pinned-slug/ 301\n');

		const { code, stdout } = await commune('--root', dir, 'rename', OLD, NEW, '--move-url');
		assert.equal(code, 0);
		assert.match(stdout, /URL moves from \/notes\/pinned-slug\/ to \/notes\/new-title\//);

		assert.equal(/slug:/.test(await read(dir, NEW)), false);
		assert.equal((await graph(dir)).entries.find((entry) => entry.file === NEW).urlPath, '/notes/new-title/');
		assert.equal(
			await read(dir, 'public/_redirects'),
			'/legacy/ /notes/pinned-slug/ 301\n/notes/pinned-slug/ /notes/new-title/ 301\n/notes/pinned-slug.md /notes/new-title.md 301\n'
		);
	});
});

test('--move-url creates _redirects when missing', async () => {
	await withRenameVault(async (dir) => {
		await commune('--root', dir, 'rename', OLD, NEW, '--move-url');
		assert.equal(
			await read(dir, 'public/_redirects'),
			'/notes/old-title/ /notes/new-title/ 301\n/notes/old-title.md /notes/new-title.md 301\n'
		);
	});
});

test('a rename back drops the redirect that would loop', async () => {
	await withRenameVault(async (dir) => {
		await commune('--root', dir, 'rename', OLD, NEW, '--move-url');
		await commune('--root', dir, 'rename', NEW, OLD, '--move-url');
		const redirects = await read(dir, 'public/_redirects');
		assert.equal(redirects, '/notes/new-title/ /notes/old-title/ 301\n/notes/new-title.md /notes/old-title.md 301\n');
	});
});

test('--dry-run prints the plan and writes nothing', async () => {
	await withRenameVault(async (dir) => {
		const snapshot = async () =>
			Object.fromEntries(
				await Promise.all(
					(await readdir(path.join(dir, NOTES))).map(async (name) => [name, await read(dir, `${NOTES}/${name}`)])
				)
			);
		const before = await snapshot();

		const { code, stdout } = await commune('--root', dir, 'rename', OLD, NEW, '--move-url', '--dry-run');
		assert.equal(code, 0);
		assert.match(stdout, /dry run: nothing was written/);
		assert.match(stdout, new RegExp(`move   ${OLD} -> ${NEW}`));
		assert.match(stdout, /Linker\.md:\d+/);
		assert.match(stdout, /\+ .*\[\[New Title\]\]/);
		assert.match(stdout, /URL moves/);

		assert.deepEqual(await snapshot(), before);
		assert.equal(await exists(path.join(dir, 'public/_redirects')), false);
	});
});

test('the title follows the filename only when it was the filename', async () => {
	await withRenameVault(async (dir) => {
		await put(dir, OLD, note('A Different Title', 'x'));
		const { code, stdout } = await commune('--root', dir, 'rename', OLD, NEW);
		assert.equal(code, 0);
		assert.match(stdout, /title left as "A Different Title"/);
		assert.match(await read(dir, NEW), /^---\ntitle: A Different Title\n/);
	});
});

test('refuses when <to> exists', async () => {
	await withRenameVault(async (dir) => {
		const { code, stderr } = await commune('--root', dir, 'rename', OLD, `${NOTES}/Other.md`);
		assert.equal(code, 1);
		assert.match(stderr, /already exists/);
		assert.equal(await exists(path.join(dir, OLD)), true);
	});
});

test('refuses when <from> is not a content entry', async () => {
	await withRenameVault(async (dir) => {
		await put(dir, 'README.md', '# hi\n');
		for (const from of ['README.md', `${NOTES}/Missing.md`, `${NOTES}/Old Title.txt`]) {
			const { code, stderr } = await commune('--root', dir, 'rename', from, `${NOTES}/Anything.md`);
			assert.equal(code, 1, from);
			assert.match(stderr, /not a content entry/);
		}
	});
});

test('refuses when <to> leaves the collection', async () => {
	await withRenameVault(async (dir) => {
		for (const to of ['src/content/research/New Title.md', 'New Title.md', `${NOTES}/../research/New Title.md`]) {
			const { code, stderr } = await commune('--root', dir, 'rename', OLD, to);
			assert.equal(code, 1, to);
			assert.match(stderr, /inside src\/content\/notes/);
		}
		assert.equal(await exists(path.join(dir, OLD)), true);
	});
});

test('refuses a new name that collides with another entry title or alias', async () => {
	await withRenameVault(async (dir) => {
		await put(dir, `${NOTES}/Taken.md`, note('Some Title', 'x', 'aliases:\n  - Spare Name\n'));

		for (const stem of ['Some Title', 'Spare Name']) {
			const { code, stderr } = await commune('--root', dir, 'rename', OLD, `${NOTES}/${stem}.md`);
			assert.equal(code, 1, stem);
			assert.match(stderr, /ambiguous/);
		}
		assert.equal(await exists(path.join(dir, OLD)), true);
	});
});

test('refuses a filename that cannot be written inside a wikilink', async () => {
	await withRenameVault(async (dir) => {
		const { code, stderr } = await commune('--root', dir, 'rename', OLD, `${NOTES}/New #Title.md`);
		assert.equal(code, 1);
		assert.match(stderr, /cannot be written inside a \[\[link\]\]/);
	});
});

test('a wrong invocation is exit 2', async () => {
	await withRenameVault(async (dir) => {
		assert.equal((await commune('--root', dir, 'rename', OLD)).code, 2);
		assert.equal((await commune('--root', dir, 'rename', OLD, NEW, '--nope')).code, 2);
	});
});

test('--json emits one document, on success and on refusal', async () => {
	await withRenameVault(async (dir) => {
		const ok = await commune('--root', dir, 'rename', OLD, NEW, '--move-url', '--dry-run', '--json');
		assert.equal(ok.code, 0);
		assert.equal(ok.stderr, '');
		const payload = JSON.parse(ok.stdout);
		assert.equal(payload.schema, 1);
		assert.equal(payload.dryRun, true);
		assert.equal(payload.written, false);
		assert.equal(payload.from, OLD);
		assert.equal(payload.to, NEW);
		assert.equal(payload.url.decision, 'moved');
		assert.equal(payload.url.new, '/notes/new-title/');
		assert.deepEqual(payload.url.redirects, [
			'/notes/old-title/ /notes/new-title/ 301',
			'/notes/old-title.md /notes/new-title.md 301',
		]);
		assert.equal(payload.title.updated, true);
		assert.ok(payload.links.lines > 10);
		assert.ok(payload.edits.some((edit) => edit.file === `${NOTES}/Linker.md`));

		const refused = await commune('--root', dir, 'rename', OLD, `${NOTES}/Other.md`, '--json');
		assert.equal(refused.code, 1);
		assert.equal(refused.stdout, '');
		assert.equal(JSON.parse(refused.stderr).error.code, 'EEXISTS');
	});
});

test('check reports no new findings after a rename on a copy of the fixture vault', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'commune-rename-fixture-'));
	try {
		await cp(VAULT, dir, { recursive: true });
		const findings = async () => {
			const { stdout } = await commune('--root', dir, 'check', '--json');
			return JSON.parse(stdout).findings.map((f) => f.rule).sort();
		};
		const before = await findings();

		for (const mode of [[], ['--move-url']]) {
			const { code, stderr } = await commune(
				'--root', dir, 'rename', `${NOTES}/Alpha.md`, `${NOTES}/Alpha Renamed.md`, ...mode
			);
			assert.equal(code, 0, stderr);
			assert.deepEqual(await findings(), before);
			await commune('--root', dir, 'rename', `${NOTES}/Alpha Renamed.md`, `${NOTES}/Alpha.md`, ...mode);
		}

		// Beta's inbound link is piped, which is already a finding; renaming it moves the
		// finding with the name and adds none.
		await commune('--root', dir, 'rename', `${NOTES}/Beta.md`, `${NOTES}/Gamma.md`);
		assert.match(await read(dir, `${NOTES}/Alpha.md`), /\[\[Gamma\|the beta note\]\]/);
		assert.deepEqual(await findings(), before);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('--help and the verb usage both list rename', async () => {
	assert.match((await commune('--help')).stdout, /commune \[--root <dir>\] rename +<from> <to>/);
	assert.match((await commune('rename', '--help')).stdout, /--move-url/);
});

/** A small vault in a temp dir, from a map of file to text. */
async function withFiles(files, body) {
	const dir = await mkdtemp(path.join(tmpdir(), 'commune-rename-'));
	try {
		for (const [file, text] of Object.entries(files)) await put(dir, file, text);
		return await body(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Is this disk case-insensitive? Decided at runtime: it is a property of the disk, not the OS. */
async function caseInsensitive() {
	const dir = await mkdtemp(path.join(tmpdir(), 'commune-case-'));
	try {
		await writeFile(path.join(dir, 'Probe'), '');
		return await exists(path.join(dir, 'probe'));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test('a case-only rename keeps the note and its links (case-insensitive disks only)', async (t) => {
	if (!(await caseInsensitive())) return t.skip('this disk is case-sensitive');
	const dir = await mkdtemp(path.join(tmpdir(), 'commune-rename-fixture-'));
	try {
		await cp(VAULT, dir, { recursive: true });
		const before = await read(dir, `${NOTES}/Alpha.md`);
		const { code, stderr } = await commune('--root', dir, 'rename', `${NOTES}/Alpha.md`, `${NOTES}/alpha.md`);
		assert.equal(code, 0, stderr);

		const names = await readdir(path.join(dir, NOTES));
		assert.ok(names.includes('alpha.md'), 'the new spelling is on disk');
		assert.equal(names.includes('Alpha.md'), false, 'the old spelling is gone');
		assert.match(await read(dir, `${NOTES}/alpha.md`), /Links to \[\[Beta\|the beta note\]\]/);
		assert.notEqual(before, '');
		assert.match(await read(dir, `${NOTES}/Beta.md`), /\[\[alpha\]\]/);
		assert.equal((await graph(dir)).entries.some((entry) => entry.file === `${NOTES}/alpha.md`), true);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('the case-only write path never unlinks the source', async () => {
	await withFiles({ [`${NOTES}/Alpha.md`]: 'old content\n' }, async (dir) => {
		const { chmod: realChmod, mkdir: realMkdir, rename, unlink, writeFile: realWrite } = await import('node:fs/promises');
		const unlinked = [];
		const ops = {
			chmod: realChmod,
			mkdir: realMkdir,
			rename,
			writeFile: realWrite,
			unlink: async (file) => {
				unlinked.push(file);
				return unlink(file);
			},
		};
		const edit = {
			file: `${NOTES}/alpha.md`,
			source: `${NOTES}/Alpha.md`,
			before: 'old content\n',
			after: 'new content\n',
			changes: [],
			mode: 0o644,
		};
		await applyPlan(dir, `${NOTES}/Alpha.md`, `${NOTES}/alpha.md`, [edit], undefined, true, ops);

		assert.deepEqual(
			unlinked.filter((file) => !file.includes('.commune-rename-')),
			[],
			'only staging leftovers may be unlinked'
		);
		assert.deepEqual(await readdir(path.join(dir, NOTES)), ['alpha.md']);
		assert.equal(await read(dir, `${NOTES}/alpha.md`), 'new content\n');
	});
});

test('renaming a private note rewrites the links to it, and checks its name against private notes too', async () => {
	await withRenameVault(async (dir) => {
		await put(dir, `${NOTES}/Secret.md`, '---\ntitle: Secret\n---\n\nHidden. Links [[Linker]].\n');
		await put(dir, `${NOTES}/Reader.md`, note('Reader', 'See [[Secret]] and [[Secret|label]] and [file](./Secret.md).'));
		await put(dir, `${NOTES}/Hidden Two.md`, '---\ntitle: Hidden Two\n---\n\nAlso [[Secret#Part]].\n');

		const { code, stdout, stderr } = await commune('--root', dir, 'rename', `${NOTES}/Secret.md`, `${NOTES}/Revealed.md`);
		assert.equal(code, 0, stderr);
		assert.match(stdout, /not published/);
		assert.match(await read(dir, `${NOTES}/Reader.md`), /See \[\[Revealed\]\] and \[\[Revealed\|label\]\] and \[file\]\(\.\/Revealed\.md\)\./);
		assert.match(await read(dir, `${NOTES}/Hidden Two.md`), /\[\[Revealed#Part\]\]/);
		assert.match(await read(dir, `${NOTES}/Revealed.md`), /^---\ntitle: Revealed\n/);

		// A private note's title counts as a name: a public note may not take it.
		await put(dir, `${NOTES}/Quiet.md`, '---\ntitle: Quiet Name\n---\n\nx\n');
		const refused = await commune('--root', dir, 'rename', OLD, `${NOTES}/Quiet Name.md`);
		assert.equal(refused.code, 1);
		assert.match(refused.stderr, /ambiguous/);
	});
});

test('a relative file link is read against its own directory before the basename', async () => {
	const files = {
		[`${NOTES}/Isolated.md`]: note('Isolated', 'x'),
		'src/content/research/Isolated.md': '---\ntitle: Isolated Research\n---\n\ny\n',
		[`${NOTES}/Edge.md`]: note('Edge', 'Here [i](./Isolated.md) and there [r](../research/Isolated.md).'),
	};
	await withFiles(files, async (dir) => {
		const { code, stderr } = await commune('--root', dir, 'rename', `${NOTES}/Isolated.md`, `${NOTES}/Renamed.md`);
		assert.equal(code, 0, stderr);
		assert.match(await read(dir, `${NOTES}/Edge.md`), /\[i\]\(\.\/Renamed\.md\) and there \[r\]\(\.\.\/research\/Isolated\.md\)/);
	});

	await withFiles(
		{ ...files, [`${NOTES}/Edge.md`]: note('Edge', 'Line one.\n\nLost [x](./gone/Isolated.md).') },
		async (dir) => {
			const { code, stderr } = await commune('--root', dir, 'rename', `${NOTES}/Isolated.md`, `${NOTES}/Renamed.md`);
			assert.equal(code, 1);
			assert.match(stderr, /Edge\.md:\d+ \.\/gone\/Isolated\.md/);
			assert.equal(await exists(path.join(dir, `${NOTES}/Isolated.md`)), true);
		}
	);
});

test('refuses an empty or whitespace-padded new name', async () => {
	await withRenameVault(async (dir) => {
		for (const name of ['.md', ' .md', ' Spaced .md']) {
			const { code, stderr } = await commune('--root', dir, 'rename', OLD, `${NOTES}/${name}`);
			assert.equal(code, 1, JSON.stringify(name));
			assert.match(stderr, /not a usable name/);
		}
		assert.equal(await exists(path.join(dir, OLD)), true);
	});
});

test('links inside HTML comments and nested fences are not rewritten', async () => {
	await withRenameVault(async (dir) => {
		await put(
			dir,
			`${NOTES}/Linker.md`,
			note(
				'Linker',
				[
					'<!-- [[Old Title]] one-line comment -->',
					'<!--',
					'[[Old Title]] in a block comment',
					'-->',
					'Live [[Old Title]] after a comment.',
					'````md',
					'```',
					'[[Old Title]] inside the inner fence',
					'```',
					'[[Old Title]] still inside the outer fence',
					'````',
					'Live again [[Old Title]].',
					'~~~~',
					'~~~',
					'[[Old Title]] in a tilde fence',
					'~~~',
					'~~~~',
				].join('\n')
			)
		);
		const { code, stderr } = await commune('--root', dir, 'rename', OLD, NEW, '--move-url');
		assert.equal(code, 0, stderr);
		const linker = await read(dir, `${NOTES}/Linker.md`);
		assert.equal(linker.match(/\[\[New Title\]\]/g).length, 2);
		assert.equal(linker.match(/\[\[Old Title\]\]/g).length, 5);
		assert.match(linker, /<!-- \[\[Old Title\]\] one-line comment -->/);
		assert.match(linker, /Live \[\[New Title\]\] after a comment\./);
		assert.match(linker, /Live again \[\[New Title\]\]\./);
	});
});

test('file modes are kept, and a read-only file is refused by name', async (t) => {
	await withRenameVault(async (dir) => {
		await chmod(path.join(dir, `${NOTES}/Other.md`), 0o640);
		await chmod(path.join(dir, OLD), 0o600);
		const { code, stderr } = await commune('--root', dir, 'rename', OLD, NEW);
		assert.equal(code, 0, stderr);
		assert.equal((await stat(path.join(dir, `${NOTES}/Other.md`))).mode & 0o777, 0o640);
		assert.equal((await stat(path.join(dir, NEW))).mode & 0o777, 0o600);
	});

	if (process.getuid?.() === 0) return t.diagnostic('root ignores write bits; refusal not asserted');
	await withRenameVault(async (dir) => {
		await chmod(path.join(dir, `${NOTES}/Linker.md`), 0o444);
		const { code, stderr } = await commune('--root', dir, 'rename', OLD, NEW);
		assert.equal(code, 1);
		assert.match(stderr, /Linker\.md is read-only/);
		assert.equal(await exists(path.join(dir, OLD)), true, 'nothing was written');
		assert.match(await read(dir, `${NOTES}/Other.md`), /Old Title/);
	});
});

test('--move-url on a page that declares its url says so', async () => {
	await withFiles(
		{ 'src/content/pages/Old Page.md': '---\ntitle: Old Page\nurl: /custom/\n---\n\nx\n' },
		async (dir) => {
			for (const flags of [['--move-url'], []]) {
				const from = (await exists(path.join(dir, 'src/content/pages/Old Page.md'))) ? 'Old Page' : 'New Page';
				const to = from === 'Old Page' ? 'New Page' : 'Old Page';
				const { code, stdout } = await commune(
					'--root', dir, 'rename', `src/content/pages/${from}.md`, `src/content/pages/${to}.md`, ...flags
				);
				assert.equal(code, 0);
				assert.match(stdout, /URL stays \/custom\/; this page declares its own url: in frontmatter/);
			}
			assert.equal(await exists(path.join(dir, 'public/_redirects')), false);
		}
	);
});

/**
 * The skills tree, checked the way the installer checks it.
 *
 * `skills/` is the one part of this repository that no build compiles and no
 * import reaches: it is markdown, read by an agent, installed from GitHub by
 * `npx skills add` rather than out of the npm tarball. Nothing else in this
 * suite would notice if a `SKILL.md` stopped parsing, and neither would a
 * human — the failure shows up as a skill that quietly does not exist on
 * somebody else's machine.
 *
 * That is not hypothetical. The first draft of `commune-ship` carried the
 * description the plan wrote, with an unquoted colon in it — valid prose,
 * invalid YAML — and the installer skipped the whole skill with a warning in
 * the middle of a successful-looking run: "Found 3 skills", exit 0. The parse
 * assertion below is that bug.
 *
 * The rules come from three places, and each one is load-bearing:
 *
 *   - the agentskills specification: `name` is 1-64 lowercase-and-hyphen
 *     characters and *must* match the directory, `description` is 1-1024
 *     characters, references live inside the skill folder;
 *   - research #16 and this repo's plan (D9): `SKILL.md` stays under 100 lines
 *     with the branch material in `references/`, and the description is a
 *     trigger rather than a summary, because a skill that never fires costs its
 *     description line and buys nothing;
 *   - ADR 0001: the shared files are duplicated into every skill so each one
 *     installs alone, which is only safe if drift is a build failure.
 *
 * The install test at the bottom is the real thing — `npx skills add` against
 * this checkout, into a throwaway HOME and a throwaway working directory — and
 * it skips loudly rather than failing when that cannot run, since it is the one
 * assertion here that needs a network and a registry.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import matter from 'gray-matter';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SKILLS = path.join(ROOT, 'skills');

/** The loop, in order, plus the one-time skill. Order is the loop's order. */
const EXPECTED = ['commune-dump', 'commune-write', 'commune-ship', 'commune-setup'];

/** Every verb the CLI routes, longest first — `src/cli/main.ts` ROUTES. */
const ROUTES = ['graph query', 'graph related', 'check', 'gate', 'update', 'render'];

/** Files duplicated across skills on purpose; ADR 0001 explains why. */
const SHARED = [
	['scripts/preflight.mjs', EXPECTED],
	['references/handoffs.md', ['commune-dump', 'commune-write', 'commune-ship']],
];

/** The fixed shape `commune-write` reads. Headings, in order. */
const WRITING_SECTIONS = ['Sentences', 'Titles', 'Notes', 'Frontmatter', 'Avoid', 'Verdicts'];

async function skillFile(name) {
	const file = path.join(SKILLS, name, 'SKILL.md');
	const raw = await readFile(file, 'utf8');
	return { file, raw, parsed: matter(raw) };
}

test('the tree holds exactly the four skills, each with a SKILL.md', async () => {
	const entries = await readdir(SKILLS, { withFileTypes: true });
	const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	assert.deepEqual(dirs.sort(), [...EXPECTED].sort());
	assert.equal(entries.length, dirs.length, 'skills/ holds directories and nothing else');
	for (const name of EXPECTED) {
		assert.ok(existsSync(path.join(SKILLS, name, 'SKILL.md')), `${name}/SKILL.md is missing`);
	}
});

for (const name of EXPECTED) {
	test(`${name}: SKILL.md parses, and its frontmatter is the contract`, async () => {
		// gray-matter throws on the YAML the installer throws on, which is the
		// point: an unquoted colon in a description skips the skill silently.
		const { parsed } = await skillFile(name);
		const data = parsed.data;

		assert.equal(data.name, name, 'name must equal the directory name');
		assert.match(data.name, /^[a-z][a-z0-9-]{0,63}$/, 'name is lowercase and hyphens, 1-64 chars');

		assert.equal(typeof data.description, 'string');
		assert.ok(data.description.length >= 1 && data.description.length <= 1024,
			`description is ${data.description.length} chars; the cap is 1024`);
		// A trigger, not a summary. "This skill…" is a summary of itself and
		// tells the model nothing about when to fire.
		assert.doesNotMatch(data.description, /^(this|the|a|an)\s+skill\b/i,
			'the description leads with the use case, not with "this skill"');
		assert.doesNotMatch(data.description, /^use (this|the) skill\b/i,
			'the description leads with the use case, not with "use this skill"');
		assert.match(data.description, /\bUse when\b/,
			'the description names the trigger with a "Use when" clause');

		assert.match(data.metadata?.version ?? '', /^\d+\.\d+\.\d+$/, 'metadata.version is a semver');
		assert.equal(data.metadata?.['commune-schema'], '1',
			'metadata.commune-schema pins the CLI payload contract');
	});

	test(`${name}: SKILL.md is at most 100 lines`, async () => {
		const { raw } = await skillFile(name);
		const lines = raw.split('\n');
		if (lines.at(-1) === '') lines.pop();
		assert.ok(lines.length <= 100, `SKILL.md is ${lines.length} lines; branch material belongs in references/`);
	});

	test(`${name}: every reference inside the skill resolves`, async () => {
		const dir = path.join(SKILLS, name);
		const files = [path.join(dir, 'SKILL.md')];
		const references = path.join(dir, 'references');
		if (existsSync(references)) {
			for (const entry of await readdir(references)) files.push(path.join(references, entry));
		}
		for (const file of files) {
			const text = await readFile(file, 'utf8');
			for (const [, reference] of text.matchAll(/\b((?:references|scripts|assets|agents)\/[\w.-]+)/g)) {
				assert.ok(existsSync(path.join(dir, reference)),
					`${path.relative(ROOT, file)} points at ${reference}, which does not exist`);
			}
		}
	});

	test(`${name}: every CLI invocation names a verb the CLI routes`, async () => {
		const dir = path.join(SKILLS, name);
		const files = [path.join(dir, 'SKILL.md')];
		const references = path.join(dir, 'references');
		if (existsSync(references)) {
			for (const entry of await readdir(references)) files.push(path.join(references, entry));
		}
		for (const file of files) {
			const text = await readFile(file, 'utf8');
			for (const [, words] of text.matchAll(/\$COMMUNE\s+([a-z][a-z-]*(?:\s+[a-z][a-z-]*)?)/g)) {
				const routed = ROUTES.some((route) => words === route || words.startsWith(`${route} `));
				assert.ok(routed, `${path.relative(ROOT, file)} runs "commune ${words}", which is not a CLI verb`);
			}
		}
	});

	test(`${name}: every script is executable and answers --help`, async () => {
		const dir = path.join(SKILLS, name, 'scripts');
		if (!existsSync(dir)) return;
		const scripts = await readdir(dir);
		assert.ok(scripts.length > 0, 'an empty scripts/ directory installs as nothing; delete it');
		for (const script of scripts) {
			const file = path.join(dir, script);
			const mode = (await stat(file)).mode;
			assert.ok((mode & 0o111) !== 0, `${script} is not executable`);
			const { stdout } = await execFileAsync(process.execPath, [file, '--help'], { cwd: dir });
			assert.ok(stdout.trim().length > 0, `${script} --help printed nothing`);
		}
	});
}

test('commune-setup is user-invoked in both harnesses, and the loop skills are not', async () => {
	const setup = (await skillFile('commune-setup')).parsed.data;
	assert.equal(setup['disable-model-invocation'], true,
		'commune-setup rewrites the wiki\'s writing rules; it fires on the human\'s word');

	// Codex reads only name and description from the frontmatter and defaults
	// allow_implicit_invocation to true, so without this file the skill would be
	// user-invoked in Claude Code and model-invoked in Codex.
	const yaml = await readFile(path.join(SKILLS, 'commune-setup', 'agents', 'openai.yaml'), 'utf8');
	const mirrored = matter(`---\n${yaml}\n---\n`).data;
	assert.equal(mirrored.policy?.allow_implicit_invocation, false);

	for (const name of ['commune-dump', 'commune-write', 'commune-ship']) {
		const data = (await skillFile(name)).parsed.data;
		assert.equal(data['disable-model-invocation'], undefined,
			`${name} is chained by the skill before it; disabling model invocation breaks the loop`);
	}
});

test('each loop skill ends by naming the next one', async () => {
	// There is no router. Three names in loop order, each handing to the next,
	// is the whole invocation rule — so the name has to actually be in the file.
	const chain = [['commune-dump', 'commune-write'], ['commune-write', 'commune-ship']];
	for (const [from, to] of chain) {
		const { raw } = await skillFile(from);
		assert.ok(raw.includes(to), `${from}/SKILL.md never names ${to}`);
	}
});

test('the duplicated files are byte-identical', async () => {
	for (const [reference, owners] of SHARED) {
		const contents = await Promise.all(owners.map((name) => readFile(path.join(SKILLS, name, reference), 'utf8')));
		for (let i = 1; i < contents.length; i += 1) {
			assert.equal(contents[i], contents[0],
				`${owners[i]}/${reference} has drifted from ${owners[0]}/${reference} — ADR 0001 requires the copies to match`);
		}
	}
});

test('the WRITING.md template has the six sections, in order', async () => {
	const template = await readFile(path.join(SKILLS, 'commune-setup', 'assets', 'WRITING.md'), 'utf8');
	const headings = [...template.matchAll(/^## (.+)$/gm)].map(([, heading]) => heading.trim());
	assert.deepEqual(headings, WRITING_SECTIONS);
});

test('skills are not in the npm tarball', async () => {
	// ADR 0001. They install from GitHub via `npx skills add`; packing them would
	// put a second copy on disk that no tool reads and no update refreshes.
	const manifest = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
	assert.ok(!manifest.files.some((entry) => entry.split('/')[0] === 'skills'),
		'package.json `files` must not ship skills/');
});

test('npx skills add installs all four folders, references, scripts and assets included', async (t) => {
	// The only assertion here that needs a registry. It installs project-level
	// into a throwaway working directory, with HOME pointed somewhere throwaway
	// too so a global fallback can never touch the developer's real skills — and
	// with npm's cache left pointing at the real one, since a fresh HOME would
	// otherwise re-download the installer on every run.
	const home = await mkdtemp(path.join(tmpdir(), 'commune-skills-'));
	const work = path.join(home, 'work');
	await execFileAsync('mkdir', ['-p', work]);
	try {
		await execFileAsync('npx', ['--yes', 'skills', 'add', ROOT, '--skill', '*', '-a', 'claude-code', '-y'], {
			cwd: work,
			env: {
				...process.env,
				HOME: home,
				npm_config_cache: process.env.npm_config_cache ?? path.join(homedir(), '.npm'),
			},
			timeout: 240_000,
			maxBuffer: 8 * 1024 * 1024,
		});
	} catch (error) {
		t.skip(`npx skills could not run here, so the install is unverified: ${(error.stderr || error.message).trim().split('\n').at(-1)}`);
		return;
	}

	// It installs project-level next to the working directory, and global when
	// it decides there is no project; accept either, assert the same tree.
	const roots = [
		path.join(work, '.claude', 'skills'),
		path.join(work, '.agents', 'skills'),
		path.join(home, '.claude', 'skills'),
		path.join(home, '.agents', 'skills'),
	];
	const installed = roots.find((candidate) => existsSync(candidate));
	assert.ok(installed, `nothing installed; looked in ${roots.join(', ')}`);

	for (const name of EXPECTED) {
		const dir = path.join(installed, name);
		assert.ok(existsSync(path.join(dir, 'SKILL.md')), `${name} did not install — the installer skips a skill whose YAML does not parse`);
	}
	assert.ok(existsSync(path.join(installed, 'commune-write', 'scripts', 'review.mjs')), 'scripts/ did not install');
	assert.ok(existsSync(path.join(installed, 'commune-write', 'references', 'grill.md')), 'references/ did not install');
	assert.ok(existsSync(path.join(installed, 'commune-setup', 'assets', 'WRITING.md')), 'assets/ did not install');
	assert.ok(existsSync(path.join(installed, 'commune-setup', 'agents', 'openai.yaml')), 'agents/ did not install');
});

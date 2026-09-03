#!/usr/bin/env node
/**
 * The side-by-side review page: original and draft, both through `commune render`.
 *
 * Two surfaces answer two different questions. This one answers *shape* — is
 * the note the right length, does it open on the claim, did the draft quietly
 * drop a link — and it has to answer it before anything is pushed, on one
 * local file with no build and no network. The other surface is the PR's
 * preview URL, where the page is read in the site's chrome and verdicts are
 * given; `commune-ship` opens that one.
 *
 * A diff would not do. Both columns are *rendered*, because a wikilink that no
 * longer resolves looks identical to one that does in markdown source, and the
 * whole point of putting the original beside the draft is to see what the
 * reader will see.
 *
 * Deliberately dependency-free: it shells out to the engine the wiki already
 * has installed, links that package's own stylesheet rather than restating it,
 * and parses nothing it does not have to. The candidate and question text is
 * copied out of the handoff files verbatim, so the margin cannot disagree with
 * the files the next step reads.
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const USAGE = `commune review — one HTML page with the original and the draft side by side

Usage:
  node scripts/review.mjs <base-ref> <path> [options]

  <base-ref>  What the draft is compared against: a git ref (HEAD, main, a sha).
              Use the ref named by \`base:\` in the answers file.
  <path>      The note being drafted, relative to the wiki root.

Options:
  --out <path>       Where to write the page. Default: dumps/<file>.review.html
  --connect <path>   The .connect.md whose candidates go in the margin.
  --answers <path>   The .answers.md whose newest round goes in the margin.
  --help

Run it from the wiki root. It calls node_modules/.bin/commune render and needs
nothing else — no network, no framework, no build.
`;

function fail(message) {
	process.stderr.write(`review: ${message}\n`);
	process.exit(1);
}

function escape(text) {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/** Render markdown through the installed engine, returning its HTML. */
async function render(bin, markdown) {
	const child = execFile(bin, ['render', '-', '--json'], { maxBuffer: 32 * 1024 * 1024 });
	child.stdin.end(markdown);
	const stdout = await new Promise((resolve, reject) => {
		let out = '';
		let err = '';
		child.stdout.on('data', (chunk) => { out += chunk; });
		child.stderr.on('data', (chunk) => { err += chunk; });
		child.on('error', reject);
		child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || `render exited ${code}`))));
	});
	const payload = JSON.parse(stdout);
	if (payload.schema !== 1) fail(`render returned schema ${payload.schema}, this script reads schema 1`);
	return payload;
}

/** The file as of a git ref, or null when the ref does not have it yet. */
async function atRef(ref, file) {
	try {
		const { stdout } = await execFileAsync('git', ['show', `${ref}:${file}`], { maxBuffer: 32 * 1024 * 1024 });
		return stdout;
	} catch {
		return null;
	}
}

/** Everything between the first two `---` lines, verbatim. */
function frontmatter(text) {
	const match = /^---\n([\s\S]*?)\n---/.exec(text);
	return match ? match[1] : '';
}

/** The candidate lists, copied out of connect's frontmatter without a YAML parser. */
function candidates(text) {
	const wanted = ['mentions', 'unmatched', 'unreferenced', 'at_risk'];
	const out = [];
	let current = null;
	for (const line of frontmatter(text).split('\n')) {
		const key = /^([a-z_]+):/.exec(line);
		if (key) current = wanted.includes(key[1]) ? key[1] : null;
		else if (current && line.trim().startsWith('-')) out.push(`${current}: ${line.trim().slice(1).trim()}`);
	}
	return out;
}

/** The newest `## Round N — questions` block, verbatim. */
function questions(text) {
	const blocks = text.split(/^## /m).filter((block) => /^Round \d+ — questions/.test(block));
	const last = blocks.at(-1);
	return last ? last.split('\n').slice(1).join('\n').trim() : '';
}

function page({ file, base, original, draft, marginQuestions, marginCandidates, stylesheet }) {
	const list = (items) => (items.length === 0 ? '<p class="empty">none</p>' : `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>`);
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(path.basename(file))} — original and draft</title>
${stylesheet ? `<link rel="stylesheet" href="${escape(stylesheet)}">` : ''}
<style>
  body { margin: 0; background: var(--c-bg, #fff); color: var(--c-text, #1a1a1a);
         font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  header { padding: 1rem 1.5rem; border-bottom: 1px solid var(--c-border, #e5e5e5); }
  header h1 { font-size: 1rem; margin: 0; font-weight: 600; }
  header p { margin: .25rem 0 0; color: var(--c-text-muted, #6c757d); font-size: .85rem; }
  main { display: grid; grid-template-columns: 1fr 1fr 20rem; gap: 1.5rem; padding: 1.5rem; align-items: start; }
  @media (max-width: 60rem) { main { grid-template-columns: 1fr; } }
  section { min-width: 0; }
  h2 { font-size: .75rem; text-transform: uppercase; letter-spacing: .08em;
       color: var(--c-text-muted, #6c757d); margin: 0 0 .75rem; }
  .col { background: var(--c-bg-soft, #f8f9fa); border: 1px solid var(--c-border, #e5e5e5);
         border-radius: var(--c-radius-md, .75rem); padding: 1.25rem; overflow-wrap: anywhere; }
  .margin { position: sticky; top: 1.5rem; font-size: .85rem; }
  .margin pre { white-space: pre-wrap; font: inherit; margin: 0 0 1rem; }
  .margin ul { padding-left: 1.1rem; margin: 0 0 1rem; }
  .empty { color: var(--c-text-muted, #6c757d); margin: 0 0 1rem; }
</style>
</head>
<body>
<header>
  <h1>${escape(file)}</h1>
  <p>Left: <code>${escape(base)}</code>. Right: the working tree. Both through <code>commune render</code>.</p>
</header>
<main>
  <section><h2>Original</h2><div class="col">${original}</div></section>
  <section><h2>Draft</h2><div class="col">${draft}</div></section>
  <aside class="margin">
    <h2>This round</h2>
    ${marginQuestions ? `<pre>${escape(marginQuestions)}</pre>` : '<p class="empty">no questions yet</p>'}
    <h2>Candidates</h2>
    ${list(marginCandidates)}
  </aside>
</main>
</body>
</html>
`;
}

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
	process.stdout.write(USAGE);
	process.exit(0);
}

const options = { out: null, connect: null, answers: null };
const positional = [];
for (let i = 0; i < argv.length; i += 1) {
	const arg = argv[i];
	if (arg === '--out' || arg === '--connect' || arg === '--answers') {
		const value = argv[i + 1];
		if (value === undefined) fail(`${arg} needs a value`);
		options[arg.slice(2)] = value;
		i += 1;
	} else if (arg.startsWith('--')) fail(`unknown option ${arg}`);
	else positional.push(arg);
}
if (positional.length !== 2) fail(`expected <base-ref> <path>, got ${positional.length} positional arguments\n\n${USAGE}`);

const [base, file] = positional;
const bin = path.join(process.cwd(), 'node_modules', '.bin', 'commune');
if (!existsSync(bin)) fail('no node_modules/.bin/commune — run this from the wiki root');
if (!existsSync(file)) fail(`${file} does not exist`);

const before = await atRef(base, file);
const original = before === null
	? '<p><em>New file. Nothing at this ref to compare against.</em></p>'
	: (await render(bin, before)).html;
const draft = (await render(bin, readFileSync(file, 'utf8'))).html;

const stylesheets = [
	'node_modules/@dmthepm/commune/src/styles/design-system.css',
	'src/styles/design-system.css',
];
const found = stylesheets.find((candidate) => existsSync(candidate));

const out = options.out ?? path.join('dumps', `${path.basename(file, path.extname(file))}.review.html`);
writeFileSync(out, page({
	file,
	base,
	original,
	draft,
	marginQuestions: options.answers && existsSync(options.answers) ? questions(readFileSync(options.answers, 'utf8')) : '',
	marginCandidates: options.connect && existsSync(options.connect) ? candidates(readFileSync(options.connect, 'utf8')) : [],
	// Relative to the page, which lives in dumps/.
	stylesheet: found ? path.relative(path.dirname(path.resolve(out)), path.resolve(found)) : null,
}));
process.stdout.write(`${out}\n`);

#!/usr/bin/env node
/**
 * The preflight every loop skill runs before it touches a file.
 *
 * Two failures this exists to make loud rather than silent:
 *
 *   - The skill drives a *different* CLI than the site builds with. Skills call
 *     the engine the wiki has installed, by path, and never download one — an
 *     `npx -y @dmthepm/commune` would fetch latest per run and drift from the
 *     version `astro build` uses, which is the one thing this package exists to
 *     stop. So the check is "is the installed engine new enough", and the fix
 *     is one line the human runs.
 *   - The payload shape moved under the skill. Every `--json` document carries
 *     `schema`, and a skill that reads keys out of schema 2 as if it were
 *     schema 1 produces a confident wrong answer instead of an error.
 *
 * Deterministic on purpose: a semver comparison written in prose gets done two
 * different ways by two harnesses, and "0.10.0 >= 0.4.0" is exactly the string
 * comparison a language model gets wrong.
 *
 * This file is duplicated byte-for-byte into every loop skill so that each one
 * installs and runs alone; `tests/skills.test.mjs` fails if the copies drift.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** The release that ships `render`, `--unreferenced` and normalised `related`. */
const MIN = '0.4.0';
const FIX = 'Install or update the engine: pnpm add @dmthepm/commune@latest';
const SCHEMA = 1;

const USAGE = `commune skills preflight — check the wiki's installed engine before a skill runs

Usage:
  node scripts/preflight.mjs                 Check node_modules/.bin/commune is >= ${MIN}.
                                             Prints the path to use on stdout.
  node scripts/preflight.mjs --schema        Read one --json payload on stdin and
                                             assert schema === ${SCHEMA}.
  node scripts/preflight.mjs --help

Run it from the wiki root — the directory holding src/content and node_modules.

Exit codes:
  0  fine, carry on
  1  stop the skill and show the printed line to the human
`;

/** `0.4.0` and `0.10.0` compare as numbers, which is the whole point. */
function compare(a, b) {
	const parts = (v) => v.split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
	const [x, y] = [parts(a), parts(b)];
	for (let i = 0; i < 3; i += 1) {
		if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
	}
	return 0;
}

function stop(message) {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

async function readStdin() {
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString('utf8');
}

async function checkSchema() {
	const raw = await readStdin();
	if (raw.trim() === '') stop('Preflight: nothing on stdin. Pipe one --json payload in.');
	let payload;
	try {
		payload = JSON.parse(raw);
	} catch {
		payload = null;
	}
	if (payload === null || typeof payload !== 'object') {
		stop('Preflight: stdin is not one JSON document. The CLI writes JSON on stdout and prose on stderr — pipe stdout only.');
	}
	if (payload.schema !== SCHEMA) {
		stop(`Preflight: payload is schema ${JSON.stringify(payload.schema)}, this skill reads schema ${SCHEMA}. Stop and say so. ${FIX}`);
	}
	process.stdout.write(`schema ${SCHEMA}\n`);
}

async function checkVersion() {
	const bin = path.join(process.cwd(), 'node_modules', '.bin', 'commune');
	if (!existsSync(bin)) {
		stop(`Preflight: no ${path.relative(process.cwd(), bin)}. Run this from the wiki root. ${FIX}`);
	}
	let version;
	try {
		const { stdout } = await execFileAsync(bin, ['--version']);
		version = stdout.trim();
	} catch (error) {
		stop(`Preflight: ${bin} --version failed: ${error.stderr || error.message}`);
	}
	if (!/^\d+\.\d+\.\d+/.test(version)) {
		stop(`Preflight: ${bin} --version printed ${JSON.stringify(version)}, not a version. ${FIX}`);
	}
	if (compare(version, MIN) < 0) {
		stop(`Preflight: this wiki has @dmthepm/commune ${version}; the skills need ${MIN} or newer. ${FIX}`);
	}
	process.stdout.write(`${bin}\n`);
}

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
	process.stdout.write(USAGE);
} else if (argv.includes('--schema')) {
	await checkSchema();
} else if (argv.length > 0) {
	stop(`Preflight: unknown argument ${JSON.stringify(argv[0])}.\n\n${USAGE}`);
} else {
	await checkVersion();
}

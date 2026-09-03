#!/usr/bin/env node

/**
 * The `commune` entry point.
 *
 * One line on purpose, and this is the line #18 promised would change: it now
 * imports the compiled CLI rather than the TypeScript source. Node refuses to
 * strip types from any file under a `node_modules` path, so a `.ts` import here
 * works from a checkout and dies the moment this package is installed.
 *
 * Two things have to be true for the import below to resolve on an install,
 * and both are in `package.json`. `prepare` runs `tsc`, which pnpm executes
 * inside its own clone of a git dependency, so `lib/` gets *built*. And the
 * `files` allowlist names `lib`, so `lib/` gets *packed* — without that field
 * the pack falls back to `.gitignore`, which ignores build output, and the
 * installed package would arrive with a bin and nothing for it to run.
 * `tests/install.test.mjs` and the CI stranger-install step exist to catch
 * exactly that, because a checkout never notices it.
 *
 * The package compiles to `lib/`, not `dist/`: `dist/` is Astro's, and
 * `astro build` empties its output directory before every run, so a site build
 * would delete the CLI that is about to check it.
 *
 * If `lib/` is missing in a checkout, `pnpm build:lib` writes it.
 */

import { run } from '../lib/cli/main.js';

process.exitCode = await run(process.argv.slice(2));

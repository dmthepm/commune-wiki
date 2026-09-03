#!/usr/bin/env node

/**
 * The `commune` entry point.
 *
 * One line on purpose, and this is the line #18 promised would change: it now
 * imports the compiled CLI rather than the TypeScript source. Node refuses to
 * strip types from any file under a `node_modules` path, so a `.ts` import here
 * works from a checkout and dies the moment this package is installed. The
 * compiled `lib/` is produced by `prepare`, which pnpm runs inside its own
 * clone of a git dependency — so the file below exists by the time anyone can
 * execute this one.
 *
 * The package compiles to `lib/`, not `dist/`: `dist/` is Astro's, and
 * `astro build` empties its output directory before every run, so a site build
 * would delete the CLI that is about to check it.
 *
 * If `lib/` is missing in a checkout, `pnpm build:lib` writes it.
 */

import { run } from '../lib/cli/main.js';

process.exitCode = await run(process.argv.slice(2));

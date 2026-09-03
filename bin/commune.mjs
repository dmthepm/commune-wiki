#!/usr/bin/env node

/**
 * The `commune` entry point.
 *
 * One line on purpose, and this is the line #18 promised would change: it now
 * imports the compiled CLI rather than the TypeScript source. Node refuses to
 * strip types from any file under a `node_modules` path, so a `.ts` import here
 * works from a checkout and dies the moment this package is installed. The
 * compiled `dist/` is produced by `prepare`, which pnpm runs inside its own
 * clone of a git dependency — so the file below exists by the time anyone can
 * execute this one.
 *
 * If `dist/` is missing in a checkout, `pnpm build:lib` writes it.
 */

import { run } from '../dist/cli/main.js';

process.exitCode = await run(process.argv.slice(2));

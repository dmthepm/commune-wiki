#!/usr/bin/env node

/**
 * The `commune` entry point.
 *
 * One line on purpose. Node refuses to strip types from any file under a
 * `node_modules` path, so the day this package is consumed through a pnpm
 * `file:` dependency the `.ts` import below stops resolving. Whatever #7
 * chooses to fix that — a `module.registerHooks` shim, compiled output, or a
 * `link:` dependency — is a change to this file and nothing else.
 */

import { run } from '../src/cli/main.ts';

process.exitCode = await run(process.argv.slice(2));

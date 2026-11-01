#!/usr/bin/env node
import { createWiki } from '../bin/create.mjs';

const args = process.argv.slice(2);
if (args.length !== 1 || args[0].startsWith('-')) {
  console.error('Usage: node scripts/create-wiki.mjs <destination>\nChoose a new directory. No dependencies are installed automatically.');
  process.exitCode = 1;
} else {
  process.exitCode = await createWiki(args[0]);
}

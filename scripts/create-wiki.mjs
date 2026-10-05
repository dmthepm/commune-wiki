#!/usr/bin/env node
import { cp, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = await realpath(fileURLToPath(new URL('../examples/starter/', import.meta.url)));
const args = process.argv.slice(2);
if (args.length !== 1 || args[0].startsWith('-')) {
  console.error('Usage: node scripts/create-wiki.mjs <destination>\nChoose a new directory. No dependencies are installed automatically.');
  process.exitCode = 1;
} else {
  try {
    const destination = path.resolve(args[0]);
    // Resolve the nearest existing ancestor too, so a symlink into the
    // starter cannot bypass the source/destination overlap guard.
    let ancestor = destination;
    let resolvedAncestor;
    while (!resolvedAncestor) {
      try { resolvedAncestor = await realpath(ancestor); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        ancestor = path.dirname(ancestor);
      }
    }
    if (resolvedAncestor === source || resolvedAncestor.startsWith(source + path.sep)) {
      throw new Error('Choose a destination outside examples/starter.');
    }
    // Claim a new directory exclusively. Existing directories (even empty
    // ones), files, and symlinks are rejected before any content is copied.
    await mkdir(path.dirname(destination), { recursive: true });
    await mkdir(destination);
    const excluded = new Set(['node_modules', 'dist', '.astro', '.git', '.DS_Store', 'backlinks.json', 'site.json']);
    try {
      for (const entry of await readdir(source)) {
        if (excluded.has(entry)) continue;
        await cp(path.join(source, entry), path.join(destination, entry), {
          recursive: true,
          force: false,
          errorOnExist: true,
          filter: file => !excluded.has(path.basename(file)),
        });
      }
    } catch (error) {
      // The directory was ours alone (mkdir above would have refused an
      // existing one), so a half-copied wiki is removed rather than left
      // to block the retry.
      await rm(destination, { recursive: true, force: true });
      throw error;
    }
    // Say where the wiki is the way the reader named it. A path inside the
    // working directory prints relative, so `my-wiki` does not come back as a
    // two-line absolute path. Anything outside it stays absolute.
    const relative = path.relative(process.cwd(), destination);
    const outside = relative === '' || relative.split(path.sep)[0] === '..' || path.isAbsolute(relative);
    // `./` keeps a name that starts with a dash from reading as an option to `cd`.
    const shown = outside ? destination : relative.startsWith('-') ? `.${path.sep}${relative}` : relative;
    const quoted = /^[\w./-]+$/.test(shown) ? shown : "'" + shown.replaceAll("'", "'\\''") + "'";
    console.log(`Created ${shown}\n\nNext:\n  cd ${quoted}\n  npm install\n  npm run build\n  npm run verify\n  npm run dev\n\nNo dependencies were installed. Read README.md before publishing.`);
  } catch (error) {
    console.error(`Could not create wiki: ${error.message}`);
    process.exitCode = 1;
  }
}

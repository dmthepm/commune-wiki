import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = relative => readFile(path.join(root, relative), 'utf8');

// Every check below is written against the sample notes this starter ships
// with. Once you edit or replace them, a failure here means the samples
// changed, not that your wiki is broken, so the failure says that instead of
// printing a stack trace.
async function verify() {
  const graph = JSON.parse(await read('dist/backlinks.json'));
  const notes = ['welcome', 'connected-notes', 'writing-in-public'];
  const published = notes.map(slug => `/notes/${slug}/`).concat('/updates/2026-09-08/');
  assert.deepEqual(Object.keys(graph).sort(), published.sort(), 'Only the three public notes and update enter search/graph');

  for (const slug of notes) {
    const url = `/notes/${slug}/`;
    const html = await read(`dist/notes/${slug}/index.html`);
    assert.match(html, /id="pane-container"/, `${url} has the pane container`);
    assert.match(html, /class="prose"/, `${url} has the article required by pane delegation`);
    assert.ok(html.includes(`data-backlinks-for="${url}"`), `${url} mounts package backlinks`);
    assert.ok(html.includes(`href="/notes/${slug}.md"`), `${url} links to its markdown twin`);
    assert.match(html, /id="commune-search"/, 'Package static search is mounted');
    assert.equal(await read(`dist/notes/${slug}.md`), await read(`src/content/notes/${slug}.md`), 'Markdown twin preserves source bytes');
  }

  for (const [from, to] of [['welcome', 'connected-notes'], ['connected-notes', 'welcome']]) {
    assert.ok((await read(`dist/notes/${from}/index.html`)).includes(`href="/notes/${to}/"`), `${from} resolves its wikilink to ${to}`);
    assert.ok(graph[`/notes/${to}/`].inbound.includes(`/notes/${from}/`), `${to} has a backlink from ${from}`);
  }
  assert.equal(await read('dist/updates/2026-09-08.md'), await read('src/content/updates/2026-09-08.md'));
  await checkPrivate(path.join(root, 'dist'));
}

async function checkPrivate(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assert.doesNotMatch(entry.name, /(?:private|draft)-example/, 'No private/draft route or twin');
    if (entry.isDirectory()) await checkPrivate(file);
    else if (/\.(?:html|json|md|js)$/.test(entry.name)) {
      assert.doesNotMatch(await readFile(file, 'utf8'), /PRIVATE_STARTER_SENTINEL|DRAFT_STARTER_SENTINEL|Private example|Draft example/, 'No private/draft content in public artifacts');
    }
  }
}

try {
  await verify();
  console.log('Starter verified: three public notes, update, reciprocal links/backlinks, byte-identical markdown twins, pane/search mounts, and private/draft exclusion.');
  console.log('For browser behavior, follow README.md: open two panes, close/Back, and search.');
} catch (error) {
  if (!(error instanceof assert.AssertionError)) throw error;
  console.error(`Sample check failed: ${error.message}`);
  console.error('This script checks the sample notes the starter ships with. If you have edited or replaced them, that is expected.');
  console.error('Check your own content with `npm run check` instead, and remove the "verify" script from package.json once you no longer need it.');
  process.exitCode = 1;
}

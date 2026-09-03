# Commune

A wiki engine for Astro, and a CLI that queries the wiki's link graph without running a build.

Write markdown. Link notes with `[[double brackets]]`. Get a static site where every link resolves both ways, every page has a plain-markdown twin, and the whole graph is one JSON file you can also query from a terminal.

MIT. It runs [devon.md](https://devon.md).

## Install

You need an Astro 7 project on Node 22.12 or newer.

```bash
pnpm add @dmthepm/commune @astrojs/markdown-remark
```

Then three files, and your notes. `astro.config.mjs`, in full:

```js
import { defineConfig } from 'astro/config';
import commune from '@dmthepm/commune/astro';
import { communeMarkdown } from '@dmthepm/commune/markdown';

const site = 'https://example.com';

export default defineConfig({
  site,
  markdown: { processor: communeMarkdown({ site }) },
  integrations: [commune()],
});
```

Astro 7 renders markdown with Sätteri and no longer installs the unified pipeline, so `markdown.processor` is where the wikilink plugins have to go. `site` is a parameter because the engine has no host of its own — it decides what counts as an external link against your origin, which you already declare once.

Commune reads markdown off disk, but Astro will not render a page for it until the collection is registered and something routes it — so copy these two files. `src/content.config.ts`:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const collections = {
  notes: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/notes' }),
    schema: z.object({
      title: z.string(),
      visibility: z.enum(['public', 'private', 'draft']).default('private'),
    }),
  }),
};
```

And `src/pages/notes/[...slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';

export async function getStaticPaths() {
  const notes = await getCollection('notes', (note) => note.data.visibility === 'public');
  return notes.map((note) => ({ params: { slug: note.id }, props: { note } }));
}

const { note } = Astro.props;
const { Content } = await render(note);
---

<html lang="en">
  <head><meta charset="utf-8" /><title>{note.data.title}</title></head>
  <body><h1>{note.data.title}</h1><Content /></body>
</html>
```

Both are the smallest versions that work. [`tests/fixtures/consumer`](tests/fixtures/consumer) is the same project one step further along — it adds the `research` and `pages` collections and imports components off the package — and it is the reference to read when you want the fuller shape.

Notes go in `src/content/notes/`. Two frontmatter fields are load-bearing:

```markdown
---
title: "Hello"
visibility: "public"
---

A link to [[World]], and one to [Astro](https://astro.build).
```

`title` is what `[[Hello]]` matches on. `visibility` defaults to private, so only `public` is published. Build that, and the paragraph renders as:

```html
A link to <a href="/notes/world/" class="wikilink">World</a>, and one to
<a href="https://astro.build" target="_blank" rel="noopener noreferrer">Astro</a>.
```

That route is a starting point, not an interface. The package ships the mechanism and none of `src/pages/` — the markup, the layout and the URL shape are yours to change, and Commune keeps the links inside them working.

## What ships

- **WikiLinks.** `[[Title]]` and `[[Title|Display text]]` become real hrefs at build time, matched against titles and aliases. A link that resolves to nothing stays plain text instead of rendering a dead anchor.
- **Backlinks.** The build writes `backlinks.json` — every entry with its inbound and outbound edges — to `dist/` and `public/`. `Backlinks.astro` renders it on a page.
- **Markdown twins.** Every published content entry gets its source written beside it, so `/notes/hello/` also answers at `/notes/hello.md`. Entries in the content directories only — a hand-written route under `src/pages/` has no source file to twin. Agents and readers get the same document without scraping HTML.
- **External links.** Anything off your `site` origin gets `target="_blank" rel="noopener noreferrer"` without you marking it up.
- **The graph as a library.** `@dmthepm/commune/graph` exports the content loader, the link resolver and the graph builder. The Astro build and the CLI both call it. That is the point: one resolver, not two that drift.
- **Updates.** A fourth collection, `src/content/updates/`, for the dated entries that say what changed. `Updates.astro` renders the newest few as a card. See [Updates](#updates) below.
- **Honest dates.** `updated:` in frontmatter wins where you wrote one; where you did not, the date comes from the file's last commit, and from its mtime in a tree with no history. Every entry says which, so a page can show the honest one. See [Dates](#dates) below.
- **A site-wide last-updated.** The build writes `site.json` beside `backlinks.json`: the newest date across the whole wiki, which entry it belongs to, and the newest commit date whatever the entries claim.
- **Components and stylesheets.** `@dmthepm/commune/components/*.astro` and `@dmthepm/commune/styles/*.css`, shipped as source. These are the components off my own site rather than a theme system — take them as a starting point, not an API.

## Dates

Two frontmatter fields decide a page's dates, and neither is required:

```markdown
---
created: 2025-10-09
updated: 2026-01-21
---
```

Where they are absent the engine reads the repository instead — `updated` is the file's last commit date, `created` its first — from one `git log` walk per build. A tree with no history at all (a tarball, a `COPY` in a Dockerfile, a host with no `git`) falls back to file mtimes rather than failing the build.

Every entry carries `updatedSource`, one of `frontmatter`, `git`, `mtime` or `none`, and `modifiedInGit`, which is the commit date whatever `updated` ended up being. The pair is the point: a note whose `updated:` says January and whose last commit was September changed on a day nobody wrote down, and a page that shows both says so.

### Shallow clones

**A shallow checkout produces no derived dates at all.** In a `--depth 1` clone every file's only commit is the one that was fetched, so every file would date from the day of the build — one confident wrong answer on every entry at once. The engine refuses it rather than reporting it: dates come from frontmatter only, entries without one get `updatedSource: "none"` and no date, and the build prints this once on stderr:

```
git history is shallow: dates come from frontmatter only. Fetch full history (fetch-depth: 0 / unshallow) to derive dates from commits.
```

The same refusal applies to file mtimes anywhere inside a repository, and to a file that has never been committed. Inside a checkout an mtime is the moment the file reached that disk — on CI, the moment of the build — so it is the same falsehood wearing a different hat. mtimes are used in one place only: a project that is not in a repository at all.

The fix is to fetch the history. On **GitHub Actions**, `actions/checkout` defaults to depth 1, so set it explicitly:

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
```

On **Cloudflare Workers Builds**, check the build log for the warning above — if it is there, the clone was shallow. Whether Workers Builds exposes a clone-depth setting is not documented here; if it does not, an alternative is to keep `updated:` in frontmatter for anything whose date matters, which wins over history anyway. A build step that runs `git fetch --unshallow` before the build has the same effect wherever the build has network access and credentials for the repository.

**Known gap: renames.** History is read without `--follow`, so a file's derived `created` is the date of the commit that gave it its current path, not the date the writing began. Renaming a note therefore resets its `created` and leaves `updated` correct. `--follow` is per-file by design — it cannot be asked for in the single batched walk this uses — so the fix is a `created:` in frontmatter, which wins over history.

`commune graph query --json` carries all four fields. The build writes the site-wide version to `site.json`:

```json
{
  "lastUpdated": "2026-09-02",
  "lastUpdatedPath": "/about-this-wiki/",
  "lastUpdatedSource": "frontmatter",
  "lastModifiedInGit": "2026-09-03",
  "entries": 12
}
```

It is a sibling of `backlinks.json` rather than a key inside it, because every top-level key of `backlinks.json` is a urlPath and its readers walk it as one. Generated, not committed: a date derived from history changes on the same commit that changes it, so a committed copy would be stale exactly when it mattered. Add `public/site.json` to your `.gitignore`.

## Updates

A wiki's front door has to answer "what changed" before it answers anything else. Commune's answer is content: one dated entry per batch of work, in `src/content/updates/`, which the graph treats as a collection like any other — twins, backlinks, `check`, `graph query --collection updates`.

```markdown
---
title: "New notes and a working loop"
date: 2026-09-03
summary: "Rewrote the home note and added two notes."
links:
  - Atomic Notes
  - /notes/evergreen-notes/
---

I rewrote the home note. [[Atomic Notes]] and [[Evergreen Notes]] are new.
```

`links:` is the one place in frontmatter where a bare string is a link. Everywhere else a link has to be spelled `[[like this]]` — a page's own `url:` would otherwise become a self-edge — but `links:` means nothing else, so a title or a site path both resolve and both become real edges. Write it or don't: `[[wikilinks]]` in the body work the same way, and naming a page in both places is still one edge.

Register the collection alongside your notes in `src/content.config.ts`:

```ts
updates: defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/updates' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    summary: z.string(),
    aiGenerated: z.boolean().default(false),
    links: z.array(z.string()).default([]),
  }),
}),
```

Then render the card wherever it belongs — the home page, an index, a sidebar:

```astro
---
import Updates from '@dmthepm/commune/components/Updates.astro';
---
<Updates limit={5} heading="Recent updates" />
```

It reads the collection at build time and emits markup. No fetch, no client script.

### A feed

The engine ships no routes, so it ships no RSS either — a feed is a route, and routes are yours. It is two lines with `@astrojs/rss`, in `src/pages/updates/rss.xml.ts`:

```ts
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const updates = await getCollection('updates');
  return rss({
    title: 'Updates',
    description: 'What changed',
    site: context.site,
    items: updates
      .sort((a, b) => b.data.date.localeCompare(a.data.date))
      .map((update) => ({
        title: update.data.title,
        description: update.data.summary,
        pubDate: new Date(`${update.data.date}T12:00:00Z`),
        link: `/updates/${update.id}/`,
      })),
  });
}
```

## The CLI

`commune` installs as a bin. It reads markdown off disk and answers without an Astro process running, which is what makes it useful while you are still writing.

```bash
commune check
commune graph query --collection notes --orphans
commune graph query --recent 7d
commune update --recent 7d
commune graph related src/content/notes/hello.md
echo "a rough dump that mentions World" | commune graph related -
commune render src/content/notes/hello.md
echo '[[World]]' | commune render -
commune gate
```

| Verb | What it answers |
| --- | --- |
| `graph query` | Every entry with its edges and dates. Filter with `--collection`, `--tag`, `--status`, `--orphans`, `--deadends`, `--unreferenced`, `--recent`. |
| `graph related <path\|text\|->` | What this connects to. It takes stdin, so you can ask about a draft before it is a note. Titles are matched across whitespace and case, so a dictated "noon tide" still finds `Noontide`. |
| `render <path\|->` | The markdown as HTML, through the site's own pipeline: WikiLinks resolved, external links marked. Takes stdin, so you can see a draft before it is a page. |
| `update` | Scaffold a dated update entry from what changed. Prints it; `--write` files it. |
| `check` | Broken links, duplicate names, ambiguous targets, non-canonical titles. |
| `gate` | Run after a build, against the built site. |

`--orphans` and `--unreferenced` are different questions and it is worth knowing which one you are asking. An orphan is *isolated* — nothing links to it and it links nowhere — which on a wiki where most notes link out returns almost nothing. `--unreferenced` is zero inbound with any outbound: the note you wrote, cited three others from, and never linked back to from anywhere. `updates` entries are left out of it, since a dated changelog entry is expected to have nothing pointing at it; `--collection updates` is how you say you meant them.

`--recent` takes `7d`, `2w` or a date, and reports the day it resolved to in the summary — which is what a weekly update job needs, since `7d` means a different day tomorrow. Entries with no date at all are not returned: "unchanged since Monday" and "nobody knows" are different answers.

Every verb takes `--json` and emits one document on stdout with everything else on stderr. The human-readable text is the fallback rendering; the JSON is the contract.

`render` is the site's own markdown processor with no Astro process around it — the same `communeMarkdown()` the config hands to `markdown.processor`, so the HTML is the page's HTML rather than a lookalike. It needs the site's origin to decide which links are external: `--site` says it, and without one the Astro config is read for a `site` declaration, falling back to `https://example.com` with a line on stderr saying so. `--json` adds the document's links and the names among them that resolve to nothing, which the HTML cannot tell you — an unresolved WikiLink renders as plain text, exactly as it does on the site.

`update` is the only verb that can write, and it only does so when asked: without `--write` the entry goes to stdout, and with it the command refuses to overwrite an update that already exists. `summary` comes out empty — summarizing a week is a judgement, and the CLI has none.

Exit codes report whether the command finished, never what it found — `0` finished, `1` could not finish, `2` invalid invocation. Findings live in the payload. A command that exits non-zero because it *found* something is indistinguishable, to a shell, from one that crashed. `gate` is the one deliberate exception: a gate's entire job is a yes/no and a build has to stop on it, so `gate` exits `1` when the build it checked is wrong.

`commune --help` prints the full surface. `commune --version` prints the installed version, which is the honest way to know what you have.

## What it is not

It is not a note-taking app and it is not trying to replace one. I write in Obsidian; Commune is what turns the vault into a site. There is no editor here, no sync, no account, no server. The graph is computed from files on disk at build time, and the files are yours whether or not you ever run this.

## Where this is going

Commune is the engine under a larger idea: own your canon. The wiki is one output surface, not the product. What I am building toward is an authoring loop — dictate a dump, have agents find what it already connects to, grill it, draft it, ship it — where the graph is what makes connection-finding possible *before* a draft exists. That is why the graph is a queryable library with a CLI on top instead of a build artifact, and why `graph related` reads stdin.

None of that loop is in this package. `pnpm add @dmthepm/commune` gives you the engine and the CLI above, and nothing else. The authoring skills and the email destination are tracked in [the issues](https://github.com/dmthepm/commune-wiki/issues); when they ship, this section shrinks and the one above it grows.

## Deploy

The build output is `dist/`, a static directory with no runtime, so any static host serves it — see [docs/hosting.md](docs/hosting.md).

## Working on Commune itself

```bash
pnpm install
pnpm dev        # the engine's own wiki, for developing against
pnpm build      # compile lib/, build the site, then gate it
pnpm test       # node --test
```

`pnpm test:consumer` installs `tests/fixtures/consumer` against the working tree and builds it. That fixture is a stranger's project in miniature, and it is the check that catches a package boundary this README describes wrongly.

[CONTRIBUTING.md](CONTRIBUTING.md) has the rest. Issues and questions go to [the tracker](https://github.com/dmthepm/commune-wiki/issues).

## License

MIT — see [LICENSE](LICENSE). Use it, change it, sell it. Keep the copyright notice; that is the whole obligation.

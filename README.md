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
- **Components and stylesheets.** `@dmthepm/commune/components/*.astro` and `@dmthepm/commune/styles/*.css`, shipped as source. These are the components off my own site rather than a theme system — take them as a starting point, not an API.

## The CLI

`commune` installs as a bin. It reads markdown off disk and answers without an Astro process running, which is what makes it useful while you are still writing.

```bash
commune check
commune graph query --collection notes --orphans
commune graph related src/content/notes/hello.md
echo "a rough dump that mentions World" | commune graph related -
commune gate
```

| Verb | What it answers |
| --- | --- |
| `graph query` | Every entry with its edges. Filter with `--collection`, `--tag`, `--status`, `--orphans`, `--deadends`. |
| `graph related <path\|text\|->` | What this connects to. It takes stdin, so you can ask about a draft before it is a note. |
| `check` | Broken links, duplicate names, ambiguous targets, non-canonical titles. |
| `gate` | Run after a build, against the built site. |

Every verb takes `--json` and emits one document on stdout with everything else on stderr. The human-readable text is the fallback rendering; the JSON is the contract.

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

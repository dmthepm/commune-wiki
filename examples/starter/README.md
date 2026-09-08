# Your Commune wiki

A small, editable wiki on the published **@dmthepm/commune** package (0.5.2 or newer) and **Astro 7**. Three public notes link to one another; one update records the beginning. The package supplies sliding panes, backlinks, markdown sources, static search, and the Commune design system. The starter owns the routes and a generic header.

## Start locally

You need **Node.js 22.12.0 or newer**, **npm 9.6.5 or newer**, and an internet connection for the first install. Check with `node --version` and `npm --version`.

From a Commune repository checkout, create a new directory:

```sh
node scripts/create-wiki.mjs ../my-wiki
cd ../my-wiki
npm install
npm run build
npm run verify
npm run dev
```

You can invoke the copier by its absolute path from any working directory. Its destination is relative to your current directory. It refuses an existing destination, including an empty folder or symlink, and never installs dependencies for you. You can also copy this entire `examples/starter` directory yourself; it has no dependency on the surrounding repository.

If you already have this starter as a standalone directory, begin with `npm install` inside it. Open the local URL printed by Astro, normally `http://localhost:4321`.

Expected build output: six HTML pages (home, three notes, update index, one update), `dist/backlinks.json`, `dist/site.json`, and four `.md` sources. `npm run verify` checks the unchanged sample content: two reciprocal wikilinks and backlinks, exact markdown twins, component mounts, and private/draft exclusion. Once you replace the samples, update or remove that sample-specific verification script. `npm run check` checks your current content links; the build also runs Commune’s publication gate.

## Try the reading loop

1. Open **Welcome**, then **Connected notes**. At a viewport at least 1024 pixels wide, both notes remain in panes. On smaller screens links navigate normally.
2. Follow **Writing in public**, close its pane with ×, then use browser Back. Return to a previous thought and check that the URL follows the visible note.
3. Look for **Links to this note** below the writing. Backlinks are populated from the generated graph after JavaScript loads.
4. Click **view as markdown**. `/notes/welcome.md` returns the original source.
5. Click **Search**, or press ⌘K / Ctrl+K, and search for `Connected`. Escape closes the dialog. Search is a static local match over the published graph; there is no AI endpoint or API key to configure.

To test the production output, run `npm run preview` after building. If a link or search result looks stale after editing, restart `npm run dev`, or rebuild and restart preview: the package generates the graph at startup/build time.

## Make it yours

- Edit `src/content/notes/welcome.md`, then add a markdown file with a unique title and `visibility: public` to `src/content/notes/`.
- Link by exact title: `[[Connected notes]]`. Commune’s publication policy requires canonical titles in wikilinks. Its renderer supports aliased labels, but the publication gate intentionally rejects them. Use ordinary markdown links when you need a different label.
- Change **My wiki** in `src/layouts/WikiLayout.astro` and the home introduction in `src/pages/index.astro`.
- Set `site` in `astro.config.mjs` to your deployment origin before publishing. Deploy `dist/` at the domain root. This starter is not configured for a subdirectory such as `/my-wiki/`.
- Adjust `src/styles/wiki.css` using Commune’s `--c-*` design tokens. The imported design system follows your operating system’s light/dark preference.

Example note:

```markdown
---
title: A new thought
visibility: public
status: seedling
summary: Something I want to understand.
tags: [thinking]
---

## A question worth keeping

This connects to [[Welcome]].
```

Optional graph commands (after installing):

```sh
npx commune graph query --unreferenced --json
npx commune graph related src/content/notes/welcome.md --json
```

## What becomes public

Only notes explicitly marked `visibility: public` get HTML routes, graph/search entries, backlinks, or markdown twins. `private`, `draft`, and missing visibility stay unpublished. The included private and draft examples contain harmless test markers, and `npm run verify` searches the output for leaks.

**In Commune, updates, research, and pages are always public.** This starter defines notes and updates only. Its update schema rejects `private` and `draft` visibility. Keep unpublished writing under notes, not updates, research, pages, or `public/`. Everything in `public/` is served as-is. Published markdown twins include the complete frontmatter: do not put secrets in a public note’s metadata.

Visibility controls the generated site, not access to source files in Git. A public source repository exposes its private/draft note files too. Keep your source repository private if it contains confidential writing, and publish only `dist/`.

## First-run troubleshooting and feedback

- An engine/version error: check that your terminal uses Node 22.12+ and npm 9.6.5+.
- Install fails: record the npm error and registry/network settings. The starter installs only published packages, with no monorepo paths.
- A link fails the build: run `npm run check`; check spelling, unique titles, and the target note’s visibility.
- No second pane: use a viewport at least 1024 pixels wide and allow JavaScript. Mobile navigation intentionally uses ordinary pages.
- Search/backlinks are stale: restart the dev server after changing content, or rebuild production output.

Report your first confusing step in [Tell me where it broke (#85)](https://github.com/dmthepm/commune-wiki/issues/85). Include OS, Node/npm versions, minutes elapsed, command, expected result, actual result, and where you found Commune. Do not include private notes or secrets in logs.

A successful automated local install/build is **not** proof that another person can finish on another machine in ten minutes. That human first-run check remains separate.

## License

This starter’s code, documentation, and sample notes are MIT licensed; see [LICENSE](LICENSE). Replace the samples with your writing and choose its license deliberately. The published Commune package is MIT licensed.

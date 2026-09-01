# Research: consuming commune-wiki as raw source via `file:` dep

- **Context:** [noontide-co/commune-wiki#5](https://github.com/noontide-co/commune-wiki/issues/5) (parent map: [#2](https://github.com/noontide-co/commune-wiki/issues/2))
- **Date:** 2026-09-01
- **Question:** Can an Astro 4 consumer (devon-wiki) load remark plugins, Astro integrations, and `.astro` components from a `file:`-linked local package as raw `.ts`/`.astro` source, or must commune-wiki ship a build step (tsup/tsc dist)?
- **Method:** primary sources only — Astro/Vite/Node/pnpm/npm docs and source code (Astro 4.16.x, Vite 5.4.x). No live reproduction was run; every behavior claim below traces to a cited doc or code path.

## Answer (TL;DR)

**No build step required.** Ship raw source — with one carve-out: the entry points that are *executed by Node directly* (the remark plugin and integration factory imported by `astro.config.mjs`, and the CLI `bin` script) must be plain `.js`, because those paths bypass Vite's transform and Node refuses to run `.ts` from inside `node_modules`. Everything else — `.astro` components, and any TS imported from frontmatter/pages — is compiled by Astro's Vite pipeline straight from source, exactly as Astro's own publishing docs recommend. A tsup/tsc dist is unnecessary friction for the `file:` dogfood loop.

---

## (a) remark plugin + integration imported from `astro.config.mjs`

How Astro 4 actually loads the config ([astro@4.16.18 `packages/astro/src/core/config/vite-load.ts`](https://github.com/withastro/astro/blob/astro%404.16.18/packages/astro/src/core/config/vite-load.ts)):

1. For `.mjs`/`.js` config files it first tries a **native Node `import()`**.
2. On any failure it falls back to a throwaway Vite dev server and loads the config through **`server.ssrLoadModule()`** — i.e. through Vite's SSR transform pipeline.

So whether `import remarkWikiLinks from 'commune-wiki/remark-wikilinks'` works from `astro.config.mjs` hinges on Vite SSR **externalization** of that bare import:

- Vite's default: *"all dependencies are externalized except for linked dependencies"* ([Vite SSR options — `ssr.external`](https://vite.dev/config/ssr-options)); the decision is made in [`ssrExternal.ts`](https://github.com/vitejs/vite/blob/v5.4.19/packages/vite/src/node/ssr/ssrExternal.ts) via realpath resolution (`preserveSymlinks: false` default). "Linked" = realpath resolves **outside** `node_modules`.
- Non-externalized (linked) modules go through Vite's transform → raw `.ts` is compiled by esbuild → **works**.
- Externalized modules are handed to Node at runtime → Node must load the file itself. Node's built-in type stripping **explicitly refuses TypeScript under a `node_modules` path**: *"To discourage package authors from publishing packages written in TypeScript, Node.js refuses to handle TypeScript files inside folders under a `node_modules` path"* ([Node.js TypeScript docs](https://nodejs.org/api/typescript.html)). On older Node (18/20, which Astro 4 supports) `.ts` fails with `ERR_UNKNOWN_FILE_EXTENSION` outright. Either way: **fails**.

Which linking mode you get depends on the package manager (see (d)):

| Install mechanism | Layout | Vite sees | Raw `.ts` in `astro.config.mjs` |
|---|---|---|---|
| npm `file:` (default, `install-links: false`) | symlink to source dir ([npm install docs](https://docs.npmjs.com/cli/v10/commands/npm-install)) | linked → not externalized | ✅ works |
| pnpm `link:` | symlink | linked → not externalized | ✅ works |
| **pnpm `file:`** | **hard-linked copy under `node_modules/.pnpm`** ([pnpm link docs](https://pnpm.io/cli/link): "`file:` … the linked package is hard-linked to your project `node_modules`") | realpath inside `node_modules` → **externalized** | ❌ **fails** |

Since devon-wiki uses pnpm and the plan is a `file:` dep in `package.json`, the pnpm row is the one that matters: **raw `.ts` imported from `astro.config.mjs` breaks under pnpm `file:`.** There is no clean consumer-side workaround — `vite.ssr.noExternal` can't help because the fallback config server is created before the user config is known (its `ssr.external` list is hardcoded in `vite-load.ts`).

**Fix, not a build step:** author the config-consumed entry points (`remark-wikilinks`, the backlinks integration factory) as plain `.js`/`.mjs` (JSDoc types optional). Node loads them natively regardless of externalization, and the Vite path also handles them. Alternatively a *tiny* tsup build of just these entry points would work, but plain JS is lower friction.

**`vite.optimizeDeps`:** not involved here (pre-bundling is dev-mode, client-side only — [Vite dep pre-bundling](https://vite.dev/guide/dep-pre-bundling)). For client-side code, linked deps are treated as source and not pre-bundled (must be ESM; add to `optimizeDeps.include` only if the linked dep ships CJS); restart dev with `--force` to pick up changes. Non-linked deps (pnpm `file:` hard-link) *are* pre-bundled, and esbuild handles TS fine, so client-side TS works either way.

## (b) `.astro` components from a linked package

Supported, no build step. Astro's own package-publishing docs state: *"Notice that there was no `build` step for Astro packages. Any file type that Astro supports natively, such as `.astro`, `.ts`, `.jsx`, and `.css`, can be published directly without a build step"* — and show an `exports` map pointing straight at `.astro` files ([Astro — publishing components/integrations](https://docs.astro.build/en/reference/publish-to-npm/)).

The one gotcha is SSR **externalization again**, for dev SSR and for the prerender build: an externalized `.astro` import would be handed to Node, which can't parse it. Astro solves this by auto-detecting "Astro packages" with vitefu's `crawlFrameworkPkgs` and adding them to `ssr.noExternal` ([astro@4.16.18 `packages/astro/src/core/create-vite.ts`](https://github.com/withastro/astro/blob/astro%404.16.18/packages/astro/src/core/create-vite.ts)):

```js
return (
  pkgJson.peerDependencies?.astro ||
  pkgJson.dependencies?.astro ||
  pkgJson.keywords?.includes('astro') ||
  pkgJson.keywords?.includes('astro-component') ||
  /^(?:@[^/]+\/)?astro-/.test(pkgJson.name)
);
```

**Implication for commune-wiki's package.json:** the auto-detection needs at least one signal. `commune-wiki` doesn't match the `astro-*` name pattern, so it must declare `"peerDependencies": { "astro": "^4" }` and/or keywords `astro-integration` / `astro-component`. Without a signal, the consumer must set `vite.ssr.noExternal: ['commune-wiki']` — workable but a footgun, and mandatory under pnpm `file:` (hard-linked realpath never reads as "linked"). Astro also sets `resolve.dedupe: ['astro']` (same file), which keeps a single Astro instance as long as `astro` is a peer dep rather than a bundled copy.

Nested `.astro` imports inside the package are fine once noExternalized (Astro keeps `astro/components` noExternal for exactly this reason — see `ALWAYS_NOEXTERNAL` in `create-vite.ts`).

## (c) CLI `bin` resolution from a linked package

Resolution itself is not the problem: both managers wire a dep's `bin` entries into `node_modules/.bin` — npm via `bin-links` (default true, [npm install docs](https://docs.npmjs.com/cli/v10/commands/npm-install)); pnpm does the same for `file:` deps and additionally installs the linked package's own dependencies, unlike `pnpm link` which requires manual install ([pnpm link docs](https://pnpm.io/cli/link)).

The constraint is the same as (a): the bin script is executed by Node directly (shebang → `node`), so it must be plain `.js`. A `.ts` bin sits under a `node_modules` realpath under pnpm `file:` → Node refuses it per the type-stripping rule. Even under npm `file:` (symlink → realpath outside `node_modules` → modern Node would strip types) it would only work on recent Node with erasable-syntax-only TS — fragile. Ship the bin as `.js`.

## (d) pnpm strict `node_modules` vs npm/yarn flat

- **Phantom deps:** pnpm's non-flat layout symlinks only *direct* dependencies into the root `node_modules` ([pnpm motivation](https://pnpm.io/motivation)). Any import in commune-wiki source that isn't declared in its own `package.json` will fail under pnpm while silently working under npm/yarn hoisting. Audit `dependencies` before dogfooding (e.g. `globby`, `gray-matter`, `unist-util-visit` are used by the current mechanism code and must move with it).
- **Link mechanics:** npm `file:` = symlink to the source folder (with `install-links: false` default); pnpm `file:` = hard-linked copy inside the virtual store; pnpm `link:` = symlink. This decides Vite's linked-detection and therefore the (a) outcome. pnpm recommends `file:` over `link:` for local dev because it *"better resolves the peer dependencies from the project"* ([pnpm link docs](https://pnpm.io/cli/link)) — which is what we want for the `astro` peer.
- **Update propagation:** both symlink and hard-link reflect source *content* edits; with pnpm `file:` hard-links, newly added/renamed files require a re-`pnpm install` to materialize in the virtual store.
- **Vite caches:** after linked-dep changes, restart dev with `--force` if the dep was pre-bundled ([Vite dep pre-bundling](https://vite.dev/guide/dep-pre-bundling)).

## (e) Recommended lowest-friction format

**Raw source, no build step, with JS entry points.** Concretely, for commune-wiki as a single package with subpath exports (charting decision):

```json
{
  "name": "commune-wiki",
  "type": "module",
  "peerDependencies": { "astro": "^4" },
  "keywords": ["astro-integration", "astro-component", "withastro"],
  "exports": {
    "./remark-wikilinks": "./remark-wikilinks.js",
    "./backlinks": "./astro.backlinks.js",
    "./components/*": "./src/components/*.astro",
    "./graph": "./src/graph.ts"
  },
  "bin": { "commune": "./bin/commune.js" }
}
```

- `.js` for the three Node-executed surfaces (remark plugin, integration factory, bin). `.ts`/`.astro` raw everywhere else — Vite/Astro compile them in the consumer.
- `peerDependencies.astro` + keywords do double duty: Astro's `ssr.noExternal` auto-detection (b) and correct peer resolution under pnpm `file:` (d).
- If the package later gets config-consumed surfaces too complex for hand-maintained JS, a minimal tsup pass over *just those entry points* is the fallback — but it's not needed for the dogfood loop, and npm publish (deferred per map #2) doesn't require a dist either, since raw source publishes fine per Astro's docs.

## Sources

- [Astro — Publishing components/integrations to npm](https://docs.astro.build/en/reference/publish-to-npm/) ("no `build` step for Astro packages… `.astro`, `.ts`, `.jsx`, `.css` can be published directly")
- [astro@4.16.18 — `packages/astro/src/core/config/vite-load.ts`](https://github.com/withastro/astro/blob/astro%404.16.18/packages/astro/src/core/config/vite-load.ts) (Node-import-first, Vite `ssrLoadModule` fallback)
- [astro@4.16.18 — `packages/astro/src/core/create-vite.ts`](https://github.com/withastro/astro/blob/astro%404.16.18/packages/astro/src/core/create-vite.ts) (`crawlFrameworkPkgs` → `ssr.noExternal`; `resolve.dedupe: ['astro']`; `ALWAYS_NOEXTERNAL`)
- [Vite — SSR options (`ssr.external`, `ssr.noExternal`)](https://vite.dev/config/ssr-options) ("all dependencies are externalized except for linked dependencies")
- [Vite — Dep Pre-Bundling, Monorepos and Linked Dependencies](https://vite.dev/guide/dep-pre-bundling)
- [vite@v5.4.19 — `packages/vite/src/node/ssr/ssrExternal.ts`](https://github.com/vitejs/vite/blob/v5.4.19/packages/vite/src/node/ssr/ssrExternal.ts) (externalization decision logic)
- [Node.js — TypeScript support](https://nodejs.org/api/typescript.html) (type stripping default; refused under `node_modules`)
- [pnpm — `pnpm link` vs `file:` protocol](https://pnpm.io/cli/link) (symlink vs hard-link; peer dep resolution; dep installation)
- [pnpm — Motivation](https://pnpm.io/motivation) (non-flat `node_modules`, phantom-dep isolation)
- [npm — `npm install`](https://docs.npmjs.com/cli/v10/commands/npm-install) (`file:` symlink semantics, `install-links`, `bin-links`)

# Senior review of the #7 plan — the package boundary

Reviewed 2026-09-03 against worktree `289630f` (= `main`), Node v22.23.1, pnpm 10.19.0, astro 7.2.10 (Vite 8.2.2), TypeScript 5.9.3. devon-wiki read at `b375df1` (Astro 4.16.19), never modified. Frozen junior plan: the #7 body plus its two comments (the 2026-09-02 staleness note and the 2026-09-03 drift note). Every codebase claim below was checked in this worktree; every experiment ran in the session scratchpad on a *copy* of the engine; every best-practice claim carries a fetched source and date or is marked `[training-data, unverified]`.

## Evidence gathered before critique

**Reproductions, this machine, 2026-09-03:**

- `pnpm add github:dmthepm/commune-wiki` into an empty project fetches a codeload tarball into `node_modules/.pnpm/commune-publish@https+++codeload…/node_modules/commune-publish` and `node node_modules/commune-publish/bin/commune.mjs --help` dies with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. #18's M1 holds for git installs as well as `file:`.
- A scratch copy of the engine compiled with `tsc` (`module: NodeNext`, `rewriteRelativeImportExtensions: true`, `declaration: true`) emits `dist/**/*.js` + `.d.ts` with every `./x.ts` import rewritten to `./x.js`. The compiled CLI answers `check --json` on the fixture vault with the same payload as the source CLI.
- **`tsc` fails on today's source.** Three real type errors that `astro check` never ran and Node's type stripping never sees: `src/lib/graph.ts:94` passes `githubSlug` (which takes `(value, maintainCase?)`) straight to `Array.map`; `STAR_CONFIG`'s `as const` fields make five `switch` arms in `calculateStars` (`graph.ts:637-671`) "not comparable"; `remark-wikilinks.ts:14` and `rehype-external-links.ts:9` import `mdast`/`hast` types that are not declared dependencies (they resolve today only through pnpm's hoisted `.pnpm/node_modules`). A `prepare` that runs `tsc` fails the install until these are fixed.
- With those three fixed and `package.json` given `exports`, `files`, `bin → dist`, `prepare: tsc -p tsconfig.build.json`, `peerDependencies.astro ^7`:
  - `pnpm add file:../eng` → hard-link copy under `.pnpm/commune@file+..+eng…`, **`files` allowlist honoured** (no `docs/`, `tests/`, `scripts/`, `public/` copied), compiled bin runs via the `.bin` shim, `import('commune/graph')`, `commune/remark`, `commune/astro` all resolve. **`file:` does not run `prepare`**: with `dist/` deleted in the source, the install succeeds and ships no `dist/`.
  - `pnpm add "git+file://…/eng#v0.1.0-probe"` → pnpm clones, runs `pnpm install` + `prepare` inside the clone (`ERR_PNPM_PREPARE_PACKAGE` when `tsc` failed; success once fixed), installs the package **with `dist/`**, pins the commit hash in `pnpm-lock.yaml`, and the bin runs. Took ~8 s. The pnpm 10 build-script gate ("Ignored build scripts: esbuild") did not block the git dependency's `prepare`.
- **A fresh Astro 7 project consuming the scratch package via `file:` builds green**: `astro.config.mjs` imports `commune/astro`, `commune/remark`, `commune/rehype`; a page imports `commune/components/Header.astro`, `commune/components/Footer.astro`, `commune/styles/design-system.css` and `toMarkdownHref` from `commune/graph`. Output: `[[World]]` rendered as `<a href="/notes/world/" class="wikilink">`, the external link got `target="_blank" rel="noopener noreferrer"`, `dist/backlinks.json` and `dist/notes/hello.md` were written by the integration.
- **Negative test on the `keywords`/peer heuristic:** editing the installed package to `astro: { external: true }` with no `keywords` and no `peerDependencies` **still built**. Cause, read in source: Vite 8's `canExternalizeFile` (`vite/dist/node/chunks/node.js:27468-27471`) only externalizes `.js`/`.mjs`/`.cjs` or extensionless files, so `.astro`, `.css` and `.ts` inside `node_modules` are always bundled. Astro's `isFrameworkPkgByJson` (`astro/dist/core/create-vite.js:84-93`, via `vitefu`'s `crawlFrameworkPkgs`) still adds the package to `noExternal` when it has `peerDependencies.astro`, `dependencies.astro`, keyword `astro`/`astro-component`, or an `astro-` name — that matters for *JS* entry points that import `astro:*` virtual modules, which this package has none of.
- Baselines from the unmodified engine CLI, read-only: devon-wiki `check --json` → 80 entries, 373 edges, 0 `broken-link`, **1 `duplicate-name` error** (`manual-note-refinement-doesnt-scale.md` and `the-higher-self-prompt-in-reflect.md` both answer to "higher self prompt"; content, not mechanism — two more entries than #18's 78 on 2026-09-02). Engine `check --json` → 11 entries, 41 edges, 30 `broken-link` warnings, 0 errors. `git -C devon-wiki status` clean afterwards.
- `npm view commune` → **taken** (`habemus`, 0.0.0, last modified 2022-06-13). `npm view @dmthepm/commune` → 404. `npm view commune-wiki` → 404.

**devon-wiki's copies of engine mechanism** (all marked for deletion by this ticket):

| devon-wiki file | Engine equivalent | Divergence |
|---|---|---|
| `astro.backlinks.ts` (11.4 KB) | `astro.backlinks.ts` (4.6 KB) → `src/lib/graph.ts` | Pre-#3 monolith: own globby scan, own `pathToSlug`, own `extractLinks` (misses `url`-kind links), `dir.pathname` bug, no `.md` writer |
| `remark-wikilinks.ts` (6.9 KB) | `remark-wikilinks.ts` (3.0 KB) | Own scan + raw-basename `pathToSlug` (#22's concern); transformer body identical |
| inline `rehypeExternalLinks` in `astro.config.mjs` | `rehype-external-links.ts` | Hardcodes `devonmeadows.com`; ignores hand-written `target` |
| `scripts/test-search-index.mjs` | `scripts/test-search-index.mjs` | 140 changed lines: fourth copy of the scan and the canonical-title rule |
| `public/graph.json` | none | Artifact from `efedf32`, referenced nowhere — dead |

**devon-wiki files that stay harness-owned:** `src/content/config.ts` (Astro 4 `type: 'content'`, `author` defaults), `src/pages/**` (all hardcode `https://devonmeadows.com`; `index.astro` renders the `my-working-notes` note as home; `herdr.astro` and `printables.astro` hand pages; `llms.txt.ts`, `llms-full.txt.ts`, three `rss.xml.ts`), `src/lib/llms.ts` and `src/lib/rss.ts` (identity-laden, use Astro 4 `entry.slug`), `src/components/**` (`DispatchSignup`, `FeedLinks`, `HoverPreviews` are devon-only; the shared eleven differ by 0–11 lines and are #8's), `src/styles/**` (#8), `functions/api/subscribe.ts` (Cloudflare Pages Function, Resend), `public/_redirects`, `PlausibleScript.astro`, `dumps/`, `.impeccable/`, the `updates` collection and pages.

**Cloudflare Pages** (build image v3 docs, fetched 2026-09-03): default Node 22.16.0, default pnpm 10.11.1, overridable via `NODE_VERSION` / `.nvmrc` / `.node-version`. devon-wiki has none of those files.

**Sources fetched 2026-09-03:** Node v22 `typescript.html` ("refuses to handle TypeScript files inside folders under a `node_modules` path"; type stripping default since v22.18.0; Stability 1.2) and `module.html` (`registerHooks` Stability 1.1 *Active development*, synchronous, in-thread; `stripTypeScriptTypes` Stability 1.2); TypeScript 5.7 notes (`rewriteRelativeImportExtensions`: relative `.ts` → `.js`, never package self-references, no dynamic-expression imports); pnpm `package-sources` (git deps by tag/commit; directory installs described as symlinks — **the current docs describe v12; 10.19.0 observed hard-link copies**), `cli/link` ("pnpm will not install the dependencies of the linked package"), `settings/build` ("a package name on its own never approves builds for a git or tarball dependency"), `cli/install` (`frozen-lockfile` true by default in CI); Astro integrations reference (`astro-integration` keyword for `astro add`; `updateConfig` deep-merges), publish-to-npm guide (`.astro` "can be published directly without a build step"; `exports`, `files`, `keywords` `astro-component`/`withastro`), config reference (`site`; `markdown.processor` accepts `unified()` or `satteri()`), v7 upgrade guide (Sätteri default; `@astrojs/markdown-remark` must be installed to keep remark/rehype).

---

## Senior Review

**Altitude diagnosis:** the junior plan is at the right altitude on *what* crosses the boundary (an `exports` map with the right subpaths, a `bin`, a `files` allowlist, deletion of the harness copies) and wrong on every load-bearing *how*: it targets Astro 4, specifies a cancelled config loader, chooses "no build step" from an analysis that a live reproduction now refutes for both `file:` and git installs, and says nothing about the one fact that decides whether devon-wiki can deploy at all — that Cloudflare Pages cannot see `../commune-wiki`.

### Blockers

- **[B1] devon-wiki is on Astro 4.16.19 and the package will declare `astro ^7`.** The install is refused before any of this ticket's work can be tested on the harness. devon-wiki's own upgrade is the #26 work repeated on the harness: `type: 'content'` collections → `glob()` loaders (or the `legacy.collections` flag), `entry.slug` → `entry.id`, `entry.render()` → `render(entry)`, `@astrojs/tailwind` → inline PostCSS, `sharp` dropped, `markdown.remarkPlugins` → `markdown.processor: unified(...)`. The engine's pages differ from devon-wiki's by 278/282/150/142 lines mostly for this reason. #26 said "devon-wiki is a separate ticket once this lands" and no such ticket exists. — **Fix:** open it and sequence it *before* the harness half of #7, with #26's acceptance test (byte-identical `backlinks.json`, whitespace-only HTML diff). It passes the admission test: distinct outcome, independently schedulable, evidenced, outside #7's contract. Open question 2.

- **[B2] `file:../commune-wiki` cannot be the committed consumption mode, because the deploy machine has no `../commune-wiki`.** devon-wiki builds on Cloudflare Pages from its own checkout; a `file:` specifier to a sibling directory resolves only on Devon's laptop. The junior plan's item 3 ("add `file:` dep") would make the live site unbuildable at the first deploy. `link:` has the same problem plus pnpm's own caveat that linked packages' dependencies are not installed. — **Fix:** the committed specifier is a git tag, `github:dmthepm/commune-wiki#v0.1.0`; reproduced today that pnpm builds a git dependency's `prepare` and pins the commit in the lockfile. `pnpm link ../commune-wiki` is the *uncommitted* local loop. Decision D2.

- **[B3] "No build step" is refuted for every install mode a stranger or a deploy would use.** Reproduced: `github:` tarball → `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`; `file:` → same (#18, 2026-09-02). The three Node-executed surfaces (integration and plugins imported from `astro.config.mjs`, the bin) must be JavaScript on disk. The junior plan's answer, "author them as plain `.js`", would strand `src/lib/graph.ts` — the integration and the remark plugin both import it, so it would have to become `.js` too, and the CLI with it: the whole graph core rewritten out of TypeScript to dodge a compile step. — **Fix:** compile with `tsc` to `dist/` on `prepare`; `.astro` and CSS stay raw. Decision D1, with `registerHooks` and `link:` rejected on evidence.

- **[B4] `tsc` does not pass on the current source, so a `prepare` build fails the install.** Three type errors listed in the evidence, none caught today because nothing type-checks the Node-side files (`astro check` is not in `package.json` or CI). — **Fix:** first commit of the sequence; `tsc -p tsconfig.build.json` becomes the type gate in CI, and `@types/hast` + `@types/mdast` become declared devDependencies.

### Major

- **[M1] The ticket specifies a config loader that was cancelled, and the real config need is smaller than either version of the ticket says.** Every per-wiki value the mechanism needs today is already an Astro config value or fixed by convention: `site` (Astro's own; the rehype plugin already takes it as an option, the integration can read `config.site`), the content directories (`src/content/{notes,research,pages}`, `CONTENT_DIRS` in the core, #17's to change), and the output dir (`astro:build:done`'s `dir`). Nothing needs a generated JSON. — **Fix:** no config file of any kind in this ticket. The integration takes an options object reserved for later (`{}` today) and reads `config.root`/`config.site`/`dir`; the markdown processor is built by an exported helper that takes `{ site }`. Decision D5.

- **[M2] `peerDependencies: astro` + `astro` keyword is presented as the thing that makes raw `.astro` imports work; it is not, on Astro 7 / Vite 8.** Verified by the negative test and by reading `canExternalizeFile`: Vite never externalizes a non-JS file, so `.astro`/`.css`/`.ts` under `node_modules` are bundled unconditionally. The heuristic still matters for JS entry points that touch `astro:*` and for `astro add`/dedupe. — **Fix:** keep `peerDependencies.astro: "^7.0.0"` and the keywords for the right reasons (version contract, `astro add`, `dedupe: ['astro']`), and stop claiming they are what makes components load. Decision D3.

- **[M3] The gate script is the one mechanism file the junior plan deletes from devon-wiki without saying what replaces it.** devon-wiki's `build` is `astro build && node scripts/test-search-index.mjs`; the engine's version imports `../src/lib/graph.ts`, which a consumer cannot reach. The three assertions (pages indexed, canonical titles, page links rendered) need the built `dist/` and the graph. — **Fix:** `commune gate` — a CLI verb whose whole job is yes/no, exit 1 on failure, per the map's Greptile-derived rule that a *gate* may encode its answer. devon-wiki's build becomes `astro build && commune gate`. The engine's own `scripts/test-search-index.mjs` goes too; one implementation, two callers. Decision D6.

- **[M4] devon-wiki's `remark-wikilinks.ts` resolves by raw basename; the engine's core slugifies segments with `github-slugger` and honours frontmatter `slug`.** On devon-wiki's already-slug-named files (`atomic-notes.md`) the two agree, which is why the read-only dogfood resolves all 373 edges; #22 is what makes them disagree. — **Fix:** nothing to build, but the receipt must show `backlinks.json` in devon-wiki byte-identical (or every difference explained) after the swap, exactly as #26 did for the engine. Sequencing step 7.

- **[M5] Package name is undecided and `commune` is taken on npm** (`habemus`, placeholder 0.0.0 from 2022). The name is the import specifier in devon-wiki's config and pages; changing it later is a rename across the harness. npm publish is deferred, but git installs still read `package.json.name` for the `node_modules` directory and `exports` resolution. — **Fix:** `@dmthepm/commune`, bin `commune`. Open question 1 — Devon's answer changes every import line.

- **[M6] `engines.node >=22.18.0` was set for a `.ts` bin and would now over-constrain consumers.** With compiled output the consumer floor is Astro's `>=22.12.0`; Cloudflare Pages defaults to 22.16.0, so devon-wiki would build on the default image. The engine's *tests* still import `.ts` and need 22.18+, but that is a dev-time floor. — **Fix:** `engines.node: ">=22.12.0"`; `.nvmrc` `22` stays for dev and CI; devon-wiki gets a `.node-version` of `22` so Pages and the laptop agree.

### Minor

- **[m1]** `bin/commune.mjs` today imports `../src/cli/main.ts`; #18's D8 bought a one-line change and this is it: `../dist/cli/main.js`. The top-level `remark-wikilinks.ts`, `rehype-external-links.ts`, `astro.backlinks.ts` move under `src/` so `rootDir: src` gives a flat `dist/` (`dist/lib/graph.js`, `dist/cli/main.js`, `dist/remark-wikilinks.js`, `dist/integration.js`). The engine's own `astro.config.mjs` keeps importing `./src/*.ts` raw — Astro loads its config through Vite, which handles `.ts` — and does *not* self-reference the package (TS 5.7 notes: self-references are not rewritten; not worth the trap).
- **[m2]** `@astrojs/markdown-remark` is imported by the consumer's config (for `unified()`), so it is a peer dependency of the package alongside `astro`; `globby`, `gray-matter`, `github-slugger`, `unist-util-visit` are real dependencies (pnpm strict layout, as #5 said). `@astrojs/sitemap`, Tailwind, `autoprefixer`, `@astrojs/check`, `puppeteer`, `typescript`, `@types/*` are devDependencies of the engine site, not of the package.
- **[m3]** The engine's `Footer.astro` links to `/notes/what-is-commune/` and its pages hardcode `https://devonmeadows.com` — identity inside engine components. Not this ticket's (components are #8's), but worth a comment on #8 now that a stranger has built with that footer.
- **[m4]** `public/graph.json` in devon-wiki is a dead artifact (`efedf32`, no references). Delete it in the same PR as the mechanism copies.
- **[m5]** pnpm's current docs describe directory installs as symlinks (v12 semantics); 10.19.0 hard-links. Neither is relied on: the committed mode is a git tag and the dev mode is `pnpm link`.
- **[m6]** `hast`/`mdast` types resolve today only via pnpm's hoisted `.pnpm/node_modules` — a phantom dependency of exactly the kind #5 warned about. Declared in B4's fix.

### What the junior got right

- **The `exports` subpath list is right** — `./graph`, `./remark`, `./astro`, `./components/*`, `./styles/*` — and the consumer build used every one of them plus `./rehype`. Kept, with `./rehype`, `./markdown` and `./package.json` added and `./check` folded into `./graph` (the check functions already live there).
- **`files` allowlist.** Verified that pnpm honours it for `file:` and git installs; it is what keeps 50 Puppeteer scripts and the fixture vault out of a consumer's `node_modules`. Kept.
- **Delete the three copies plus the gate script from devon-wiki**, and "builds with zero local mechanism files" as the resolution condition. Kept, made exact (file list in §3).
- **Declare every imported dependency** (pnpm strict). Kept.
- **The 2026-09-03 comment's drift list** — the inline rehype pass and the raw-basename `pathToSlug` — is accurate and complete for mechanism; the table above adds only the gate script and the dead `graph.json`.
- **Empirically verify the externalization claim.** Done; it changed the answer (M2).

---

## Promoted Plan (v2)

### 1. Goal and non-goals

Make `commune-wiki` an installable package that devon-wiki imports instead of copying: compiled Node-side entry points, raw `.astro`/CSS under subpath exports, a `commune` bin, a `commune gate` build check, and a fresh-project proof that a stranger can install it from a git tag and build. Then make devon-wiki consume it and delete its four copies.

Out of scope: npm publish (deferred by the map); the release mechanism and Dependabot (#33, which cuts `v0.2.0` onward — `v0.1.0` is cut by hand here so devon-wiki has a pin); moving shared components and styles (#8); title-named files (#22); any config file, markdown or JSON; porting remark to Sätteri; devon-wiki content edits beyond deleting mechanism; devon-wiki's Astro 7 upgrade *itself* (B1 — a prerequisite ticket, sequenced first).

### 2. Decisions

| # | Decision | Chosen | Strongest rejected | Evidence |
|---|---|---|---|---|
| D1 | Ship format, Node-side | `tsc` → `dist/` (`NodeNext`, `rewriteRelativeImportExtensions`, `.d.ts`), run by `prepare`; `.astro` and CSS raw | `module.registerHooks` + `stripTypeScriptTypes` in the bin — Stability 1.1 *active development*, only fixes the bin (the integration and plugins are loaded by Astro's config loader, not the bin), and still leaves `.ts` under `node_modules` for the remark plugin's import of the core | Node docs fetched 2026-09-03; `github:` and `file:` repros; compiled-CLI parity on the fixture vault |
| D2 | devon-wiki consumption, committed | `"@dmthepm/commune": "github:dmthepm/commune-wiki#v0.1.0"`; lockfile pins the commit; `pnpm link ../commune-wiki` for uncommitted local iteration | `file:../commune-wiki` — works on the laptop only; Cloudflare Pages has no sibling checkout, and `file:` does not run `prepare` (reproduced) | B2; git+file probe with `prepare`; Pages build-image docs |
| D3 | Astro peer range | `peerDependencies: { astro: "^7.0.0", "@astrojs/markdown-remark": "^7.3.0" }`, `keywords: [astro, astro-integration, withastro]` — for the version contract, `astro add`, `dedupe`; **not** for `.astro` loading, which Vite 8 bundles regardless | Relying on the keyword for externalization (junior plan) — refuted by the negative test | M2; `canExternalizeFile`; `create-vite.js:84-93` |
| D4 | Package name | `@dmthepm/commune`, bin `commune` | `commune` — taken on npm; `commune-wiki` — free, but the import reads `commune-wiki/astro` and the repo can be renamed later without renaming the package | `npm view` 2026-09-03; open question 1 |
| D5 | Config threading | None. Integration `commune({})` reads `config.root`, `config.site`, `dir`; `communeMarkdown({ site })` builds the `unified()` processor with both plugins; `site` lives once, in `defineConfig` | Generated JSON between markdown context files and `astro.config.mjs` (#6's escape hatch) — no value exists yet that Astro's config does not already carry | M1; consumer probe config |
| D6 | Build gate | `commune gate [--root] [--dist]` — the three assertions, exit 1 on failure (a gate verb, per the map's Greptile rule); both repos' `build` = `astro build && commune gate` | Exporting the script under `./scripts/*` and running it with `node node_modules/…` — a path, not a contract | M3; #2 exit-code doctrine |
| D7 | Runtime floor | `engines.node >=22.12.0` (consumers); `.nvmrc` `22` (dev/CI); devon-wiki `.node-version` `22` | Keeping `>=22.18.0` — was for the `.ts` bin; would refuse Pages' default image for no reason | M6; Pages docs |
| D8 | Proof for strangers | `tests/fixtures/consumer/` (minimal Astro 7 project, `file:` to the repo root) built in CI, plus a CI step that installs `git+file://$GITHUB_WORKSPACE#$GITHUB_SHA` into a temp dir and runs the bin — the exact path a `github:` user takes, including `prepare` | Testing only the engine site — never exercises `exports`, `files`, `prepare` or the bin from `node_modules` | consumer probe; git+file probe |
| D9 | Layout | Node-side sources under `src/` (`src/lib`, `src/cli`, `src/remark-wikilinks.ts`, `src/rehype-external-links.ts`, `src/integration.ts`, `src/markdown.ts`), `rootDir: src` → flat `dist/`; engine's own `astro.config.mjs` imports `./src/*.ts` raw, no self-reference | Root-level plugin files (today) — `rootDir: .` puts `dist/src/…` in the map; self-reference — TS does not rewrite it and Vite's config loader was not tested on it | m1; TS 5.7 notes |

### 3. Design

**`package.json` (engine) after this ticket:**

```json
{
  "name": "@dmthepm/commune",
  "version": "0.1.0",
  "type": "module",
  "bin": { "commune": "bin/commune.mjs" },
  "files": ["bin", "dist", "src/components", "src/styles", "src/lib", "src/cli", "src/*.ts", "LICENSE", "README.md"],
  "exports": {
    "./graph":        { "types": "./dist/lib/graph.d.ts",           "default": "./dist/lib/graph.js" },
    "./astro":        { "types": "./dist/integration.d.ts",         "default": "./dist/integration.js" },
    "./markdown":     { "types": "./dist/markdown.d.ts",            "default": "./dist/markdown.js" },
    "./remark":       { "types": "./dist/remark-wikilinks.d.ts",    "default": "./dist/remark-wikilinks.js" },
    "./rehype":       { "types": "./dist/rehype-external-links.d.ts","default": "./dist/rehype-external-links.js" },
    "./components/*": "./src/components/*",
    "./styles/*":     "./src/styles/*",
    "./package.json": "./package.json"
  },
  "keywords": ["astro", "astro-integration", "withastro", "wiki", "wikilinks", "backlinks"],
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "build:lib": "tsc -p tsconfig.build.json",
    "prepare": "pnpm build:lib",
    "pretest": "pnpm build:lib",
    "test": "node --test \"tests/**/*.test.mjs\"",
    "build": "pnpm build:lib && astro build && node bin/commune.mjs gate",
    "test:consumer": "pnpm --dir tests/fixtures/consumer install && pnpm --dir tests/fixtures/consumer build"
  },
  "peerDependencies": { "astro": "^7.0.0", "@astrojs/markdown-remark": "^7.3.0" },
  "dependencies": { "github-slugger": "^2.0.0", "globby": "^14.0.0", "gray-matter": "^4.0.3", "unist-util-visit": "^5.0.0" },
  "devDependencies": { "astro": "^7.2.10", "@astrojs/markdown-remark": "^7.3.0", "@astrojs/sitemap": "^3.7.4", "@astrojs/check": "^0.9.0", "@types/hast": "^3.0.4", "@types/mdast": "^4.0.4", "autoprefixer": "^10.4.16", "tailwindcss": "^3.4.0", "@tailwindcss/typography": "^0.5.10", "puppeteer": "^24.25.0", "typescript": "^5.9.3" }
}
```

`src/components` ships raw because #8 will consume it from here; the `src/lib`/`src/cli`/`src/*.ts` entries in `files` are for source maps and readability only — nothing resolves them.

**`tsconfig.build.json`:** `target ES2022`, `module`/`moduleResolution` `NodeNext`, `rootDir: src`, `outDir: dist`, `declaration: true`, `rewriteRelativeImportExtensions: true`, `allowImportingTsExtensions: true`, `strict: true`, `skipLibCheck: true`, `types: ["node"]`, `include: ["src/lib", "src/cli", "src/*.ts"]` (never `src/components`, `src/pages`, `src/content.config.ts`).

**`bin/commune.mjs`:** the one-line change #18 promised — `import { run } from '../dist/cli/main.js'`.

**`src/integration.ts`** (was `astro.backlinks.ts`):

```ts
export interface CommuneOptions {}   // reserved; v1 takes nothing
export default function commune(_options: CommuneOptions = {}): AstroIntegration
```
`astro:config:setup` gets `root = fileURLToPath(config.root)` and passes `{ root }` to `loadContentEntries`; writes `public/backlinks.json` under `config.publicDir`; `astro:build:done` unchanged except `root` threaded. Name stays `commune-backlinks` so build logs are diffable.

**`src/markdown.ts`:**

```ts
import { unified } from '@astrojs/markdown-remark';
export function communeMarkdown({ site }: { site: string | URL }) {
  return unified({ remarkPlugins: [remarkWikiLinks], rehypePlugins: [[rehypeExternalLinks, { site }]] });
}
```
Not run in the probe (the probe called `unified()` in the consumer config directly, which is the fallback if this helper misbehaves — same plugins, same options).

**`commune gate`** (`src/cli/gate.ts`): `--root <project>` (default cwd), `--dist <dir>` (default `dist`); reads `<publicDir>/backlinks.json` and the built HTML; the three assertions from `scripts/test-search-index.mjs` verbatim; text output `PASS: …`/`FAIL: …` on stderr, exit 1 on any failure, `--json` payload `{ schema: 1, passed: boolean, failures: [...] }`. This is the only `commune` verb whose exit code encodes a finding, and the usage text says so.

**devon-wiki after the swap** — `astro.config.mjs` in full:

```js
import { defineConfig } from 'astro/config';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import sitemap from '@astrojs/sitemap';
import commune from '@dmthepm/commune/astro';
import { communeMarkdown } from '@dmthepm/commune/markdown';

const site = 'https://devonmeadows.com';

export default defineConfig({
  site,
  markdown: { processor: communeMarkdown({ site }) },
  vite: { css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } } },
  integrations: [commune(), sitemap({ changefreq: 'weekly', priority: 0.7, lastmod: new Date() })],
});
```

`package.json`: `"@dmthepm/commune": "github:dmthepm/commune-wiki#v0.1.0"`, `"@astrojs/markdown-remark": "^7.3.0"`, `build: "astro build && commune gate"`, and `globby`, `gray-matter`, `unist-util-visit` removed (nothing in the harness imports them once the copies go). Pages that need `toMarkdownHref` (#31's harness half) import it from `@dmthepm/commune/graph`.

**devon-wiki deletes:** `astro.backlinks.ts`, `remark-wikilinks.ts`, the inline `rehypeExternalLinks` function and the `visit` import in `astro.config.mjs`, `scripts/test-search-index.mjs`, `public/graph.json`.

**devon-wiki keeps (harness-owned):** `src/content/config.ts`, everything under `src/pages/`, `src/components/` (incl. `DispatchSignup`, `FeedLinks`, `HoverPreviews`, `PlausibleScript`), `src/styles/`, `src/lib/llms.ts`, `src/lib/rss.ts`, `functions/`, `public/_redirects`, `public/backlinks.json` (committed, regenerated), the `updates` collection, `dumps/`, `.impeccable/`, `scripts/*.cjs|js|mjs|png` (Puppeteer checks; both repos carry them; not this ticket's).

**Fixture consumer** (`tests/fixtures/consumer/`): the probe project, checked in — `package.json` with `"@dmthepm/commune": "file:../../.."`, `astro.config.mjs` as above with `site: 'https://example.com'`, `src/content.config.ts` (three loaders), two notes linking each other plus one external link, one page route importing `Header`, `Footer`, `design-system.css` and `toMarkdownHref`. Its own lockfile is committed. `tests/consumer.test.mjs` runs `pnpm --dir … build` and asserts: exit 0; `dist/notes/hello/index.html` contains `href="/notes/world/" class="wikilink"` and `target="_blank" rel="noopener noreferrer"`; `dist/backlinks.json` has two nodes with reciprocal inbound; `dist/notes/hello.md` equals the source file.

**CI** adds three steps after `pnpm test`: `pnpm test:consumer`; a git-install step —
```sh
tmp=$(mktemp -d) && cd "$tmp" && pnpm init >/dev/null && pnpm add "git+file://$GITHUB_WORKSPACE#$GITHUB_SHA" && ./node_modules/.bin/commune --help
```
— and `pnpm pack --dry-run` so the `files` list is visible in the log. The `.nvmrc` comment about 22.18 and type stripping is rewritten (the bin no longer needs it; the tests do).

### 4. Sequencing

Commits in `type(#7): subject` form; each step has a check that fails before and passes after. Steps 1–6 are engine-only and mergeable alone; 7–9 need the devon-wiki Astro 7 ticket merged first.

1. **Type gate.** Fix the three `tsc` errors (typed `StarConfig` interface instead of `as const`; `(segment) => githubSlug(segment)`); add `@types/hast`, `@types/mdast`; add `tsconfig.build.json`; move the three root plugin files under `src/`; `pnpm build:lib` in CI. *Verify:* `tsc -p tsconfig.build.json` exits 0; `pnpm test` still 100 % (tests import `src/**/*.ts` unchanged); `pnpm build` prints `41 total backlinks across 11 entries`; `git diff --exit-code public/backlinks.json`.
2. **Bin on `dist`.** `bin/commune.mjs` → `../dist/cli/main.js`; `pretest`/`prepare`; `engines` to `>=22.12.0`. *Verify:* `tests/cli.test.mjs` passes from a clean clone with `pnpm install && pnpm test` (prepare builds dist); `grep -L astro dist/lib dist/cli` stays empty of matches.
3. **`commune gate`.** Port `scripts/test-search-index.mjs` into `src/cli/gate.ts`; delete the script; `build` script updated. *Verify:* `pnpm build` ends in `PASS: 1 standalone page indexed…` from the verb; a fixture with a piped wikilink makes `gate` exit 1 with the same `FAIL:` text.
4. **Package boundary.** `package.json` per §3 (name, `exports`, `files`, peers, deps split); `src/integration.ts` reads `config.root`/`config.site`; `src/markdown.ts`. *Verify:* `pnpm pack --dry-run` lists only `bin/`, `dist/`, `src/components`, `src/styles`, sources, LICENSE, README; `node -e "import('@dmthepm/commune/graph')"` works via self-reference from the repo root (a smoke test only — never used by the engine's own config).
5. **Fixture consumer + CI.** `tests/fixtures/consumer/`, `tests/consumer.test.mjs`, the git-install CI step. *Verify:* green run; the CI log shows `prepare` running `tsc` inside pnpm's clone.
6. **Tag `v0.1.0`** on `main` after 1–5 merge (hand-cut; #33 takes over from `v0.2.0`). *Verify:* from an empty directory, `pnpm add github:dmthepm/commune-wiki#v0.1.0 && ./node_modules/.bin/commune --help` exits 0 — the sentence's stranger test, run for real.
7. **devon-wiki consumes.** (After its Astro 7 ticket.) Add the dependency and `@astrojs/markdown-remark`; rewrite `astro.config.mjs` per §3; delete the five files; `.node-version`; regenerate `public/backlinks.json`. *Verify:* `pnpm build` green ending in `PASS`; `git diff public/backlinks.json` empty **or** each changed key explained (expected: none — the read-only dogfood resolved 373/373 edges with the engine core); rendered `notes/cake/index.html` still carries `target="_blank"` on its external links (the #5 fix, now from the package).
8. **Deploy proof.** Push the devon-wiki branch; Cloudflare Pages preview builds on the default image (Node 22.16, pnpm 10.11). *Verify:* the preview URL serves `/notes/atomic-notes/` with resolved wikilinks and `/notes/atomic-notes.md` (from #31's engine half, now reaching the harness for the first time). This is the step that catches a pnpm-version difference in `prepare` handling (risk 2).
9. **Receipts.** On #7: the devon-wiki `check --json` summary before and after (80 entries, 373 edges, 0 broken, 1 duplicate-name — the last is content and pre-exists), the engine's, the tag, the Pages preview URL. On #2: the decisions D1–D9 in one line each. Close #5's "verify empirically" caveat with a pointer here.

### 5. Risks and rollback

1. **`prepare` fails for a stranger** (type error slips in, or a devDependency `tsc` needs is missing). CI's git-install step is the guard; rollback is `git tag -d` and retag from a fixed commit. Cost: a broken tag is visible to nobody until devon-wiki bumps to it.
2. **Cloudflare Pages' pnpm 10.11.1 handles git `prepare` differently from 10.19.0.** Not verified here — step 8 is the test. Mitigation ready: `PNPM_VERSION=10.19.0` in the Pages env, or commit `dist/` to a `release` branch as a last resort (rejected as the default because it makes every tag a two-commit ritual).
3. **`backlinks.json` drift on devon-wiki** if the engine core resolves an edge the old monolith did not (its `extractLinks` ignores `url`-kind links; the core's does not). Step 7's diff is the detector; a differing key is a *correct* new edge, documented, not a rollback.
4. **`communeMarkdown` helper** was not run (only the inline `unified()` it wraps). If it fails, devon-wiki's config calls `unified()` directly — same behaviour, one more import line.
5. **Hardest to undo:** the package name in every devon-wiki import. Decided before step 4 or not at all.
6. **`link:` during local iteration** leaves devon-wiki's lockfile untouched only if the link is never committed. Add `pnpm link` to devon-wiki's README as "never commit this" — the failure mode is silent until Pages builds.

### 6. Open questions for a human

See after the delta.

---

## Delta summary

- **The consumption mode changed from `file:` to a git tag** because the deploy machine has no `../commune-wiki`, and `file:` does not run `prepare` (B2). `file:` survives only inside the fixture consumer; `pnpm link` is the local loop.
- **"No build step" became "compile the Node side with `tsc` on `prepare`"** — reproduced today that `github:` and `file:` installs both hit Node's `node_modules` type-stripping refusal (B3); `registerHooks` rejected as active-development and bin-only.
- **A blocker the ticket never mentions**: devon-wiki is on Astro 4 and the package will require 7; its upgrade is a prerequisite ticket (B1).
- **`tsc` does not pass on today's source** — three latent type errors and two phantom type dependencies become the first commit (B4).
- **The `keywords`/peer externalization story was refuted on Astro 7 / Vite 8** — non-JS files under `node_modules` are always bundled; the fields stay for the version contract and `astro add` (M2).
- **No config file of any kind** — `site` is Astro's, the rest is convention; the integration reads `config.root`/`config.site` (M1).
- **`commune gate` replaces the gate script in both repos** so devon-wiki can delete its fourth copy of the scan (M3).
- **Name decided against a fact**: `commune` is taken on npm; `@dmthepm/commune` proposed (M5).
- **A stranger test exists**: fixture consumer in CI plus a `git+file://…#$GITHUB_SHA` install that exercises `prepare` and the bin the way a `github:` user does (D8).

## Open questions for you

1. **Package name.** `@dmthepm/commune` (recommended: `commune` is taken on npm by a 2022 placeholder; the scope is yours; the bin stays `commune`) or the bare `commune-wiki` (free, reads as the repo)? Your answer is the import specifier in every devon-wiki file that touches the engine, so it is decided before step 4 or it is a second rename.
2. **devon-wiki's Astro 7 upgrade as its own ticket ahead of #7's harness half** (recommended: it is #26 replayed on a live site with #26's byte-identical proof, and it makes #7's harness diff a pure "delete copies, add one dependency"), or inside #7 as steps 7a–7c? Your answer changes the lane count and whether #7 can be reviewed as one diff.
3. **Cut `v0.1.0` by hand inside #7** (recommended: devon-wiki needs a pin the day it consumes; #33's mechanism then starts at `v0.2.0`) or hold #7's harness half until #33 lands release-please? Your answer decides whether #7 ends with the live site on the engine or with a branch waiting.

---

**Falsifiable success sentence for #7:** *"devon-wiki builds green on Cloudflare Pages' default image with `@dmthepm/commune` installed from `github:dmthepm/commune-wiki#v0.1.0`, with `astro.backlinks.ts`, `remark-wikilinks.ts`, the inline external-links pass and `scripts/test-search-index.mjs` deleted and `astro.config.mjs` importing only `@dmthepm/commune/astro` and `@dmthepm/commune/markdown`; `public/backlinks.json` in devon-wiki is byte-identical to the pre-swap build or every changed key is explained in the PR; `commune check --root devon-wiki --json` still reports 80 entries, 373 edges and 0 `broken-link`; `commune gate` exits 0 after `astro build` in both repos; the engine's `pnpm build` still prints `41 total backlinks across 11 entries` with `public/backlinks.json` unchanged; `tsc -p tsconfig.build.json` exits 0; CI builds `tests/fixtures/consumer` from a `file:` install and installs the package from `git+file://…#$GITHUB_SHA` into an empty directory and runs `commune --help` with exit 0."*

# The engine's dependencies, re-decided for summer 2026

Audit date: **2026-09-03**. Every claim below is either measured in this worktree — the
command and its output are given — or sourced to a first-party page with the date it was
fetched. Where a source is silent, that is said outright rather than filled in.

Ticket: [dmthepm/commune-wiki#52](https://github.com/dmthepm/commune-wiki/issues/52).
Map: [#2](https://github.com/dmthepm/commune-wiki/issues/2).

**Environment.** Worktree of `commune-wiki` on `chore/52-deps`, branched from `main` at
`d2e1b32`. macOS 25.6.0 (arm64), Node v22.23.1, pnpm 10.19.0 locally and 10.34.5 for
lockfile writes (CI's `pnpm/action-setup@v6` with `version: 10` resolves to 10.34.5 today),
astro 7.2.10 with Vite 8.2.2, TypeScript 5.9.3. Version and publish-date facts come from
`npm view <pkg> version time.modified dist-tags --json` run on 2026-09-03; repository
liveness from `gh api repos/<owner>/<repo>` the same day.

**Out of scope, already decided elsewhere:** the Tailwind 4 migration (#27, live only when
`design-system.css` crosses the package boundary in #8), moving components (#8), and Effect
(rejected on #2).

---

## Summary

Nothing in the runtime dependency set is wrong. Two devDependencies are dead — declared,
never invoked — and one more does measurably nothing. The interesting question in this set
is not a library at all: it is TypeScript, which shipped a native compiler as its default
`tsc` eight weeks ago.

| Verdict | Packages |
|---|---|
| **Keep, no change** | `github-slugger`, `unist-util-visit`, `gray-matter`, `astro`, `@astrojs/markdown-remark`, `@astrojs/sitemap`, `@types/hast`, `@types/mdast`, `@types/node`, `tailwindcss` |
| **Keep, with a dated recheck** | `globby` |
| **Replace** | `typescript` `^5.6.0` → `^7.0.0` (follow-up ticket) |
| **Drop** | `puppeteer` (done, this branch), `@astrojs/check`, `@tailwindcss/typography`, `autoprefixer` |

None of the replacements or drops below `puppeteer` are applied on this branch. Each is a
follow-up commit or ticket, and the admission test is applied to each at the end.

---

## Part 1 — the probes, and why `puppeteer` goes

`scripts/` held 52 files: 38 Puppeteer probes (26 `.cjs`, 12 `.js`), 13 PNGs the probes
wrote, and one shell migration. All 52 are deleted in `01aed8f`.

The probes were written before this repository had tests. Each one launched a real browser,
navigated to `https://devonmeadows.com` or `http://localhost:4321`, printed what it found,
and was read once. Structural facts, all checked in this worktree:

- **Nothing ran them.** No `package.json` script, no CI step, no other file in the tree
  imports or spawns anything under `scripts/`. `grep -rn "scripts/"` outside the directory
  itself returns only prose in `CONTRIBUTING.md` and `docs/`.
- **Nothing shipped them.** `files` is `["bin","lib","src/components","src/styles",
  "LICENSE","README.md"]`; `pnpm pack --json` lists the same 48 files before and after.
- **They cost every contributor a Chromium.** Removing `puppeteer` removed 145 packages
  from `pnpm-lock.yaml` (707 lines). `du -sh ~/.cache/puppeteer` on this machine:
  **3.6 GB**, in `chrome/` and `chrome-headless-shell/`.

### What covers what

| Probes | What they checked by eye | What checks it now |
|---|---|---|
| `debug-homepage-backlinks`, `test-backlinks-count`, `test-homepage-backlinks`, `validate-commune-backlinks`, `validate-commune-aliasing` | backlink counts and aliasing on the live homepage | `tests/graph.test.mjs` (34 cases, one per link form in #25's table) and `tests/graph-build.test.mjs`, which reproduces the committed `public/backlinks.json` byte for byte |
| `test-hover-preview`, `test-links-and-badges`, `test-manual-note-link`, `test-research-cross-links`, `test-production-research` | wikilinks resolving, cross-collection links, new-tab icons | `tests/graph.test.mjs` (cross-collection and url-kind edges), `tests/external-links.test.mjs` (which links get `target="_blank"`), `tests/check.test.mjs` (ambiguity, duplicates, canonical titles) |
| `validate-live-site`, `verify-full-page`, `test-production-homepage`, `test-root-domain`, `test-visible-mobile` | "is the deployed site still standing" | the prod verifier, plus `commune gate` and `tests/gate.test.mjs` for the three build assertions — page indexed, wikilink rendered as an `href`, title canonical |
| `diagnose-cards`, `test-card-formatting`, `test-homepage-cards`, `test-preview-cards`, `test-footer-cards`, `test-footer-visibility` | card and footer layout on two viewports | the harness-side hardening sweep. This is devon-wiki's rendered identity, which the engine does not own |
| `test-stars`, `test-star-hover`, `test-star-modal`, `test-star-nowrap`, `test-complete-star-system`, `test-modal-v2`, `validate-star-fix`, `validate-star-modal` | the star system's rendering and modal copy | the hardening sweep for the visuals; `tests/graph-build.test.mjs` ("stars stay off in a corpus below the minimum note count") for the computation, which is the half that lives in `src/lib/graph.ts` |
| `test-dates`, `test-created-updated`, `test-mobile-dates`, `screenshot-dates`, `screenshot-home-date`, `verify-date-display`, `verify-live-dates`, `verify-updated-logic` | a `created`/`updated` frontmatter bug, debugged against production in 2025 | nothing, and nothing should. The bug was fixed; date *display* is a harness template concern. Dead, not covered |
| `verify-rich-results` | JSON-LD schema on the live site | nothing here. Structured data is identity, harness-owned. Dead for this repository |
| `migrate-note-metadata.sh` | one-shot: `status: seed\|growing\|evergreen` → `draft\|live`, plus `created:` from git history | already run. Its header still says to run it from `sites/commune-publish`, a layout this repository has not had since the transfer. Dead |
| 13 PNGs | outputs of the above | — |

Nothing survived. `scripts/` is gone rather than emptied, and `CONTRIBUTING.md`'s tree no
longer names it.

### Puppeteer vs Playwright — and why neither is added back

The ticket left one door open: *if* a single browser-driven sweep were worth keeping, write
it once in `tests/`, choose the driver with evidence, and run it in CI against
`pnpm preview`. The door stays shut, and the reason is not that browsers are expensive. It
is that there is nothing left for the browser to assert.

Walk the candidate assertions:

- *The page renders and the wikilink is a real `href`* — `commune gate` already asserts it
  against built HTML, and `tests/gate.test.mjs` proves the gate fails when it should
  (8 cases, including a piped wikilink and a link that never became an `href`).
- *The search index contains the standalone page* — same gate, first assertion.
- *`backlinks.json` is correct* — `tests/graph-build.test.mjs` compares committed bytes.
- *The `.md` twin beside each page is byte-identical to the source* —
  `tests/markdown-urls.test.mjs`, which spawns a real `astro build` and reads `dist/`.
- *The package works in somebody else's project* — `tests/consumer.test.mjs` builds a real
  consumer; `tests/install.test.mjs` installs from a git ref the way a stranger would.

What a browser would add on top of that is the interactive layer: the pane stack, the search
modal, the star modal, hover previews. Every one of those is **harness-owned UI** the engine
ships as unstyled mechanism, and every one of them is what the hardening sweep and the prod
verifier already cover on the surface where it actually matters — the deployed site, not a
`preview` server. A CI browser job here would test devon-wiki's components from
commune-wiki's CI. That is the wrong repository.

If that changes — if #8 moves the interactive components across the boundary and they become
the engine's to guarantee — the choice at that point is **Playwright**, and the reasons are
already visible:

- Playwright 1.62.1, published 2026-09-03 (`npm view playwright version time.modified`);
  Puppeteer 25.10.0, published the same day. Both are alive; neither is a maintenance
  argument.
- Puppeteer's own docs describe it as "a JavaScript library which provides a high-level API
  to control Chrome or Firefox over the DevTools Protocol or WebDriver BiDi"
  (<https://pptr.dev/guides/what-is-puppeteer>, fetched 2026-09-03) — two browser engines.
  Playwright covers Chromium, Firefox and WebKit, and WebKit is the one that matters for a
  wiki whose reader is on iOS. Half of the deleted probes set an iPhone user agent against
  a *Chromium*, which is exactly the shape of test that proves nothing about Safari.
- Playwright ships its own runner, trace viewer and retry semantics; Puppeteer would need a
  runner bolted on, and `node --test` is what this repository already uses everywhere else.

That is a decision recorded for the day it is needed, not a dependency added today.

---

## Part 2 — every dependency, re-decided

### Runtime `dependencies`

#### `globby` `^16.2.4` — **keep**, recheck when `engines.node` moves to `>=22.17`

Used once, in `src/lib/graph.ts:201`:

```js
const files = await globby(`${CONTENT_DIRS[collection]}/**/*.{md,mdx}`, { cwd: root });
```

*Maintenance:* globby 16.2.4, last published 2026-08-19; `sindresorhus/globby` last pushed
2026-08-19. Actively maintained.

*Does Astro still use it?* **No.** `astro@7.2.10`'s `dependencies` (read from
`node_modules/astro/package.json` in this worktree) list `tinyglobby ^0.2.15`, not globby.
Vite 8.2.2 also depends on `tinyglobby`. So the ecosystem has moved to a smaller
implementation — but to a *library*, not to the built-in. That matters: the fashionable
replacement for globby in 2026 is `tinyglobby`, and swapping one dependency for another
dependency buys nothing here.

*Node's built-in.* `fsPromises.glob` was added in v22.0.0 and marked **stable in v22.17.0**
(`doc/api/fs.md`, `nodejs/node` branch `v22.x`, fetched 2026-09-03; the YAML changelog reads
`version: v22.17.0 … description: Marking the API stable`, PR 57513). It takes
`pattern {string|string[]}` and `options { cwd, exclude, withFileTypes }`. Two documented
gaps versus globby: **negation patterns are not supported** ("Note: Negation patterns (e.g.
'!foo.js') are not supported" — `exclude` takes an array of positive patterns instead), and
there is no `gitignore` option.

*Measured here* (`node`, v22.23.1, in this worktree, 2026-09-03), against the exact pattern
`src/content/notes/**/*.{md,mdx}`:

```
globby count 10 | node count 10
same set:   true
same order: true
globby small avg 0.29 ms
node   small avg 0.27 ms
```

Brace expansion, `cwd`, and arrays of patterns all work. On a large tree
(`node_modules/.pnpm/astro@*/**/*.js`) globby was faster (173 ms vs 316 ms) **and returned
a different count** (5764 vs 2656) — globby follows symbolic links by default and Node's
glob does not. Irrelevant for `src/content`, which has no symlinks; decisive if the pattern
ever points into `node_modules`.

*Verdict: keep, for one reason that has nothing to do with the API.* `engines.node` is
`>=22.12.0` — Astro's floor, and **below the 22.17.0 where `glob` became stable**. Swapping
would either ship a package that calls an experimental API on its own declared minimum, or
raise `engines` above Astro's floor for a dependency that costs 7 transitive packages and
0.29 ms. Neither is worth it today. The recheck is concrete: when `engines.node` moves to
`>=22.17.0` or later for an unrelated reason, this becomes a one-line deletion — and the
replacement must sort explicitly, because `tests/graph-build.test.mjs` compares
`backlinks.json` byte for byte and neither implementation documents an ordering guarantee
(they merely agree today).

#### `gray-matter` `^4.0.3` — **keep**, and know exactly what is being kept

Used in `src/lib/graph.ts:206` and `src/cli/related.ts:73,93`, in one shape: `matter(text)`
→ `{ content, data }`.

*Maintenance:* 4.0.3 was published **2021-04-24** (`npm view gray-matter time --json`).
`jonschlinkert/gray-matter` is **not archived**, but its last commit is `310f934`,
2025-06-14, message "Update README.md", with 81 open issues (`gh api`, 2026-09-03). Five
years without a functional release. It is finished, not abandoned — but it is not tended.

*What Astro uses instead.* Astro does **not** use gray-matter. `astro/dist/markdown/index.js`
re-exports `parseFrontmatter` from `@astrojs/internal-helpers/frontmatter`, and that file
(read in this worktree, `@astrojs/internal-helpers@0.11.0`) is about fifty lines: one regex
for the fence, `js-yaml`'s `load` for `---` and `smol-toml`'s `parse` for `+++`, plus four
`content` strategies (`remove`, `preserve`, `empty-with-spaces`, `empty-with-lines`) that
exist so source maps survive frontmatter stripping.

*The real cost of keeping it.* gray-matter depends on `js-yaml ^3.13.1`, and
`node_modules/.pnpm/` in this tree carries **`js-yaml@3.14.1` alongside `js-yaml@4.1.0` and
`js-yaml@4.3.2`** — a second, six-year-old YAML parser in the install, present only because
of this one package. That is the argument for replacing it, and it is a real one.

*Why keep anyway, for now.* Only because the swap deserves its own receipt, not because it
looks hard. Measured here: parsing all 12 files under `src/content` twice — once with
`matter(source)`, once with a fence regex plus `js-yaml@4.3.2`'s `load` — produced identical
`data` and identical `content` for **12 of 12**. Two behaviours often cited as differences
turn out not to be: both js-yaml 3.14.1 and 4.3.2 read `yes`/`no`/`on` as strings, and both
throw `YAMLException` on a duplicate key.

Twelve files is a small corpus, and the real one is devon-wiki's 80 entries. The test that
would settle it is already written — `tests/graph-build.test.mjs` asserts
`public/backlinks.json` byte for byte, and #7's acceptance already requires devon-wiki's copy
to come out byte-identical — so the swap belongs on the branch where that diff is the
receipt, not as a blind line item in an audit.

*The shape of the replacement, when it happens:* `js-yaml@4` (already in the tree, already
Astro's) plus the fence regex, ~15 lines in the graph core — **not**
`@astrojs/internal-helpers`, which is an internal package Astro pins by exact version
(`"@astrojs/internal-helpers": "0.11.0"`, not a range) and gives no compatibility promise
about.

#### `github-slugger` `^2.0.0` — **keep**, and it is the strongest keep in the set

Used in `src/lib/graph.ts:21` to slugify path segments.

*Is it still what Astro's content layer uses?* **Yes, verifiably.** Two independent
confirmations in this worktree:

- `astro@7.2.10`'s `dependencies` include `"github-slugger": "^2.0.0"`, and
  `astro/dist/content/utils.js:5` reads `import { slug as githubSlug } from "github-slugger";`
  — that is the content layer's own id generation.
- `@astrojs/markdown-remark@7.3.0` also depends on `"github-slugger": "^2.0.0"`, and uses it
  in `dist/rehype-collect-headings.js` for heading anchors.

The comment already in `src/lib/graph.ts:72` — "the same `github-slugger` call Astro's own
content layer uses" — is accurate, and it is the whole reason a URL the engine computes
outside a build matches the URL Astro computes inside one.

*Maintenance:* 2.0.0 published 2023; `Flet/github-slugger` last pushed 2023-09-30. Quiet.
That is the correct state for a package whose job is to be bit-compatible with GitHub's
anchor algorithm — a "maintained" slugger that changed its output would be a bug. And the
version is pinned in place by Astro's own range regardless of what this package declares.

#### `unist-util-visit` `^5.1.0` — **keep**

Used in both plugins (`src/remark-wikilinks.ts:13`, `src/rehype-external-links.ts:8`).

5.1.0, last published 2026-01-22. `@astrojs/markdown-remark@7.3.0` depends on
`"unist-util-visit": "^5.1.0"` — the identical range. Same tree, one copy, no drift. The
unified ecosystem is what Astro's remark path *is*; there is no alternative that is not a
rewrite of the plugins.

### `peerDependencies`

#### `astro` `^7.0.0` — **keep**

Latest 7.3.1 (published 2026-09-03); the devDependency pins `^7.2.10` and resolves to
7.2.10. The peer range is a major-version contract and correctly stays open across the
major. #26 landed the 4→7 upgrade stepwise; nothing here re-opens it.

Worth recording from the #7 senior review and re-confirmed by reading Vite 8.2.2's
`canExternalizeFile`: the `peerDependencies.astro` entry is **not** what makes raw `.astro`
imports work (Vite never externalizes a non-JS file under `node_modules`). It earns its
place as a version contract, for `astro add`, and for `dedupe: ['astro']`.

#### `@astrojs/markdown-remark` `^7.3.0` — **keep**, and it is under-used (see Part 3)

Both a peer and a devDependency, which is the right pattern: Astro 7 renders with Sätteri
and no longer installs the unified pipeline, so a consumer who wants `[[WikiLinks]]` must
install this and pass `markdown.processor` — exactly what `src/markdown.ts` assembles.
7.3.0, published 2026-08-31.

### `devDependencies`

#### `@astrojs/check` `^0.9.10` — **drop**

*It is declared and never invoked.* `grep -rn "astro check\|@astrojs/check"` across
`package.json`, `.github/workflows/`, `CONTRIBUTING.md` and `README.md` returns exactly two
hits: the dependency line itself, and a CI comment in `ci.yml:40` explaining that
`astro check` never sees the Node-side files. There is no `check` script and no CI step. The
#7 senior review said the same thing in passing ("`astro check` is not in `package.json` or
CI"); it is still true.

*Is it still the way?* Yes, for what it does. Astro's TypeScript guide
(<https://docs.astro.build/en/guides/typescript/>, fetched 2026-09-03) still names the CLI:
"you can use the `astro check` CLI command to check both `.astro` and `.ts` files", and
suggests `"astro check && astro build"` as the build script. `@astrojs/check` is the package
that supplies it (it wraps `@astrojs/language-server`).

*So drop or wire up?* Drop — and if it comes back, it comes back with a script and a CI
step in the same commit. The reason to prefer dropping over wiring is that what it would
check is `src/pages/**` and `src/components/**`: the engine's own demonstration site, which
#8 is in the process of moving. `tsc -p tsconfig.build.json` already gates everything that
ships, runs in CI before the tests, and covers the surface a consumer can break. A second
type checker that guards the half of the tree that is on its way out is not a gate; it is an
install cost. **Cost of the change:** one line in `package.json`, one lockfile write.

#### `@tailwindcss/typography` `^0.5.20` — **drop**

*It is declared and never registered.* `tailwind.config.mjs` ends with `plugins: []`. The
`.prose` class that `src/pages/[...page].astro:64` and `src/pages/index.astro:124` apply is
**hand-written**, in `src/styles/notes.css:14-32` ("Andy-style note typography"). The
plugin's utilities are not in the build; nothing would change if it were uninstalled today.

**Cost of the change:** one line, one lockfile write. If typography ever *is* wanted, it is a
Tailwind-4 decision and belongs to #27, not here.

#### `autoprefixer` `^10.5.4` — **drop**

This is the one the ticket asked to check against "Tailwind 3 + Lightning CSS in Vite 8",
and the premise turns out to be half wrong in a way that makes the answer cleaner.

*Lightning CSS is not the transformer.* Vite 8.2.2 lists `lightningcss` among its plain
`dependencies` (read from `vite@8.2.2/package.json` in this tree: `lightningcss, picomatch,
postcss, rolldown, tinyglobby`), so it ships with every install — but the default is
unchanged. Read in `vite/dist/node/chunks/node.js`:

```js
const _cssConfigDefaults = Object.freeze({
  /** @experimental */
  transformer: "postcss",
  preprocessorMaxWorkers: true,
  /** @experimental */
  devSourcemap: false
});
```

`transformer` is still `"postcss"`, and still flagged `@experimental`. So the PostCSS chain
this project declares inline in `astro.config.mjs` — `[tailwindcss(), autoprefixer()]` — is
what actually runs, and autoprefixer really is the only thing that could add a prefix.

*It adds nothing.* Running the project's own CSS through PostCSS twice, with and without
autoprefixer 10.5.4 (measured in this worktree, 2026-09-03):

```
src/styles/design-system.css  identical=false  with=7151B  without=7426B
src/styles/notes.css          identical=true
```

The output with autoprefixer is **smaller**, and the entire diff is one line — a
`-webkit-backdrop-filter` declaration that Tailwind 3's own preflight emits and autoprefixer
*removes* as obsolete for current targets. Autoprefixer adds zero declarations to this
project.

*Confirmed against the shipped build.* The only vendor prefixes in `dist/_astro/*.css` are
`-webkit-scrollbar`, `-webkit-scrollbar-track`, `-webkit-scrollbar-thumb` and
`-ms-overflow-style` — all four hand-written in `src/pages/index.astro:636-703`, none of
them things autoprefixer generates (they are non-standard properties, not prefixed
standards). `design-system.BJgfoMTB.css` contains no prefixes at all.

*And its data is stale.* The run above printed, unprompted:

```
Browserslist: browsers data (caniuse-lite) is 11 months old. Please run:
  npx update-browserslist-db@latest
```

An autoprefixer whose correctness depends on a data package nobody updates, that adds
nothing to the output, is not a safety net.

**The one consequence of dropping it:** the built CSS regains that single
`-webkit-backdrop-filter` line from Tailwind's preflight — one redundant declaration that
older Safari wanted and current Safari ignores. Harmless.

**Cost of the change:** delete the import and the array entry in `astro.config.mjs`, delete
the devDependency, rebuild, confirm `dist/_astro/*.css` differs by that one line only.

#### `typescript` `^5.6.0` — **replace with `^7.0.0`**, on its own ticket

This is the substantive finding.

*What shipped.* **TypeScript 7.0 was released 2026-07-08** — the native Go port formerly
distributed as `@typescript/native-preview` / "tsgo". The `typescript` package's `tsc` *is*
the Go executable now; the old compiler moved to `@typescript/typescript6` as `tsc6`. The
announcement claims "speedups between 8x and 12x on full builds"
(<https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/>, fetched
2026-09-03). Registry state, same day: `typescript@latest` is **7.0.2**, published
2026-07-08, with per-platform native binaries as `optionalDependencies`
(`@typescript/typescript-darwin-arm64` and fourteen siblings). This repository is on
`^5.6.0`, resolving to 5.9.3 — two majors behind.

*Measured on this package* (both compilers, same `tsconfig.build.json`, output to scratch
directories outside the worktree, 2026-09-03):

| | `tsc` 5.9.3 | `tsc` 7.0.2 |
|---|---|---|
| wall time | 0.99 s | **0.18 s** |
| files emitted | 30 | 30 (identical set) |
| `.d.ts` output | — | **byte-identical to 5.9.3's, all 15** |
| `.js` output | — | differs in one respect only |

The only `.js` difference is quote style on rewritten specifiers: 5.9.3 emits
`import remarkWikiLinks from "./remark-wikilinks.js";`, 7.0.2 preserves the source's
`'./remark-wikilinks.js'`. `rewriteRelativeImportExtensions`, `declaration`,
`verbatimModuleSyntax` and `module: NodeNext` all behave the same. Nothing in
`tsconfig.build.json` is in the announcement's removed-options list.

*What blocks doing it here and now.* One thing, and it is the reason this is a ticket rather
than a commit on this branch: the 7.0 announcement states that "Vue, Svelte, Astro, MDX, and
Angular template type-checking cannot yet use TypeScript 7", and `@astrojs/check`'s own
metadata agrees — `npm view @astrojs/check peerDependencies` returns
`{"typescript": "^5.0.0 || ^6.0.0"}` (2026-09-03). Dropping `@astrojs/check` (above) removes
that conflict entirely, which is why the two changes are sequenced: **drop `@astrojs/check`
first, then move `typescript` to `^7`.** If `astro check` is ever wanted back before the
language server supports 7, the pattern is an aliased `typescript6` devDependency for that
one command.

The other caveat in the announcement — "No programmatic API: tools requiring TypeScript's
API (like typescript-eslint) must use TypeScript 6.0 via aliases" — does not bite: nothing
in this repository imports the TypeScript API, and there is no ESLint.

**Cost of the change:** one version range, one lockfile write, and a rebuilt `lib/` whose
`.d.ts` files are byte-identical and whose `.js` files differ only in quoting. The gain is a
`prepare` step that runs 5x faster on every install — which is the step a stranger's
`pnpm add github:dmthepm/commune-wiki#v0.1.0` waits on.

#### `tailwindcss` `^3.4.0` — **keep**, per #27

Latest is 4.3.3 (2026-08-31); `v3-lts` is a live dist-tag at 3.4.19, which is the honest
signal that Tailwind 3 is supported rather than stranded. #27 already owns the migration and
already names its trigger: the moment `design-system.css` crosses the package boundary in #8
and the *package* has to pick a major. Nothing in this audit moves that date.

#### `@astrojs/sitemap` `^3.7.4` — **keep**

3.7.4, published 2026-08-31, versioned in lockstep with Astro's own releases. It runs on
every build and produces `dist/sitemap-index.xml` and `dist/sitemap-0.xml` — verified in this
worktree's build output. It is arguably harness identity rather than engine mechanism, but it
is a devDependency of the demonstration site, not a runtime dependency of the package, so it
costs a consumer nothing.

#### `@types/hast` `^3.0.5`, `@types/mdast` `^4.0.4` — **keep as devDependencies**

The concern worth testing: both leak into the *public* declarations —
`lib/remark-wikilinks.d.ts:12` is `import type { Root } from 'mdast';` and
`lib/rehype-external-links.d.ts:7` is `import type { Root } from 'hast';` — while the
packages that provide them are dev-only. A consumer type-checking against those files would
fail if nothing supplied the types.

*Tested rather than assumed.* Packed the tarball, installed it into an empty project with
`typescript@5.9.3` and `"types": []` and `"skipLibCheck": false`, and type-checked a file
importing `@dmthepm/commune/remark` and `@dmthepm/commune/rehype`. **`tsc` exit 0.**
`npm ls @types/mdast @types/hast` in that project shows why: they arrive through
`@astrojs/markdown-remark`, which every consumer must install anyway because it is a
declared peer, and which hard-depends on both (via `@astrojs/internal-helpers` and
`@mdx-js/mdx`).

So the types travel with the peer. Keep them dev-only, and keep this paragraph, because the
next person to read those two `import type` lines will have the same worry.

The same probe incidentally clears a second worry: `lib/remark-wikilinks.d.ts` emits
`import { type GraphOptions } from './lib/graph.ts';` — a `.ts` specifier in a shipped
declaration file, which looks wrong. TypeScript resolves it to the adjacent `.d.ts`. Exit 0
is the proof.

#### `@types/node` `^22.20.1` — **keep at `^22`**

`@types/node@latest` is 26.4.1 (2026-09-01), but the range should track the package's
**minimum** Node, not the newest one: `engines.node` is `>=22.12.0`, and `tsconfig.build.json`
sets `"types": ["node"]`. Typing against Node 26's library would let a Node-26-only API
compile clean and then throw for a consumer on the declared floor. `^22` is correct until
`engines` moves.

---

## Part 3 — using what we keep harder

The destination sentence from #2 is the filter: **agent-friendly, connect-and-think, build
in public.** Each item below names the capability, what it would give, what it costs, and a
yes or no. Three are yes.

### 1. `@astrojs/markdown-remark`'s `createMarkdownProcessor` — a `commune render` verb — **yes**

*The capability.* `@astrojs/markdown-remark@7.3.0` exports, verified by importing it in this
worktree: `createMarkdownProcessor, extractFrontmatter, isFrontmatterValid,
isUnifiedProcessor, markdownConfigDefaults, parseFrontmatter, rehypeHeadingIds, rehypePrism,
rehypeShiki, remarkCollectImages, syntaxHighlightDefaults, unified`. Today `src/markdown.ts`
uses exactly one of them — `unified` — to hand Astro a processor. `createMarkdownProcessor`
is the other half: it renders markdown to HTML **without an Astro build running**.

*What it would give.* A `commune render <file> --json` that returns the HTML the site would
publish, from the same pipeline, with wikilinks resolved and external links marked. That is
the missing surface for two things the map already wants: #19's refine step (see what this
draft will look like before committing anything) and the compose-once/fan-out output model
(#21's email destination needs rendered HTML, and rendering it a second way is the
duplicate-copy bug class #3 exists to kill).

*Cost.* One CLI verb, `src/cli/render.ts` is already the name of the output module so the
verb file needs another name, plus tests. The pipeline itself is already assembled by
`communeMarkdown()`. Genuinely small.

*The one thing to check first:* the CLI's hard rule that no Astro module loads on its path
(`tests/cli.test.mjs`: "no Astro module is loaded on the CLI path"). `@astrojs/markdown-remark`
is a separate package from `astro` and a declared peer, so importing it does not violate the
letter of that rule — but the test exists because loading Astro is slow and drags in Vite,
and this import should be lazy, inside the verb, exactly as the rule intends.

**Yes.** Passes the admission test: distinct outcome, independently schedulable, evidenced
above, outside #19's contract.

### 2. `rehypeHeadingIds` — make `[[Note#Heading]]` land on the heading — **yes**

*The capability.* Same package, same export list. `@astrojs/markdown-remark` uses it
internally to give headings stable `id`s with `github-slugger` — the same slugger the graph
core already uses.

*What it would give.* Today the graph parses `[[Note#Heading]]`, strips the subpath, and
emits a link to the page (`tests/graph.test.mjs`: "heading subpath is stripped from a
wikilink", "block subpath is stripped from a wikilink"). Stripping is right for the *edge* —
the link points at the note — but the rendered `href` loses the anchor, so a link Obsidian
takes you to the exact paragraph of takes you to the top of the page here. Adding
`rehypeHeadingIds` to `communeMarkdown()` and keeping the subpath on the href (not on the
edge) closes the gap. Connect-and-think is precisely about landing on the right sentence.

*Cost.* One plugin in the processor, one change in `remark-wikilinks.ts` to append
`#${slug(subpath)}` to the href while `extractLinks` keeps returning the bare target. The
graph tests should not move at all, which is what makes it a safe change; the block-reference
form (`[[Note#^block-id]]`) has no HTML anchor to point at and stays stripped.

**Yes**, as a small ticket. Distinct outcome, evidenced, not owned by an existing ticket.

### 3. `gray-matter`'s `matter.stringify()` — the write half — **yes, when the authoring loop needs it**

*The capability.* `gray-matter` is used here as a reader only. It also exports
`matter.stringify(content, data)`, `matter.read()`, `matter.test()` and `matter.language()`
(read in `node_modules/.pnpm/gray-matter@4.0.3/…/index.js:160-205`).

*What it would give.* The map's loop is dump → connect → grill → draft → refine → ship, and
skills do the writing. Every one of those writes has to put frontmatter back — `updated`,
`status`, `aliases`, `tags` — and doing it with string surgery is how frontmatter drifts.
One `writeEntry()` in the graph core, built on `stringify`, makes "an agent edited this note"
a mechanism rather than a regex.

*Cost.* Small, but it is a genuinely new capability (the core is read-only today) and it
needs a policy on key order and quoting so that an agent's write does not reformat a file a
human is editing in Obsidian.

**Yes, but sequenced behind #19/#10** — it is the authoring loop's tool, and building it
before there is a caller is the #6 failure mode the map already named. Recorded here, not
ticketed yet.

### 4. Astro content-layer loaders as the graph's source — **no**

*The capability.* A custom loader with a `load({ store, meta, parseData, generateDigest,
watcher, renderMarkdown })` context, which would let the content layer be populated by
commune's own scan instead of Astro's `glob()`, removing the second traversal of
`src/content`.

*Why no.* Astro's own reference is explicit that loaders **run at build time**
(<https://docs.astro.build/en/reference/content-loader-reference/>, fetched 2026-09-03), and
runtime access is through `getEntry()` / `getLiveEntry()` inside an Astro process. The map's
charting decision from 2026-09-02 is the opposite requirement: *"Graph must be queryable
outside a build… The connect step must ask 'what does this dump touch?' before any draft
exists, with no build running."* `tests/cli.test.mjs` enforces it — "no Astro module is
loaded on the CLI path".

Making the content layer the source would put the graph inside the thing it must outlive.
The direction of the dependency is correct as it stands: the core scans, and the integration
hands Astro the result. The duplicate traversal it would save is 0.29 ms over 11 files.

**No.** Rejected with a reason, which is one of the two outcomes #52 asks for.

### 5. The Astro dev toolbar app API as a note-review surface — **no, for now**

*The capability.* `addDevToolbarApp({ id, name, entrypoint, icon })` in `astro:config:setup`;
the entrypoint exports `defineToolbarApp({ init(canvas, app, server) })`, renders into a
`ShadowRoot`, and talks to the dev server both ways — `server.send(event, payload)` /
`server.on(event, cb)` on the client, and an `astro:server:setup` `toolbar` object with
`send()`, `on()`, `onAppInitialized()`, `onAppToggled()` on the server. Pre-built components
(`astro-dev-toolbar-window`, `-button`, `-highlight`) exist
(<https://docs.astro.build/en/reference/dev-toolbar-app-reference/>, fetched 2026-09-03).

*What it would give.* A panel on `localhost` showing this note's broken links, ambiguous
targets and orphan status while you read the rendered page — `commune check` findings pinned
to the thing they are about. It is genuinely well shaped for it: the server half could import
the graph core directly, and `astro-dev-toolbar-highlight` could mark the offending link in
the page.

*Why no, for now.* Three reasons, in order of weight. It is **dev-server only** — the refine
step in #19 wants a review surface that also exists for a built site, and this one vanishes
at `astro build`. It is **a second UI to maintain** for findings the CLI already emits as
JSON, and #16's research is blunt about which of those an agent actually consumes. And #2
already ruled out a "local browser admin UI" on the grounds that Obsidian is that UI; a
toolbar app is a smaller version of the same idea.

Revisit if #19 lands and the refine step turns out to need per-link visual feedback that a
terminal cannot give. **No.**

### 6. `astro preview` as the refine-step review surface for #19 — **yes, and it is nearly free**

*The capability.* `pnpm preview` already exists in `package.json` and serves `dist/` exactly
as the deployed site would, static-file semantics and all.

*What it would give.* #19's refine step needs "show me what this becomes before I ship it".
A preview server is that, with no new dependency, no browser driver and no second renderer —
and it is the honest surface, because it serves the same bytes Cloudflare will. Paired with
item 1 (`commune render` for a single note, fast) it gives the loop two speeds: one note in
milliseconds, the whole site in a build.

*Cost.* Nearly none as a mechanism; the work is in #19's skill, which needs to know to run
it, on which port, and how to hand back a URL. What it is *not* is a test surface — see
Part 1 on why a CI browser job against `preview` earns nothing here.

**Yes**, as a line in #19 rather than a ticket of its own. It fails the admission test's
"independently schedulable" clause: it is how #19's refine step works, not a separate
outcome.

### 7. Pagefind's index for `graph related` — **no, and the README is wrong**

*The finding.* There is no Pagefind. It is not in `package.json`, not in the lockfile, and
`src/components/SearchModal.astro:100` says so in a comment: *"Pagefind removed — semantic
search will handle full-text needs."* Search today is a `/api/ask` semantic endpoint (a
harness-owned Cloudflare Function) with a dev-mode fallback that reads `backlinks.json` and
does substring matching over titles, summaries, aliases and tags.

So this is not "use what we keep harder" — it is a proposal to add a dependency. Against
that: `commune related` already exists, is tested (`tests/related.test.mjs`, 8 cases), and
answers a *different* question — links, whole-word alias mentions, and inbound entries from
the graph — which is the connect step's question. Pagefind answers "which pages contain this
word", which is the reader's question, and the reader's question already has an answer.

**No.** What this section *does* produce is a defect: `README.md:16` still advertises
"Cmd-K palette with Pagefind static search", `README.md:258-265` documents a build-time
Pagefind index and a dev fallback, and `README.md:377` lists Pagefind under the stack. Three
false claims in the front door. #23 (README rewrite) is closed as out of scope, and its note
says the one live item there is "a delete-only edit on any branch" — this is another one.

### 8. View transitions for the sliding panes — **no to `<ClientRouter />`, yes to the native API**

*What the panes are.* `src/components/panes.ts` fetches a note's URL, parses the response
with `DOMParser`, lifts `<main>` out of it, and appends a `.pane` div to a stack. The page
never navigates. That is the Andy-Matuschak stacked-notes model, and it is deliberate.

*Why `<ClientRouter />` is the wrong tool.* Astro's client router — `<ClientRouter />`,
imported from `astro:transitions`, with no deprecation notice in the guide
(<https://docs.astro.build/en/guides/view-transitions/>, fetched 2026-09-03) — turns an MPA into
an SPA by **replacing the page** on navigation. Panes do the opposite: they keep the current
page and add to it. Adopting the router would mean giving up the stack, or running both and
reconciling two navigation models. It also brings a real hazard the docs name outright:
"Bundled module scripts… are only ever executed once. After initial execution they will be
ignored, even if the script exists on the new page after a transition" — and this site's
interactivity lives in exactly such scripts (`BacklinksScript`, `HeaderStarScript`,
`StarredLinksScript`, `SearchModal`).

*What is worth taking.* The **native** View Transition API — `document.startViewTransition()`
around the pane insertion and removal in `panes.ts`, with `view-transition-name` on the pane
element. That animates the stack without a router, degrades to today's behaviour where the
API is missing, and the docs' own closing note points the same way: using `<ClientRouter />`
"will increasingly become unnecessary" as browsers ship the native API. Wrap it in
`prefers-reduced-motion` by hand, since without the component nothing does that for you.

**No** to the Astro component; **yes** to about fifteen lines of native API in `panes.ts`,
which belongs to #8 (the components' ticket) rather than to a ticket of its own.

### Also noted, not proposed

- **`globby`'s `gitignore: true`** and `isGitIgnored` would let the content scan honour
  `.gitignore` for free. No use for it today — `src/content` has no ignored files — but it is
  the answer if a vault ever carries drafts it does not publish.
- **`github-slugger`'s `BananaSlug` class** (the default export, versus the stateless `slug`
  function the core uses) keeps a counter and de-duplicates repeated headings within one
  document. That is the correct tool if item 2 lands and two headings in a note share a
  title.
- **`unist-util-visit`'s `SKIP` / `EXIT` return values** let a visitor stop descending. Both
  plugins currently visit every node; irrelevant at this corpus size, worth knowing at ten
  thousand notes.

---

## Follow-ups this audit produces

Applied on this branch (`chore/52-deps`):

1. `scripts/` deleted, `puppeteer` dropped, `CONTRIBUTING.md` corrected — `01aed8f`.

Its own commit, next, small and mechanical:

2. Drop `@astrojs/check` and `@tailwindcss/typography` (declared, never invoked).
3. Drop `autoprefixer` and its two lines in `astro.config.mjs`; the receipt is a
   `dist/_astro/*.css` diff of exactly one `-webkit-backdrop-filter` line.

A ticket, because it changes what every install runs and wants its own green CI:

4. **`typescript` `^5.6.0` → `^7.0.0`.** Sequenced after 2. Admission test: distinct outcome
   (a 5x faster `prepare` for every consumer), independently schedulable, evidenced (the
   measurements above), outside any existing ticket's contract. All four hold.

Tickets, because they add capability:

5. **`commune render`** on `createMarkdownProcessor` (Part 3, item 1).
6. **Heading anchors for `[[Note#Heading]]`** via `rehypeHeadingIds` (Part 3, item 2).

Delete-only edits, on any branch:

7. `README.md` lines 16, 258-265 and 377 claim a Pagefind search that was removed.

Recorded, not ticketed:

8. `gray-matter` → `js-yaml@4` plus a fence regex, when someone is already in the graph core
   with `backlinks.json` as the receipt — most naturally on #7's branch, where devon-wiki's
   copy has to come out byte-identical anyway. Removes a six-year-old second YAML parser
   (`js-yaml@3.14.1`) from every install. Agrees with gray-matter on 12 of 12 files today.
9. `globby` → `fsPromises.glob`, when `engines.node` moves to `>=22.17.0`.
10. `matter.stringify()` as the core's write half, behind #19/#10.
11. Native `document.startViewTransition()` in `panes.ts`, inside #8.

---

## Sources

Fetched or measured 2026-09-03.

**Measured in this worktree** (Node v22.23.1, astro 7.2.10, Vite 8.2.2, macOS 25.6.0 arm64):
`npm view` for every version, publish date and dependency set quoted above;
`gh api repos/{jonschlinkert/gray-matter,sindresorhus/globby,Flet/github-slugger}`;
`node_modules/astro/package.json`, `astro/dist/content/utils.js`,
`@astrojs/internal-helpers@0.11.0/dist/frontmatter.js`,
`@astrojs/markdown-remark@7.3.0/package.json`, `vite@8.2.2/dist/node/chunks/node.js`;
the globby / `fsPromises.glob` comparison; the gray-matter vs `js-yaml@4.3.2` parse of all 12
files under `src/content`, and the js-yaml 3.14.1 vs 4.3.2 `yes`/`no`/`on` and duplicate-key
probe; the autoprefixer with/without PostCSS run and the `dist/_astro/*.css` prefix census;
the `tsc` 5.9.3 vs 7.0.2 compile; the packed-tarball type-check probe;
`du -sh ~/.cache/puppeteer`.

**Fetched:**

- Node.js v22 `fs` documentation — `doc/api/fs.md`, `nodejs/node` branch `v22.x`
  (`fsPromises.glob` added v22.0.0, "Marking the API stable" in v22.17.0, PR 57513;
  negation patterns unsupported in `exclude`).
- <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/> — TypeScript 7.0,
  released 2026-07-08; the Go port becomes `tsc`; 8-12x; old compiler as
  `@typescript/typescript6`; no programmatic API; "Vue, Svelte, Astro, MDX, and Angular
  template type-checking cannot yet use TypeScript 7".
- <https://docs.astro.build/en/guides/typescript/> — `astro check` is still the named CLI
  for checking `.astro` and `.ts`.
- <https://docs.astro.build/en/reference/content-loader-reference/> — loader API; loaders run
  at build time.
- <https://docs.astro.build/en/reference/dev-toolbar-app-reference/> — `addDevToolbarApp`,
  `defineToolbarApp`, `init(canvas, app, server)`, the `astro:server:setup` `toolbar` object.
- <https://docs.astro.build/en/guides/view-transitions/> — `<ClientRouter />` from
  `astro:transitions`; bundled module scripts execute once; `fallback`;
  `prefers-reduced-motion`; the note that the component "will increasingly become
  unnecessary".
- <https://pptr.dev/guides/what-is-puppeteer> — Puppeteer controls "Chrome or Firefox over
  the DevTools Protocol or WebDriver BiDi".

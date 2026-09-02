# Senior review of the #18 plan — graph CLI over the existing core

Reviewed 2026-09-02 against worktree `179d2cf` (= `main`), Node v22.23.1, pnpm 10.19.0, astro 7.2.10. Frozen artifact: `junior-plan-18.md` (Source A = issue body, Source B = today's rescope). Every codebase claim below was checked in this worktree; every best-practice claim carries a fetched source and date or is marked `[training-data, unverified]`.

Evidence gathered before critique (Phase 1):

- `pnpm test` → 34 pass. `pnpm build` → green, prints `41 total backlinks across 11 entries` and `PASS: 1 standalone page indexed…`; `public/backlinks.json` is committed and byte-identical after a build. 28 `Broken link` warnings on the engine's own template content today.
- `src/lib/graph.ts` run with `cwd` = devon-wiki (read-only, no edits): 78 entries (73 notes, 4 research, 1 page), 372 edges, 372 resolved, 0 broken, 0 duplicate titles, 5 entries with zero inbound. The core already works on the live corpus with zero changes.
- Empirical, this machine: `pnpm add file:../eng` hard-links the package into `node_modules/.pnpm/eng@file+..+eng/…`; a `bin/commune.mjs` that imports `../src/lib/graph.ts` dies with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, with or without `--experimental-strip-types`. `pnpm add link:../eng` (symlink) runs fine. Local `node bin/commune.ts` with a shebang also runs fine.
- `node:util.parseArgs` on v22.23.1: `allowPositionals`, `allowNegative`, `multiple`, `tokens` all work; strict errors carry `ERR_PARSE_ARGS_UNKNOWN_OPTION` / `ERR_PARSE_ARGS_INVALID_OPTION_VALUE` / `ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL`. Stability 2 (Stable) since v20 (Node util docs v22.x/v24.x, fetched 2026-09-02).
- Astro 7 `astro:build:done` signature is `{ pages, dir: URL, assets, logger }` (`node_modules/astro/dist/types/public/integrations.d.ts:369-375`); `new URL('file:///tmp/a b/dist/').pathname` → `/tmp/a%20b/dist/`.
- pnpm 10 ignores `esbuild` and `puppeteer` build scripts by default (install output), so CI will not download Chromium.

---

## Senior Review

**Altitude diagnosis:** mixed — Source B is at the right altitude for the refactor, the dogfood and the CI hygiene (concrete files, a byte-identical proof, a falsifiable sentence), but it fogs the three things a build lane cannot decide alone: what `graph related` actually computes, what any command's JSON looks like, and what `--root` points at — and the success sentence it offers is unrunnable against the core as it exists.

### Blockers

- **[B1] `--root` in the success sentence contradicts the core's path model.** The sentence runs `--root …/devon-wiki/src/content`, but `CONTENT_DIRS` are `src/content/notes` etc. *relative to the project root* (`src/lib/graph.ts:29-33`), `loadContentEntries()` takes no root at all and globs relative to `process.cwd()` (`graph.ts:130-134`), and `ContentEntry.file` is documented as "relative to the project root" (`graph.ts:55-56`) and feeds `toUrlPath`'s `path.relative(CONTENT_DIRS[collection], file)` (`graph.ts:86-87`). Pointing root at `src/content` silently changes slug derivation and every `file` value. Verified alternative: with `cwd` = the devon-wiki *project* root the unmodified core loads all 78 entries and resolves all 372 edges. — **Fix:** `--root <dir>` means the project root (the directory that contains `src/content`), default `process.cwd()`; thread it as a parameter (`loadContentEntries({ root })` → `globby(pattern, { cwd: root })`, `readFile(path.join(root, file))`), never `process.chdir`. Reject a root without `src/content` with exit 1. Rewrite the success sentence accordingly (v2 below).

- **[B2] `graph related <path|text>` has no semantics.** "What an arbitrary blob of text connects to" is the primitive #19's connect step runs on and #10's skills will be written against, yet the plan never says what "connects" means for text that contains no links. A lane either invents ranking (product direction) or ships link-extraction only and calls it done. Nothing in the core today computes anything but explicit edges (`extractLinks`, `graph.ts:296-316`). — **Fix:** define v1 as two deterministic buckets, both computable from what exists: `links` = every edge extracted from the blob (`extractLinks(text, frontmatter)`) with its resolution or `null`; `mentions` = case-insensitive whole-word occurrences of any entry's title or alias in the code-stripped text, excluding the source entry itself, ordered by count then title. A `path` argument additionally returns `inbound`. Fuzzy or semantic similarity is explicitly out of scope and is an open question for Devon (below). Shape in the design section.

- **[B3] "Findings in the payload" with no payload.** No JSON shape is given for any of the three commands, no rule for where warnings go when stdout is JSON, and no error shape for exits 1 and 2. This is the contract #10, #19 and #24 consume; leaving it to the lane means the skills get written against whatever fell out. Research found no single standard envelope — the de-facto shape is *bare payload with top-level summary counts on stdout; all diagnostics on stderr; a JSON error object on stderr when the command fails in JSON mode* (Semgrep `{results, errors, paths, version}`; oxlint `{diagnostics, number_of_files…}`; lychee stats object; clig.dev "machine readable → stdout, logs/errors → stderr"; Arcjet 2026-06-02 and Gibil 2026-03-28 stderr error objects; all fetched 2026-09-02). Findings-style reports converge on ESLint/SARIF vocabulary: `{ file, line?, ruleId, severity, message }` plus counts. — **Fix:** the schemas in the design section, with a top-level integer `schema: 1` so the contract can evolve (SchemaVer practice, anchore/syft schema README, fetched 2026-09-02).

### Major

- **[M1] The bin as planned breaks the moment #7 ships a `file:` dependency, and the plan does not say so.** `node bin/commune.mjs` importing `../src/lib/graph.ts` works in-repo (Node 22.18+ strips types by default — v22.18.0 release notes, 2025-07-31) but Node "refuses to handle TypeScript files inside folders under a `node_modules` path" (Node docs `typescript.html`, identical wording in v22.23.2, v24.20.0 and v26.8.1, fetched 2026-09-02; implementation is a path regex in `lib/internal/util.js`). Reproduced today with pnpm 10.19.0: `file:` hard-links, `.ts` import throws; `link:` symlinks, works. pnpm issue #10602 (2026-02-12, open) reports the same under `pnpm deploy`. Research #5's conclusion therefore still holds on Astro 7 / Node 22.23. — **Fix:** not this ticket's to solve, but the plan must (a) record the constraint on #7 with the reproduction, (b) keep the bin a one-line shell (`bin/commune.mjs` → `src/cli/main.ts`) so #7's fix — `module.registerHooks` + `module.stripTypeScriptTypes` in the bin (both "1.2 Release candidate", Node module docs, fetched 2026-09-02), shipping compiled JS, or switching devon-wiki to `link:` — is local to one file.

- **[M2] `check`'s "non-canonical WikiLink titles" would be a second copy of a rule that already ships.** The canonical-title rule lives in `scripts/test-search-index.mjs:41-70` with its own lookup table and regex. Two copies of one rule is the bug class #3 was opened to kill (`graph.ts:4-8`). — **Fix:** move the rule into the core as a check function; `check` reports it and the gate script consumes the same function for its assertion 2 (keeping its exit-1 behaviour — it is a gate, per the map's Greptile-derived rule). One implementation, two callers.

- **[M3] The success sentence is not falsifiable on the numbers that matter.** It names `15 pages, 41 backlinks across 11 entries` for the build but gives no expected result for the two new commands. Measured baselines exist: engine `check` must report 28 `broken-link` findings and 0 `duplicate-name`/`ambiguous-target`; devon-wiki `graph query` must return 78 entries with 372 resolved edges and 0 broken. Without these, "runs on the live corpus" is satisfied by any output. — **Fix:** put the numbers in the sentence (v2 below) and in the PR receipt.

- **[M4] Moving `buildBacklinksGraph` into the core is under-specified on the one thing the CLI needs: diagnostics as data.** Today the function takes a `logger` and *prints* broken links inline (`astro.backlinks.ts:172, 213-220`); a core that logs cannot put findings in a payload. `NoteMetadata` (`astro.backlinks.ts:157-170`) and `STAR_CONFIG` must move with it, and `backlinks.json`'s shape is a runtime contract read by four client scripts plus a build-time import (`src/components/{BacklinksScript,StarredLinksScript,HeaderStarScript,SearchModal}.astro`, `src/pages/notes/[...slug].astro:36`). — **Fix:** `buildGraph(entries)` is pure and returns `{ nodes, diagnostics, totalBacklinks }`; the integration renders diagnostics through `logger.warn` with the *same* line format so build output is unchanged; `toBacklinksJson(graph)` reproduces today's bytes. Also note `lookupCache` (`graph.ts:230-247`) is process-global and cwd-bound — the CLI must not call `getLinkLookup()`; it builds its own lookups from the root it was given.

- **[M5] Collision and ambiguity warnings (item d) are untestable against real content.** Both corpora have zero duplicate titles and zero duplicate basenames (verified today; #18's own comment says the same), and `tests/graph.test.mjs` resolves against the real `src/content` (`tests/graph.test.mjs:23-30`). — **Fix:** add `tests/fixtures/vault/` (a minimal project root with `src/content/{notes,research,pages}`) containing one duplicate title, one basename/title collision, one broken link, one isolated note and one piped wikilink. CLI tests spawn the bin with `--root tests/fixtures/vault` and assert both the parsed JSON and the exit code.

- **[M6] "A bin" names no parser and no dispatch.** For three subcommands and boolean/string flags `node:util.parseArgs` is sufficient and dependency-free (Stable, Node docs; current guides still place it as the zero-dependency choice — PkgPulse 2026-03-08, OneUpTime 2026-01-22). It has no subcommand support, so dispatch is a two-pass parse: leading positionals route, then `argv.slice(n)` is parsed strictly per subcommand (verified locally). Commander would *fight* the contract — its parse errors default to exit 1 (`lib/command.js`, fetched 2026-09-02), not 2. — **Fix:** decide `parseArgs`, no dependency; map `ERR_PARSE_ARGS_*` to exit 2.

### Minor

- **[m1]** "73 notes" undercounts the corpus the graph sees: 78 entries (73 notes + 4 research + 1 page). Use 78.
- **[m2]** Bin name: the map and the sentence say `commune`; `package.json` is still `commune-publish` with no `bin`. Use `"bin": { "commune": "bin/commune.mjs" }` now; the package rename is #7's.
- **[m3]** Pin the runtime the repo already depends on: `engines.node: ">=22.18.0"` (first release with default type stripping; Astro's floor is only `>=22.12.0`) and a `.nvmrc` that CI reads. Someone on 22.12–22.17 gets a confusing syntax error today.
- **[m4]** Define `--orphans` as *isolated* (zero inbound **and** zero outbound), per the #18 comment warning against copying Obsidian's incoming-only bug; offer `--deadends` (zero outbound) separately.
- **[m5]** `--json` should be an explicit flag, not TTY-detected. `gh`, Greptile, Semgrep and clig.dev all use an explicit flag; oxlint's agent auto-detect is the outlier. Auto-switching makes `commune check | tee` behave differently from `commune check`.
- **[m6]** Findings should carry an optional `line` from day one (ESLint/SARIF/remark-validate-links all do). `extractLinks` does not track offsets today; leave `line` optional in the schema and add offsets when #24 needs them.
- **[m7]** The build already computes the graph twice (`astro:config:setup` and `astro:build:done`, `astro.backlinks.ts:265-301`), printing the summary twice. Pre-existing, out of scope; do not "fix" it in this ticket or the byte-identical proof loses its meaning.

### What the junior got right

- **Item 1 is done.** Verified stronger than claimed: the unmodified core loads and resolves the whole devon-wiki corpus. Kept.
- **`backlinks.json` byte-identical as the proof** of the refactor. Exactly the right invariant; it is committed, so `git diff --exit-code public/backlinks.json` is the check. Kept and made explicit.
- **Scoping `check` v1 to link integrity so #17 does not block**, with the `collection` field kept so collapsing collections changes a value, not a shape. Kept.
- **Exit codes report completion, not findings.** Matches the corrected map, Greptile's documented contract, and the growing agent-tool practice (Semgrep exits 0 with findings unless `--error`). Kept, with the gate script explicitly retaining its exit-1 role.
- **`--root` as the dogfood without waiting for #7.** Right idea, wrong target directory (B1).
- **The `dir.pathname` bug is real** on Astro 7 (`dir: URL`; `pathname` percent-encodes). Astro's own docs example is `fileURLToPath(new URL('./x.json', dir))` (integrations reference, fetched 2026-09-02). Kept.
- **CI is genuinely missing** (no `.github/workflows` in either repo) and cheap to add. Kept.
- Frontmatter drift as a **follow-up commit, not a ticket** — matches the map's admission test.

---

## Promoted Plan (v2)

### 1. Goal and non-goals

Make the content graph queryable with no Astro process, from a `commune` binary whose JSON output is the contract the authoring skills (#10), the connect step (#19) and `rename` (#24) are built on; make the Astro integration a thin consumer of that core; prove both on devon-wiki's live corpus without modifying it.

Out of scope: semantic or fuzzy relatedness; frontmatter-drift checks (follow-up commit after #17); packaging the bin for `file:` consumption (#7, with the constraint recorded there); the Obsidian oracle; `rename`; changing `backlinks.json`'s shape or the double build in the integration; any content edit in either repo.

### 2. Decisions

| # | Decision | Chosen | Strongest rejected | Evidence |
|---|---|---|---|---|
| D1 | Arg parsing | `node:util.parseArgs`, strict per-subcommand schema, two-pass dispatch, no dependency | Commander (generated help, `choices`) — but its usage errors exit 1 by default and it gains no runtime range (floor is Node 22.12) | Node util docs v22/v24 (Stable); Commander `lib/command.js`; local run 2026-09-02 |
| D2 | Exit codes | `0` finished (findings or none) · `1` could not finish · `2` invalid invocation. Gate behaviour stays in `scripts/test-search-index.mjs`, which keeps exit 1 | Linter convention (ESLint/Ruff: 1 on findings) — rejected by the map; indistinguishable from a crash for an agent | Map charting decision; Greptile docs; Semgrep `--error` opt-in; argparse/Go flag/clap all use 2 for usage |
| D3 | Output mode | Text by default; `--json` explicit flag; one JSON document per run, 2-space indented, on stdout; everything else on stderr | TTY auto-detection (oxlint agent mode) — surprising under pipes | clig.dev; gh `--json`; Greptile `--json` |
| D4 | JSON envelope | Bare payload with `schema: 1` and `root`; findings/entries arrays plus `summary` counts; on exit 1/2 in JSON mode, `{"error":{"code","message"}}` on **stderr**, nothing on stdout | `{ok,data,errors}` wrapper — no fetched source uses it for success payloads | Semgrep, oxlint, lychee shapes; Arcjet/Gibil error objects; syft SchemaVer |
| D5 | `--root` | Project root (contains `src/content`); default `cwd`; absolute internally; `file` fields stay root-relative POSIX | Content dir — breaks slug derivation and `file` semantics (B1) | `graph.ts:29-33, 55-56, 86-87`; devon-wiki run |
| D6 | `related` v1 | Deterministic: `links` (extracted + resolved) and `mentions` (whole-word title/alias hits); `inbound` when the source is a graph entry | Any ranking/similarity — product direction, open question | B2 |
| D7 | `check` rules v1 | `broken-link` (warning), `ambiguous-target` (error), `duplicate-name` (error), `noncanonical-title` (error), all from one core function that the gate script also calls | Keeping the rule copy in the script — duplicate-copy bug class | M2; `scripts/test-search-index.mjs:41-70`; build today warns only on broken links |
| D8 | Bin layout | `bin/commune.mjs` (`#!/usr/bin/env node`, one import) → `src/cli/main.ts`; `package.json` `bin: { commune }`, `engines.node >=22.18.0`, `.nvmrc` `22` | `.ts` bin — pnpm's shim execs a shebang-less `.ts` directly and it fails; either way dies under `file:` | Node `typescript.html`; pnpm cmd-shim source; local repro |
| D9 | Orphan semantics | `--orphans` = zero inbound and zero outbound; `--deadends` = zero outbound; unresolved is `check`'s business | Obsidian CLI's incoming-only orphans | #18 comment 2026-09-02 05:44 |
| D10 | Tests | `node --test`, fixture vault under `tests/fixtures/vault`, CLI tests spawn the bin and parse stdout | Testing only the library — leaves exit codes and stdout/stderr split unproven | M5; Node test docs (quoted globs) |

### 3. Design

**Core API (`src/lib/graph.ts`, all Astro-free):**

```ts
export interface GraphOptions { root?: string }               // default process.cwd()
export function loadContentEntries(opts?: GraphOptions): Promise<ContentEntry[]>

export interface NoteMetadata { /* moved verbatim from astro.backlinks.ts:157-170 */ }
export interface Diagnostic {
  rule: 'broken-link' | 'ambiguous-target' | 'duplicate-name' | 'noncanonical-title';
  severity: 'error' | 'warning';
  file: string;            // root-relative
  line?: number;           // optional in v1
  message: string;
  target?: string;         // the link text or name involved
  candidates?: string[];   // urlPaths, for ambiguous-target / duplicate-name
  canonical?: string;      // for noncanonical-title
}
export interface Graph {
  nodes: Record<string, NoteMetadata>;   // keyed by urlPath, insertion order = entry order
  diagnostics: Diagnostic[];
  totalBacklinks: number;
}
export function buildGraph(entries: ContentEntry[]): Graph     // pure; stars applied; no logging
export function calculateStars(nodes: Map<string, NoteMetadata>): Set<string>
export function checkEntries(entries: ContentEntry[], graph: Graph): Diagnostic[]  // graph.diagnostics + canonical-title + duplicate-name
export function toBacklinksJson(graph: Graph): Record<string, NoteMetadata>       // today's bytes
export function related(entries, graph, input: RelatedInput): RelatedResult
```

`buildLinkLookup` gains collision detection: while building, a second entry claiming a lowercased title or alias, or two entries sharing a basename, records `duplicate-name`; resolution stays last-wins (unchanged behaviour, now reported). `ambiguous-target` is raised when a `name` link matches more than one entry via basename-vs-title disagreement. Source-relative disambiguation remains out of scope (no nested content in either corpus).

**Integration (`astro.backlinks.ts`) after the move:** `loadContentEntries()` → `buildGraph()` → `for (d of graph.diagnostics) logger.warn(format(d))` using today's exact `⚠️  Broken link in …` string → `writeBacklinksFile(fileURLToPath(new URL('./backlinks.json', dir)), toBacklinksJson(graph))`. Star config stays in the core; the integration keeps no graph logic.

**CLI (`src/cli/`):**

```
commune graph query [--root <dir>] [--collection <c>]… [--tag <t>]… [--status <s>] [--orphans] [--deadends] [--json]
commune graph related <path|text|-> [--root <dir>] [--json]
commune check [--root <dir>] [--json]
commune --help | <cmd> --help
```

Filters: repeated `--collection`/`--tag` are any-of within a flag, all-of across flags. `related`'s positional is a file if it exists (absolute, or relative to root or cwd), stdin if `-`, otherwise literal text.

`graph query --json`:
```json
{ "schema": 1, "root": "/abs/project", "count": 78,
  "entries": [ { "urlPath": "/notes/atomic-notes/", "title": "Atomic Notes", "collection": "notes",
                 "file": "src/content/notes/atomic-notes.md", "slug": "atomic-notes",
                 "tags": [], "status": "live", "aliases": [], "updated": "2026-01-21",
                 "outbound": ["/notes/evergreen-notes/"], "inbound": ["/notes/commune/"] } ] }
```

`graph related --json`:
```json
{ "schema": 1, "root": "/abs/project",
  "source": { "kind": "file" | "text" | "stdin", "file": "src/content/notes/x.md", "urlPath": "/notes/x/" },
  "links":    [ { "kind": "name", "target": "Evergreen Notes",
                  "resolved": { "urlPath": "/notes/evergreen-notes/", "title": "Evergreen Notes", "collection": "notes", "file": "…" } | null } ],
  "mentions": [ { "urlPath": "/notes/atomic-notes/", "title": "Atomic Notes", "collection": "notes", "file": "…", "matched": "atomic notes", "count": 2 } ],
  "inbound":  [ { "urlPath": "…", "title": "…", "collection": "…", "file": "…" } ],
  "summary":  { "links": 3, "resolved": 2, "unresolved": 1, "mentions": 4, "inbound": 2 } }
```
Mentions: run `stripCode()` on the text, match each entry's title and aliases as case-insensitive whole words (`\b` on both sides, titles ≥ 3 characters), skip the source entry, sort by `count` desc then `title`. `inbound` is `[]` for text/stdin.

`check --json`:
```json
{ "schema": 1, "root": "/abs/project",
  "summary": { "entries": 11, "edges": 41, "errors": 0, "warnings": 28,
               "byRule": { "broken-link": 28, "ambiguous-target": 0, "duplicate-name": 0, "noncanonical-title": 0 } },
  "findings": [ { "rule": "broken-link", "severity": "warning", "file": "src/content/notes/Atomic Notes.md",
                  "message": "[[Ask the Brain]] does not resolve", "target": "Ask the Brain" } ] }
```

**Failure handling:** missing/invalid root or `src/content` → exit 1, stderr `{"error":{"code":"ENOCONTENT","message":…}}` (text mode: one line). Unreadable file or frontmatter that gray-matter cannot parse → exit 1 with `EPARSE` and the file named; not a finding in v1. Unknown flag, missing value, unknown subcommand → exit 2 with `EUSAGE` and the subcommand's usage on stderr. Nothing ever goes to stdout in JSON mode except the one document.

**Text mode:** one line per entry/finding, no colour library, `summary` as the last line. It is the fallback rendering, not the contract.

**Fixture vault** (`tests/fixtures/vault/src/content/…`): two notes titled identically, a note whose basename equals another's title, a note linking to a nonexistent title, an isolated note, a piped wikilink, a research entry and a page. Small enough to read in one screen.

### 4. Sequencing

Each step is one or two commits in the repo's `type(#18): subject` form; each has a check that fails before and passes after.

1. **Root parameter + fixture vault.** `loadContentEntries({ root })`; existing 34 tests unchanged; new tests load the fixture via `--root`-equivalent option. *Verify:* `pnpm test` passes; `node -e` load of devon-wiki root returns 78 entries.
2. **Move graph construction into the core, integration goes thin.** `NoteMetadata`, `STAR_CONFIG`, `calculateStars`, `buildGraph`, `toBacklinksJson`; diagnostics as data; `fileURLToPath` fix. *Verify:* `pnpm build && git diff --exit-code public/backlinks.json` is clean and build stdout still shows `41 total backlinks across 11 entries` and 28 warnings; `astro.backlinks.ts` no longer imports `globby`, `gray-matter` or computes anything.
3. **Bin + `graph query`.** `bin/commune.mjs`, `src/cli/main.ts`, parseArgs dispatch, exit-code mapping, `engines`, `.nvmrc`. *Verify:* CLI tests spawn `node bin/commune.mjs --root tests/fixtures/vault graph query --json`, parse stdout, assert exit 0, and assert `--bogus` exits 2 with empty stdout.
4. **`check`.** Core `checkEntries`; canonical-title rule moved out of `scripts/test-search-index.mjs`, which now imports it and keeps `FAIL`/exit 1. *Verify:* engine `commune check --json` reports `warnings: 28, errors: 0`; fixture reports one of each rule; `pnpm build` still prints `PASS`.
5. **`graph related`.** *Verify:* fixture tests for file, text and stdin inputs; `related 'src/content/notes/Atomic Notes.md' --json` on the engine returns non-empty `links` and `inbound` with no Astro import anywhere on the path (`grep -L astro` over `src/lib src/cli bin`).
6. **CI.** `.github/workflows/ci.yml`: `pnpm/action-setup`, `actions/setup-node` with `node-version-file: .nvmrc`, `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`, `node bin/commune.mjs check --json > /dev/null`. *Verify:* green run on the PR.
7. **Dogfood receipt, read-only.** Run `graph query --json` and `check --json` with `--root ~/Documents/GitHub/dmthepm/devon-wiki`; paste counts into the PR body and #18. *Verify:* 78 entries, 372 resolved edges, 0 broken, 0 duplicate-name; `git -C devon-wiki status` clean.

**Falsifiable success sentence (v2):** *"`node bin/commune.mjs graph related 'src/content/notes/Atomic Notes.md' --json` exits 0 and returns its resolved links and inbound entries with no Astro module loaded; `node bin/commune.mjs --root ~/Documents/GitHub/dmthepm/devon-wiki graph query --json` returns 78 entries and `check --json` reports 0 errors and 0 broken links on that corpus without writing to it; on the engine `check --json` reports exactly 28 `broken-link` warnings and 0 errors; `pnpm build` leaves `public/backlinks.json` byte-identical and prints `41 total backlinks across 11 entries` and `PASS: 1 standalone page indexed`; `pnpm test` passes including tests that spawn the bin; CI runs `pnpm test && pnpm build` green."*

### 5. Risks and rollback

- **`backlinks.json` shape regression** would break four client scripts and the note page. Guarded by the byte-identical check on every commit of step 2; rollback is reverting that commit alone.
- **Diagnostic ordering or wording drift** changes build logs but not artifacts; acceptable, but keep today's warning string so the receipt is a clean diff.
- **`file:` packaging wall (M1)** is inherited by #7, not created here. The thin-bin layout keeps the eventual fix to one file. Recorded on #7 with the repro.
- **#17 collapsing collections** changes `collection` values and possibly `CONTENT_DIRS`; every command already carries `collection` per entry, and `CONTENT_DIRS` stays the single place to edit.
- **Hardest to undo:** the JSON contract once #10 writes skills against it. `schema: 1` plus "add fields, never remove" is the escape hatch; a breaking change bumps the integer.

### 6. Open questions for a human

See the section after the delta.

---

## Delta summary

- **`--root` now means the project root, not `src/content`**, because the core derives slugs and `file` values from that root (B1); the success sentence was rewritten so it is actually runnable.
- **`graph related` got a definition**: deterministic `links` + `mentions` (+ `inbound` for a file), no ranking; similarity is pushed to a human decision instead of being invented by a lane (B2).
- **JSON contracts written down** for all three commands, with `schema: 1`, stdout/stderr rules, and error objects, grounded in what Semgrep/oxlint/lychee/ESLint/Greptile actually emit (B3).
- **Diagnostics became data** in the core so the CLI and the integration render the same findings; the canonical-title rule moves into the core so the gate script and `check` share one implementation (M2, M4).
- **Fixture vault and bin-spawning tests** added, because neither real corpus contains a collision or an ambiguity to test against (M5).
- **Constraint recorded, not solved:** the bin cannot be consumed through `pnpm file:` on any current Node (reproduced today), so the bin is one line and the fix is handed to #7 (M1).
- Named the parser (`parseArgs`, no dependency), pinned `engines.node >=22.18.0`, fixed the corpus count (78), and defined orphan = isolated.

## Open questions for you

1. **Relatedness beyond explicit links and title mentions.** v1 is deterministic. Do you want TF-IDF/embedding similarity as part of the connect step, and should that be decided inside #19's prototype rather than here?
2. **Bin name.** The map and this plan use `commune`; the package is still `commune-publish`. Confirm `commune` as the bin now, and leave the package rename to #7.
3. **Broken links: warning or error?** Today the build only warns and renders the link as plain text. v1 keeps `broken-link` as a warning; if you want a hard gate, it should be a separate flag (`check --fail-on error|warning`) or a gate verb, per the map's Greptile rule. Which?
4. **#7's packaging answer.** Given the `file:` type-stripping wall, the options are `link:` (symlink; works today), compiled JS output, or a self-registering hook in the bin. None is this ticket's call, but the plan assumes #7 picks one before the skills (#10) can invoke `commune` from an installed package.
5. **Line/column in findings.** Optional in v1. #24's link rewriting will need offsets; add them now (small change to `extractLinks`) or when #24 lands?

# Research: does Obsidian expose a graph an external CLI can query?

- **Context:** [dmthepm/commune-wiki#14](https://github.com/dmthepm/commune-wiki/issues/14) (parent map: [#2](https://github.com/dmthepm/commune-wiki/issues/2))
- **Date:** 2026-09-02
- **Question:** Commune plans to own a content graph. Obsidian already has one. Should commune own the graph outright, defer to Obsidian's, or own it and emit something Obsidian's tooling can consume?
- **Method:** primary sources only — Obsidian's help docs, developer docs, changelog and official forum; the actual plugin and CLI source (GitHub, npm registry, package tarballs); plus direct inspection of a real Obsidian install on this machine (app 1.12.7, vault at `~/Documents/GitHub/devon`). Every behavioural claim below traces to a cited doc, a cited source file, or a command run locally and shown inline.

## Answer (TL;DR)

**Commune should own the graph outright, and emit plain `[[wikilinks]]` in the markdown so Obsidian keeps building its own from the same source of truth.** Not "defer", not "sync".

The reason is a single hard fact that survived every avenue checked: **Obsidian's link graph exists only inside a running Obsidian process.** It is never written into the vault. It is persisted — but into the Electron app's Chromium IndexedDB store outside the vault, in a format that a) is LevelDB, which "may only be opened by one process at a time", so it is unreadable *while* Obsidian runs, and b) is Blink-serialised, so it is only parseable *when* Obsidian is closed by reimplementing a Chromium forensics reader.

The thing that genuinely changed in 2026 is that Obsidian now ships an **official CLI** (1.12.0, 2026-02-10) with real graph verbs — `backlinks`, `links`, `orphans`, `deadends`, `unresolved`, `tags`, `base:query` — all with `format=json`. It is a good tool. It is also explicitly documented as requiring the desktop app: *"Obsidian CLI requires the Obsidian app to be running."* And **Obsidian Headless**, the standalone npm client that does not need the app, turns out to be Sync + Publish only — a file transport with no query surface at all.

So the honest verdict on the ticket's central question: **there is no machine-readable graph an external Node CLI can query with the app closed.** Commune builds in CI (`astro build`); it cannot depend on a GUI app being alive. And commune is already doing the right thing — `remark-wikilinks.ts` and `astro.backlinks.ts` on `main` derive the graph from the markdown and emit `public/backlinks.json` and `public/graph.json`, with #3 consolidating them into `src/lib/graph.ts`. Keep that. The integration leg is one line of policy: **keep writing `[[wikilinks]]`**, and Obsidian rebuilds its own graph from commune's output for free.

---

## 1. Obsidian's link index: what it computes, and where it does not live

### What it computes

Obsidian's index is exposed to plugins as `MetadataCache`. Two fields carry the whole graph ([MetadataCache, developer docs](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache)):

| Field | Type | Doc text (verbatim) |
|---|---|---|
| `resolvedLinks` | `Record<string, Record<string, number>>` | "Contains all resolved links. This object maps each source file's path to an object of destination file paths with the link count." |
| `unresolvedLinks` | `Record<string, Record<string, number>>` | "Contains all unresolved links. This object maps each source file to an object of unknown destinations with count." |

Note what this shape *is*: an adjacency map with edge weights, forward direction only. **Backlinks are not stored** — they are derived by inverting `resolvedLinks`. Per-file metadata comes from `getFileCache(file)` / `getCache(path)` returning [`CachedMetadata`](https://docs.obsidian.md/Reference/TypeScript+API/CachedMetadata): `links`, `embeds`, `tags`, `headings`, `sections`, `listItems`, `frontmatter`, `frontmatterLinks`, `frontmatterPosition`, `referenceLinks`, `footnotes`, `footnoteRefs`, `blocks` — all optional.

Aliases are not a first-class cache field; they arrive through `frontmatter.aliases` and are applied during link resolution by `getFirstLinkpathDest(linkpath, sourcePath)`, documented only as "Get the best match for a linkpath" (since 0.12.5). That resolution rule — Obsidian's shortest-path-when-possible matching, alias handling, and ambiguity tie-breaking — **is not specified anywhere in the public docs**. [Internal links](https://obsidian.md/help/links) documents the syntax (`[[Note]]`, `[[Note#Heading]]`, `[[Note#^block]]`, `[[Note|Alias]]`, `![[embed]]`) and the *Settings → Files and links* toggles, but says nothing about how ambiguous names resolve. Anything that claims to mirror Obsidian's resolution is reverse-engineering it.

The index is event-driven: `on('changed')`, `on('deleted')`, `on('resolve')` (one file resolved), `on('resolved')` (all files resolved). Those events only fire inside the app.

### Where it is persisted — and why that does not help

Obsidian's own help page is unusually direct ([How Obsidian stores data](https://obsidian.md/help/data-storage)):

> "In order to provide a fast experience while using the app, Obsidian maintains a local record of metadata about the files in your vault called the metadata cache."

> "IndexedDB is a low-level, client-side database that Obsidian uses for backend storage." — it "preserves the metadata cache when the application closes."

And it names the app-data location: macOS `/Users/<user>/Library/Application Support/obsidian`, Windows `%APPDATA%\Obsidian\`, Linux `$XDG_CONFIG_HOME/obsidian/` or `~/.config/obsidian/`. The `.obsidian` folder *inside* the vault is described as holding "preferences specific to that vault, such as hotkeys, themes, and community plugins"; the only files it names are `workspace.json` and `workspaces.json`. No index.

Verified locally against a real vault (`~/Documents/GitHub/devon/.obsidian`) — the entire contents:

```
app.json  appearance.json  core-plugins.json  workspace.json
```

Four settings files. **No link index, no graph data, no cache, in the vault at all.**

The cache is instead here (verified on this machine, Obsidian 1.12.7):

```
~/Library/Application Support/obsidian/IndexedDB/app_obsidian.md_0.indexeddb.leveldb   # 64 MB
```

Grepping the `.ldb` segment files for cache field names confirms this is the metadata cache, and that the link index is in there:

```
3608  headings      845  frontmatter      341  listItems      32  embeds
1157  linksA         99  graph             88  Links
```

Two properties make it useless as an external interface, and they are mutually exclusive in the worst way:

1. **While Obsidian runs, you cannot read it.** The store is LevelDB and the directory contains a `LOCK` file. Per [LevelDB's own documentation](https://github.com/google/leveldb/blob/main/doc/index.md): *"A database may only be opened by one process at a time. The leveldb implementation acquires a lock from the operating system to prevent misuse."*
2. **While Obsidian is closed, you can open it, but the values are Blink-serialised** Chromium IndexedDB records, not JSON. Reading them means running a Chromium IndexedDB forensics parser. There is no published format guarantee, and the path itself (`app_obsidian.md_0`) is keyed by the Electron *origin*, not by vault — one store holds every vault's cache.

So the persistence is exactly backwards from what an external tool wants: locked when the data is fresh, opaque when it is readable, and undocumented in both states. Treating it as an API would be building on a Chromium implementation detail.

**Version-dependent:** the `.obsidian` contents, the IndexedDB path, and the field names above are observed on Obsidian **1.12.7** (macOS, 2026-09-02). Current public release is **1.13.7** (2026-08-12, [changelog](https://obsidian.md/changelog/)). The *architecture* (cache in app-data IndexedDB, not the vault) has been stable for years and Obsidian documents it as such; the *specifics* are not contractual.

---
## 2. Dataview and Datacore

### Dataview: real graph fields, one hop, in-app only

Dataview exposes the graph through implicit `file.*` fields ([Metadata on Pages](https://blacksmithgu.github.io/obsidian-dataview/annotation/metadata-pages/)), quoted verbatim:

| Field | Doc text |
|---|---|
| `file.inlinks` | "A list of all incoming links to this file, meaning all files that contain a link to this file." |
| `file.outlinks` | "A list of all outgoing links from this file, meaning all links the file contains." |
| `file.tags` | "A list of all unique tags in the note. Subtags are broken down by each level, so `#Tag/1/A` will be stored in the list as `[#Tag, #Tag/1, #Tag/1/A]`." |
| `file.etags` | "A list of all explicit tags in the note; unlike `file.tags`, does not break subtags down" |
| `file.aliases` | "A list of all aliases for the note as defined via the YAML frontmatter." |

Link traversal in `FROM` has exactly four source types ([Sources](https://blacksmithgu.github.io/obsidian-dataview/reference/sources/)): tags, folders, specific files, and links — `[[note]]` for inbound, `outgoing([[note]])` for outbound.

Two limits matter for the serendipity surface this ticket is scoping:

- **Orphans are not a native concept.** Zero occurrences of "orphan" in the docs or `src/`. You write `LIST WHERE length(file.inlinks) = 0`.
- **One hop only.** There is no transitive closure, no shortest path, no "within N hops", no recursive construct. `FROM [[x]]` and `outgoing([[x]])` do not compose into traversal. Multi-hop means hand-rolling a BFS in DataviewJS. Dataview answers *adjacency*, not *traversal*.

Where its data comes from: both Obsidian's cache and its own inverted indices. `FullIndex` in [`src/data-index/index.ts`](https://github.com/blacksmithgu/obsidian-dataview/blob/master/src/data-index/index.ts) holds `metadataCache: MetadataCache` ("Access to in-memory metadata"), `links: IndexMap` ("Map files -> linked files in that file, and linked file -> files that link to it"), and `persister: LocalStorageCache` ("Persistent IndexedDB backing store, used for faster startup"). `file.inlinks` comes from Dataview's own inverse index ([`src/data-model/markdown.ts`](https://github.com/blacksmithgu/obsidian-dataview/blob/master/src/data-model/markdown.ts)); `FROM [[note]]` resolves via Obsidian's `resolvedLinks` ([`src/data-index/resolver.ts`](https://github.com/blacksmithgu/obsidian-dataview/blob/master/src/data-index/resolver.ts)).

**Its persistence has the same problem as Obsidian's.** From [`src/data-import/persister.ts`](https://github.com/blacksmithgu/obsidian-dataview/blob/master/src/data-import/persister.ts):

```js
this.persister = localforage.createInstance({
    name: "dataview/cache/" + appId,
    driver: [localforage.INDEXEDDB],
    description: "Cache metadata about files and sections in the dataview index.",
});
```

Electron IndexedDB keyed by `app.appId` — **nothing in `.obsidian/plugins/dataview/` to parse.**

**Headless: no.** The npm package [`obsidian-dataview`](https://www.npmjs.com/package/obsidian-dataview) (latest **0.5.68**, 2025-03-15) is typings plus the parser; `getAPI(app)` needs a live Obsidian `App`. Requiring `lib/index.js` in plain Node fails with `Cannot find module 'obsidian'`. With a stubbed `obsidian`, the *grammar* alone does work headlessly — `QUERY_LANGUAGE.query.tryParse('LIST FROM outgoing([[Foo]]) WHERE length(file.inlinks) = 0')` returns a correct AST — but the index and executor need `Vault`, `MetadataCache` and web workers. The maintainer's own position, [issue #92 "Generic library & CLI"](https://github.com/blacksmithgu/obsidian-dataview/issues/92), open since 2021-04-10: *"I like it; the direct way would be to just implement it as a TS/JS node package, and then build the CLI on top of that."* Five years later it is still open and unassigned.

**Maintenance: effectively stalled.** Last stable **0.5.68** (2025-03-15); 0.5.69/0.5.70 are tagged but labelled "(Beta)" and live only in `manifest-beta.json`. Last commit to `master` was **2025-04-08**; the only newer branch activity is two unmerged dependabot branches. 662 open issues, 2026 PRs sitting unmerged. There is **no** explicit maintenance-mode or "superseded" statement from the maintainer — the README only calls Dataview "a hobby project" — so this is a de-facto reading of ~17 months of no merges, not a declaration.

### Datacore: same architecture, same wall

Datacore is real and in the community store — confirmed in [`community-plugins.json`](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json): `{"id": "datacore", "author": "blacksmithgu", "description": "An even faster reactive query engine for the data obsessed."}`. Its [README](https://github.com/blacksmithgu/datacore) still self-describes as *"a **work-in-progress** re-imagining of Dataview"*, and the [docs](https://blacksmithgu.github.io/datacore/) place it "in a power-user stage focused on javascript/typescript savvy users". Latest release **0.1.29 (2026-03-23)**; last commit **2026-06-21**; open PRs as recent as 2026-08-16. Slow, not abandoned.

It does not change the answer. [`src/index/persister.ts`](https://github.com/blacksmithgu/datacore/blob/master/src/index/persister.ts) is a near-verbatim copy of Dataview's: `localforage.createInstance({ name: "datacore/cache/" + appId, driver: [localforage.INDEXEDDB] })`. The npm library build `@blacksmithgu/datacore` is stale at **0.1.24 (2025-05-27)** against a 0.1.29 plugin, and is documented as typings. Maintainer on a CLI, [datacore#12](https://github.com/blacksmithgu/datacore/issues/12) (2023-09-15): *"It would be possible to make a daemon service that can be queried via a CLI or RPC… you would just need to mimic the file APIs that Obsidian provides… **I'm not currently looking at implementing this.**"*

And the sharpest statement of the whole problem, from someone asking precisely commune's question ([datacore#168](https://github.com/blacksmithgu/datacore/issues/168), 2026-04-29): *"Datacore renders html inside obsidian that you can view when you open the note, but **is not persisting your tables or documents anywhere.** If you point your agent to those notes, they are going to see the datacore code, not the result of your queries."*

That is the failure mode commune would inherit by deferring: an agent reading the vault sees query source, not query results.

---
## 3. Bases — changes one axis, not the decisive one

Bases is now a **GA core plugin**, not a beta. It arrived in 1.9.0 early access (2025-05-21, [changelog](https://obsidian.md/changelog/2025-05-21-desktop-v1.9.0/)) and went public in 1.9.10 (2025-08-18, [changelog](https://obsidian.md/changelog/2025-08-18-desktop-v1.9.10/)). [Introduction to Bases](https://obsidian.md/help/bases): *"Bases is a core plugin that lets you create database-like views of your notes."*

### It is a plain YAML file in the vault

`.base` is a first-class [accepted file format](https://obsidian.md/help/file-formats) alongside `.md` and `.canvas`. Per [Bases syntax](https://obsidian.md/help/bases/syntax): *"When you create a base in Obsidian, it is saved as a `.base` file… Bases must be valid YAML conforming to the schema defined below."* Top-level keys: `filters`, `formulas`, `properties`, `summaries`, `views`. Notably: *"By default a base includes every file in the vault. There is no `from` or `source` like in SQL or Dataview."*

The container is even typed in the public API — [`BasesConfigFile`](https://docs.obsidian.md/Reference/TypeScript+API/BasesConfigFile), *"Represents the serialized format of a Bases query as stored in a `.base` file."*

### It does expose the graph — this is the part worth knowing

The naive assumption ("Bases is frontmatter-only") is wrong. From the [file properties table](https://obsidian.md/help/bases/syntax):

| Property | Doc text |
|---|---|
| `file.backlinks` | "List of backlink files. Note: This property is performance heavy. When possible, reverse the lookup and use `file.links`. Does not automatically refresh results when the vault is changed." |
| `file.links` | "List of all internal links in the note, including frontmatter" |
| `file.embeds` | "List of all embeds in the note" |
| `file.tags` | "List of all tags in the file content and frontmatter" |

Plus link functions ([Functions](https://obsidian.md/help/bases/functions)): `file.hasLink(otherFile)` — *"Returns true if `file` links to `otherFile`"* — and `link.linksTo(file)`. And the `this` context: *"When the base is in a sidebar, `this` refers to the active file… you can use `file.hasLink(this.file)` to replicate the backlinks pane."*

`file.backlinks` shipped in 1.9.7 (2025-08-05, [changelog](https://obsidian.md/changelog/2025-08-05-desktop-v1.9.7/)).

> **Doc discrepancy, worth flagging:** the [Functions](https://obsidian.md/help/bases/functions) page's File-type field table lists 11 fields and **omits `file.backlinks` and `file.embeds`**, while the syntax page lists 13 including both. The changelog confirms the syntax page is current. Do not use the Functions page as the property inventory.

Limits: it is a per-row list-valued field, not a traversal engine. No multi-hop, no shortest path, no link position/context, no unresolved links. `file.backlinks` is documented as "performance heavy" and non-auto-refreshing (1.10.0 softened this to "View will periodically refresh the results of `file.backlinks`" — [changelog](https://obsidian.md/changelog/2025-10-01-desktop-v1.10.0/)).

### But a `.base` is a query, not results

Nothing is persisted. [Introduction to Bases](https://obsidian.md/help/bases): *"All the data in Obsidian Bases is stored in your local Markdown files and their properties."* The `.base` holds the query; `QueryController` is documented as *"Responsible for executing the Bases query and evaluating filters and formulas. Notifies views of updated results."* Live, push-based, in-process.

And the expression language inside those YAML strings **has no published grammar, schema, or reference parser**. The Functions page punts on semantics: *"Bases functions follow JavaScript behavior. For complete reference documentation, refer to MDN Web Docs."* An external evaluator would have to reimplement the lexer/parser, the type system (string/number/boolean/date/duration/list/object/link/file/regex plus date arithmetic), ~100 built-ins with JS-conformant edge cases, Obsidian's wikilink resolution and link-equality rules, and its own backlink index — and would *still* fail on any base using plugin-registered functions or view types, which the docs explicitly allow.

The Bases plugin API (1.10.0+: [`registerBasesView`](https://docs.obsidian.md/Reference/TypeScript+API/Plugin/registerBasesView), [`QueryController`](https://docs.obsidian.md/Reference/TypeScript+API/QueryController), [`BasesView`](https://docs.obsidian.md/Reference/TypeScript+API/BasesView), [`BasesQueryResult`](https://docs.obsidian.md/Reference/TypeScript+API/BasesQueryResult)) hangs entirely off `Plugin`/`App`. `QueryController` extends `Component` and exposes **no public execute method** — it cannot be driven standalone. It also took a breaking change in 1.12.

**Verdict on Bases:** it moves the "what can Obsidian's query layer see" answer (it sees links), and it gives the CLI a clean `base:query … format=json`. It does not move the "app closed" answer at all.

---

## 4. CLI surfaces: what exists, what needs the app alive

Obsidian shipped **two** first-party command-line surfaces in 2026. Any plan written on the assumption that no official CLI exists is out of date.

| Surface | Official | App must be **running** | Returns data to stdout | Status |
|---|---|---|---|---|
| **Obsidian CLI** (`obsidian`) | ✅ bundled | ❌ **yes, required** | ✅ `format=json` | Shipped, stable |
| **Obsidian Headless** (`ob`) | ✅ npm | ✅ no | ✅ `--json` | Open beta — **sync/publish only** |
| `obsidian://` URI | ✅ | yes (launches it) | ✗ effectively no | Stable, legacy |
| Advanced URI plugin | ✗ community | yes | ✗ clipboard only | Active (2.0.0, 2026-07-25) |
| Local REST API plugin | ✗ community | yes | ✅ HTTP JSON + MCP | Active (5.1.0, 2026-08-01) |
| notesmd-cli (ex-`obsidian-cli`) | ✗ community | ✅ no | ✅ | Active (v0.3.7, 2026-09-01) |
| TurboVault | ✗ community | ✅ no | ✅ | Active (v1.6.0, 2026-07-18) |
| obsidian-export | ✗ community | ✅ no | n/a (exporter) | Stale (v25.3.0, 2025-03-25) |
| obsidian-metadata | ✗ community | ✅ no | ✅ | ⚠️ **archived** |

### Obsidian CLI — the real graph, but the app must be alive

Shipped in 1.12: early access 2026-02-10 ([changelog](https://obsidian.md/changelog/2026-02-10-desktop-v1.12.0/), *"Added a command line interface that lets you control Obsidian from your terminal for scripting, automation, and integration with external tools"*), public in 1.12.4 on 2026-02-27 ([changelog](https://obsidian.md/changelog/2026-02-27-desktop-v1.12.4/)). Enabled at Settings → General → Command line interface; needs the 1.12.7+ installer.

It has a dedicated **Links** command group ([Obsidian CLI](https://obsidian.md/help/cli)), reading the real metadata cache rather than re-parsing:

```
backlinks   file=<name> path=<path> [counts] [total] format=json|tsv|csv   # "List backlinks to a file"
links       file=<name> path=<path> [total]                               # "List outgoing links from a file"
unresolved  [total] [counts] [verbose] format=json|tsv|csv                # "List unresolved links in vault"
orphans     [total]                                                        # "List files with no incoming links"
deadends    [total]                                                        # "List files with no outgoing links"
tags        [file=|path=] [sort=count] [counts] format=json|tsv|csv
base:query  file=<name> view=<name> format=json|csv|tsv|md|paths
eval        code=<javascript>                                              # "Execute JavaScript and return result"
```

`eval` is the escape hatch: arbitrary JS in the app context, i.e. full `app.metadataCache.resolvedLinks`.

Vault targeting is sane: *"If your terminal's current working directory is a vault folder, that vault is used by default… Use `vault=<name>` or `vault=<id>` to target a specific vault."*

And then the constraint, stated twice on the page:

> *"Obsidian CLI requires the Obsidian app to be running. If Obsidian is not running, the first command you run launches Obsidian."*
> *"Obsidian must be running. The CLI connects to the running Obsidian instance."*

This is remote control of a live GUI, not headless evaluation. In a CI runner or a `pnpm build`, it is unusable.

### Obsidian Headless — no app needed, no graph either

This looked like it might flip the answer. It does not. [Obsidian Headless](https://obsidian.md/help/headless): *"Obsidian Headless (open beta) is a headless client for Obsidian services… Obsidian CLI controls the Obsidian desktop app from your terminal. Obsidian Headless is a standalone client that runs independently, no desktop app required."*

I pulled the published tarball to enumerate its actual surface. npm [`obsidian-headless`](https://www.npmjs.com/package/obsidian-headless), latest **0.0.14 (2026-07-30)**, first published 2026-02-27, maintainer `lishid` (Obsidian's lead developer), `engines: node >=22`, `bin: {ob: cli.js}`, **license `UNLICENSED`**. Its README opens: *"Headless client for Obsidian Sync and Obsidian Publish. Sync and publish your vaults from the command line without the desktop app."*

The complete command list: `login`, `logout`, `sync-list-remote`, `sync-list-local`, `sync-create-remote`, `sync-setup`, `sync`, `sync-config`, `sync-status`, `sync-unlink`, `publish-list-sites`, `publish-create-site`, `publish-setup`, `publish`, `publish-config`, `publish-site-options`, `publish-unlink`.

**Not one read, query, link, tag, or metadata command.** It is a file transport bound to paid Obsidian services. It gets a vault onto a machine without a GUI; it cannot answer a single graph question. (Corroborating: a [feature request asking for JSON output](https://forum.obsidian.md/t/obsidian-headless-should-have-json-ouput-like-obsidian-cli/113046) from 2026-04-05 is entirely about `sync-*` commands, with no staff reply.)

This is the one thing that could plausibly flip the verdict later — if Headless ever grows query commands. It has not.

### `obsidian://` and Advanced URI — write/navigate channels, not read APIs

[Obsidian URI](https://obsidian.md/help/uri) documents `open`, `new`, `daily`, `unique`, `search`, `choose-vault`, `hook-get-address`. It is an OS protocol handler: invoking it hands the URI to the desktop app, launching or focusing it. The only return channel is `x-callback-url` — *"Obsidian will provide the following to the `x-success` callback: `name`… `url`… `file` (desktop only)"* — which dispatches **a second URI to another registered app**, not stdout and not an exit code. A shell script cannot read it without registering its own scheme handler, and the payload is file identity only, never content or links. `x-success` is documented on `new`, `daily`, `unique`, `hook-get-address` — **not on `open` or `search`**.

[obsidian-advanced-uri](https://github.com/Vinzent03/obsidian-advanced-uri) (active: 2.0.0, 2026-07-25; last commit 2026-08-17; 1,201 stars) adds far more actions — heading/block/line navigation, writes, command invocation by ID, frontmatter edits, canvas focus. Its return channel is **the clipboard** (`exists=true` "Copies `1` to clipboard if file exists, `0` if not"). Racing the clipboard is not a data pipeline. Do not design extraction on either.

### Local REST API — the only community surface that hands you Obsidian's own link data

[coddingtonbear/obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api) is in good health: 5.1.0 (2026-08-01), last commit 2026-08-31, 2,879 stars, 3 open issues. It hosts an HTTPS server *inside* the Obsidian process (`https://127.0.0.1:27124`), so the app must be running — kill Obsidian and the port closes.

Its `NoteJson` schema ([OpenAPI](https://coddingtonbear.github.io/obsidian-local-rest-api/openapi.yaml)) has required fields `backlinks` ("Vault-relative paths of files that link to this file"), `links`, `unresolvedLinks`, plus `tags` and `frontmatter` — Obsidian's own resolved cache, per file. There is no whole-graph endpoint, so a full graph means N requests. It also ships a built-in MCP server (18 tools).

### Community CLIs: the category collapsed after 1.12

- **`Yakitrak/obsidian-cli` no longer exists under that name** — it is now [Yakitrak/notesmd-cli](https://github.com/Yakitrak/notesmd-cli), and the README says why: *"With the release of the official Obsidian CLI, this project has been renamed from 'Obsidian CLI' to 'NotesMD CLI' to avoid confusion. NotesMD CLI works without requiring Obsidian to be running."* Very active (v0.3.7, 2026-09-01; 1,578 stars; 0 open issues). It reads the vault directory directly and has an explicit headless mode — but **no backlink or link-graph command**.
- `gsrst/obsidian-cli`, `marcus-crane/obsidian-cli`, `jwhonce/obsidian-cli`: **all 404 on the GitHub API.** Dead or never existed; treat any reference as stale.
- `Bip901/obsidian-cli` (Python): one day of activity in Sept 2025, ~1 year stale. Ignore.
- Everything created since Feb 2026 under [topic:obsidian-cli](https://github.com/topics/obsidian-cli) **wraps the official binary** and inherits "app must be running": `kitschpatrol/obsidian-ts`, `MadnessOverflow/py-wrapper-for-obsidian-cli`, `pablo-mano/Obsidian-CLI-skill`, and others.

### Vault re-parsers that genuinely work with the app closed

These do not read Obsidian's index; they re-derive links and frontmatter from the markdown, so resolution can diverge from Obsidian's (aliases, shortest-path ambiguity, block refs).

- [Epistates/turbovault](https://github.com/Epistates/turbovault) — Rust, active (v1.6.0 2026-07-18, last push 2026-08-28, 149 stars). The only actively maintained app-closed option with an explicit graph story: `turbovault-graph` ("Link graph analysis & relationship discovery"), `turbovault-parser`, `turbovault-sql`, plus an MCP server. Small, single-vendor — weigh the bus factor.
- [zoni/obsidian-export](https://github.com/zoni/obsidian-export) — Rust, one-way CommonMark exporter. Last release v25.3.0 (2025-03-25); `main` last moved 2025-08-25, recent pushes are renovate noise. Its own README: *"obsidian-export is not officially endorsed by the Obsidian team. It supports most but not all of Obsidian's Markdown flavor."*
- [natelandau/obsidian-metadata](https://github.com/natelandau/obsidian-metadata) — Python, **archived** (read-only). Do not build on it.
- `danymat/Obsidian-Markdown-Parser` (2021), `tobiaswuerth/obsidian-tools` (archived), npm `obsidian-vault-parser` (0.4.1, 2022) — all dead.

**No credible, current Node/TypeScript vault-graph parser exists.** The TS repos in this space all wrap the official CLI.

---

## 5. The honest verdict

**Is there a machine-readable graph an external Node CLI can query with the Obsidian app closed? No.**

Every path was checked and every one terminates at a running Obsidian process:

| Path | App closed? | Why not |
|---|---|---|
| Read a vault file | — | Nothing in `.obsidian` holds the index; verified empirically |
| Read Obsidian's IndexedDB | ✗ | LevelDB single-process lock while running; Blink-serialised and undocumented when closed |
| Dataview / Datacore index | ✗ | Electron IndexedDB keyed by `appId`; npm packages are typings + parser, not engines |
| Bases `.base` file | partial | The YAML query is readable; the expression language has no spec and no headless evaluator |
| Obsidian CLI | ✗ | *"requires the Obsidian app to be running"* |
| Obsidian Headless | ✅ runs | but ships **zero** query/graph commands — sync and publish only |
| Local REST API | ✗ | plugin hosted inside the app process |
| `obsidian://` / Advanced URI | ✗ | protocol handler; returns a URI or the clipboard, not data |
| Third-party vault parsers | ✅ | but they re-parse markdown — that is *building your own graph*, not reading Obsidian's |

Note the shape of the last row. The only app-closed options are tools that **re-derive the graph from the markdown**. That is precisely what commune already does. "Defer to Obsidian's graph" and "run with the app closed" are mutually exclusive, and the second is non-negotiable for a tool that builds in CI.

---

## 6. Recommendation

### Chosen: **commune owns the graph outright, and emits Obsidian-consumable open formats**

This is option three of the ticket's three, with the emphasis on *owns*. Concretely:

1. **Keep the graph core as the single source of truth.** `main` already ships `remark-wikilinks.ts` + `astro.backlinks.ts` emitting `public/backlinks.json` (per-node `outbound`/`inbound`, aliases, collection) and `public/graph.json` (`outgoing`/`backlinks`/`unlinked`). Issue #3 is consolidating the duplicated scans into `src/lib/graph.ts`. That consolidation is the right move and this research does not disturb it.
2. **Emit `[[wikilinks]]` in the markdown itself** — the one artifact Obsidian *does* consume natively and index for free. Obsidian's graph then rebuilds itself from commune's output with zero integration code. This is the "emit something Obsidian tooling can consume" leg, and it costs nothing because the notes are already written that way.
3. **Treat the further open formats as optional surface, not as the graph.** Obsidian publishes three specs an agent can write directly: [Obsidian Flavored Markdown](https://obsidian.md/help/obsidian-flavored-markdown), [Bases `.base` YAML](https://obsidian.md/help/bases/syntax), and [JSON Canvas](https://jsoncanvas.org/spec/1.0/) ([obsidianmd/jsoncanvas](https://github.com/obsidianmd/jsoncanvas), MIT, 3.7k stars). Emitting a `.base` — say, an orphans view or a per-tag view — is cheap and makes commune's thinking legible inside Obsidian. Emitting a `.canvas` from a subgraph is a plausible serendipity surface. Neither is load-bearing.
4. **Optionally consume the official CLI where the app is already open** — an interactive `commune` session on the user's desktop can shell out to `obsidian backlinks file=X format=json` to cross-check commune's resolution against Obsidian's. Useful as a *validation harness*, never as a build dependency.

The strongest external signal for this split is Obsidian's own: [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) (47.7k stars, by Obsidian's CEO) — *"Agent skills for Obsidian. Teach your agent to use Obsidian CLI and open formats including Markdown, Bases, JSON Canvas."* It teaches agents to **write the open formats directly** and to use the CLI only for app-mediated work. That is the same line this recommendation draws.

### Costs of each option

**A. Commune owns the graph outright (chosen, with the emit leg).**

- *Cost:* commune must reimplement Obsidian's link resolution — alias handling, shortest-path-when-possible matching, ambiguity tie-breaking, block and heading refs — and **that rule is not specified in any public doc**. Divergence between commune's resolution and Obsidian's is a permanent, low-grade risk. Mitigation is the validation harness in (4): diff commune's edges against `obsidian links`/`backlinks` output periodically, on a machine where the app runs.
- *Cost:* commune carries its own indexing performance and correctness. It is already carrying this.
- *Benefit:* works in CI, works with the app closed, works for users who do not run Obsidian at all, and works for the agent-skills use case where an agent reads the vault directly. No dependency on a proprietary GUI, a paid service, or an unspecified expression language.
- *Benefit:* commune can compute things Obsidian cannot — multi-hop traversal, shared-tag proximity, weighted serendipity ranking. Neither Obsidian, Dataview, nor Bases does multi-hop.

**B. Commune defers to Obsidian's graph.**

- *Cost, fatal:* requires the Obsidian desktop app running for every graph read. `astro build` in CI dies. Any headless or server deployment dies. Any user without an Obsidian licence for the Catalyst-gated features, or on a platform where the CLI is not registered, dies.
- *Cost:* the CLI is six months old and its Bases API already took a breaking change in 1.12. Coupling a build to it is coupling to a fast-moving surface.
- *Cost:* Datacore issue #168 names the exact failure: an agent pointed at notes containing queries *"see the datacore code, not the result of your queries."* Deferring means commune's serendipity surface is invisible to anything that reads the files.
- *Benefit:* resolution semantics are exactly right by construction, for free.

**C. Commune owns it but keeps it in sync with Obsidian's.**

- *Cost:* two indexes and a reconciliation loop, with no reliable trigger. Obsidian's `on('resolved')` event does not exist outside the app, and its cache is unreadable while the app is running — so "sync" means polling the CLI against a live GUI. Worst of both.
- *Cost:* the checked-in `public/graph.json` on `main` already shows the drift hazard in miniature. It holds 5 nodes — `/VISION` and four `/decisions/ADR-*` — while `src/content/` ships 10 notes and one update, and none of the five. A committed build artifact has drifted completely off its source. That is a *single*-source artifact going stale; a dual-source reconciliation loop would be strictly worse. (Worth fixing independently: either regenerate it in `build` and gitignore it, or drop it.)
- *Benefit:* none that A does not already provide more cheaply. The wikilink emit in A gives Obsidian everything it needs without a sync channel — because Obsidian re-derives its graph from the markdown anyway.

---

## Version-dependence

Findings that are pinned to a version and could change:

- **Observed on Obsidian 1.12.7** (this machine, macOS, 2026-09-02): `.obsidian` folder contents, IndexedDB path, cache field names. Current public release is **1.13.7** (2026-08-12).
- **Obsidian CLI**: shipped 1.12.0 EA (2026-02-10), public 1.12.4 (2026-02-27); requires the 1.12.7+ installer. Six months old; command set may grow.
- **Obsidian Headless**: `obsidian-headless@0.0.14` (2026-07-30), **open beta**, `UNLICENSED`, tied to paid Sync/Publish. **This is the finding most likely to change** — if Headless gains query commands, option B becomes viable for the first time. Recheck before any major graph rework.
- **Bases**: GA since 1.9.10 (2025-08-18). `file.backlinks` added 1.9.7; refresh semantics changed in 1.10.0; plugin API 1.10.0+ took a breaking change in 1.12. Expression language still unspecified.
- **Dataview**: last stable 0.5.68 (2025-03-15), last `master` commit 2025-04-08 — ~17 months idle. No maintenance-mode declaration exists; this is a de-facto reading.
- **Datacore**: 0.1.29 (2026-03-23), last commit 2026-06-21, still self-described WIP. npm library build stale at 0.1.24.
- **Obsidian's link resolution rule** is unspecified in public docs at every version checked. Assume it can change without notice.

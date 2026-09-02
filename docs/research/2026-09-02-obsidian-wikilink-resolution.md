# Research: how do `[[WikiLinks]]` resolve in Obsidian against slug-named files?

- **Context:** [noontide-co/commune-wiki#15](https://github.com/noontide-co/commune-wiki/issues/15) (parent map: [#2](https://github.com/noontide-co/commune-wiki/issues/2))
- **Date:** 2026-09-02
- **Question:** Files are slug-named (`evergreen-notes.md`) with `title: Evergreen Notes` in frontmatter. The Astro remark plugin resolves `[[Evergreen Notes]]` by frontmatter **title**; Obsidian resolves by **filename**. Every cross-link works on the site and renders unresolved in the vault. What is the lowest-friction fix?
- **Method:** primary sources only — the official Obsidian help sources, the official `obsidian-api` typings, and **the shipped Obsidian application bundle itself** (`obsidian-1.12.7.asar`, extracted and read). Where the bundle settles a question the docs leave open, the decompiled code path is quoted with its byte offset so it can be re-derived. One empirical check re-executes the shipped resolution algorithm, transcribed line-for-line, against a simulated vault. Repo facts come from reading `dmthepm/devon-wiki` and `noontide-co/commune-wiki` (read-only).

## Answer (TL;DR)

**The going-in hypothesis is wrong. `aliases` does not fix this.** Obsidian's vault-side link resolver consults *filenames only* — it never reads `aliases`. Adding `aliases: [Evergreen Notes]` to `evergreen-notes.md` will make the alias appear in autocomplete and the quick switcher, but `[[Evergreen Notes]]` still resolves to nothing: no click-through, no backlink, no graph edge, and it still counts as an unresolved link. Alias-based resolution *does* exist in the codebase — but only in the **Obsidian Publish** renderer, which is a different resolver in the same bundle. That is almost certainly the source of the folk belief that aliases resolve.

**Recommendation: write link targets in filename form with the canonical title as piped display text — `[[evergreen-notes|Evergreen Notes]]`.** This is the only form both resolvers agree on today, it needs no renames and no URL churn, and it is indifferent to titles containing colons or running to 95 characters (both of which exist in the corpus and both of which block the rename route). The alias backfill is still worth doing — not for resolution, but because it makes Obsidian's own autocomplete *emit exactly this form for you*.

Renaming files to their titles (`Evergreen Notes.md`) also works, and is genuinely attractive because it leaves all 433 existing links untouched — but it is blocked for 6 files whose titles contain `:` and produces 12 filenames of 70–95 characters, so it cannot be completed without editing user-visible titles. Details and the full cost comparison are in §5.

---

## Sources and how they were read

| Source | What it settles |
|---|---|
| [Obsidian help — Aliases](https://help.obsidian.md/aliases) (source: [`obsidian-help/en/Linking notes and files/Aliases.md`](https://github.com/obsidianmd/obsidian-help/blob/master/en/Linking%20notes%20and%20files/Aliases.md)) | The `aliases` key, YAML shape, and the note that Obsidian deliberately writes `[[Target\|Alias]]` rather than `[[Alias]]` |
| [Obsidian help — Internal links](https://help.obsidian.md/links) (source: [`Internal links.md`](https://github.com/obsidianmd/obsidian-help/blob/master/en/Linking%20notes%20and%20files/Internal%20links.md)) | Supported link formats, invalid filename characters, which settings are generation-time |
| [Obsidian help — Properties](https://help.obsidian.md/properties) | Default property list and types; `alias` (singular) deprecated in 1.9+ |
| [`obsidianmd/obsidian-api` — `obsidian.d.ts`](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) | Public contract for `MetadataCache.getFirstLinkpathDest`, `resolvedLinks`, `unresolvedLinks` |
| **`obsidian-1.12.7.asar` → `app.js`** (the shipped bundle, at `~/Library/Application Support/obsidian/`) | The actual resolution algorithm, and the exhaustive list of places `aliases` is read |
| [Astro v4 — Content collections](https://docs.astro.build/en/guides/content-collections/) | Frontmatter `slug` override; `slug` is a reserved schema key |
| `astro@4.16.19` → `dist/content/utils.js` (installed in both repos) | Confirms the frontmatter `slug` override is live in the pinned version |

The help site now 301-redirects `help.obsidian.md/*` → `obsidian.md/help/*`; both resolve to the same content, and the `obsidian-help` GitHub repo is the authoritative Markdown source quoted below.

---

## 1. Alias resolution — it does not happen in the vault

### 1a. The resolver reads filenames and nothing else

`MetadataCache.getLinkpathDest` is the single entry point for turning a link target into a file. From `app.js` (offset 1578832), reformatted but otherwise verbatim:

```js
t.prototype.getLinkpathDest = function (e, t) {
    if ("" === e && t && (f = this.vault.getAbstractFileByPath(t)) instanceof $T) return [f];
    var n = e.toLowerCase(), i = nu(n), r = null;
    if (i.contains(".") && (r = this.uniqueFileLookup.get(i)),
        r || (i = nu(n = (e + ".md").toLowerCase()), r = this.uniqueFileLookup.get(i)),
        !r) return [];
    if (i === n && 1 === r.length) return r.slice();
    /* ...remaining branches only disambiguate among the files already in `r`,
       by comparing full paths and path suffixes. Nothing new is looked up. */
}
```

Everything hangs off `this.uniqueFileLookup`. That map is populated at exactly three sites in the bundle, and every one of them keys on the **file's name**:

```js
this.uniqueFileLookup.add(s.name.toLowerCase(), s)   // initial vault load        (offset 1584692)
this.uniqueFileLookup.add(e.name.toLowerCase(), e)   // computeFileMetadataAsync  (offset 1588561)
r.remove(nu(t).toLowerCase(), e), r.add(e.name.toLowerCase(), e)  // onRename     (offset 1590599)
```

There is no fourth site, and `aliases` appears in none of them. `getFirstLinkpathDest` is just `getLinkpathDest(...)[0]`, and `isUnresolved` is `!this.getFirstLinkpathDest(...)` — so the whole resolution surface inherits this.

### 1b. Which surfaces this poisons

Everything that reports on links is computed from that one function:

- **`resolvedLinks` / `unresolvedLinks`** are built by the link resolver (offset 1587300): `var a = t.getFirstLinkpathDest(o, e); if (a) n[a.path] = ...; else { var s = BL(o); i[s] = ... }`.
- **Graph view** reads those two maps directly (offset 2553904, inside the graph renderer: `var r = e.resolvedLinks, o = e.unresolvedLinks`). No separate resolution pass.
- **Backlinks — linked mentions** uses `getBacklinksForFile` (offset 1581908): `a = t.getFirstLinkpathDest(o, i); a && a === e && n.add(i, r)`.
- **Unresolved-link count** is `unresolvedLinks`, same map.

So a bare `[[Evergreen Notes]]` against `evergreen-notes.md` is unresolved in the editor, unresolved in the graph, absent from backlinks, and counted as a dangling link — with or without an `aliases` entry.

### 1c. Where `aliases` *is* read

The frontmatter alias parser is a single function, `nT` (offset 1325289). Grepping every call site in the bundle gives the exhaustive list of alias-aware surfaces:

| Call site (offset) | Surface | Effect |
|---|---|---|
| `getLinkSuggestions` (1577723) | `[[` autocomplete | Pushes `{file, path, alias}`. **`path` is the file path; the alias is only a label.** |
| `getDisplaySuggestions` (1650365) | autocomplete after the `\|` | Offers aliases as display text |
| quick switcher (2813971, `shouldShowAlias`) | Ctrl/Cmd-O | Alias matches jump to the file |
| backlinks pane (2869194) | **Unlinked** mentions only | Builds regexes from basename + aliases |
| `3291378` | outgoing-links pane, unlinked mentions | same |
| `1496288` | `aliases` developer-console command | listing only |
| **`2208558`** | **Obsidian Publish cache** | **resolution — see below** |

`getLinkpathDest`, `resolvedLinks`, `unresolvedLinks`, graph, and linked backlinks are absent from that list.

### 1d. The Publish resolver — why the belief that aliases resolve is half-true

At offset 2208258 there is a *second*, structurally similar resolver. It sits amid `publish.site`, `getPublicHref`, `publish.navigate`, and a `permalinks` map (`permalink` being a [Publish-only property](https://help.obsidian.md/properties)). It loads aliases into an index and falls back to them:

```js
// load():
if (o = nT(r)) for (a = 0, s = o; a < s.length; a++) l = s[a], this.aliases[l.toLowerCase()] = n;

// getLinkpathDest():
var n = this._getLinkpathDest(e, t);        if (n.length > 0) return n[0];
if ((n = this._getLinkpathDest(e + ".md", t)).length > 0) return n[0];
var i = this.aliases, r = e.toLowerCase();  if (i.hasOwnProperty(r)) return i[r];
var o = nu(e);                              return i.hasOwnProperty(o) ? i[o] : null;
```

**So `[[Evergreen Notes]]` *does* resolve via aliases on an Obsidian Publish site, and does not in the desktop vault.** Two different resolvers, one bundle. This is worth writing down, because it is exactly the kind of thing that produces confident, wrong advice in forum threads.

The help docs corroborate the vault behaviour without stating it outright. From `Aliases.md`:

> Obsidian creates the link with the alias as its custom display text, for example `[[Artificial Intelligence|AI]]`.
>
> > [!note] Note
> > Rather than just using the alias as the link destination (`[[AI]]`), Obsidian uses the `[[Artificial Intelligence|AI]]` link format to ensure interoperability with other applications using the Wikilink format.

Read alongside `getLinkSuggestions` — which stores the *file path* in `path` and the alias only as a label — the reason for the piped output is not merely interoperability: it is that the bare form would not resolve.

### 1e. Exact key and accepted YAML shapes

From the parser pair (offset 1325289):

```js
function tT(e, t) {
    var n = eT(e, t);   // eT: first frontmatter key matching regex `t`
    return n
        ? "string" == typeof n ? [n.trim()]
        : Array.isArray(n) ? n.filter(function (e) { return "string" == typeof e })
                              .map(function (e) { return e.trim() })
        : null
        : null;
}
function nT(e) {
    var t = tT(e, /^aliases$/i);
    return t ? t.map(function (e) { return e.trim() })
               .filter(function (e) { return !!e }) : null;
}
```

| Shape | Result |
|---|---|
| `aliases:` / `Aliases:` / `ALIASES:` | all accepted — the key regex is `/^aliases$/i` |
| `alias:` (singular) | **not matched.** Deprecated as a default property in Obsidian 1.9+ per [Properties](https://help.obsidian.md/properties); the bundle carries a one-way migration that renames `alias` → `aliases` (offset 3265839) |
| YAML block list or inline `[A, B]` | accepted; non-string items silently dropped, each item trimmed, empties filtered |
| a bare string `aliases: Evergreen Notes` | accepted as **one** alias |
| a comma-separated string `aliases: A, B` | accepted as **one** alias literally named `"A, B"` — there is no comma split |
| number, map, anything else | `null` — silently ignored |

All comparisons are `toLowerCase()` on both sides, so alias matching (in the surfaces that use it) is case-insensitive. The docs say only: *"Aliases should always be formatted as a list in YAML."*

### 1f. Empirical check

The `getLinkpathDest` body above was transcribed line-for-line into Node and run against a simulated vault (`notes/evergreen-notes.md` carrying `aliases: ["Evergreen Notes"]`, plus a control file actually named `Evergreen Notes RENAMED.md`):

```
[[Evergreen Notes]]  (alias present, slug filename)  -> UNRESOLVED
[[evergreen-notes]]  (exact filename)                -> notes/evergreen-notes.md
[[Evergreen-Notes]]  (filename, wrong case)          -> notes/evergreen-notes.md
[[EVERGREEN-NOTES]]  (filename, all caps)            -> notes/evergreen-notes.md
[[notes/evergreen-notes]] (full path)                -> notes/evergreen-notes.md
[[Andy Matuschak's Notes]] (alias w/ apostrophe)     -> UNRESOLVED
[[Evergreen Notes RENAMED]] (filename == title)      -> notes/Evergreen Notes RENAMED.md
```

Two things fall out. The alias is inert. And **resolution is case-insensitive on the filename** — `[[Evergreen Notes]]` fails purely on the space-vs-hyphen difference, not on case. That matters for §5: link targets do not have to be typed in lowercase.

---

## 2. Settings — all three are generation-time, none are resolution-time

Every one of the named settings is read only by link *authoring* code paths. None appears anywhere in `getLinkpathDest`.

| Setting | Default (offset 1205167–1205770) | Only read by | Effect on resolution |
|---|---|---|---|
| **New link format** (`newLinkFormat`) | `"shortest"`; options `shortest` / `relative` / `absolute` | `fileToLinktext` (offset 1581908) | **none** — decides what text gets *written* into a new link |
| **Use `[[Wikilinks]]`** (`useMarkdownLinks`) | `false` (i.e. wikilinks on) | `generateMarkdownLink` (1624651), link renderer (1647338) | **none** — decides whether a new link is written as `[[x]]` or `[x](x)`. Existing `[[...]]` links keep resolving either way |
| **Default location for new notes** (`newFileLocation`) | `"root"` | `getMarkdownNewFileParent` (1611084), `getNewFileParent` (3181413) | **none** — where a *new file* is created |
| **Automatically update internal links** (`alwaysUpdateLinks`) | `false` | rename handler (1615520) | **none** — rewrites links after a rename |

The help docs describe both user-facing ones purely in generation terms: *"When you select one of the suggested files, Obsidian instead generates a Markdown link"*, and *"Obsidian can automatically update internal links in your vault when you rename a file."*

**Conclusion: link resolution is not configurable.** There is no setting, on either the vault or the plugin-free app, that makes `[[Evergreen Notes]]` find `evergreen-notes.md`. The fix has to be in the content or in our own build.

---

## 3. What the repos actually do today

Both repos pin `astro: ^4.15.0` (installed: **4.16.19**) and use legacy `type: 'content'` collections.

**The Astro-side resolver keys on title and alias, never on slug.** In `devon-wiki/remark-wikilinks.ts` and in commune-wiki's extracted `src/lib/graph.ts` (`buildLinkLookup`), the lookup is built as:

```ts
lookup.set(alias.toLowerCase(), target);   // for each alias
lookup.set(entry.title.toLowerCase(), target);
```

Lookup is case-insensitive; piped links are parsed (`/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g`) and the pipe label is used as display text; unresolved links are emitted as **plain text with the brackets stripped** — silently non-clickable, no marker. `aliases` is already a first-class field in the zod schema (`aliases: z.array(z.string()).default([])`, commented *"Aliases for WikiLink resolution"*), the schema is not `.strict()`, and 49 of devon-wiki's 73 notes already carry the key. **Adding aliases breaks nothing.**

Corpus shape (devon-wiki `src/content/notes/`): 73 notes, flat, all filenames strict slug-case, **433 wikilink occurrences across 79 distinct targets**. Filenames and titles diverge freely — `ledger-replaces-feeds.md` is titled *"See what I'm working on"*.

**Three independent slug derivations, all filename-based, none reading frontmatter `slug`:** `remark-wikilinks.ts:pathToSlug`, `astro.backlinks.ts:pathToSlug`, and commune-wiki's `graph.ts:toUrlPath`. This is the hidden cost of the rename route (§5). commune-wiki has already collapsed its copy into one function; devon-wiki still has two.

Neither repo contains an `.obsidian/` directory, so there are no vault settings in version control — the vault is configured elsewhere and syncs in.

---

## 4. Interaction with the canonical-title rule

`devon-wiki/scripts/test-search-index.mjs` gates every build (`"build": "astro build && node scripts/test-search-index.mjs"`). commune-wiki has no equivalent; its build is plain `astro build`.

It builds `canonicalTargets` from titles **and aliases**, mapping each key to the canonical *title*:

```js
canonicalTargets.set(entry.title.toLowerCase(), entry.title);
for (const alias of entry.aliases || []) canonicalTargets.set(alias.toLowerCase(), entry.title);
```

then fails the build on:

```js
if (customLabel || linkedTitle !== canonicalTitle) { noncanonicalWikiLinks.push(...) }
```

Two consequences:

1. **Adding an `aliases` key does not conflict with the rule.** It only widens `canonicalTargets`. Confirmed: zero piped links exist anywhere in devon-wiki's content today.
2. **But the rule forbids ever *using* an alias in a link.** `linkedTitle !== canonicalTitle` is an exact, case-sensitive comparison, so `[[evergreen]]` and even `[[evergreen notes]]` fail the build. And `customLabel ||` bans piped links outright, including `[[Evergreen Notes|Evergreen Notes]]`.

So the alias route does not *conflict* with the rule — it is rendered pointless by it. The rule is one day old ([`d6720ab` "[fix] Enforce canonical wiki link titles"](https://github.com/dmthepm/devon-wiki/commit/d6720ab), 2026-09-01), so it is a fresh, revisable decision rather than settled ground.

One live hazard worth flagging regardless of which route is taken: **adding an alias can retroactively break the build.** A link that was previously unresolvable is skipped by `if (!canonicalTitle) continue;`; once an alias makes it resolvable it becomes a canonicality failure. Backfill aliases and re-run the build in the same commit.

Note also that `README.md` (150–155) and `CONTRIBUTING.md` (265–270) both advertise `[[Note Title|Display Text]]` as supported syntax that the script forbids. The docs and the gate already contradict each other and need reconciling either way.

---

## 5. The two routes that actually work

### Route A — filename-form targets, canonical title as display text (**recommended**)

Write `[[evergreen-notes|Evergreen Notes]]`.

- **Obsidian:** `evergreen-notes` → `+ ".md"` → exact hit in `uniqueFileLookup`. Resolves, clicks, appears in backlinks and the graph, drops off the unresolved count. Case-insensitive, so `[[Evergreen-Notes|…]]` works too.
- **Astro:** needs the slug registered as a lookup key. In commune-wiki that is **one line** in `buildLinkLookup` (`lookup.set(entry.slug.toLowerCase(), target)`); devon-wiki would need it in `remark-wikilinks.ts` too, or an `aliases: [<slug>]` backfill (which several notes already have — `evergreen-notes.md` carries `aliases: ["evergreen", "evergreen-notes"]`).
- **Display is identical in both** — the site renders the pipe label, and so does Obsidian's reading view.
- **The alias backfill earns its keep here.** With `aliases: [Evergreen Notes]` on the file, typing `[[Evergreen` in Obsidian and selecting the alias inserts *exactly* `[[evergreen-notes|Evergreen Notes]]` — because `getLinkSuggestions` supplies the file path as the target and the alias as the label, and `newLinkFormat: "shortest"` reduces the path to the basename. The hypothesis was right about what to add and wrong about why: aliases are an **authoring ergonomic**, not a resolution mechanism.

**Costs:** rewrite 433 link occurrences (mechanical, scriptable from `backlinks.json`, and verifiable — the existing `dist/notes/<slug>/index.html` href assertion in `test-search-index.mjs` proves every rewritten link still renders). Relax the canonicality rule from *"target must equal the canonical title, no pipes"* to *"target must be the canonical title **or** the entry's own slug, and the pipe label must be the canonical title"* — which preserves the rule's actual intent (no arbitrary relabelling) while permitting the one form both resolvers agree on. Update `README.md` and `CONTRIBUTING.md`.

### Route B — rename files to titles, hold URLs with frontmatter `slug`

Rename `evergreen-notes.md` → `Evergreen Notes.md` and add `slug: evergreen-notes`.

The `slug` override is real and live in the pinned version. Astro v4 docs:

> You can override an entry's generated slug by adding your own `slug` property to the file frontmatter.
>
> `"slug"` is a special, reserved property name that is not allowed in your custom collection `schema` and will not appear in your entry's `data` property.

Confirmed in `astro@4.16.19/dist/content/utils.js:431` — `getEntrySlug` reads the frontmatter `slug` and hands it to `parseEntrySlug`, where it wins over the generated slug. Neither repo's schema declares `slug`, so the reserved-key constraint is already satisfied, and `src/pages/notes/[...slug].astro` routes on `note.slug`, so URLs would follow automatically.

Its real appeal is that **all 433 links stay exactly as written**, the canonicality rule survives untouched, and `[[Evergreen Notes]]` — the form `docs/NOTE-WRITING-BIBLE.md` prescribes — resolves natively on both sides.

**But it cannot be completed as-is:**

- **Six titles contain `:`** (`Deep Research: OSS Business Models`, `The Commune Box: Hardware + Software Ecosystem Research`, and four more). The Obsidian docs list `:` among characters that *"may not work as a link"* and recommend against them; it is also illegal on Windows and rendered as `/` by Finder. These six cannot be renamed without editing a user-visible title.
- **Twelve titles run 70–95 characters** — the claim-as-title evergreen style the note-writing bible actively encourages. Renaming produces 95-character filenames: legal on APFS, awkward everywhere else, and near Windows' 260-character path ceiling.
- **Three slug-derivation sites must be patched** (`remark-wikilinks.ts`, `astro.backlinks.ts`, `graph.ts`) to prefer frontmatter `slug`. Miss any one and every wikilink on the site silently points at `/notes/Evergreen Notes/` while Astro serves `/notes/evergreen-notes/`.
- **It couples filenames to a mutable editorial field.** Titles here are not stable identifiers; the corpus already demonstrates this.

No case-insensitive title collisions exist today, so that risk is theoretical — but it becomes live the moment filenames are titles on a case-insensitive filesystem.

### Rejected: an Obsidian community plugin that resolves by frontmatter title

Technically possible (some plugins monkey-patch `metadataCache`), but it puts the requirement "click the cross links in Obsidian" behind a third-party runtime dependency, is unverifiable against primary sources, and does not travel with the repo. Out of scope for a content-and-build fix.

### Comparison

| | Route A (piped slug targets) | Route B (rename to titles) |
|---|---|---|
| Renames | 0 | 73 |
| Frontmatter edits | 0 (or an optional alias backfill) | 73 × `slug:` |
| Link occurrences rewritten | 433 | 0 |
| Code sites touched | 1–2 | 3 |
| Canonicality rule | must be relaxed | untouched |
| Docs to update | README, CONTRIBUTING | none |
| URL churn | none | none (via `slug:`) |
| Blocked files | none | 6 (titles containing `:`) |
| Blast radius | authored prose | filenames + frontmatter |
| Survives long/punctuated titles | yes | no |

Route B's blast radius is the safer kind — structure rather than prose — and if the corpus were all short, clean titles it would win. It is not. Six files it cannot touch at all and a house style that actively produces 90-character sentence-titles make it a migration that has to be *partially* abandoned at the point of contact, leaving the original bug in place for exactly the notes with the most distinctive titles. Route A is indifferent to title shape, which is the property that matters for a corpus written this way.

---

## Recommended sequence

1. **commune-wiki first**, where the graph logic is already extracted to one place: add `lookup.set(entry.slug.toLowerCase(), target)` to `buildLinkLookup` in `src/lib/graph.ts`, below the alias pass and above the title pass so titles keep winning. Purely additive — every existing `[[Title]]` link keeps working.
2. **Backfill `aliases: [<Title>]`** on notes whose title differs from their slug, and re-run the build in the same commit (see the retroactive-failure hazard in §4). This buys the Obsidian autocomplete that generates the correct link form.
3. **Relax `test-search-index.mjs`** in devon-wiki: accept a target equal to the canonical title *or* the entry's own slug, and require any pipe label to equal the canonical title. Reconcile `README.md` and `CONTRIBUTING.md` with the new rule in the same change.
4. **Rewrite the 433 links** to `[[slug|Canonical Title]]`, generated from `backlinks.json` rather than by hand-rolled regex over prose, and verify with the existing `dist/notes/<slug>/index.html` href assertions.
5. Optionally add `slug:` frontmatter across the corpus regardless of route. It is inert today and it permanently decouples URLs from filenames, which makes any future rename — including a later change of heart toward Route B — free of URL churn.

## Open questions

- Steps 1–2 alone leave the 433 existing links unresolved in Obsidian while making every *newly authored* link work. If step 4 looks too invasive to land at once, that is a legitimate stopping point, but it should be a deliberate choice rather than a stall.
- devon-wiki's `research` collection schema has no `aliases` field, and its four entries are the ones with colons in their titles. They need the field added if research notes are to be cross-linkable from the vault.
- `status` is declared as `['draft','live','updated']` in the schema but defaults to `'seed'` in `astro.backlinks.ts` and `graph.ts`, and `README.md` documents `seed | growing | evergreen`. Unrelated to this ticket, but it will bite whoever touches the graph next.

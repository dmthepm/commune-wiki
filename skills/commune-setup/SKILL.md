---
name: commune-setup
description: One-time setup of a Commune wiki for the authoring loop. Writes WRITING.md by interview, migrating any existing writing document into it, and decides the dumps policy. Use when the user runs it by name on a wiki that has no WRITING.md yet.
disable-model-invocation: true
metadata:
  version: "0.1.0"
  commune-schema: "1"
---

# commune-setup

Run once per wiki. Output: `WRITING.md` at the wiki root, in the fixed shape,
with no placeholder left in it — plus, when the wiki had one, a deleted writing
document and the links to it repointed.

User-invoked on purpose. It writes the file every other skill obeys, and it asks
questions only the wiki's owner can answer.

## Rules

- **Explore before you ask.** Every question you can answer from the repository
  is not a question. Read first, ask the residue.
- **Recommended answer first**, so answering is a yes or a correction.
- **Rules only.** `WRITING.md` gets nothing that does not change what an agent
  writes. History, positioning and plans stay wherever they are, or get deleted
  with the file they were in.
- Never install anything.

## Steps

1. **Preflight.** `node scripts/preflight.mjs`. Below 0.4.0, stop and show its
   line. Also stop if `WRITING.md` already exists: say so, and offer to add
   missing sections rather than overwrite the file.

2. **Explore.** Read, in this order, and say what you found in one line each:
   - `src/content.config.ts` — the collections and every field's real type,
     required flag and default. This is what validates; a rule that contradicts
     it is a build failure waiting.
   - Any existing writing document (`docs/NOTE-WRITING-BIBLE.md`, `STYLE.md`,
     `VOICE.md`, `docs/writing*.md`). If one exists, follow
     `references/migrate.md` before asking anything.
   - Three live notes, chosen for spread: the longest, the newest, and one with
     many inbound links. Read them for length band, person, title shape and
     frontmatter habits — evidence for the recommendations, not rules yet.
   - `.gitignore`, and whether the repository is public
     (`gh repo view --json visibility` when `gh` is there; otherwise ask).

3. **Draft `WRITING.md`** from `assets/WRITING.md`, filling every section you
   have evidence for. Keep the six headings and their order exactly:
   Sentences, Titles, Notes, Frontmatter, Avoid, Verdicts. `commune-write` reads
   this shape.

4. **Ask the residue** — only the sections still holding a placeholder, plus the
   two below. One message, numbered, recommended answer first, each question
   naming what it changes in the file.

5. **The two questions that are never inferable.**
   - **Dumps policy.** *"`dumps.publish: opt-in` — a dictated dump stays
     provenance beside the notes unless its frontmatter says `visibility:
     public`. `never` or `all` instead?"* Write the answer into the
     **Frontmatter** section's dumps line.
   - **Public repository.** Only when the repo is public: *"`dumps/` will be
     readable by anyone with the URL. Add `dumps/` to `.gitignore` so the
     handoffs live only on your machine?"* Recommend gitignoring on a public
     repo and committing on a private one. If they gitignore it, say plainly
     that the loop still works and the provenance is no longer in the history.

6. **Write and verify.** Write `WRITING.md`. Then check yourself: no
   `<angle bracket>` remains; every frontmatter block's keys and values exist in
   `src/content.config.ts`; the six headings are present and in order. Delete
   the migrated document and repoint its links in the same commit. Print the
   path and what to run next: *"Run `commune-dump` with your first dump."*

## Stop conditions

- `WRITING.md` exists → stop; offer to fill gaps, never overwrite.
- No `src/content.config.ts` → stop. This is not a Commune wiki yet, and the
  frontmatter section would be invented.
- The owner does not answer the residue → write the file with the sections you
  have evidence for and leave the rest as placeholders, saying which. A
  half-answered `WRITING.md` is honest; an invented one is not.

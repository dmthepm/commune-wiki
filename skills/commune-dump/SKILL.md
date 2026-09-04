---
name: commune-dump
description: Turn a dictated or pasted dump into a dated dump file and a connect file for a Commune wiki. Use when the user dictates or pastes a note idea, says "dump", names a note to redo or a page to add, or hands over a transcript to turn into wiki content. Requires the wiki's installed commune CLI; writes dumps/<date>-<slug>.md and dumps/<date>-<slug>.connect.md, then hands off to commune-write.
metadata:
  version: "0.1.0"
  commune-schema: "1"
---

# commune-dump

Intake and connect. Two files out, no note written, no edit to `src/content/`.

Run every command from the wiki root — the directory holding `src/content` and
`node_modules`. Pass no `--root`. `$COMMUNE` is the executable path step 1
prints; run it directly, with no `node` in front. `<slug>` below always means
`<yyyy-mm-dd>-<target-slug>`, the dump file's own stem, where `<target-slug>` is
the target's title lowercased with every run of non-alphanumerics turned into
one hyphen. Create `dumps/` if the wiki has none.

## Rules

- Write the dump **verbatim**, as plain paragraphs, never fenced and never
  indented as code: `graph related` strips code before matching, so a fenced
  dump has zero mentions. Verbatim includes the sentence that told you where
  the note goes; it stays in the body and is also recorded in `target:`.
- `mentions`, `unmatched` and `unreferenced` are **candidates for the human**,
  never targets. The draft is never scored on them.
- Deciding what counts as a subject is your judgement. Deciding whether a note
  exists for it is the CLI's. Never filter graph results in prose.
- Never install anything. Never run `npx @dmthepm/commune`.

## Steps

1. **Preflight.** Run `node scripts/preflight.mjs`. On success it prints one
   line, the CLI path; call it `$COMMUNE`. Any non-zero exit is a stop: show its
   line, install nothing. Read every `--json` payload through
   `... --json | node scripts/preflight.mjs --schema`, which passes the document
   through unchanged and stops the skill on any other schema.

2. **Write the dump file.** Input: the text the user gave. If it is a Monologue
   note id rather than text, read `references/monologue.md` first. Ask one
   question, covering only what the text does not answer: which note is this for
   — an existing file, or a new one in which collection — and, for a new one,
   what it is called. **Never invent the title.** It is what step 3 compares
   against and what every later path is named from. Output: `dumps/<slug>.md`,
   frontmatter per `references/handoffs.md`, body verbatim. If that path already
   exists, stop and say so; a dump is never overwritten.

3. **Baseline, and the name collision.** Run `$COMMUNE check --json` and keep
   `summary` as `baseline`. Two collision cases, one stop:
   - The target exists: any `duplicate-name` finding naming its title or an
     alias.
   - The target is new: `check` cannot see a file that is not there, so compare
     the answered title and aliases against every `title` and `aliases` entry in
     `$COMMUNE graph query --json`, case-insensitively.
   Either way, write `.connect.md` with `status: blocked` and the collision in
   `duplicate_name`, stop, and name the two files. The link lookup is last-wins:
   a colliding note silently steals the older note's inbound links, and no later
   step catches it.

4. **Connect.** Input: the dump file. In order:
   - `$COMMUNE graph related - --json < dumps/<slug>.md` → `mentions`.
   - If the target file already exists, `$COMMUNE graph related <target> --json`
     → `target.inbound` and `target.outbound`; then **one**
     `$COMMUNE graph query --json`, where every entry carries its own
     `inbound` array — its length is the count `at_risk` needs for each
     resolved outbound link.
   - List the dump's subjects yourself — the proper nouns, projects and claims a
     reader would expect a note for — one phrase per line, and pipe that list to
     `$COMMUNE graph related - --json`. You wrote the list, so you carry each
     phrase's sentence across yourself; the CLI only answers whether a note
     exists. A subject is matched when it equals a returned mention's `matched`
     or `title`, ignoring case and spacing; the rest is `unmatched`.
   - `$COMMUNE graph query --unreferenced --json` → `unreferenced`.
   Tag every mention and unmatched phrase with the sentence that produced it and
   its tense, per `references/handoffs.md`.

5. **Write the connect file.** Output: `dumps/<slug>.connect.md`, keys exactly
   as `references/handoffs.md` gives them, `status: ready`, `files:` seeded with
   the target path. A new note follows the naming its collection already uses
   — read one existing filename before you guess it. Body:
   `## What I ran` (the commands, verbatim),
   `## Candidates` (each with its sentence, in the human's words, and what
   linking or not linking it would do to the graph), `## Handoff`.

6. **Hand off.** Print the two paths and say: *"Run `commune-write`."* Do not
   draft. Do not edit `src/content/`. Do not commit.

## Stop conditions

- Preflight failed, or a payload is not schema 1 → show the line, stop.
- A name collision on the target → `status: blocked`, stop.
- The dump file already exists → stop; never overwrite a dump.
- The dump names no target and the user does not answer → stop; the target is
  the one thing every later step needs.
- `check` errors that already existed → **not** a stop. They are the baseline;
  `commune-ship` diffs against it.

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
`<yyyy-mm-dd>-<target-slug>`, the dump file's own stem. Create `dumps/` if the
wiki has none.

## Rules

- Write the dump **verbatim** and as plain paragraphs. Never fence it, never
  indent it as code: `graph related` strips code before matching, so a fenced
  dump has zero mentions.
- `mentions`, `unmatched` and `unreferenced` are **candidates for the human**,
  never targets. The draft is never scored on them.
- Deciding what counts as a subject is your judgement. Deciding whether a note
  exists for it is the CLI's. Never filter graph results in prose.
- Never install anything. Never run `npx @dmthepm/commune`.

## Steps

1. **Preflight.** Run `node scripts/preflight.mjs` → `$COMMUNE`. On exit 1, stop
   and show its line — do not continue and do not install. Read every `--json`
   payload through `... --json | node scripts/preflight.mjs --schema`, which
   passes the document straight through and stops the skill on any other schema.

2. **Write the dump file.** Input: the text the user gave. If it is a Monologue
   note id rather than text, read `references/monologue.md` first. Ask one
   question, covering only what the text does not answer: which note is this for
   — an existing file, or a new one in which collection — and, for a new one,
   what it is called. **Never invent the title.** It is the string step 3
   compares findings against and the stem every later file is named from.
   Output: `dumps/<slug>.md`, frontmatter per `references/handoffs.md`, body
   verbatim.

3. **Baseline, and the duplicate-name stop.** Run `$COMMUNE check --json`. Keep
   `summary` as `baseline`. If any `duplicate-name` finding names the target
   title or one of its aliases, write `.connect.md` with `status: blocked` and
   that finding in `duplicate_name`, stop, and tell the user which two files
   collide. The link lookup is last-wins: a new note that collides silently
   steals the older note's inbound links, and no later step catches it.

4. **Connect.** Input: the dump file. In order:
   - `$COMMUNE graph related - --json < dumps/<slug>.md` → `mentions`.
   - If the target file already exists, `$COMMUNE graph related <target> --json`
     → `target.inbound` and `target.outbound`; then `$COMMUNE graph query --json`
     for the inbound count of each resolved outbound link → `at_risk`.
   - List the dump's subjects yourself — the proper nouns, projects and claims a
     reader would expect a note for. Write them one per line and pipe that list
     to `$COMMUNE graph related - --json`. A subject is matched when it equals a
     returned mention's `matched` or `title`, ignoring case and spacing; what is
     left over is `unmatched`.
   - `$COMMUNE graph query --unreferenced --json` → `unreferenced`.
   Tag every mention and every unmatched phrase with the sentence that produced
   it and its tense, per `references/handoffs.md`. A sentence that argues
   *against* a subject still mentions it, and the tense is the only thing that
   says so.

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
- `duplicate-name` names the target → `status: blocked`, stop.
- The dump names no target and the user does not answer → stop; the target is
  the one thing every later step needs.
- `check` reports errors that already existed → **not** a stop. They are the
  baseline; `commune-ship` diffs against it.

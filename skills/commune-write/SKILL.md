---
name: commune-write
description: Grill, draft and refine one Commune note from a dump. Use when a dumps/*.connect.md exists with no answered round (ask the round), when an answers file has a new answered round (draft or refine), or when the user gives a one-sentence correction on a drafted note. Requires the wiki's installed commune CLI; writes into the real note file plus dumps/<slug>.answers.md and dumps/<slug>.review.html, then hands off to commune-ship.
metadata:
  version: "0.1.0"
  commune-schema: "1"
---

# commune-write

Grill, draft, refine. One note per run. The draft goes into the real file in
`src/content/`; the worktree is the staging area.

Run every command from the wiki root. Pass no `--root`. `$COMMUNE` is the path
step 1 prints. Handoff file shapes: `references/handoffs.md`.

## Rules

- `WRITING.md` at the wiki root decides every sentence and every frontmatter
  block. Read it first and read nothing else about voice. If it is missing,
  stop and say: *"Run `commune-setup` first — this wiki has no `WRITING.md`."*
- A note the dump means to publish gets `visibility: public` **before** you run
  `check`. Notes default to `private`, and the graph cannot see a private note:
  `check`, `related`, `gate` and `update` all skip it, so a green `check` on a
  private draft proves nothing. When `publish: false`, say in one line that the
  note gets no graph verification, and do not pretend otherwise.
- Candidates in `.connect.md` are offers. A mention the draft ignores is not a
  miss, and you never link something to raise a number.
- Never install anything. Do not commit the draft; `commune-ship` commits it.
  The one exception is refine, which commits each correction on its own so a
  verdict can be reverted alone (`references/refine.md`).

## Steps

1. **Preflight and read.** Run `node scripts/preflight.mjs` → `$COMMUNE`; stop
   on exit 1 and show its line. Read, in order: `WRITING.md`, the dump file,
   `dumps/<slug>.connect.md`, and `dumps/<slug>.answers.md` if it exists. Pipe
   every `--json` payload through `node scripts/preflight.mjs --schema`.

2. **Grill** — when no answered round exists. Follow `references/grill.md`.
   Output: `dumps/<slug>.answers.md` with `## Settled` and
   `## Round N — questions`. Print the path and stop. Do not draft in the same
   turn.

3. **Draft** — when the newest round has answers under it. Output: the file at
   `target:` in the dump, or a new file in `src/content/<collection>/`, named
   the way that collection already names its files — read one before you
   guess. Write `## Round N — decisions extracted` into
   `.answers.md` first, then apply those decisions as a delta to the base named
   by `base:`. Frontmatter comes from `WRITING.md`'s block for that collection,
   keys in its order. Append every file you touched to `files:` in
   `.connect.md`.

4. **Verify.** Run `$COMMUNE check --json` and diff `summary` against
   `baseline` in `.connect.md`. Any **new** finding is yours to fix before you
   show anything; pre-existing findings are the baseline and are not. Then
   `$COMMUNE graph related <target> --json` for what the note now links.

5. **Render the side by side.** Run:
   `node scripts/review.mjs <base-ref> <target> --connect dumps/<slug>.connect.md --answers dumps/<slug>.answers.md --out dumps/<slug>.review.html`
   Pass `--out`: the script's default is named after the note, not the dump. Print that path, then a short table of
   what changed in the graph — links added, links dropped, and for each dropped
   link what `at_risk` says it costs.

6. **Hand off.** Say: *"Answer in `dumps/<slug>.answers.md`, give me a
   one-sentence correction, or say ship."* On a correction, follow
   `references/refine.md` — same skill, next round. On "ship", say:
   *"Run `commune-ship`."*

## Stop conditions

- No `WRITING.md` → stop, name `commune-setup`.
- `.connect.md` has `status: blocked` → stop; `commune-dump` owns that.
- No answered round → you are in step 2, and stopping is the step.
- A new `check` finding you cannot fix → stop and say which line caused it.
  Never show a review page with a broken link in it.

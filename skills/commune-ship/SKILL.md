---
name: commune-ship
description: Verify and ship the file set one dump produced in a Commune wiki — check against the baseline, file the updates entry, build, gate, confirm hrefs, commit, open the PR. Use when the user says ship, or when a reviewed draft is ready to go out. Requires the wiki's installed commune CLI; reads dumps/<slug>.connect.md and dumps/<slug>.answers.md, writes dumps/<slug>.ship.md and the PR. Never merges.
metadata:
  version: "0.1.0"
  commune-schema: "1"
---

# commune-ship

Mechanical. Everything here is a check with a right answer, which is why it runs
after the human has said ship and why a stranger who edited by hand can run it
alone.

Run every command from the wiki root. Pass no `--root`. `$COMMUNE` is the path
step 1 prints. Handoff file shapes: `references/handoffs.md`.

## Rules

- **Never merge.** Open the PR and stop. Voice is the human's, and the PR is
  where they read the page in the site's chrome.
- A green `check` is not proof the page exists. It did not catch a note whose
  file name and title disagreed shipping a 404. Step 6 is what catches that.
- Pre-existing findings are the baseline, not your problem. **New** findings
  are, and they stop the ship.
- Never install anything.

## Steps

1. **Preflight and read.** `node scripts/preflight.mjs` → `$COMMUNE`; stop on
   exit 1. Read `dumps/<slug>.connect.md` for `files:` and `baseline:`, and
   `dumps/<slug>.answers.md` for what was decided. Pipe every `--json` payload
   through `node scripts/preflight.mjs --schema`.

2. **Check against the baseline.** `$COMMUNE check --json`. Compare `summary`
   to `baseline`. Any finding that is not in the baseline stops the ship: say
   which file and which rule, and hand back to `commune-write`.

3. **File the updates entry.** `$COMMUNE update --recent <dump date> --json`
   first, to read the scaffold. If `src/content/updates/<today>.md` does not
   exist, run it again with `--write`; if it does, **edit that file** — `update`
   refuses to overwrite and a second scaffold for one day is wrong anyway. Then
   fill `summary:`, which the CLI leaves empty on purpose: one sentence, from
   the dump, in the voice `WRITING.md` describes. Set `aiGenerated: false` when
   that sentence is the human's — dictated or edited by them — and `true` when
   you wrote it and they only approved. Show them the sentence.

4. **Build and gate.** `pnpm run build`, never `astro build` by hand: the wiki's
   script carries its lifecycle hooks (devon-wiki's `prebuild` unshallows the
   clone so dates are real). If the script does not end in `commune gate`, run
   `$COMMUNE gate` after it. `gate` reads
   `public/backlinks.json`, which only a build writes, so there is no gate
   without the build. `gate` exits 1 when the built site is wrong; that stops
   the ship.

5. **Confirm every new href.** For each entry the file set created or renamed,
   read its `urlPath` from `$COMMUNE graph query --json` and grep `dist/` for
   it. Missing means the page did not render at the URL the graph promises —
   a 404 that `check` cannot see.

6. **Commit and open the PR.** Commit exactly the paths in `files:` plus the
   updates entry and the four `dumps/` handoff files. Conventional message,
   subject in the wiki's own convention. Push the branch. Open the PR with the
   preview URL and `dumps/<slug>.review.html` in the body, and the `summary`
   sentence quoted so it can be corrected in one reply.

7. **Write the receipt.** Output: `dumps/<slug>.ship.md`, keys per
   `references/handoffs.md` — the check diff, the hrefs, the updates entry, the
   commit, the PR URL, the preview URL. Print the PR URL and stop.

## Stop conditions

- A new `check` finding → stop, name it, hand back to `commune-write`.
- `gate` exits 1 → stop, quote its finding.
- An href missing from `dist/` → stop. That is the 404 this step exists for.
- No preview URL yet (the deployment has not finished) → open the PR anyway and
  say the preview is pending; do not wait, and do not merge.

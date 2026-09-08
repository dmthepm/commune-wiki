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
  file name and title disagreed shipping a 404. Step 5 is what catches that.
- Pre-existing findings are the baseline, not your problem. **New** findings
  are, and they stop the ship.
- Never install anything.

## Steps

1. **Preflight and read.** `node scripts/preflight.mjs` → `$COMMUNE`; stop on
   exit 1. Read `WRITING.md` for `dumps.commit`. Read `dumps/<slug>.connect.md` for `files:` and `baseline:`, and
   `dumps/<slug>.answers.md` for what was decided. Pipe every `--json` payload
   through `node scripts/preflight.mjs --schema`. Compare finding identities
   `(rule, file, target)` with `baseline.findings`, using `null` for absent targets.

2. **Check against the baseline.** `$COMMUNE check --json`. Compare identities as sets, never counts.
   A missing `baseline.findings` requires recovering the pre-edit findings;
   never treat the edited corpus as its own baseline. Any finding that is not in the baseline stops the ship: say
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

5. **Confirm every new href.** For each created or renamed entry, read its
   `urlPath` from `$COMMUNE graph query --json`. Require both an href occurrence
   in built HTML and an existing destination under `dist/`: `/path/` maps to
   `dist/path/index.html`; its `/path.md` twin maps to `dist/path.md`. Check both
   URLs, stripping query and fragment before mapping; `/` maps to `dist/index.html`.
   Also check new internal links in edited files, including existing destinations.
   Record occurrence and destination existence separately; either missing stops ship.

6. **Commit and open the PR.** Prepare the receipt first with commit, PR and
   preview pending. Commit exactly `files:` plus the updates entry; include the
   four handoffs only when `WRITING.md` says `dumps.commit: true`. Otherwise
   exclude every `dumps/` path, even if listed in `files:` or already staged.
   Never use a blanket add. Use the wiki's conventional commit subject. Push and
   open the PR with the preview URL and summary sentence. Include the review
   path only when handoffs are shared; otherwise describe the review in the PR.

7. **Finish the receipt.** Update `dumps/<slug>.ship.md` per
   `references/handoffs.md` with the check diff, href checks, updates entry,
   content commit, PR and preview URLs. When `dumps.commit: true`, commit this
   receipt update separately and push; its `commit` names the content commit.
   Otherwise keep it local. Print the PR URL and stop.

## Stop conditions

- A new `check` finding → stop, name it, hand back to `commune-write`.
- `gate` exits 1 → stop, quote its finding.
- An href occurrence or destination file missing from `dist/` → stop. That is the 404 this step exists for.
- No preview URL yet (the deployment has not finished) → open the PR anyway and
  say the preview is pending; do not wait, and do not merge.

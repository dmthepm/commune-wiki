# Refine

Refine is not a fourth step and not a fourth skill. It is `commune-write` run
again on a note that already has a draft, with a base and a round number.

Trigger: the human gives a one-sentence correction on a drafted note — in chat,
in the PR, or appended to `dumps/<slug>.answers.md`.

## Steps

1. **Preflight**, as always: `node scripts/preflight.mjs`.
2. **Read the base.** `base:` in the answers frontmatter says what this turn
   diffs against: `original` (the file as of the dump's first commit),
   `previous` (the last drafted turn) or `current` (the working tree). Keep
   whatever is there. Change it only when the human says which one — "go back to
   how it was" is `original`, and that is the one they mean most often.
3. **Extract the decision.** Append to `.answers.md`: bump `rounds`, add
   `## Round N — answers (verbatim)` with their sentence exactly as given, then
   `## Round N — decisions extracted` with what it changes, file by file. Verbatim
   matters: the paraphrase is where a taste call turns into a different note.
4. **Apply it as a delta to the base.** One correction is one change. Do not
   re-draft the note around it, do not fix things nobody asked about, and do not
   improve a sentence the correction did not touch.
5. **Re-verify and re-render.** `$COMMUNE check --json` against the connect
   baseline, then `node scripts/review.mjs <base> <path> --connect … --answers … --out dumps/<slug>.review.html`.
6. **One commit per turn**, so each verdict is revertable on its own.

## When a correction becomes a rule

Only when the human says so — "make that a rule", "always do that", "add that to
the writing rules". Then append one dated line to `WRITING.md` under
`## Verdicts`, in their words, and say which file you added it to.

Never append automatically. A one-off taste call ("no architecture on the home
note") is not a rule, and auto-appending turns every correction into doctrine
nobody chose. If you are unsure, it is not a rule: ask on the next round.

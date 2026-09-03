# The four handoff files

Every hand-off in the loop is one markdown file with YAML frontmatter, in the
wiki's `dumps/`. The machine part is the frontmatter. The reasoning is the body.
There is no sibling `.json`: the person who has to accept a candidate has to be
able to read it.

Any step can be re-run by a different context window or a different harness,
because these four files are the whole state. Nothing is carried in a chat.

Names, from one dump slug `<yyyy-mm-dd>-<target-slug>`:

| File | Written by | Read by |
|---|---|---|
| `dumps/<slug>.md` | `commune-dump` | write, ship |
| `dumps/<slug>.connect.md` | `commune-dump`, `files:` appended by `commune-write` | write, ship |
| `dumps/<slug>.answers.md` | `commune-write`, answered by the human | write, ship |
| `dumps/<slug>.ship.md` | `commune-ship` | the human |

Keys are exact. Do not invent, rename or drop one; a later skill reads them.

## `dumps/<yyyy-mm-dd>-<target-slug>.md` — the dump

```yaml
---
kind: dump
captured: 2026-09-05
source: dictated | pasted | monologue:<note_id>
target: src/content/notes/<slug>.md | new:<collection>
publish: true            # false = keep the note private; no graph verification is possible
visibility: private      # private | public — whether the dump itself is publishable
---
<verbatim text, unedited, as plain paragraphs>
```

The body is never fenced and never indented as code. `graph related` strips code
before it matches, so a fenced dump has no mentions at all.

`visibility` is the dump's own, not the note's: `private` is the default and
means the dump is provenance beside the notes, never a page. `public` means the
wiki may publish it. `publish` is about the *note* the dump becomes.

## `dumps/<slug>.connect.md` — what the graph already knows

```yaml
---
kind: connect
dump: dumps/2026-09-05-<slug>.md
cli: "@dmthepm/commune 0.4.0"
baseline:                # check --json summary, before any edit
  entries: 85
  edges: 396
  errors: 1
  warnings: 0
duplicate_name: []       # check findings whose candidates include the target; non-empty = stopped
target: { file: src/content/notes/<slug>.md, urlPath: /notes/<slug>/, inbound: 6, outbound: 11 }
at_risk:                 # the target's resolved outbound links; each one the draft may drop
  - { urlPath: /notes/noontide/, inbound: 2, orphans_if_dropped: false }
mentions:                # related.mentions, each tagged with the sentence and tense that produced it
  - { urlPath: /notes/main-branch/, sentence: "I don't really want to highlight…", tense: negative }
unmatched:               # subjects with no note: phrases related - did not match
  - { phrase: "Cloudflare", sentence: "…building the app in Cloudflare…", tense: present }
unreferenced:            # graph query --unreferenced; offered, never a goal
  - { urlPath: /notes/…/, title: "…" }
files:                   # the file set ship will commit; grows through write
  - src/content/notes/<slug>.md
status: ready | blocked
---
## What I ran
## Candidates
## Handoff
```

`mentions`, `unmatched` and `unreferenced` are candidates for the human. The
draft is never scored on them: a mention the draft ignores is not a miss.

`tense` is the skill's judgement about the sentence that produced the candidate —
`present`, `past`, `negative`, `hypothetical`. "I do not want to highlight Noon
Tide" mentions Noontide and argues against linking it, and only the tense tag
carries that. One tag per candidate: when a sentence both states a fact and
refuses to feature it — "Noon Tide is the company, and I do not want to
highlight it" — tag it `negative`, because the refusal is the half that changes
the draft.

`at_risk` is every **resolved** outbound link of the target, each with that
entry's own inbound count and whether dropping this link would leave it at zero.
The counts come from one `graph query --json`, never from counting by hand.
Unresolved links are not at risk; they are already broken, and `check` reports
them.

## `dumps/<slug>.answers.md` — the grill

```yaml
---
kind: answers
dump: dumps/2026-09-05-<slug>.md
rounds: 1
base: original          # original | previous | current — what the next draft diffs against
---
## Settled (facts, no decision)
## Round 1 — questions
❓ Q1 … ➡️ recommended …
## Round 1 — answers (verbatim)
## Round 1 — decisions extracted
```

Answers are appended verbatim, never summarised in place. The newest round that
has answers under it is the one the draft executes. `rounds` counts the rounds
that exist, answered or not.

## `dumps/<slug>.ship.md` — the receipt

```yaml
---
kind: ship
dump: dumps/2026-09-05-<slug>.md
cli: "@dmthepm/commune 0.4.0"
check:                  # against connect's baseline
  entries: 86
  edges: 402
  new_findings: []      # non-empty = ship stopped
updates_entry: src/content/updates/2026-09-05.md
aiGenerated: false      # false when the summary sentence is the human's, true when the agent wrote it
hrefs:                  # every new or renamed urlPath, grepped in dist/
  - { urlPath: /research/<slug>/, found: true }
commit: <sha>
pr: https://github.com/<owner>/<repo>/pull/<n>
preview: https://<hash>.<project>.pages.dev/research/<slug>/
review: dumps/<slug>.review.html
---
## What I ran
## What shipped
```

`commune-ship` never merges. The PR is where the human reads the page in the
site's chrome and says ship or leaves a correction.

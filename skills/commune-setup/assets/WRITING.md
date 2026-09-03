# Writing rules

The rules this wiki is written by. `commune-write` reads this file first and
reads nothing else about voice, so a rule that is not here is not followed.

Rules only. No history, no positioning, no description of the project: an
overview is dead weight in a context window, and every line below has to change
something the agent writes. Replace every `<angle bracket>` — a placeholder left
in place is a rule nobody chose.

## Sentences

Rules that change a sentence: length, person, what to cut.

- <Voice in one line: e.g. direct, active, first person, no corporate register.>
- <Preferred phrasings, as pairs: "<this>" over "<that>".>
- <What to cut: hedges, throat-clearing, adverbs, whatever this wiki does not do.>

## Titles

- <The title rule. e.g. a title is a takeaway, not a label: "Box-first earns
  trust", not "Self-hosting". If you cannot name the claim, the note is not one
  note yet.>
- <Casing, length, punctuation.>

## Notes

- **Length:** <band, e.g. 150–250 words, and what earns an exception.>
- **One idea per note.** <How to tell when it is two.>
- **Proper nouns get their own note.** <Which ones: people, projects, products.
  The note says what the thing means here, then links out.>
- **Linking:** <how densely, and where external links go — in the note, never as
  the note.>

## Frontmatter

One block per collection, keys in this order, required keys marked. A note the
loop means to publish sets `visibility: public` before anything checks it: the
graph cannot see a private note, so a green `check` on one proves nothing.

```yaml
# notes — src/content/notes/<Title>.md
title: <string>            # required
visibility: public         # public | private | draft — default private
status: draft              # draft | live | updated
tags: []                   # <how many, which vocabulary>
aliases: []                # <other names WikiLinks may use>
created: <yyyy-mm-dd>
updated: <yyyy-mm-dd>
author: <name>
summary: <one sentence>
```

```yaml
# research — src/content/research/<Title>.md
title: <string>            # required
summaryNote: <slug>        # required — the note that summarises this
created: <yyyy-mm-dd>      # required
wordCount: <number>        # required
context: <one sentence>    # required — shown in the info box, may contain [[links]]
author: <name>
model: <model that produced it>
aiSource: <tool that produced it>
updated: <yyyy-mm-dd>
summary: <one sentence>
```

```yaml
# updates — src/content/updates/<yyyy-mm-dd>.md
title: <string>            # required
date: <yyyy-mm-dd>         # required
summary: <one sentence>    # required — written by a human or approved by one
aiGenerated: false         # false when the summary sentence is yours
links: []                  # the pages this rolls up
author: <name>
```

```yaml
# pages — src/content/pages/<Title>.md
title: <string>            # required
url: /<path>/              # required — absolute, trailing slash
summary: <one sentence>    # required
aliases: []
tags: []
created: <yyyy-mm-dd>
updated: <yyyy-mm-dd>
```

**Dumps.** `dumps.publish: <never | opt-in | all>` — whether the dictated dumps
in `dumps/` are ever published as pages. `never`: they stay provenance beside
the notes. `opt-in`: a dump with `visibility: public` in its frontmatter is
publishable, everything else is not. `all`: every dump is public. Default and
recommendation: `opt-in`.

## Avoid

Words and shapes that are never written here.

- <word> — <why>
- <shape, e.g. "not X but Y", rule-of-three lists, em-dash pile-ups>

## Verdicts

Dated one-liners. Appended **only** when the wiki's owner says a correction is a
rule — "make that a rule". A one-off taste call is not a rule.

- <yyyy-mm-dd> — <the rule, in their words>

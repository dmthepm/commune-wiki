# Research pages

How `commune-write` turns a finished piece of research into a research page.
Read this at the grill, before any round is written, whenever the dump might
be research. Frontmatter keys and their order, and every length band, come
from `WRITING.md`; this file covers everything the schema cannot enforce.

Every "ask" below is a grill question: numbered, recommended answer first, in
a round of `dumps/<slug>.answers.md` (`references/grill.md`). The draft turn
never asks. A question that only appears while drafting stops the draft: write
it as the next round, print the path, stop.

## Is it research?

Research answers questions someone asked, with sources. Before writing, check
the form:

- An argument the owner is making, built on their own view: an essay.
- Something written to subscribers, dated, in a letter's voice: a letter.
- One idea, within the length `WRITING.md` gives notes: a note.

If the material reads as one of these, or as two of them at once, the form is
the round's first question. Never default to research or to a note because
that collection exists.

## Two files, always

A research run is the one run that writes two files. Both go in `files:` in
`.connect.md`.

1. **The dossier**, `src/content/research/<Title>.md`. The full research, long
   form. Name it the way that collection already names its files: read one
   first.
2. **One summary note**, `src/content/notes/<slug>.md`, the dossier's only
   summary. The dossier's `summaryNote` is that note's slug, and the note
   ends with a WikiLink to the dossier's title. One dossier, one summary note:
   never two summaries, never a dossier without one.

### The dossier

- Opens with what was asked, by whom, and why: the questions, numbered, in one
  short paragraph. Then one section per question, in the same order.
- **`context`** (frontmatter) names the hub note the research hangs from and
  the notes it serves, as WikiLinks.
- **What steers this.** A short section after the questions, before the
  findings: the owner's own beliefs that shaped which questions were asked and
  how the findings are weighed, each linked to the note that states it. Take
  these from the owner's existing notes, or ask in the grill. Never infer a
  belief and never write one into their mouth. If none exists yet, leave the
  section out rather than filling it, and say so in the report back.
- Findings are stated, then sourced. Numbers carry their date and their
  source. A judgment is marked as the researcher's, separate from what a
  source says.
- Ends with `## Sources`: every source, linked, each with one line on what it
  supplied.
- **`wordCount`** is counted from the body, not estimated.

### The summary note

- In the owner's voice, per `WRITING.md`. First person: what they had
  researched and what came out of it.
- Length per `WRITING.md`'s notes band. The findings as takeaways, in the
  order they matter, not a table of contents of the dossier.
- Frontmatter per `WRITING.md`'s notes block, with `visibility: public`. Read
  one of the wiki's existing research summaries first: if they carry a `type:`
  key or a shared tag (devon.md uses `type: research-summary` and
  `deep-research`), carry the same, `type:` placed after `tags`.
- Last lines: `Full Deep Research:` then `[[<dossier title>]]`.

## Interlinking

Dense and deliberate: a reader of either file should be able to walk from it
into the rest of the wiki at every point the research touches it.

1. **Find what exists.** `$COMMUNE graph query --json` lists every title and
   alias. `$COMMUNE graph related <dossier path> --json` ranks the notes the
   research is closest to. Read the top of that list before writing links.
2. **Link the first mention** in each section of every person, project,
   product, place or idea that has a note, with the note's title verbatim in
   `[[Title]]`, no pipe. Rewrite the sentence around the title. Once per
   section is enough.
3. **The summary note links at least three existing notes**, each where it
   genuinely bears, in a sentence that says why it connects. No "see also"
   lists.
4. **Unlinked mentions.** Search both files for every title and alias from
   step 1, case-insensitive. Each hit is linked, or left unlinked for a reason
   you give in the report back.
5. **Links back in.** List up to five existing notes the findings change or
   support, each with the one sentence and link you would add. These are a
   question in the report back. Do not edit other notes unasked.
6. **No links to notes that do not exist.** A WikiLink to a missing note is a
   broken link. Drop the brackets, or ask in the grill whether to write the
   note.

## Visuals

Optional. A visual earns its place where a picture explains a mechanism, a
comparison or a structure faster than prose; three is plenty, none is fine.

- In the owner's established style, from the reference visuals `WRITING.md`
  names. If it names none, draw nothing: propose the visual in the report back
  in one line (what it would show, and why) for the owner to answer.
- Files under `public/research/<dossier slug>/`, referenced with absolute
  paths, each with alt text that states what the picture shows.
- Facts in a visual come from the dossier and nowhere else.
- A drawn visual is a question in the report back; it ships only once the
  owner answers yes.

## Before the report back

- `$COMMUNE check --json`: no new `broken-link`, `ambiguous-target`,
  `duplicate-name` or `noncanonical-title` from either file.
- The build passes, and `$COMMUNE gate` on the built site exits 0.
- On the built site: the dossier links to its summary note, the summary note
  links to the dossier, and every WikiLink in both resolves.
- **Report back** as the next round of `dumps/<slug>.answers.md`. Under
  Settled: the links added, and the unlinked mentions kept and why. As
  questions: the proposed links back in, each visual drawn or proposed, and
  any "what steers this" belief that needs the owner.

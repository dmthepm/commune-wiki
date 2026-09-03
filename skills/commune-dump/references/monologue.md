# Intake from Monologue (optional)

A plain paste is the default and always works. This adapter exists for one case:
the user names a Monologue note instead of pasting its text — "dump note_123",
a Monologue URL, or "the walk I recorded this morning".

Commune does not depend on Monologue. If the `monologue` CLI is not on the
machine, say so in one line and ask for the text instead. Never install it
without being asked.

## Getting the text

```bash
monologue notes list --limit 10            # find the note the user means
monologue notes get <note_id> --field transcript
```

Use the **transcript**, not the summary. The dump file is the raw thought; a
summary is already a draft, written by something that has never read
`WRITING.md`, and `commune-write` would then be refining someone else's prose in
the user's name.

If `monologue` is missing, `EveryInc/monologue-toolkit` installs it and
`monologue onboarding` takes the API token. Both are the user's call, not yours.

## What changes in step 2

- `source: monologue:<note_id>` in the dump frontmatter, so the provenance is a
  note id and not the word "dictated".
- `captured:` is the note's own date when the CLI reports one, not today.
- The body is still verbatim and still plain paragraphs. Transcripts arrive with
  filler and false starts; leave them. The grill is where they get resolved, and
  a cleaned-up transcript hides the sentences whose tense `commune-dump` has to
  tag.

Everything else in `SKILL.md` is unchanged.

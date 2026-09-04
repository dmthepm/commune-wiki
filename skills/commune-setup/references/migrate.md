# Migrating an existing rules document into `WRITING.md`

Most wikis that need this skill already have a writing document. Two files with
writing rules in them is drift: the agent reads one, the human edits the other,
and within a month they disagree. So the migration is a move, not a copy — the
old file ends up deleted in the same commit.

## Steps

1. **Find it.** Look for `docs/NOTE-WRITING-BIBLE.md`, `WRITING.md`, `STYLE.md`,
   `VOICE.md`, `docs/writing*.md`, `.github/*style*`. If there is none, skip to
   the interview; nothing here applies.
2. **Read it whole**, then sort every section into one of three piles: a rule
   that changes what an agent writes; a fact about the project; a plan. Only the
   first pile moves.
3. **Place each rule** in the section of `assets/WRITING.md` that decides that
   thing. One rule, one section. If a rule fits two sections, it is two rules.
4. **Reconcile the frontmatter against the schema.** The old document is written
   by memory; `src/content.config.ts` is what actually validates. Where they
   disagree, the schema wins and you say so out loud — a value the schema does
   not accept is a note that fails `commune check`.
5. **Drop the rest, and say what you dropped**, by section name, in one line
   each. Do not paraphrase it into `WRITING.md` to be safe. An overview costs
   context on every note the agent writes and changes none of them.
6. **Interview only the empty sections** (`SKILL.md` step 5).
7. **Delete the old file in the same commit** and grep for links to it —
   `README`, `CONTRIBUTING`, other docs — and repoint them at `WRITING.md`.

## Worked example: `docs/NOTE-WRITING-BIBLE.md`

The engine's own wiki carries this file, last updated 2025-10-16, 204 lines.
Where each section goes:

| Section in the bible | Goes to | Note |
|---|---|---|
| 1. Titles are takeaways, not labels | **Titles** | Keep the bad/good pair; it is the rule's test |
| 2. Atomic notes (one idea per note) | **Notes** | Keep the test: "what is the ONE idea here" |
| 3. Associative linking over hierarchies | **Notes** → Linking | |
| 4. Target 150–250 words | **Notes** → Length | Keep the exception clause |
| 5. Proper nouns get their own notes | **Notes** | Including "external links go in the note, not as the note" |
| Voice & Style → Use Devon's voice | **Sentences** | The phrasing pairs are the rule; keep them as pairs |
| Voice & Style → Avoid these words | **Avoid** | Verbatim, with the reason on each |
| Voice & Style → Prefer these patterns | **Sentences** | Same shape as the pairs above |
| Connection Patterns → When to link, Dense linking | **Notes** → Linking | Merge with row 3; one rule, not two |
| Tags & Metadata → Visibility, Status, Tags | **Frontmatter** | **Reconcile:** see below |
| Note Evolution → Status progression | **Frontmatter** | **Reconcile:** see below |
| Note Evolution → How notes evolve | — | A description of the loop. The loop is the skills |
| The Agent's Role | — | This became `commune-dump` and the grill; not a writing rule |
| Depth Gating (Future) | — | A feature idea, not a rule; say it was dropped |
| The Vision | — | Positioning |
| Quality Signals Research | — | Research. Link it from a note if it should be readable |
| Meta / Sources | — | Provenance of the old file, which is being deleted |

**The reconciliation this example forces.** The bible lists four statuses —
Draft, Working, Live, Evergreen — and a `working` visibility. `src/content.config.ts`
accepts `status: draft | live | updated` and `visibility: public | private | draft`.
`working` and `evergreen` do not exist and would fail the build. So the
`Frontmatter` block gets the schema's values, and the human is told in one line:
*"the bible's `working` and `evergreen` statuses are not in the schema; I used
`draft`, `live`, `updated`. Say the word and I will add them to the schema
instead."* That is a real question, and it is the only one this migration
produces.

Result: six of sixteen sections move, five merge into three rules, five are
dropped by name, and the interview is left asking about `Sentences` length and
the `dumps` policy — the two things the bible never had an opinion about.

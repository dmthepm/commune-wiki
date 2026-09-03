# Senior review of the #10 plan — the authoring skills over the CLI

Reviewed 2026-09-03 against worktree `447ac94` (= `main`; `v0.3.0` was tagged forty seconds later at `996965c` by release-please), Node v22.23.1. devon-wiki read at `d6c5969`, never modified; it has `@dmthepm/commune` 0.3.0 installed under a `^0.1.0` range. Frozen junior plan: the #10 body as re-pointed on 2026-09-02, plus the run-1 findings recorded on #19 (two comments and the 1,020-line transcript at `dumps/2026-09-02-home-note.transcript.md` in devon-wiki). Every codebase claim below was checked in this worktree; every CLI probe ran a scratchpad-compiled copy of the `main` CLI read-only against devon-wiki; every ecosystem claim carries a fetched source and date or is marked `[training-data, unverified]`. An isolated reviewer with no access to this session's reasoning was handed the frozen artifact and the evidence file and told to attack it; four of its findings changed decisions below and are credited where they did. Two of its claims did not survive checking and are recorded as such.

## Evidence gathered before critique

**The CLI as it exists today** (`src/cli/`, compiled from `main`):

- Verbs: `graph query`, `graph related`, `check`, `gate`, `update` (`src/cli/main.ts:58`). No `render` — #60 is open. `src/cli/render.ts` is the stdout/stderr JSON writer, not markdown rendering; it exports `SCHEMA = 1` with the comment *"Every payload carries the contract version, so #10's skills can pin it."*
- `graph query` filters: `--collection`, `--tag`, `--status`, `--orphans` (zero in **and** zero out), `--deadends`, `--recent`. No `--unreferenced` (`src/cli/usage.ts:568-575`).
- `graph related` matches titles and aliases as whole words, case-insensitively, on the exact string (`src/cli/related.ts:132-140`). No whitespace normalisation, no `unmatched[]`. **Stdin is parsed with gray-matter** (`related.ts:71-75`), so a dump's YAML is *not* scanned as prose; only the literal-text positional skips parsing (`related.ts:107`). Run 1's "`graph related -` ate the YAML frontmatter" does not reproduce on this source — the isolated reviewer caught this, and my own evidence note had repeated the transcript's claim.
- `graph related` runs `stripCode` before matching (`related.ts:163`): text inside fences is invisible to `mentions`.
- The graph sees only public entries: notes opt in with `visibility: public`, every other collection is public (`src/lib/graph.ts:271-274`). A note left at the schema default (`private`, `src/content.config.ts:11`) or at `draft` is invisible to `check`, `related`, `gate`, `update` and any new query flag.
- `duplicate-name`: the link lookup keeps last-wins (`graph.ts:1136`, `:1190`), so a new note whose title or alias collides silently steals the link.
- `update` is the only writing verb, refuses to overwrite with `EEXISTS` (`src/cli/update.ts:87`), has no `--date`, scaffolds `aiGenerated: false` (`update.ts:37`), excludes its own collection from the roll-up (`update.ts:77`), and leaves `summary` empty on purpose (#62).
- `gate` reads `public/backlinks.json`, which only a build writes (`src/cli/gate.ts`): there is no gate without `astro build`.
- The package ships `bin`, `lib`, `src/components`, `src/styles` (`package.json` `files`). There is no `skills/` directory in the repo. README's "Where this is going" says the loop is not in the package and points at the issues.
- devon-wiki already has `commune` on `node_modules/.bin`: its `build` is `astro build && commune gate`, its `check` script is `commune check --json`. Its `package.json` range is `^0.1.0`, which on a 0.x version pins the minor (`<0.2.0`), yet 0.3.0 is what is installed — the range and the install already disagree, which is the version-drift class a preflight exists for.

**Live probes on devon-wiki, 2026-09-03, read-only** (85 entries today; run 1 saw 78):

| Probe | Result | What it proves |
|---|---|---|
| `check --json` | 85 entries, 396 edges, 1 error (the pre-existing `duplicate-name` on "higher self prompt"), 0 broken links | Baseline for run 2; the error is content, not a defect of the loop |
| `graph related -` on *"I do not want to highlight Noon Tide and Main Branch. I am working on Cake and Morning Paper on Cloudflare."* | mentions: Cake, Main Branch, Morning Paper. **Noontide missed. Cloudflare silent.** | Run-1 gap 1 reproduces on today's code; Cake and Morning Paper hit only because run 1 created their notes |
| `graph query --orphans` | 1 (`/updates/2025-10-17/`) | Same definition problem as run 1 |
| zero-inbound-any-outbound, computed over `graph query --json` | 4, **all `updates` entries** (2025-10-18, 2025-10-19, 2026-03-12, 2026-09-03) | A naive `--unreferenced` returns roll-up entries, which are unreferenced by design. The four Deep Research notes now have 2 inbound each (devon-wiki #20 fixed the research backlinks), so the run-1 rescue set no longer exists |
| `update --recent 7d` (no `--write`) | A dated entry listing Cake, Morning Paper, My Working Notes, Network effects, Printed references, Herdr with `summary: ""` | The ship step's roll-up scaffold works today; the sentence is the agent's to write |

devon-wiki has no `WRITING.md`. It has `docs/NOTE-WRITING-BIBLE.md` (last updated 2025-10-16): titles are takeaways, one idea per note, 150–250 words, proper nouns get their own notes, an avoid-words list, Devon's voice patterns. `git ls-files dumps` on devon-wiki `main`: the run-1 dump, answers and transcript, four `BRIEF-*.md` lane briefs, `CLOUDFLARE-STEPS.md`, `SUBSCRIBE-SECRETS.md` (checked: it documents *which* secrets the Worker needs and where to get them; it holds no key values), and a `harden/` folder of screenshots and sweep scripts. `dumps/` is already a public catch-all, not a loop directory.

**The skills ecosystem, fetched 2026-09-03:**

- *vercel-labs/skills README*: `npx skills add <owner/repo>` discovers `SKILL.md` in the repo root, `skills/`, `.claude/skills/`, `.agents/skills/`, `.codex/skills/` and the like, walked three deep; `--skill`/`-s`, `-a`/`--agent`, `-g`, `--copy`, `-y`; default install symlinks from one canonical copy; `npx skills update`. Frontmatter required: `name`, `description`. The README does not document folder copying or a lock file; **verified locally instead**: `~/.agents/skills/impeccable/` holds `SKILL.md`, `reference/` (30+ files), `scripts/`, `agents/openai.yaml` — whole folders install; `~/.agents/.skill-lock.json` v3 records `skillPath: skills/<name>/SKILL.md` and `skillFolderHash` per skill; `~/.claude/skills/<name>` are symlinks into `~/.agents/skills/<name>`. `monologue-notes` installed from `EveryInc/monologue-toolkit` at exactly the `skills/<name>/SKILL.md` layout this plan proposes.
- *agentskills.io specification*: `name` 1–64 chars, lowercase and hyphens, **must match the directory name**; `description` 1–1024 chars, "what and when"; optional `license`, `compatibility`, `metadata` (string→string), `allowed-tools` (experimental); `scripts/`, `references/`, `assets/`; keep `SKILL.md` under 500 lines; file references one level deep.
- *Claude Code skills docs (code.claude.com)*: frontmatter `name`, `description` (+`when_to_use`, combined cap 1,536 chars in the listing), `argument-hint`, `arguments`, `disable-model-invocation` (default false; also stops subagent preload and scheduled-task use), `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context: fork` (+`agent`, `background`), `hooks`, `paths`, `shell`. Project skills load from `.claude/skills/` in the start directory and every parent up to the repo root. `` !`command` `` inline shell and `${CLAUDE_PROJECT_DIR}` substitution exist for local skills — and only there.
- *Codex skills docs (learn.chatgpt.com/docs/build-skills)*: discovers `$CWD/.agents/skills`, `$REPO_ROOT/.agents/skills`, `~/.agents/skills`, `/etc/codex/skills`; reads `name` and `description`; optional `agents/openai.yaml` with `interface.*` and `policy.allow_implicit_invocation` (default true); explicit invocation is `$skill-name`; the skills list is capped at 2% of context or 8,000 chars.
- *Research #16 (2026-09-02)*: ETH Zurich arXiv:2602.11988 — context files "do not generally improve task success rates, while increasing inference cost by over 20%"; Vercel's evals measured a skill never invoked in 56% of cases; constraints C2 (skills shell out to the CLI), C4 (the description is a trigger), C8 (`SKILL.md` under 100 lines, rest in `references/`), C9 (job-split with a router and a written invocation rule).
- *Prior art on disk*: morning-paper `ROLES.md` — one markdown handoff per role with YAML frontmatter (`role`, `phase`, `status: ready|notes|blocked`, `inputs[]`, `handoff{}`) and fixed sections, *"Do not split role handoffs into paired JSON and markdown files"*, and a CLI that rejects skeletal handoffs. paperboy `WRITING.md` — rules first, then an editorial layer of concrete molds, then lineage; `OPERATING.md` hard rule 3, *"Every hand-off is a file."* `~/.claude/skills/grilling` — rounds, a frontier, numbered questions each with a recommended answer. `writing-for-agents/SKILL-MECHANICS.md` — a user-invoked skill (`disable-model-invocation: true`) cannot be reached by another skill; shared reference for several user-invoked skills lives outside the skill system.

---

## Senior Review

**Altitude diagnosis:** mixed. The #10 body is fog on everything that matters — "which skills exist" is delegated to #19, "handoffs are files" names no file, "calls the CLI" names no verb, and the review surface, the voice file and the CLI-discovery question are absent. The run-1 findings are the opposite: precise, evidenced, already at the right altitude on handoffs and on `related`'s first gap — and granular in two places where the source disagrees (a stdin bug that is not there, a JSON handoff the cited pattern forbids). The promoted plan is mostly the run-1 findings turned into decisions, plus the five things neither text says: visibility, the CLI bridge, the review surface, the voice file's shape, and ship.

### Blockers

- **[B1] Two of the skills call CLI capabilities that do not exist, and the review surface calls a verb that does not exist.** Connect needs whitespace-tolerant matching and a rescuable-notes query; the side-by-side needs `render`. Probed today: "Noon Tide" still misses `Noontide`, `--orphans` still returns 1 on a wiki with 4 unreferenced entries, and `render` is #60, open (`src/cli/main.ts:58`). A skill written against these is prose about a CLI that is not there, and rule 4 of the ticket forbids the skill doing the graph work itself. — **Fix:** the CLI prerequisites are step 0, one engine release, with fixture tests, before any `SKILL.md` is written. Decision D6 lists them with tickets — and drops two the transcript asked for (below).

- **[B2] The skill-to-CLI bridge is unspecified, and the obvious answer is wrong.** `npx -y @dmthepm/commune` fetches *latest* on every run, so the CLI the skill drives can differ from the engine the site builds with — the exact drift the package exists to remove (README: "one resolver, not two that drift"), and devon-wiki's `^0.1.0` range already disagrees with its installed 0.3.0. Bare `npx commune` is worse: with no local install it resolves the npm package `commune`, a 2022 placeholder owned by someone else (`docs/plans/2026-09-03-package-boundary-plan.md`, evidence). — **Fix:** the CLI is the one the wiki has installed, called by path, never by download; every skill preflights `--version` and refuses below the release that ships D6. Decision D3.

- **[B3] The graph cannot see the note the loop is writing unless the draft sets `visibility: public`.** Notes default to `private` (`src/content.config.ts:11`) and `isPublic` drops them (`graph.ts:271-274`), so a draft left at the default is invisible to `check`, `related`, `gate` and `update`: a green `check` on a private draft proves nothing, and the roll-up omits it. Neither the ticket nor run 1 mentions visibility — run 1 never hit it because the home note was already public. (Isolated reviewer's finding.) — **Fix:** `commune-write` sets `visibility: public` on any note the dump means to publish *before* running `check`, and says so in the file; a dump that means "keep it private" gets no graph verification and the skill says that too. In §3.

- **[B4] Connect's output has no file, and the run-1 proposal for one (`.connect.json`) contradicts the house pattern it cites.** Run 1 is right that this is the first thing that breaks when the loop splits. But a JSON file is unreadable by the person who has to accept its candidates (finding 9: candidates for Devon, never targets), and morning-paper's `ROLES.md` — the pattern #10 names — forbids paired JSON+markdown handoffs. — **Fix:** every handoff is one markdown file with YAML frontmatter: the machine part in the frontmatter, the reasoning in the body. Decision D2, schemas in §3.

### Major

- **[M1] "A skill per loop step" is asserted, not derived, and five names is the failure C9 warns about.** Run 1 named three seams and one context-asymmetry argument; it did not say five skills. Intake→connect is *"pure mechanism, nothing between them needs judgement"* (transcript, Findings §1) — a step, not a boundary. The voice harm (finding 5) came from *connect's* research context reaching draft, not from grill's; grill's whole context is the dump, the connect file and the rules, which draft needs anyway. Refine is draft re-entered with a named base (finding 8). Ship is mechanical and runs after a second human stop. (The isolated reviewer pushed this from four skills to three; the argument held.) — **Fix:** three loop skills at the three places the evidence shows a context or human boundary that a file cannot bridge alone — `commune-dump` (intake + connect), `commune-write` (grill → draft → refine), `commune-ship` — plus `commune-setup` (run once, #20's). No router: three verbs in loop order, each ending by naming the next, is the written invocation rule. Decision D1.

- **[M2] `--unreferenced` as specified in run 1 returns noise on today's corpus.** Probed: the zero-in-any-out set on devon-wiki is exactly the four `updates` entries, unreferenced by construction. `update` already excludes its own collection (`update.ts:77`); the query flag must too or the skill filters in prose. — **Fix:** `--unreferenced` excludes `updates` unless `--collection updates` is passed, and says so in `--help`. In D6.

- **[M3] Two of run 1's four CLI asks are not CLI work.** Frontmatter-aware stdin already exists (`related.ts:71-75`). `unmatched[]` — "which subjects in this dump have no note" — needs the agent's judgement about what a subject *is*; a capitalised-phrase extractor would return sentence starts, and no deterministic rule gives Claude and Codex the same answer. What *is* deterministic is "does a note exist for this phrase", and with D6's normalised matching `related -` answers that for any list of phrases the skill hands it. — **Fix:** `unmatched` is a skill step (list the subjects, feed them to `related -`, subtract the mentions), stated as judgement in the skill; the CLI ticket count drops from four to three. Tense tagging (finding 9) is likewise the skill's, and the file says so.

- **[M4] The review surface is described three ways and specified zero ways.** #2 says side-by-side in the site's chrome on `astro preview` or a branch URL; run 1 says the Cloudflare preview found the bugs and the diff found shape; the brief says "what the draft skill emits". These are two surfaces for two questions. — **Fix:** `commune-write` emits a local side-by-side page (original and draft, both through `commune render`) for *shape*; `commune-ship` opens the PR whose preview URL is the surface for *verdicts*, and refine turns are PR turns. Decision D5.

- **[M5] `WRITING.md` has no content spec and would fail #6's test as usually written.** The ETH result and #16 say overviews are dead weight and rules get followed. A voice *profile* is an overview; devon-wiki already has the rules, stale, in `NOTE-WRITING-BIBLE.md`, and a second file beside it is drift. — **Fix:** `WRITING.md` is a rules file with a fixed shape (§3), loaded by exactly one skill step, deciding exactly one thing (every sentence's shape and every frontmatter block's fields); `commune-setup` migrates the bible into it and deletes the bible; it grows one line per refine verdict Devon promotes to a rule. Decision D4.

- **[M6] Grill reuses `~/.claude/skills/grilling` — a skill a stranger has not installed, with a reading Devon rejected.** *"These aren't questions… I'm not really satisfied with this yet."* Five of seven were resolved facts wearing question marks. — **Fix:** the grill step is self-contained inside `commune-write` (round and frontier mechanics restated in under 30 lines) with the three rules the run produced. Decision D7.

- **[M7] Ship is undefined beyond "commit", and the one rule run 1 proved is missing.** A green `check` shipped a 404 (`Cake.md` → `/notes/Cake/`); the fix was grepping `dist/`. Ship also needs a baseline (devon-wiki carries one pre-existing error), a rule for the second run in a day (`update --write` hits `EEXISTS`, `update.ts:87`), and a rule for `aiGenerated` on the roll-up it files. — **Fix:** Decision D8; `aiGenerated` is open question 4.

### Minor

- **[m1]** Skill names must match their directory and must not collide with skills already on the machine: `grilling`, `grill-me`, `grill-with-docs`, `research`, `handoff` all exist under `~/.agents/skills/`. Prefix everything `commune-`.
- **[m2]** The `skills/` tree is installed from GitHub by `npx skills add`, not from the npm tarball; `files` in `package.json` need not change. The ADR #20 asks for says so, or someone will "fix" it.
- **[m3]** The skills-lock hash means every `SKILL.md` edit is a new version for installed users. Each skill carries `metadata.version`, bumped in the same commit; the pairing skills ↔ CLI is stated as a `schema` integer, not a semver range.
- **[m4]** `stripCode` (`related.ts:163`) means a dump wrapped in a fence loses every mention. `commune-dump` writes the dump as plain paragraphs, never fenced.
- **[m5]** A dump whose target title or alias already answers to another note is a `duplicate-name` in waiting, and the lookup is last-wins (`graph.ts:1190`). `commune-dump` runs `check --json` and stops on any `duplicate-name` finding whose `candidates` include the target.
- **[m6]** Codex parity: `disable-model-invocation`, `context: fork`, `` !`cmd` `` and `${CLAUDE_PROJECT_DIR}` are Claude Code only. The skills use none of them except `disable-model-invocation` on `commune-setup`, mirrored by `agents/openai.yaml`. Untested on this machine; step 1's verify records it.
- **[m7]** Nothing validates the tree. `tests/skills.test.mjs`: name = directory, description ≤ 1,024 chars, `SKILL.md` ≤ 100 lines, every relative reference resolves, every `commune` invocation in a skill names a verb in `ROUTES`.

### What the junior got right

- **Every hand-off is a file, and connect is the step that breaks the law.** Kept, made exact.
- **Answers are durable** (`.answers.md`, rounds appended verbatim, decisions extracted). Kept; "Decisions extracted" is a required section, since run 1 said that is where the judgement lives.
- **Draft belongs in the real file; the worktree is the staging area; `check` is the mechanical review.** Kept, with the visibility rule it needs to be true.
- **Connect findings are candidates, not targets; tag each with the tense of the sentence that produced it.** Kept as fields on every connect candidate, written by the skill.
- **Refine needs a named base, and Devon's base is the original.** Kept as `base:` in the answers frontmatter, default `original`.
- **The "Noon Tide" gap, ranked first.** Kept verbatim as D6's first ticket.
- **One context window per job is a voice argument.** Kept — it is the argument that keeps connect out of the window that writes.
- **Ship's unit is a file set; `update --recent` is the roll-up scaffold.** Kept; probed working today.
- **The `reference/` pattern and a description that fires.** Kept, with the fetched constraints.

---

## Promoted Plan (v2)

### 1. Goal and non-goals

Ship the authoring loop as installable skills over the `commune` CLI, so that Devon can dictate a dump and have agents in Claude Code or Codex find what it touches, ask only the questions whose answers change the file, write the note in his voice into the real file, put a rendered page in front of him, and ship the file set — with a file at every hand-off, so any step can be re-run by a different context window or a different harness. The proof: run 2 on devon-wiki goes dump → PR with Devon answering one short grill round and reviewing on the preview URL, and a stranger who runs `npx skills add dmthepm/commune-wiki` on a wiki that has the package installed gets the same loop.

Out of scope: the install mechanism and README first-run (#20, which this unblocks); `commune init` scaffolding (#20 item 4); the `monologue-notes` intake adapter (a reference file in `commune-dump`, exercised when Devon uses it, never a dependency); scheduled weekly intake from GitHub activity (#2 "Weekly Update"); email or social outputs (#21); heading anchors (#61); title-named files (#22); the data-shape decision (#17 — every skill reads `collection` from the CLI and writes frontmatter from `WRITING.md`, so collapsing collections changes a value, not a skill); semantic or embedding-based relatedness.

### 2. Decisions

| # | Decision | Chosen | Strongest rejected | Evidence |
|---|---|---|---|---|
| D1 | Skill boundaries | Three loop skills — `commune-dump` (intake + connect), `commune-write` (grill → draft → refine), `commune-ship` — plus `commune-setup` (run once). Seams: intake→connect is mechanism, one skill; connect→grill is the context boundary run 1 showed harms voice (connect's research must not reach the window that writes), and the connect file is what crosses it; grill→draft is a human stop *inside* one context — the skill writes the round, stops, and resumes from the answers file, and grill's context is exactly what draft needs; refine is draft with `base:` and `round:` set; ship is mechanical and follows a second human stop ("ship it"), so a stranger who edited by hand can run it alone. No router: three names in loop order, each ending by naming the next, is C9's invocation rule | Five skills, one per step (the #10 body's default): splits a mechanism seam with no handoff worth a file, adds a skill for refine that has no job, and gives Devon six names to remember in two harnesses. Four skills with grill separate (this review's first draft): grill has no context of its own worth isolating, and a separate skill needs a router. One skill with internal steps (the `impeccable` shape): loses the connect→write boundary | Transcript Findings §1 (seam table); finding 5 (voice — the README was in *connect's* context); findings 8, 12 (refine cadence); #16 C9; `SKILL-MECHANICS.md` |
| D2 | Handoff format and home | One markdown file per hand-off with YAML frontmatter, in the wiki's `dumps/`: `<date>-<target>.md` (dump), `.connect.md`, `.answers.md`, `.ship.md`. Frontmatter carries the machine part (urlPaths, file sets, baseline), the body the reasoning; raw CLI payloads, when kept, are fenced under a heading in the body, never sibling `.json`. Committed with the PR; transcripts and briefs are not the loop's files and stop landing in `dumps/` | `.connect.json` (run 1): unreadable by the person who accepts the candidates, and forbidden by the `ROLES.md` pattern #10 cites. A commune-owned location outside the harness repo: the provenance belongs beside the notes it produced, and devon-wiki already ships `dumps/` on `main` — as a catch-all that this decision narrows | `ROLES.md` "Artifact Contract"; finding 9; `git ls-files dumps` on devon-wiki; open question 1 |
| D3 | How skills find the CLI | The one installed in the wiki, called by path: `node_modules/.bin/commune` from the wiki root. Every skill's first step runs `--version`; below the D6 release (`0.4.0`) it stops with the one-line fix `pnpm add @dmthepm/commune@latest`; every `--json` payload is checked for `schema: 1`. Skills never install anything | `npx -y @dmthepm/commune`: fetches latest per run, so the skill's CLI and the site's engine drift, and it re-adds the install friction #7 and #33 removed. Bare `npx commune`: resolves to the wrong npm package when the local install is missing | README "one resolver"; `npm view commune` in the #7 plan; devon-wiki `package.json` (`^0.1.0` range, 0.3.0 installed); #33 stranger test; `render.ts` `SCHEMA` |
| D4 | Voice | `WRITING.md` at the wiki root, harness-owned, in a fixed shape (§3): rules that change a sentence, frontmatter blocks per collection with key order, the avoid list, the title rule, and a dated "Verdicts" section. `commune-setup` writes it once, migrating any existing rules doc (devon-wiki: `docs/NOTE-WRITING-BIBLE.md` becomes it and is deleted) and asking only the residue. `commune-write` loads it first and nothing else about voice. Verdicts are appended only when Devon says a correction is a rule (open question 5). The engine ships the template under `skills/commune-setup/assets/WRITING.md` | Reading five live notes to infer the register (run 1): worked, unrepeatable, unauditable. A voice corpus (paperboy Layer 1): corpus is reference the agent reads and forgets; rules are followed. Auto-appending every refine correction: a one-off taste call becomes a permanent rule nobody chose | Finding 6; #6's test; #16 (ETH); `NOTE-WRITING-BIBLE.md` exists and is stale (2025-10-16); #2 "record the why as a durable voice rule" |
| D5 | Review surface | Two surfaces for two questions. **Shape:** `commune-write` writes `dumps/<dump>.review.html` — original (from `git show <base>:<path>`) and draft, both through `commune render`, side by side, the round's questions and the connect candidates in a margin — and prints the path. **Verdicts:** `commune-ship` opens the PR; its preview URL is where Devon reads the page in the site's chrome; each refine turn is one sentence, applied by `commune-write` with `round: N`, one commit | `astro preview` on localhost as the only surface: a full build per turn and no original beside the draft; Devon's turns came from a URL he could open anywhere. The Cloudflare preview alone: found the bugs, could not show shape, needs a push per turn. The original as a fenced block in the chat message (the reviewer's fallback if #60 slips): a diff again, which Devon rated useful for shape and no more. A `commune review` verb: the side-by-side is a 40-line script over `render`, not graph logic | #19 comment 2; #2 review-surface note; answers file ("seeing a side-by-side diff is gonna be useful") |
| D6 | CLI prerequisites | Step 0, one engine release (`0.4.0`; `v0.3.0` is already cut): (a) `graph related`: normalise whitespace and case across word boundaries before matching, so "Noon Tide" hits `Noontide` — **new ticket**; (b) `graph query --unreferenced` — zero inbound, any outbound, `updates` excluded unless asked — **new ticket**; (c) `commune render <path\|->` — **#60**, unchanged scope. Not needed: frontmatter-aware stdin (exists), `unmatched[]` (skill step, M3), #61, `--date` on `update`, direction-awareness in `related` | Doing (b) as skill prose over `graph query --json`: the five-line filter run 1 wrote by hand is precisely rule 4's "graph logic in prose", and two harnesses would write it differently. Doing (a) in prose: means re-reading 85 titles per dump. Semantic matching: deferred twice by the map | Live probes; `related.ts:71-75`, `:132-140`; `usage.ts`; #62's reasoning for pulling `update` into the CLI |
| D7 | Grill | Inside `commune-write`, self-contained: round/frontier mechanics in under 30 lines; three rules — (1) a question exists only if Devon's answer changes a file; everything else is a one-line fact under "Settled"; (2) when the answer is taste, the question is two rendered sentences side by side (via `render`), never a description of them; (3) graph consequences are read from `.connect.md` and stated ("dropping `[[Noontide]]` leaves it with 0 inbound"), and become a question only when the consequence is Devon's to accept. Each question leads with the recommended answer. Writes the round into `.answers.md`, stops | Depending on `~/.claude/skills/grilling`: a stranger does not have it; a skill cannot reach a user-invoked skill anyway; its reading produced the round Devon rejected. A fork of `grilling`: 20 lines of structure are not worth a dependency | Answers file "Feedback on the grill itself"; transcript Findings §4 as amended; `SKILL-MECHANICS.md` |
| D8 | Ship | `commune-ship`: reads `.connect.md` (file set, baseline) and `.answers.md`; `check --json` diffed against the baseline (new findings block; pre-existing ones do not); `update --recent <dump date>` → `--write`, or if today's entry exists, edits it (never a second scaffold); **fills `summary`** from the dump; `astro build && node_modules/.bin/commune gate`; greps `dist/` for the href of every entry the file set created or renamed, using the `urlPath` from `graph query`; commits the file set with a conventional message; pushes; opens the PR with the preview URL and the side-by-side path in the body; writes `.ship.md`. Never merges | Ship as draft's last step: a stranger who edited by hand still needs ship, and the human stop between them is real. Skipping the build: `gate` reads `backlinks.json`, which only the build writes, and the href is only in `dist/` | Finding 10 (green `check`, dead href); finding 7; `gate.ts`; `update.ts:77-87`; #62; #2 merge doctrine |
| D9 | Invocation and frontmatter | Loop skills are model-invoked (chained: each ends by naming the next skill and its file); descriptions are triggers, key use case first, ≤ 1,024 chars. `commune-setup` is user-invoked (`disable-model-invocation: true`; Codex mirror via `agents/openai.yaml` `policy.allow_implicit_invocation: false`). Frontmatter beyond `name`/`description`/`metadata`: only that one field. `SKILL.md` ≤ 100 lines; branch-specific material in `references/` | `paths:` gating on `src/content/**`: Claude-only, fires on edits the loop did not start. `context: fork`: Claude-only, runs in the background by default, and the grill has to talk to Devon; files give the same isolation | Claude Code docs; Codex docs; `SKILL-MECHANICS.md`; #16 C3, C4, C8 |
| D10 | Run 2 | One new research page plus its `updates` entry, on devon-wiki. Dump = the research Devon already ran, pasted, with one sentence of intent. Exercises intake of a long artifact → new file with the `research` schema (`summaryNote`, `wordCount`, `context` required) → `update --write`, the roll-up model Devon stated in round 2; research is public by default so the visibility rule is not in play; the grill is ≤ 3 questions because the content is written and the frontmatter is fixed | The Cloudflare architecture note (run-1 Q6): a good run 3; its grill would be about placement. Another home-note edit: re-runs run 1's taste fight and exercises nothing new | Answers file round 2; #19 comment 2; `graph.ts:272`; `src/content.config.ts` research schema |

### 3. Design

**Repository layout (engine repo, installed by `npx skills add dmthepm/commune-wiki`):**

```
skills/
  commune-setup/           run once per wiki, user-invoked (#20 owns the scaffold; WRITING.md is specified here)
    SKILL.md
    assets/WRITING.md      the template
    agents/openai.yaml     allow_implicit_invocation: false
  commune-dump/            intake + connect, model-invoked
    SKILL.md
    references/monologue.md
  commune-write/           grill + draft + refine, model-invoked
    SKILL.md
    scripts/review.mjs     side-by-side page over `commune render`
    references/refine.md
  commune-ship/            model-invoked
    SKILL.md
tests/skills.test.mjs      name = dir, description ≤ 1024, SKILL.md ≤ 100 lines, refs resolve, verbs exist
docs/adr/                  the distribution ADR #20 asks for (skills from GitHub, package from npm, pairing by schema)
```

**Frontmatter, exactly:**

```yaml
# skills/commune-dump/SKILL.md
---
name: commune-dump
description: Turn a dictated or pasted dump into a dated dump file and a connect file for a Commune wiki. Use when the user dictates or pastes a note idea, says "dump", names a note to redo or a page to add, or hands over a transcript to turn into wiki content. Requires the wiki's installed commune CLI.
metadata:
  version: "0.1.0"
  commune-schema: "1"
---
```

```yaml
# skills/commune-write/SKILL.md
---
name: commune-write
description: Grill, draft and refine one Commune note from a dump. Use when a dumps/*.connect.md exists with no answered round (ask the round), when an answers file has a new answered round (draft or refine), or when the user gives a one-sentence correction on a drafted note.
metadata:
  version: "0.1.0"
  commune-schema: "1"
---
```

```yaml
# skills/commune-ship/SKILL.md
---
name: commune-ship
description: Verify and ship the file set one dump produced in a Commune wiki: check against the baseline, file the updates entry, build, gate, confirm hrefs, commit, open the PR. Use when the user says ship, or when a reviewed draft is ready to go out.
metadata:
  version: "0.1.0"
  commune-schema: "1"
---
```

```yaml
# skills/commune-setup/SKILL.md
---
name: commune-setup
description: One-time setup of a Commune wiki for the authoring loop. Writes WRITING.md by interview.
disable-model-invocation: true
metadata:
  version: "0.1.0"
---
```

**The CLI preflight, common to every loop skill (first step of each `SKILL.md`):**

```sh
node_modules/.bin/commune --version   # must print >= 0.4.0; otherwise stop:
                                      # "Install or update the engine: pnpm add @dmthepm/commune@latest"
```

Every `--json` call is read with `schema === 1` asserted; a different schema stops the skill with the version it found. The skill runs from the wiki root and passes no `--root`.

**Handoff files** (all in the wiki's `dumps/`, all markdown with YAML frontmatter):

`dumps/<yyyy-mm-dd>-<target-slug>.md` — written by `commune-dump`, the dump verbatim, as plain paragraphs (never fenced — `stripCode` would hide it from `related`):

```yaml
---
kind: dump
captured: 2026-09-05
source: dictated | pasted | monologue:<note_id>
target: src/content/notes/<slug>.md | new:<collection>   # required; the one question intake may ask
publish: true                                            # false = keep private; no graph verification possible
---
<verbatim text, unedited>
```

`dumps/<dump>.connect.md` — written by `commune-dump` after the CLI calls:

```yaml
---
kind: connect
dump: dumps/2026-09-05-<slug>.md
cli: "@dmthepm/commune 0.4.0"
baseline:                      # check --json summary before any edit
  entries: 85
  edges: 396
  errors: 1
  warnings: 0
duplicate_name: []             # check findings whose candidates include the target; non-empty = stopped
target: { file: src/content/notes/<slug>.md, urlPath: /notes/<slug>/, inbound: 6, outbound: 11 }
at_risk:                       # target's resolved outbound links; each one the draft may drop
  - { urlPath: /notes/noontide/, inbound: 2, orphans_if_dropped: false }
mentions:                      # related.mentions, each tagged by the skill with sentence and tense
  - { urlPath: /notes/main-branch/, sentence: "I don't really want to highlight…", tense: negative }
unmatched:                     # subjects the skill listed that related - did not match: notes that do not exist
  - { phrase: "Cloudflare", sentence: "…building the app in Cloudflare…", tense: present }
unreferenced:                  # graph query --unreferenced; offered, never a goal
  - { urlPath: /notes/…/, title: "…" }
files:                         # the file set ship will commit; grows through write
  - src/content/notes/<slug>.md
status: ready | blocked
---
## What I ran
## Candidates
## Handoff
```

`dumps/<dump>.answers.md` — written by `commune-write` (rounds) and appended by Devon's answers; the newest answered round is what the draft executes:

```yaml
---
kind: answers
dump: dumps/2026-09-05-<slug>.md
rounds: 1
base: original            # original | previous | current — what the next draft diffs against
---
## Settled (facts, no decision)
## Round 1 — questions
❓ Q1 … ➡️ recommended …
## Round 1 — answers (verbatim)
## Round 1 — decisions extracted
```

`dumps/<dump>.ship.md` — written by `commune-ship`: the `check` diff against the baseline, the hrefs grepped in `dist/`, the `updates` entry path and its `summary`, the commit, the PR URL and preview URL.

**`WRITING.md` (wiki root, harness-owned), the fixed shape the template ships:**

```markdown
# Writing rules
## Sentences        rules that change a sentence: length, person, fragments, what to cut
## Titles           the title rule (devon-wiki: a title is a takeaway, not a label)
## Notes            length band; one idea; proper nouns get their own note; where external links go
## Frontmatter      one block per collection, keys in order, which are required, example values,
                    and `visibility: public` on anything meant to publish
## Avoid            words and shapes that are never written
## Verdicts         dated one-liners, appended only when Devon says a correction is a rule
```

Passes #6's test line by line: loaded by `commune-write` step 1 and nowhere else; each section decides one thing the skill writes. It contains no history, no positioning, no description of the project — the ETH finding is the reason. `commune-setup` migrates an existing rules document into this shape when one exists and interviews only for empty sections, recommended answer first.

**`commune-dump`, the steps:** (1) preflight; (2) if the input is a Monologue note id, `references/monologue.md` (optional adapter; a plain paste is the default); write the dump file verbatim, asking for `target:` only if the text does not name one; (3) `check --json` → baseline, and stop with `status: blocked` if a `duplicate-name` finding names the target; (4) `graph related - < dump`; when the target exists, `graph related <target>`; list the dump's subjects (judgement) and run `related -` on that list to find which have no note; `graph query --unreferenced`; (5) write `.connect.md`, every candidate tagged with the sentence and tense that produced it; (6) Handoff: *"Run `commune-write`."* Rule, in the file: *mentions, unmatched and unreferenced entries are candidates for the human; the draft is never scored on them.*

**`commune-write`, the steps:** (1) preflight; read `WRITING.md`, the dump, `.connect.md`, `.answers.md` if present; (2) **grill** — if no answered round exists: resolve every fact from the filesystem and the CLI into "Settled"; ask only the frontier of decisions whose answer changes a file, recommended answer first, taste questions as two rendered sentences, graph consequences stated from the connect file; write the round; stop. Completion criterion: *every question, if answered the other way, changes a line in the file set.* (3) **draft** — with an answered round: extract decisions into "decisions extracted"; write into the real file at `target` (or the new file, slug-named, frontmatter from `WRITING.md`'s block for the collection, `visibility: public` when `publish: true`); apply each decision as a delta to the base named in `base:`; add new files to `files:` in `.connect.md`; (4) `check --json`, diff against the baseline — a new finding is fixed before anything is shown; (5) `scripts/review.mjs` → `dumps/<dump>.review.html`; print the path and a "what changed" edge table; (6) Handoff: *"Answer in `.answers.md`, give a one-sentence correction, or say ship."* **Refine** (`references/refine.md`): the same skill on a correction — extract the decision, bump `rounds`, keep `base` unless he changed it, one commit per turn; if Devon says the correction is a rule, append it to `WRITING.md` Verdicts.

**`commune-ship`:** per D8. The `summary:` sentence for the `updates` entry is written by the agent from the dump and shown in the PR body; `aiGenerated` per open question 4. Merge is not this skill's — open question 2.

**`scripts/review.mjs`** (in `commune-write`, ~40 lines): takes `<base-ref> <path>`; `git show <base-ref>:<path>` and the working file each through `node_modules/.bin/commune render - --json`; writes one HTML file with two columns, the site's stylesheet linked from `node_modules/@dmthepm/commune/src/styles/design-system.css`, and a margin listing the round's questions and the connect candidates. No network, no framework. Until #60 lands, the script does not exist and step 5 is skipped — which is why #60 is step 0.

### 4. Sequencing

Commits in `type(#10): subject` form (engine) or `type(#<ticket>)` for the CLI prerequisites; each step has a check that fails before and passes after.

0. **CLI prerequisites, engine, one release.** Two new tickets plus #60: (a) `related` normalisation, (b) `--unreferenced`, (c) `render`. Release `0.4.0` via release-please. *Verify:* fixture tests for each; on devon-wiki, read-only: the probe sentence returns `Noontide` in `mentions`; `graph query --unreferenced --json` returns 0 today and 4 with `--collection updates`; `echo '[[Cake]]' | commune render --root devon-wiki` prints `href="/notes/cake/"`; `npm view @dmthepm/commune version` → `0.4.0`; devon-wiki's range bumped to `^0.4.0` in its own PR.
1. **The tree and its test.** `skills/` with the four folders, frontmatter per D9, `tests/skills.test.mjs` in `pnpm test` and CI, `agents/openai.yaml` for `commune-setup`, the distribution ADR. *Verify:* `npx skills add <path-to-this-checkout> --skill '*' -a claude-code -a codex -y` into a temp home installs four folders including `scripts/` and `assets/`; `/commune-dump` appears in Claude Code's listing with its description intact; `$commune-dump` resolves in Codex if it is on the machine, otherwise recorded as untested; the test fails on a deliberately 101-line `SKILL.md` and on a description over 1,024 chars.
2. **`commune-setup` writes `WRITING.md` for devon-wiki.** Migrates `NOTE-WRITING-BIBLE.md`; interviews only the residue; PR on devon-wiki that adds `WRITING.md` and deletes the bible. *Verify:* every section of the shape is non-empty; each frontmatter block matches `src/content.config.ts`'s schema for that collection (a note written from the block passes `commune check`); Devon's answers took one message.
3. **Run 2 on devon-wiki** (D10): a lane runs `commune-dump` → `commune-write` (stop for Devon) → `commune-write` → `commune-ship` on a worktree. *Verify:* the grill round is ≤ 3 questions, each of which changes a line when answered the other way (Devon's test); the PR body carries the preview URL and the side-by-side path; the `updates` entry exists with a non-empty `summary`; the `check` diff vs baseline is empty; every new href greps in `dist/`; the four handoff files exist; **a fresh context window given only the handoff files runs `commune-write` to the same draft** — run that once as the test; `commune-dump` fired on the pasted dump without being named (the 56% test) — if it did not, its description is rewritten before step 4.
4. **Receipts and unblocking.** On #10: the four skills with one line each, the run-2 receipt, the CLI version. On #20: unblocked; README's "Where this is going" loses the paragraph that says the loop is not here, and the install section gains the skills command. On #19: run 2 recorded. On #2: D1–D10 in one line each; "Commune / Review surface" moves from "Not yet specified" to D5.

### 5. Risks and rollback

1. **The skill never fires** (Vercel's 56%). Every loop skill's description leads with the file or the phrase that should trigger it; run 2 measures it (step 3). Rollback: none needed; a skill that does not fire costs its description line and Devon types its name.
2. **Version drift between the skill and the installed CLI.** The preflight is the guard; the failure mode is a clear one-line stop, not a wrong answer. `metadata.commune-schema` states the pairing.
3. **`unmatched` is noisy** (the agent lists too many subjects). It is offered with the sentence that produced it, never acted on; the `tense` tag and the rule in the file keep it a candidate list.
4. **A private draft is invisible to the graph.** B3's rule is in `commune-write` and in `WRITING.md`'s frontmatter block; run 2 uses `research`, which is public by default, so the first exercise of the rule is run 3. Recorded so it is not mistaken for proven.
5. **`dumps/` is public** on a public wiki and already holds non-loop files. Open question 1 decides the policy; the template `.gitignore` in `commune-setup` offers `dumps/` as opt-out.
6. **Codex parity is untested on this machine** if Codex is not installed. Recorded in step 1's receipt; the layout is the documented Codex root, so the residual risk is one YAML file.
7. **Hardest to undo:** the handoff file names and frontmatter keys once run 2 has written them and skills read them. Decided here, in §3, before any skill is authored — the same reason #18's JSON envelope was decided first.
8. **`astro build` in ship on a large wiki.** Under a minute on devon-wiki; if it grows, ship can gate against the PR's preview build instead. Not this map's problem.

### 6. Open questions for a human

See after the delta.

---

## Delta summary

- **Five skills became three loop skills plus setup**, from the run-1 seam table and the voice argument read precisely: connect's context is the one that harms writing, so the boundary is connect→write; grill and draft share a window and a file. No router. (M1, D1)
- **Handoffs are markdown with frontmatter, not JSON**, per the `ROLES.md` pattern the ticket cites, so Devon can read the candidates he is asked to accept. (B4, D2)
- **The CLI is found by path in the wiki, never downloaded**, with a version and schema preflight, because `npx -y` drifts and bare `npx commune` resolves to a stranger's package — and devon-wiki's range and install already disagree. (B2, D3)
- **Visibility is a rule the loop needs and neither text had**: a private draft is invisible to every verb. (B3)
- **CLI prerequisites went from four to three, with one corrected**: frontmatter-aware stdin already exists, `unmatched` is judgement and lives in the skill, `--unreferenced` must exclude `updates`. Release `0.4.0`, since `v0.3.0` was cut during this review. (B1, M2, M3, D6)
- **The review surface is two surfaces**: a local side-by-side page for shape, the PR preview URL for verdicts, refine turns are PR turns. (M4, D5)
- **`WRITING.md` has a fixed shape that passes #6's test**, `commune-setup` migrates the existing bible into it, and verdicts are appended on Devon's word. (M5, D4)
- **Grill is self-contained and rewritten around Devon's test** — a question exists only if the answer changes the file. (M6, D7)
- **Ship is specified**: baseline diff, `update --write` or edit, the agent's summary, build + gate, href grep in `dist/`, PR, no merge. (M7, D8)
- **Run 2 is a research page plus its update entry**, chosen so the grill is short and visibility is not in play. (D10)

## Open questions for you

1. **`dumps/` policy: which loop files are committed?** Recommended: dump, connect, answers and ship files are committed (they are the provenance of the notes beside them); transcripts, lane briefs and `harden/` sweeps stop landing there. The run-1 files are already on `main`, so this narrows a habit rather than starting one. If you would rather dictation stay private, `commune-setup` writes `dumps/` into `.gitignore` and the handoffs live only on the branch. Your answer changes one template line and what a stranger's wiki keeps.
2. **Does a content PR merge on your word, or on the verifier's?** The map's doctrine merges on verification and asks you only for what you own; run 1 merged the home note on your word after three preview turns. Recommended: voice is yours — `commune-ship` opens the PR and stops; you say "ship" or leave a refine sentence; the prod verifier runs after the merge as it does now. Your answer decides whether `commune-ship` is ever allowed to merge.
3. **Run 2's research.** Which deep research you already have becomes the first research page? The plan needs the document, not the topic; the pasted document plus one sentence of intent is the whole dump.
4. **`aiGenerated` on an `updates` entry the agent writes from your dictated summary.** It is a public label on the site. Recommended: `false` when the summary sentence is yours (dictated or edited by you), `true` when the agent wrote it and you only approved. Your answer is one line in `commune-ship`.
5. **Do refine corrections become `WRITING.md` rules automatically, or only when you say so?** Recommended: only when you say "make that a rule" — a one-off taste call ("no architecture on the home note") is not a rule, and auto-appending turns every correction into doctrine nobody chose. Your answer is one branch in `references/refine.md`.

---

**Falsifiable success sentence for #10:** *"`npx skills add dmthepm/commune-wiki` installs four skills; on devon-wiki with `@dmthepm/commune@^0.4.0` installed, a dump for a new research page goes through `commune-dump`, `commune-write` (one round, ≤ 3 questions, each of which would change a line if answered differently) and `commune-ship` with four handoff files in `dumps/`, a `dumps/*.review.html` side-by-side, a PR whose preview URL Devon reviews, an `updates` entry with a written `summary`, `check` unchanged against the baseline, and every new href present in `dist/`; a fresh context window given only the handoff files re-runs `commune-write` to the same draft; `tests/skills.test.mjs` passes in CI; and `graph related -` on a dump that says 'Noon Tide' returns `Noontide` in `mentions`."*

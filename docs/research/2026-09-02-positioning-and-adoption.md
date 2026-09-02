# Research: compound engineering, and what makes agent-native tools spread

- **Context:** [dmthepm/commune-wiki#16](https://github.com/dmthepm/commune-wiki/issues/16) (parent map: [#2](https://github.com/dmthepm/commune-wiki/issues/2))
- **Date:** 2026-09-02
- **Question:** What does compound engineering actually claim, what earned adoption for the reference set (`npx skills`, Matt Pocock's skills, Greptile CLI, morning-paper), what is commune's one-line claim, and what must commune get right at launch?
- **Method:** primary sources — the Every essays and guide themselves, the GitHub and npm REST APIs (star/licence/date facts fetched 2026-09-02), the specs, and the skills actually installed on this machine under `~/.agents/skills/`. Where a claim is inference rather than something a source states, it is marked.
- **Deliverable:** constraints, not a marketing plan. Every numbered constraint below is meant to be actionable against a ticket.

---

## TL;DR

1. **Compound engineering's real mechanism is a filing convention, not an AI capability.** The transferable part is the fourth step — *compound* — where a session's residue is written back into durable files. Commune is already this shape; it should say so, and it should name the lineage explicitly rather than reinvent the vocabulary.
2. **Positioning pick: "Own your canon. Anti-capture."** Reasoning and two alternates in §3.
3. **The single highest-leverage launch constraint is `npx skills add dmthepm/commune-wiki` working on a cold machine**, followed by a `commune demo` that produces a real artifact offline. Everything else is downstream.
4. **The licence should be MIT, not AGPL-3.0.** Every adopted reference in this space is MIT, including Devon's own two best-performing repos. This is flagged as a decision, not made unilaterally.
5. **The current README is the biggest liability in the repo.** 423 lines, sixteen emoji-prefixed headings, a vendor-authored comparison table, and a `git clone` install. It reads as exactly the thing developers dismiss.

---

## 1. Compound engineering

### 1.1 What it claims

The term is Kieran Klaassen's, coined at Every in the essay **"My AI Had Already Fixed the Code Before I Saw It"** (Every, *Source Code*, 2025-08-18):

> I call this **compounding engineering**: building self-improving development systems where each iteration makes the next one faster, safer, and better.

— <https://every.to/source-code/my-ai-had-already-fixed-the-code-before-i-saw-it>

The claim is positional against ordinary AI-assisted work, and the essay states the contrast directly:

> Typical AI engineering is about short-term gains. You prompt, it codes, you ship. Then you start over. Compounding engineering is about building systems with memory, where every pull request teaches the system, every bug becomes a permanent lesson, and every code review updates the defaults. AI engineering makes you faster today. Compounding engineering makes you faster tomorrow, and each day after.

The definitive statement is the co-authored **"Compound Engineering: How Every Codes With Agents"** by Dan Shipper and Kieran Klaassen (Every, *Chain of Thought*, 2025-12-11):

> In traditional engineering, you expect each feature to make the next feature harder to build—more code means more edge cases, more interdependencies, and more issues that are hard to anticipate. By contrast, in compound engineering, you expect each feature to make the next feature *easier* to build. This is because compound engineering creates a learning loop for your agents and members of your team, so that each bug, failed test, or *a-ha* problem-solving insight gets documented and used by future agents.

— <https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents>
(That URL now serves Every's evergreen guide content; the December 2025 essay body is preserved at the [Wayback snapshot of 2025-12-16](https://web.archive.org/web/20251216042234/https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents), which is where these quotes are from.)

The headline productivity claim, hedged in the original and usually repeated without the hedges:

> Today, if your AI is used right, a single developer can do the work of five developers a few years ago, based on our experience at Every.

The living guide (<https://every.to/guides/compound-engineering>, byline "Kieran Klaassen and Claude", last modified 2026-08-31) compresses it to one sentence:

> The core philosophy of compound engineering is that each unit of engineering work should make subsequent units easier—not harder.

### 1.2 The workflow in practice

Four steps, as stated in December 2025: **Plan → Work → Review → Compound → Repeat.**

> Plan: Agents read issues, research approaches, and synthesize information into detailed implementation plans. Work: Agents write code and create tests according to those plans. Review: The engineer reviews the output itself and the lessons learned from the output. Compound: The engineer feeds the results back into the system, where they make the next loop better by helping the whole system learn from successes and failures. This is where the magic happens.

> Roughly 80 percent of compound engineering is in the plan and review parts, while 20 percent is in the work and compound.

The guide is blunt that step four is the whole thing:

> It's the fourth step that separates compound engineering from other engineering. This is where the gains accumulate. Skip it, and you've done traditional engineering with AI assistance.

Klaassen expanded the loop to eight steps in **"Compound Engineering Gets an Upgrade"** (2026-05-29, <https://every.to/p/compound-engineering-gets-an-upgrade>):

> So I expanded the loop: **Ideate → brainstorm → plan → work → review → polish → compound → repeat**. Ideate and brainstorm are the new front of the process. Polish is the new end. Compound is still the most important step, because the whole point is that every feature should make the next feature easier.

And on where the human went:

> the work phase has become boring—in the best way. If the plan is good and the agent has the right context, it usually does the work right. […] The question now is: "Where do I fit in?"

**The artifacts.** This is the load-bearing detail, and the guide publishes the tree verbatim:

```
your-project/
├── CLAUDE.md              # Agent instructions, preferences, and patterns
├── docs/
│   ├── brainstorms/       # /workflows:brainstorm output
│   ├── solutions/         # /workflows:compound output (categorized)
│   └── plans/             # /workflows:plan output
└── todos/                 # /triage and review findings
    ├── 001-ready-p1-fix-auth.md
    └── 002-pending-p2-add-tests.md
```

> **docs/solutions/** builds your institutional knowledge because each solved problem becomes searchable documentation. Future sessions will find past solutions automatically.

The compound step itself is four actions: *capture the solution*, *make it findable* ("Add YAML frontmatter to make sure it is tagged with the right metadata, tags, and categories for retrieval"), *update the system*, and *verify the learning* ("Would the system catch this automatically next time?").

Two further stated beliefs matter for commune:

> Plans are the new code. The plan document is now the most important thing you produce.

> Make your environment agent-native. If a developer can see or do something, the agent should be allowed to see or do it too.

The guide also revises the 80/20 split upward at the org level: *"you should allocate 50 percent of engineering time to building features, and 50 percent to improving the system."*

### 1.3 The honest read

The most credible independent assessment is Will Larson's (**"Learning from Every's Compound Engineering"**, 2026-01-19, <https://lethain.com/everyinc-compound-engineering/>). He is positive on the mechanism and deflationary about its durability:

> an extremely effective way to convert these intuited best-practices into something specific, concrete, and largely automatic

> If recent history is our guide, it's a solid guess that many of the practices in compound engineering will get absorbed into the Claude Code and Cursor harnesses over the next couple of months, at which point using these techniques explicitly will be indistinguishable from folks who are entirely unaware they're using them.

The sharpest critique found (MoClaw, **"What Compound Engineering Actually Compounds"**, 2026-08-07, <https://moclaw.ai/blog/compound-engineering>) makes three points that apply directly to commune:

> It compounds per repository, not per person. The artifacts live in `docs/`. Move to a different repo and you start from zero.

> The 80/20 split is a recommendation, not a measurement.

> The question is not whether the loop works. It is whether your engineers will read `docs/solutions/` in three months. That is a culture question.

Klaassen has undercut his own system in public, which is worth knowing before leaning on the brand:

> Opus 5 is out now! And it broke Compound Engineering, but I also like it. […] Just remember to let go of you skills and big mega prompts.
> — <https://x.com/kieranklaassen/status/2080712817926443486>

One more observation, my inference rather than a claim any source makes: despite ~24.8k stars on the plugin, compound engineering has **almost no adversarial Hacker News thread**. The canonical December 2025 essay scored 1 point and 0 comments (HN id 46237139); the guide got 2 points and 0 comments, twice. The discourse is nearly all Every-originated plus friendly derivative posts. Treat the idea as a well-marketed convention with a real mechanism inside it, not as a stress-tested consensus.

### 1.4 What transfers to a personal wiki, and what does not

**Transfers cleanly:**

- **The compound step is commune's entire product.** Every's `docs/solutions/` — a solved problem, captured, frontmattered for retrieval, linked into a durable context file — is structurally identical to an evergreen note in a queryable graph. Commune's `dump → connect → grill → draft → refine → ship` is the same loop with the codebase swapped for a corpus. Commune should say this plainly; it is the strongest available credibility claim and it is true.
- **"Make it findable" as a hard requirement, not a nicety.** Every's own guidance is that capture without retrieval metadata is wasted. This is the argument for the graph being queryable outside a build ([#18](https://github.com/dmthepm/commune-wiki/issues/18)) — a note that cannot be found by the next session did not compound.
- **Plans are the artifact.** Commune's equivalent: the note, not the transcript. The dictation is disposable; the atomic note is the thing that must survive.
- **Agent-native environment.** "If a developer can see or do something, the agent should be allowed to see or do it too" is the argument for the JSON-first CLI. Obsidian is a human surface; the CLI is the agent's equivalent, and they must see the same corpus.
- **The 50/50 rule, adapted.** Half the time writing notes, half the time improving the note-writing system (the bible, the voice files, the skills). Commune already has `docs/NOTE-WRITING-BIBLE.md` as this artifact.

**Does not transfer:**

- **The compounding claim itself is weaker for a wiki.** In a codebase, "each feature makes the next easier" is measurable in shipped features. For a personal wiki there is no equivalent output metric, so the same rhetoric would be unfalsifiable. Do not borrow the "one person does the work of five" register. Commune's honest claim is *maintenance*, not *acceleration*.
- **The per-repository critique lands harder here.** MoClaw's "move to a different repo and you start from zero" is a real weakness for CE; for commune it is a feature — there is exactly one corpus, and it is the user's. Say that. It is a genuine advantage over the thing being referenced.
- **The parallel-review-agent apparatus does not port.** CE's fourteen named review agents and fifty-agent `/lfg` chain are a codebase-scale answer. A personal note does not need `security-sentinel`. Commune's `grill` is one adversary, not a swarm; scale here would be theatre.
- **Larson's absorption warning applies double.** If the harnesses absorb memory and retrieval, the differentiated part of commune must be the corpus and the graph, not the prompt scaffolding. Build the graph; treat the skills as replaceable.

### 1.5 The lineage is already in the stack

`monologue-notes` from `EveryInc/monologue-toolkit` is installed on this machine (`~/.agents/.skill-lock.json` records `source: EveryInc/monologue-toolkit`, `skillPath: skills/monologue-notes/SKILL.md`). Monologue is Every's dictation product; the toolkit is the read API around it. Commune sits directly downstream: Monologue captures the voice, commune is what happens to it afterwards.

Two facts about that repo are worth carrying:

- **It is the design precedent for cross-harness skills.** SKILL.md line 15, verbatim: *"This skill is intentionally shell-first so it works across agents that can run terminal commands, including Codex and Claude Code."* The skill wraps a CLI rather than exposing an MCP server. This is the single most important architectural lesson in this brief — see C2.
- **It is not a distribution precedent.** 62 stars, no repo description, no topics, and **no LICENSE file** (GitHub's licence field is `null`; `LICENSE` and `LICENSE.md` both 404). Source-available, not licensed for reuse. Every's own flagship, `EveryInc/compound-engineering-plugin`, is MIT with 24,763 stars. The difference between 62 and 24,763 in the same org is not quality; it is packaging.

`EveryInc/compound-engineering-plugin` also demonstrates the multi-harness layout at scale: one directory per host — `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `.devin-plugin/`, `.grok-plugin/`, `.opencode/`, `.cline/`, `.agents/` — plus `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and governance files (`LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `PRIVACY.md`, `CHANGELOG.md`). Its `CONCEPTS.md` is a repo glossary that self-describes as *"Shared domain vocabulary for this project… Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings"* — the same artifact `domain-modeling` produces, and a good model for commune's `CONTEXT.md` ([#6](https://github.com/dmthepm/commune-wiki/issues/6)).

---

## 2. The reference set: what each did to earn adoption

All star counts and licences fetched from the GitHub REST API on 2026-09-02.

| Project | Stars | Licence | The move that earned it |
|---|---:|---|---|
| `mattpocock/skills` | 244,188 | MIT | Provenance + named enemies + failure-mode README |
| `vercel-labs/skills` | 30,210 | MIT | Became the transport everyone else needs |
| `EveryInc/compound-engineering-plugin` | 24,763 | MIT | One directory per harness; a named methodology |
| `EveryInc/monologue-toolkit` | 62 | **none** | (counter-example: good design, no packaging) |
| `noontide-co/mainbranch` | 37 | MIT | — |
| `dmthepm/morning-paper` | 5 | MIT | (counter-example: see §2.4) |
| `dmthepm/commune-wiki` | 1 | AGPL-3.0 | — |

### 2.1 `vercel-labs/skills` — it became the rails

Created 2026-01-14; 30,210 stars in under eight months. Repo description: *"The open agent skills tool - npx skills"*. The README's entire first screenful is four things — name, one sentence, the harness list, the install command:

> # skills
> The CLI for the open agent skills ecosystem.
> Supports **OpenCode**, **Claude Code**, **Codex**, **Cursor**, and [73 more](#supported-agents).
> ```bash
> npx skills add vercel-labs/agent-skills
> ```

— <https://github.com/vercel-labs/skills>

What it actually did to earn adoption was **solve someone else's distribution problem**. Before it, publishing a skill meant publishing N times, once per harness. `npx skills` made the unit of distribution a *git repo* rather than a package: `npx skills add owner/repo` works against GitHub shorthand, a full URL, GitLab, any git URL, or a direct `SKILL.md` download. It installs to `.agents/skills/` and symlinks into each harness's directory, with `-g` for global and `--copy` to opt out of symlinks. Verified on this machine: `~/.agents/.skill-lock.json` is `"version": 3`, records `skillFolderHash` per skill for update detection, and `~/.claude/skills/`, `~/.codex/skills/` and `~/.cursor/skills/` are all populated.

**The lesson for commune is not "copy this." It is "ride it."** Commune does not need to solve cross-harness installation; that problem is solved, it is MIT, and Devon already has it installed. The map's decision to distribute via `npx skills add dmthepm/commune-wiki` is correct and this brief adds no caveat to it — only the requirement that the repo ship `skills/<name>/SKILL.md` at root so the resolver finds it.

### 2.2 `mattpocock/skills` — provenance is the whole pitch

244,188 stars, MIT. The repo description is the argument in eight words: *"Skills for Real Engineers. Straight from my .agents directory."*

Three mechanisms, all copyable:

**It names its rivals and says why they fail.**

> Developing real applications is hard. Approaches like GSD, BMAD, and Spec-Kit try to help by owning the process. But while doing so, they take away your control and make bugs in the process hard to resolve.
>
> These skills are designed to be small, easy to adapt, and composable. They work with any model.

**The README is organised by failure mode, not by feature.** The body is `#1: The Agent Didn't Do What I Want`, `#2: The Agent Is Way Too Verbose`, and so on — each opening with an epigraph from a canonical engineering text (*The Pragmatic Programmer*, Evans' *Domain-Driven Design*), then a stated **Problem**, then **The Fix** naming the skill. Failure mode #1 is resolved by `/grill-me` and `/grill-with-docs`, described as *"my most popular skills."* Failure mode #2 is resolved by a `CONTEXT.md` — and the proof offered is a before/after from a real repo of his own:

> **BEFORE**: "There's a problem when a lesson inside a section of a course is made 'real' (i.e. given a spot in the file system)"
> **AFTER**: "There's a problem with the materialization cascade"

**Install is time-boxed in the heading and offers two paths with stated philosophies.** `## Installation (30-second setup)`:

> Two ways in, two philosophies. **The Claude Code plugin** installs the whole set as a managed, read-only bundle that updates when I ship, so you subscribe rather than fork. **skills.sh** copies editable skill files into your project, so you can hack on them and make them your own. Pick one: installing both leaves you with every skill twice.

Step 2 is `/setup-matt-pocock-skills`, run once per repo, which asks only three things (issue tracker, triage labels, docs location). Step 3 is literally "Bam - you're ready to go."

He also publishes his ADRs in-repo and links them from the README (`.agents/adr/0002-ship-as-a-claude-code-plugin.md`), and his router skill `ask-matt` carries `disable-model-invocation: true` so it is reachable only by typing it.

Commune's whole authoring loop — dump, connect, grill, draft, refine, ship — is already this family of skills; `grilling` and `wayfinder` from this repo are what produced the ticket this brief answers. The lineage is real and should be acknowledged rather than obscured.

### 2.3 The Greptile CLI — a machine-first output contract

Greptile's CLI is not open source, but it ships an **MIT-licensed skill** (`greptile-cli`, installed on this machine) that is the best available specimen of a CLI designed for agents rather than humans. Its frontmatter carries `license: MIT`, `metadata: {author: greptileai, minCliCompat: 3.3.0}`, and `allowed-tools: [Bash(greptile *), Bash(git *)]`.

Four contract decisions worth stealing verbatim:

> `greptile review` renders a live terminal UI by default. That output is not meant to be parsed. When running as an agent, always pass `--json` (structured) or `--agent` (plain text).

> Agent environment variables (`CLAUDECODE`, `CLAUDE_CODE`, `CODEX_SHELL`, `CODEX_THREAD_ID`, `CODEX_CI`, `CURSOR_AGENT`) do **not** change the output format. They only suppress interactive surfaces like pickers and auto-login. Pass the flag.

> A non-zero exit means the review did not finish. It does **not** mean findings were found. A review reporting ten `P0`s still exits `0`.

> Do not install the CLI without asking.

It also inverts the usual documentation default — *"Prefer this reference over running `greptile <cmd> --help`"* — and keeps the flag matrix and output schemas in `references/commands.md` and `references/output.md` rather than in `SKILL.md`.

**This produces a correction to an accepted decision in the map.** [#2](https://github.com/dmthepm/commune-wiki/issues/2) records "meaningful exit codes (0 clean / 1 findings / 2 error)". Greptile explicitly rejects encoding findings in the exit code, and it is right: a command that exits non-zero because it found something is indistinguishable, to a shell, from a command that crashed. See C5.

### 2.4 `dmthepm/morning-paper` — right about the demo, wrong about the door

The positioning line lives in the **GitHub repo description**, not the README:

> Own your algorithm. A print-first personal newspaper your agent composes from sources and preferences you own as files, rendered to PDF by a CLI. Anti-feed; runs on Claude Code and Codex.

The README hero is a different, softer sentence — *"A real paper every morning, from your private newsroom."* That split is the first lesson: **the fighting line is hiding in a metadata field while the README opens with a mood.**

What it gets right, and commune should copy exactly:

- **The demo is the success criterion, and it is stated as a refusal to accept a weaker one.** The setup prompt says success is *"a real demo PDF on disk and open on my screen, not just a successful package install"*, ends with *"Stop when the demo PDF exists and is open on my screen"*, and defers everything else: *"Do not set up my private newsroom yet. First prove the engine prints."*
- **The demo runs offline.** First bullet under "What It Does": *"Renders a demo paper with no config or network."*
- **Negative-space claims.** *"No database. No Docker. No hosted account required. No fabricated filler: a missing source prints 'not configured' or 'nothing today.'"* Naming what it will not do is a costly signal; feature lists are not.
- **It defers to the host's primitives instead of inventing its own.** On scheduling: *"Prefer the native recurring primitive of the agent host you already use. Morning Paper should not invent a second scheduling system unless you ask for a local fallback."*
- **`ROLES.md`** — eight numbered roles, *"each role reads the shared edition folder, does one job, and leaves one markdown handoff"* — is the job-split precedent the map already cites.

What it gets wrong, at 5 stars after five months, MIT and genuinely good:

- **The front door is a 20-line prompt you paste into an agent.** The manual install underneath needs a pinned Python 3.13, a `[pretty]` extra, `uv tool install` with `pipx` fallback, and on macOS `brew install pango gdk-pixbuf`.
- **The plugin path requires adding a custom marketplace** (`/plugin marketplace add dmthepm/morning-paper`). Compare Pocock: *"It's in Claude Code's official marketplace, so there's nothing to add first."* A private marketplace has an audience of people who already decided to install.
- **No repo topics, no homepage.** Same hole as commune.

The engine is not the problem. The door is.

---

## 3. Positioning

### 3.1 The template, reverse-engineered

morning-paper's description has four beats: **imperative ownership claim → concrete mechanism sentence → coined enemy → harness proof.** Beat three is load-bearing. Pocock's equivalent is naming GSD/BMAD/Spec-Kit; `npx skills`'s is "77 agents"; Greptile's is "before anything is pushed." A line without an enemy is a description, and descriptions do not spread.

The enemy has to be chosen carefully, because §5 shows the reflex commune will actually meet: *"Doesn't Obsidian already do pretty much the same?"* and *"Obsidian but with AI integration baked in up front."* The line's job is to make that reflex wrong in one reading.

### 3.2 Candidate A — "Own your canon. Anti-capture."

> Own your canon. Dictate; job-split agent skills turn the dump into atomic, cross-linked markdown over a queryable graph you can browse in Obsidian and publish as a static site. Anti-capture; runs on Claude Code, Codex and Cursor.

**Reasoning.** The enemy is *capture* — the thing every PKM tool sells and the thing that demonstrably fails its users. Westenberg deleted 10,000 notes and wrote *"I started reading to extract. Listening to summarize... I stopped wondering and started processing."* The top comment in that thread is *"I would never read them again."* Declaring against capture is a real positional claim against the entire category, and it is aimed at the tool's failure rather than the user's discipline.

"Canon" carries the maintenance claim: a canon implies things were promoted, revised, and superseded. That is commune's actual differentiator against dictation-to-notes products — Granola, Mem, Reflect and Monologue itself all capture; none revise. It also answers the Obsidian reflex directly, because Obsidian is a *vault*, and a vault is storage.

**Risk.** "Canon" needs half a beat to land and reads slightly literary. It is the least immediately concrete of the three.

### 3.3 Candidate B — "Say it once. Anti-graveyard."

> Say it once. A CLI and job-split agent skills turn dictation into a maintained markdown wiki — connected, grilled, drafted, shipped — browsable in Obsidian, published with Astro. Anti-graveyard; runs on Claude Code, Codex and Cursor.

**Reasoning.** Highest recognition of the three: every developer has an abandoned vault, and "graveyard" names it in one word. "Say it once" is the dictation promise in three words and doubles as the atomicity rule.

**Risk.** "Say it once" is a productivity-tool cliché and reads as an efficiency claim rather than a stance. "Graveyard" points the accusation at the user's past behaviour rather than at a competitor's product — self-deprecating where "anti-feed" was defiant. It also under-promises: the graveyard problem is solved by deleting notes, not by building a graph.

### 3.4 Candidate C — "Your notes should argue back. Anti-slop."

> Your notes should argue back. Dictate; skills connect the dump to what you already wrote, grill the claim, then draft an atomic note into a queryable markdown graph. Anti-slop; runs on Claude Code, Codex and Cursor.

**Reasoning.** Leads on `grill`, the one step in the loop no competitor has, and converts the strongest objection to AI writing tools into the headline feature. "Slop" is Simon Willison's term for *"unwanted AI generated content"*, and §5 shows it is the single fastest way a project gets dismissed — claiming the opposite is a genuinely aggressive move.

**Risk.** It is the highest-stakes line here: it must be earned in every note the tool emits, and one slop-shaped output falsifies it publicly. "Slop" is also trend-coupled and may date within a year. And it mis-scopes — commune does more than argue.

### 3.5 Pick: **A — "Own your canon. Anti-capture."**

Four reasons.

1. **It attacks the category, not the user (B) or the medium (C).** "Anti-capture" says the incumbent tools are solving the wrong problem. That is a claim commune can defend on mechanism, because the graph and the revise step are real.
2. **It survives its own roadmap.** If `grill` is renamed or Obsidian is dropped, A still holds; C dies with `grill`, and B is a promise about input rather than about the artifact.
3. **It compounds Devon's other repos into one argument.** "Own your algorithm" (morning-paper) and "files-first" (mainbranch) plus "own your canon" reads as a body of work with a stance, not three unrelated side projects. That accumulation is itself an adoption asset.
4. **It answers the Obsidian reflex.** Obsidian stores; commune decides. That distinction is the only defensible answer to *"how is this different from pointing an agent at a vault?"* — and it must be answerable in the first sentence, because §5 shows readers bail before the second.

**Keep the losers as section headings, not taglines.** C's "your notes should argue back" is the right subhead for the `grill` section of the README. B's "say it once" is the right first line of the demo transcript.

**One caveat, stated plainly:** a positioning line is a promise about the artifact. If the notes commune emits are not visibly better than what a bare agent pointed at a folder produces, no line in this section saves it. The line is downstream of C10.

---

## 4. What actually drives adoption

Ordered by leverage. Where the evidence is weak, it says so.

### 4.1 Install friction

The peer group is not subtle. Claude Code leads with `curl -fsSL https://claude.ai/install.sh | bash` under a tab labelled "Native Install (Recommended)"; Codex, opencode and uv all lead with a piped shell script. Gemini CLI is the only true zero-install `npx` story — and it can be, because it is a JS package. **Commune is a Node CLI, so it gets the good option for free.**

Claude Code's docs make the architectural point explicitly: *"The npm package installs the same native binary as the standalone installer... The installed `claude` binary does not itself invoke Node."* Install method and implementation language have decoupled. Commune does not need to care about this yet, but it means `npx` is a choice, not a constraint.

**Honest gap:** no credible public source measures install-funnel drop-off for CLI tools. The claim "fewer steps means more installs" is universally assumed and nowhere instrumented. It is still the right bet, because every vendor with telemetry has made it.

### 4.2 The first-run demo

`clig.dev` is the primary source and is unambiguous on the zero-argument case:

> **Display concise help text by default.** When `myapp` or `myapp subcommand` requires arguments to function, and is run with no arguments, display concise help text.

> **Lead with examples.** Users tend to use examples over other forms of documentation, so show them first.

Its best framing of first-run is as a conversation:

> the user types a command, gets an error, changes the command, gets a different error, and so on, until it works. **This mode of learning through repeated failure is like a conversation the user is having with the program.** [...] At worst, it's a hostile conversation which makes them feel stupid and resentful.

And on errors as documentation: *"Catch errors and rewrite them for humans... 'Can't write to file.txt. You might need to make it writable by running `chmod +w file.txt`.'"* Responsiveness budget: *"Print something to the user in <100ms."* 12 Factor CLI Apps converges independently and adds *"Never require a prompt though. The user needs to be able to automate your CLI in a script."*

The sample-data precedent is Kibana's: *"Using sample data is a great way to start exploring the system and learn your way around... If you have no data, you will be prompted to install these packages when running Kibana for the first time."* Grafana's TestData, Superset's `load_examples`, Metabase's Sample Database and `streamlit hello` are the same pattern.

**Honest gap:** no source instruments that zero-config reduces bounce. The mechanism is argued everywhere and measured nowhere.

### 4.3 The README's opening seconds

`standard-readme` requires a Short Description that *"Must be less than 120 characters"* and *"Must match GitHub's description."* The *Art of README* supplies the model:

> A README is a module consumer's first -- and maybe only -- look into your creation.

> The ordering presented here is lovingly referred to as "cognitive funneling"... the ordering of these key elements should be decided by **how quickly they let someone "short circuit" and bail on your module**.

> your job, when you're doing it with optimal altruism in mind, isn't to "sell" people on your work. It's to let them evaluate what your creation does as objectively as possible.

On badges, which applies equally to emoji: *"Be judicious in your use of badges... They add visual noise to your README... For each badge, consider: 'what real value is this badge providing to the typical viewer of this README?'"*

GitHub's own guidance is thin but normative: *"A README should only contain information necessary for developers to get started using and contributing to your project. Longer documentation is best suited for wikis."* Commune's README is 423 lines.

### 4.4 Screenshots and terminal recordings

Charm's is the best first-party statement, written by a team reflecting on 100k stars:

> The README is critically important to the success of an open source product. It's often a developer's first point of contact with a project and the place where a developer will, **in a matter of seconds**, judge whether the project worthy of further consideration.

> Our strategy is to simply follow the age-old rule of advertising: showing the product.

> GIFs... are the most effective medium we've encountered for illustrating how software works in a concise manner.

— <https://charm.land/blog/100k/>

**Tooling recommendation: VHS over asciinema, for a specific reason.** VHS (*"Write terminal GIFs as code"*) drives recordings from a plain-text `.tape` script, so the demo is diffable, reviewable and regenerable in CI — it cannot silently drift from the CLI it documents. asciinema's `.cast` files are also text and its selling point is real (*"just pause the player and copy-paste the content you want. It's just text after all!"*), but **asciinema does not render inline on GitHub**; it needs `agg` or `svg-term` to become an embeddable artifact. The *Art of README* adds a durability argument for inlining: *"your version control repository and its embedded README will outlive your repository host and any of the things you hyperlink to -- especially images."*

**Honest gap:** there is no controlled study showing a hero GIF causes adoption. The only quantitative source (arXiv:2206.10772, n=1950) is correlational — popular READMEs use lists and images. Treat the GIF as what successful projects deliberately do, not as a proven lever.

### 4.5 Cross-harness support — and a correction

The governance picture settled in December 2025. The Linux Foundation formed the **Agentic AI Foundation** on 2025-12-09, anchored by MCP (Anthropic), goose (Block) and AGENTS.md (OpenAI), with AWS, Anthropic, Block, Bloomberg, Cloudflare, Google, Microsoft and OpenAI as platinum members. Anthropic published **Agent Skills** as an open standard at `agentskills.io` on 2025-12-18, spec repo MIT.

The spec allows exactly six frontmatter fields — `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` — and Claude Code enforces this at the packaging boundary with a hard error listing the allowed properties. `name` must match the parent directory. Progressive disclosure is budgeted: *"Metadata (~100 tokens)... Instructions (< 5000 tokens recommended)... Resources (as needed)"*, and *"Keep your main `SKILL.md` under 500 lines."*

**Where each harness looks:**

| Tool | Instruction file | Skills directories |
|---|---|---|
| Claude Code | `CLAUDE.md` **only** | `~/.claude/skills/`, `.claude/skills/` |
| Codex | `AGENTS.md` | `.agents/skills`, `$HOME/.agents/skills` |
| Cursor | `.cursor/rules/*.mdc` + `AGENTS.md` | `.agents/skills/`, `.cursor/skills/`, plus `.claude/skills/` compat |
| VS Code / Copilot | `.github/copilot-instructions.md` | `.github/skills/`, `.claude/skills/`, `.agents/skills/` |

Claude Code is the odd one out on both axes, and says so:

> **Claude Code reads `CLAUDE.md`, not `AGENTS.md`.** If your repository already uses `AGENTS.md` for other coding agents, create a `CLAUDE.md` that imports it so both tools read the same instructions without duplicating them.

`.agents/skills/` is the converging convention, and the spec's own implementation guide says why:

> The `.agents/skills/` paths have emerged as a widely-adopted convention for cross-client skill sharing... scanning `.agents/skills/` means skills installed by other compliant clients are automatically visible to yours, and vice versa.

**The correction — and this is the most surprising finding in this brief.** Two independent sources say context files and skills do not help by default.

An ETH Zurich / LogicStar study (Gloaguen et al., arXiv:2602.11988, Feb 2026):

> **Surprisingly, we find that providing context files does not generally improve task success rates, while increasing inference cost by over 20% on average.** [...] we find that while instructions in the context files are well followed by coding agents, **repository overviews, although popular and recommended by model providers, are not helpful.**

And Vercel's own eval (2026-01-27), testing Next.js 16 APIs absent from training data:

| Config | Pass rate |
|---|---|
| Baseline, no docs | 53% |
| Skills, default | 53% |
| Skills, explicit instructions | 79% |
| `AGENTS.md` compressed docs index | **100%** |

> **In 56% of eval cases, the skill was never invoked.** The agent had access to the documentation but didn't use it.

The synthesis across both: **instructions get followed; repository overviews are dead weight; a skill only fires if its `description` is written as a trigger.** This turns the `description` field from metadata into the most important line in the file, and it makes an `AGENTS.md` that inlines the essential contract a *higher*-performing artifact than a skill that describes it. See C3 and C4.

### 4.6 Licence

The evidence here is one-sided enough to be worth stating bluntly, while leaving the decision with Devon.

**Google's policy bans AGPL from workstations, not just from products** (<https://opensource.google/documentation/reference/using/agpl-policy>):

> **WARNING: Code licensed under the GNU Affero General Public License (AGPL) MUST NOT be used at Google.**

> - **Do not install AGPL-licensed programs on your workstation, Google-issued laptop, or Google-issued phone** without explicit authorization from the Open Source Programs Office.

That second bullet is dispositive for a developer CLI: it bans *installing*, independent of any linking or distribution question. Developer discourse corroborates the pattern beyond Google — *"bigco policy is to not allow ANY AGPL code within a 10 mile radius of any computer owned by said company. The author(s) are free to use AGPL, but there are significant downsides if they care about adoption."*

**The peer norms, both readings:**

- As *agent tooling*: Apache-2.0 dominates (Codex, Gemini CLI, goose, aider). The most-starred agent CLI of all — opencode, 203,100 stars — is MIT. **Zero agent CLIs are AGPL.**
- As *note/wiki tooling*: MIT is near-universal (Quartz, Astro, Docusaurus, Foam, the Obsidian API; a 200-plugin sample of the Obsidian ecosystem is ~80.5% MIT, 1% AGPL). AGPL appears only on end-user desktop *apps* — Logseq — never on libraries meant to be embedded.

**Apache-2.0 is the serious alternative to MIT**, for its §3 patent grant and termination clause; the FSF recommends it over MIT on exactly those grounds (*"For substantial programs it is better to use the Apache 2.0 license since it blocks patent treachery"*), and Google mandates it internally. Its cost for a CLI is §4 notice compliance — Google's own guidance suggests a `--notices` flag. Apache-2.0 is also GPLv2-incompatible where MIT is compatible with everything.

Commune is currently AGPL-3.0, which GitHub renders as licence "Other". Devon's own two best-performing repos, morning-paper and mainbranch (37 stars), are both MIT. Commune's AGPL is protecting a static-site generator against a hosted competitor that does not exist, at the cost of every developer whose employer has a licence policy.

One structural note if a change is ever contemplated later: **every project that successfully relicensed — Grafana, Redis, MongoDB, Elastic — had a CLA.** DCO-only projects effectively cannot relicense without unanimous contributor consent. That is a feature if the goal is a credible no-rug-pull commitment, and a trap if it is not.

---

## 5. Anti-patterns: what gets a project like this dismissed

Five kill-shots, each evidenced by developers reacting to real repos.

### 5.1 The AI-slop README — the fastest kill

> **The AI slop readme is a real turn off. Makes me question the quality/accuracy of the rest of the project.**
> — <https://news.ycombinator.com/item?id=49225171>

> Didn't make it past the first paragraph of AI slop in the README. **Have some respect for your readers and put actual information in it**, ideally human generated. At least the first paragraph! Otherwise you may as well name it IGNOREME.
> — <https://news.ycombinator.com/item?id=47281562>

> The readme is AI slop, and incredibly grating to read. **The disgust I felt while reading it almost put me off trying the project.** Is the code also AI slop?
> — <https://news.ycombinator.com/item?id=48531868>

The reaction is not unanimous — *"It's really demeaning to call someone's hard work 'AI slop'. Did you actually read the code?"* — but the asymmetry is what matters: **being wrongly accused costs the reader anyway.**

The escape hatch is Simon Willison's, who coined the term (*"slop is the term for unwanted AI generated content"*, <https://simonwillison.net/2024/May/8/slop/>). His distinguishing variable is not AI-vs-human:

> **I attach my name and stake my credibility on the things that I publish.**

Reviewed and signed is not slop. Unreviewed and thrust upon someone is.

### 5.2 Emoji headings are a named, specific tell

> the emojis in the readme scream AI generated more than any emdash ever could.
> — <https://news.ycombinator.com/item?id=45312970>

> The AI generated emoji soup readme isn't exactly inspiring…
> — <https://news.ycombinator.com/item?id=47289023>

> The readme has crazy emojis & the code was all checked in at once, which is usually my telltale for these kinds of things.
> — <https://news.ycombinator.com/item?id=46522706>

Pangram's frequency analysis identifies which emoji are the tells: checkmarks, warning signs and keycap numbers appear *"at rates hundreds of times above the human baseline, whereas humans use faces to express themselves far more often than AI"*. Markdown density is 12× the human rate, bullet lists 9×.

**commune-wiki's README has sixteen H2 headings and every single one is emoji-prefixed** (`## ✨ Features`, `## 🎯 Who Is This For?`, `## 🚀 Quick Start`, …), plus nine emoji feature bullets. `CONTRIBUTING.md` is the same. This is currently the most damaging file in the repo.

### 5.3 "It's just markdown" — the dismissal commune must survive

From the AGENTS.md launch thread (837 points):

> **In what way is this a format or standard? It's just markdown in a namespce**
> — <https://news.ycombinator.com/item?id=44957515>

From the Claude Skills thread (816 points, 427 comments):

> Upon further inspection **skills are effectively a bunch of markdown files and scripts** that get unzipped at the right time and used as context.
> — <https://news.ycombinator.com/item?id=45607778>

> Seems like a more organized way to do the equivalent of a folder full of md files + instructing the LLM to ls that folder
> — <https://news.ycombinator.com/item?id=45607782>

**"It's a folder of markdown" is not a defence — it is the accusation.** A project that is 90% prompt files has no answer to it. Commune's answer has to be the graph: a queryable index with a CLI surface and a JSON contract is a program, and can be demonstrated as one in a way a folder cannot. This is the strongest argument for [#18](https://github.com/dmthepm/commune-wiki/issues/18) landing *before* the skills in [#10](https://github.com/dmthepm/commune-wiki/issues/10).

### 5.4 PKM fatigue is real, specific, and aimed at exactly this product

Joan Westenberg deleted 10,000 notes after seven years:

> **Instead of accelerating my thinking, it began to replace it. Instead of aiding memory, it froze my curiosity into static categories.**

> I started reading to extract. Listening to summarize. Thinking in formats I could file. Every experience became fodder. **I stopped wondering and started processing.**

The thread (598 points, 348 comments) is full of the same:

> I tried to collect all thoughts, notes etc. but **I would never read them again.** Most of it would be outdated anyways.
> — <https://news.ycombinator.com/item?id=44402648>

> **The whole "second brain" thing seems like something you do to make a neat screenshot of your note graph.** I just use regular old folders like a file directory.
> — <https://news.ycombinator.com/item?id=46238861>

That last one is aimed directly at commune's most photogenic feature. **Do not lead with the graph visual.** Lead with what the graph is *for* — the connect step finding what a new dump touches before a draft exists.

### 5.5 "Another one of these" — the highest-frequency killer

From a Show HN for a markdown knowledge base (318 points, Apr 2026):

> **Just another disposable piece of software maintained by a single person that does 80% of what other apps do but worse. Max lifespan 2 years**
> — <https://news.ycombinator.com/item?id=47883025>

> Doesn't Obsidian already do pretty much the same?
> — <https://news.ycombinator.com/item?id=47883132>

From an AI-augmented PKM Show HN the same week:

> how is this different from pointing Claude Cowork at an Obsidian Vault?
> — <https://news.ycombinator.com/item?id=47891154>

> I feel like most of these applications all boil down to "**Obsidian but with AI integration baked in up front**". It'd be interesting to see approaches that actually rethink commonplaces of the experience rather than just reproduce the same thing but "with ai"
> — <https://news.ycombinator.com/item?id=47893456>

> It is the second llm wiki on frontpage today! I wish the scene was more collaborative - instead of everyone writing their own. But I guess this is **the llm curse - too easy to start.**
> — <https://news.ycombinator.com/item?id=47892318>

And the general form:

> I feel like there's **not enough content on the landing page to help me understand why I need yet another notetaking app. The burden of proof is high** given how many of these there are.
> — <https://news.ycombinator.com/item?id=49092157>

**Commune's current README hands this objection a loaded weapon**: a vendor-authored comparison table against Obsidian, Notion, Roam and Logseq, claiming Obsidian is *"Desktop app, proprietary sync"* — while commune's own plan is to use Obsidian as its browsing surface. Delete it.

### 5.6 The README that doesn't say what it does

> The README.md doesn't really explain what it is or why I'd want it, just directory structure and how to install
> — <https://news.ycombinator.com/item?id=47468597>

> It is rather long-winded and have a lot of **bombastic claims but doesnt really explain what it does.**
> — <https://news.ycombinator.com/item?id=46575471>

> **within 2-3 minutes I'm not convinced why I care** and still don't know enough about what this is
> — <https://news.ycombinator.com/item?id=48648184>

### 5.7 The through-line

Every anti-pattern above is the same failure: **the artifact reads as costless to produce, so the reader assigns it costless value.** Emoji bullets, bombastic claims, a folder of markdown, another PKM tool — each signals that no scarce human judgement was spent. The defences are all costly-signal moves: a demo that shows the thing running, a licence that matches the peer ecosystem rather than maximising leverage, spec-pure frontmatter that provably works in four harnesses, and prose a human clearly wrote and signed.

---

## 6. Constraints

The deliverable. Each is actionable and mapped to a ticket where one exists.

### Build

**C1 — One install command, no prerequisites in it.** `npx skills add dmthepm/commune-wiki`, above the fold, nothing before it. Requires `skills/<name>/SKILL.md` at repo root. The Node CLI must be obtainable by the skill without a second manual step. ([#20](https://github.com/dmthepm/commune-wiki/issues/20)) *Counter-evidence in-house: morning-paper's front door is a 20-line paste prompt with a pinned Python and a Homebrew system library. Five stars.*

**C2 — Skills shell out to the CLI. Never harness-specific APIs.** The precedent is already installed on this machine: *"This skill is intentionally shell-first so it works across agents that can run terminal commands, including Codex and Claude Code."* Portability is a consequence of the CLI boundary, not a feature to be added later. ([#10](https://github.com/dmthepm/commune-wiki/issues/10))

**C3 — Spec-pure frontmatter, six fields only.** `name` (matching the directory), `description`, and optionally `license`, `compatibility`, `metadata`, `allowed-tools`. Anything else is a hard packaging error in Claude Code. Ship to both `.agents/skills/` and `.claude/skills/`; ship an `AGENTS.md` with a `CLAUDE.md` that imports it. ([#20](https://github.com/dmthepm/commune-wiki/issues/20))

**C4 — The `description` is a trigger, not a summary.** Vercel measured skills never firing in 56% of eval cases. Write each `description` as the conditions under which the skill should activate, with the keywords a user would actually say. Corollary from the ETH study: put the operative contract *in* `AGENTS.md`, and do not write a repository overview — overviews measurably do not help and cost tokens. ([#10](https://github.com/dmthepm/commune-wiki/issues/10), [#6](https://github.com/dmthepm/commune-wiki/issues/6))

**C5 — Exit codes describe whether the command ran, not what it found.** This revises the decision in [#2](https://github.com/dmthepm/commune-wiki/issues/2) ("0 clean / 1 findings / 2 error"). Adopt: `0` ran, `1` could not finish, `2` invalid invocation, `130` interrupted. Findings live in the JSON payload. If a hook needs a gate, add a separate status verb that encodes state in its exit code. Harness env vars (`CLAUDECODE`, `CODEX_SHELL`, `CURSOR_AGENT`) must not switch output format — the flag does. ([#9](https://github.com/dmthepm/commune-wiki/issues/9), [#18](https://github.com/dmthepm/commune-wiki/issues/18))

**C6 — A `commune demo` that produces a real artifact, offline, in one command.** Bundled sample dictation in, real linked notes plus a graph query plus a built page out, no config and no network. The success criterion is stated as a refusal, morning-paper style: not "install succeeded" but "notes exist on disk and the graph answers a query." ([#11](https://github.com/dmthepm/commune-wiki/issues/11))

**C7 — Bare `commune` prints concise help with examples first.** Per `clig.dev`: a description, one or two example invocations, and a pointer to `--help`. Something on stdout inside 100ms. Errors rewritten for humans with the fix in the message. Never require an interactive prompt — every command must be scriptable. ([#9](https://github.com/dmthepm/commune-wiki/issues/9))

**C8 — `SKILL.md` under 100 lines; everything else in `references/`, loaded on demand.** The spec recommends under 5000 tokens and under 500 lines; the working examples are far tighter — `monologue-notes` is 77 lines, and `greptile-cli` states *"Prefer this reference over running `greptile <cmd> --help`."* ([#10](https://github.com/dmthepm/commune-wiki/issues/10))

**C9 — Job-split with a router and a written invocation rule.** One skill per job in `dump → connect → grill → draft → refine → ship`, one user-invoked router (Pocock's `ask-matt` carries `disable-model-invocation: true`), and the rule that a user-invoked skill may call model-invoked skills but never another user-invoked one — written down before the second skill is authored. ([#19](https://github.com/dmthepm/commune-wiki/issues/19), [#10](https://github.com/dmthepm/commune-wiki/issues/10))

**C10 — The graph ships before the skills.** §5.3's "it's just markdown" dismissal has no answer that is itself markdown. A queryable index with a JSON contract is demonstrably a program. Land [#18](https://github.com/dmthepm/commune-wiki/issues/18) before [#10](https://github.com/dmthepm/commune-wiki/issues/10).

**C11 — Ask before installing anything.** Greptile: *"Do not install the CLI without asking."* Applies to the CLI, to Obsidian plugins, and to anything the setup skill would place in a user's home directory.

**C12 — Defer to the host's primitives.** Do not build scheduling, a plugin marketplace, or a second skills installer. morning-paper: *"Morning Paper should not invent a second scheduling system unless you ask for a local fallback."*

**C13 — Licence: change AGPL-3.0 to MIT.** *Flagged as a decision for Devon, not made here.* The evidence: Google's policy bans **installing** AGPL software on employee machines without OSPO authorisation; zero agent CLIs are AGPL; the note/wiki ecosystem is ~80% MIT; Devon's own two best-performing repos are MIT. Apache-2.0 is the defensible alternative if the patent grant is wanted, at the cost of §4 notice compliance and GPLv2 incompatibility. AGPL is currently protecting a static-site generator from a hosted competitor that does not exist. Note this touches `LICENSE`, `package.json` and devon-wiki, and needs a deliberate decision because relicensing later without a CLA requires unanimous contributor consent.

### Presentation

**C14 — The GitHub repo description is the positioning line. Set it.** Currently `null`, along with topics and homepage. `standard-readme` requires the README's short description to match it and to be under 120 characters. This is a five-minute fix on the highest-traffic surface in the project.

**C15 — First screenful: name, claim, enemy, one install command.** Nothing else. Today line 3 of the README is `**License**: AGPL-3.0 / **Status**: Active Development`, before the reader has been given a reason to care. `npx skills` gets its entire hero into 15 lines.

**C16 — Organise the README by failure mode, not by feature.** Pocock's structure: numbered failure mode → epigraph → stated Problem → the skill that is the Fix. Commune's four: *the dump never becomes a note; the note never gets linked; the claim never gets tested; the wiki stops being edited.* This also kills the `## ✨ Features` list, which is the section §5.1 readers bail on.

**C17 — Delete every emoji heading.** Sixteen in `README.md`, more in `CONTRIBUTING.md`. Specifically named as an AI tell in §5.2. None of the adopted references does this.

**C18 — Delete the comparison table.** Vendor-authored comparisons against Obsidian, Notion, Roam and Logseq read as marketing, and commune's runs on Obsidian — the table argues against commune's own architecture.

**C19 — One VHS-scripted demo GIF at the top, ~60 seconds, inlined.** VHS over asciinema because a `.tape` file is diffable and regenerable in CI, so the demo cannot drift from the CLI; asciinema does not render inline on GitHub without `agg`. Show the real terminal: dictation in, a linked note and a built page out. Charm: *"showing the product."*

**C20 — Lead with provenance, not promise.** Pocock's entire claim is *"Straight from my .agents directory"*. Commune's equivalent is devon-wiki: live at devonmeadows.com, ~74 notes, running this engine. Say it, link it, count it. That is the proof no README copy can fake and the direct answer to *"max lifespan 2 years."*

**C21 — Publish the ADRs.** The map's "Charting decisions" entries — Node over Rust and Python, `npx skills` over a Claude-only plugin, markdown config over `commune.config.ts`, dictation over Obsidian as the writing surface — are already written and already good. Put them in the repo and link them from the README, as Pocock and Every both do. Reasoning in public is the respect mechanism.

**C22 — Human-written, human-signed prose.** Willison's line is the standard: *"I attach my name and stake my credibility on the things that I publish."* Agent-drafted is fine; unreviewed is not. This applies with particular force to a tool whose product is generated notes — §5.1 shows the reader who suspects the README will assume the same of the output.

---

## 7. Open questions

- **Is `grill` demonstrable in a 60-second GIF?** It is the differentiating step (§3.4) and the hardest to show, because its value is in the pushback quality. If it cannot be shown, C19's demo should lead with `connect` instead and `grill` should be the README's second section.
- **What is the falsifiable claim for note quality?** Positioning candidate A promises a maintained canon. Nothing in this brief establishes how a visitor verifies that in thirty seconds. A public diff of a note across three revisions might do it.
- **Does the AGENTS.md finding (§4.5) change [#6](https://github.com/dmthepm/commune-wiki/issues/6)?** The durable markdown context files were specified as the config surface. The ETH study says instructions are followed and overviews are not — so the durable files should read as rules, not as descriptions of the project. Worth re-reading #6 against that.
- **Name and npm scope.** `package.json` currently says `commune-publish`. The bin name, the skill directory name and the `npx skills add` path all have to agree, and the positioning line should survive the choice.

## 8. Sources

**Compound engineering** — Klaassen, ["My AI Had Already Fixed the Code Before I Saw It"](https://every.to/source-code/my-ai-had-already-fixed-the-code-before-i-saw-it) (2025-08-18) · Shipper & Klaassen, ["Compound Engineering: How Every Codes With Agents"](https://web.archive.org/web/20251216042234/https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents) (2025-12-11, Wayback) · [Every's Compound Engineering guide](https://every.to/guides/compound-engineering) · Klaassen, ["Compound Engineering Gets an Upgrade"](https://every.to/p/compound-engineering-gets-an-upgrade) (2026-05-29) · Larson, ["Learning from Every's Compound Engineering"](https://lethain.com/everyinc-compound-engineering/) (2026-01-19) · MoClaw, ["What Compound Engineering Actually Compounds"](https://moclaw.ai/blog/compound-engineering) (2026-08-07)

**Reference projects** — [vercel-labs/skills](https://github.com/vercel-labs/skills) · [mattpocock/skills](https://github.com/mattpocock/skills) · [EveryInc/monologue-toolkit](https://github.com/EveryInc/monologue-toolkit) · [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) · [dmthepm/morning-paper](https://github.com/dmthepm/morning-paper) · `greptile-cli` SKILL.md and `references/output.md` as installed at `~/.agents/skills/greptile-cli`

**Specs and standards** — [agentskills.io specification](https://agentskills.io/specification) · [Adding skills support](https://agentskills.io/client-implementation/adding-skills-support.md) · [agents.md](https://agents.md/) · [Claude Code memory docs](https://code.claude.com/docs/en/memory) · [Anthropic, "Equipping agents for the real world with Agent Skills"](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) (2025-10-16) · [Linux Foundation, Agentic AI Foundation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) (2025-12-09)

**Evidence against the default assumptions** — Gloaguen, Mündler, Müller, Raychev, Vechev, ["Evaluating AGENTS.md"](https://arxiv.org/abs/2602.11988) (arXiv:2602.11988) · [Vercel, "AGENTS.md outperforms Skills in our agent evals"](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) (2026-01-27)

**CLI and README craft** — [clig.dev](https://clig.dev) · [12 Factor CLI Apps](https://medium.com/@jdxcode/12-factor-cli-apps-dd3c227a0e46) · [Art of README](https://github.com/hackergrrl/art-of-readme) · [standard-readme spec](https://github.com/RichardLitt/standard-readme/blob/main/spec.md) · [Charm, "100k"](https://charm.land/blog/100k/) · [VHS](https://github.com/charmbracelet/vhs) · [asciinema](https://github.com/asciinema/asciinema) · [Diátaxis](https://diataxis.fr)

**Licensing** — [Google AGPL policy](https://opensource.google/documentation/reference/using/agpl-policy) · [Google releasing guidance](https://opensource.google/documentation/reference/releasing/preparing) · [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) · [FSF licence recommendations](https://www.gnu.org/licenses/license-recommendations.html) · [choosealicense.com](https://choosealicense.com) · [Blue Oak Council licence list](https://blueoakcouncil.org/list)

**Anti-patterns** — Willison, ["Slop"](https://simonwillison.net/2024/May/8/slop/) (2024-05-08) · Westenberg, "I Deleted My Second Brain" ([HN thread](https://news.ycombinator.com/item?id=44402470)) · [Pangram, "Signs of AI writing"](https://www.pangram.com/signs-of-ai-writing) · [LeadDev, "Open source has a big AI slop problem"](https://leaddev.com/software-quality/open-source-has-a-big-ai-slop-problem) (2026-02-17) · individual HN comments cited inline

**Method note.** Claims about `npx skills`, `monologue-notes`, `greptile-cli` and `mattpocock/skills` internals were verified against the copies installed on this machine under `~/.agents/skills/` and `~/.agents/.skill-lock.json`, not from documentation alone. Star counts, licences and repo metadata come from the GitHub and npm REST APIs on 2026-09-02. Where a source is paywalled (the remainder of both Klaassen essays), that is noted rather than paraphrased. Three findings are explicitly inference and are labelled as such in the text: the absence of adversarial HN discussion of compound engineering, the reason for the 62-vs-24,763 star gap inside Every, and the reading that an absent LICENSE file makes `monologue-toolkit` unreusable.

**Known gaps.** Reddit was unreachable during this research, so §5's developer discourse is Hacker News-only — quotes were pulled from HN's Algolia API rather than paraphrased from search results, so they are exact, but the sampling is narrower than ideal. Three claims that would strengthen the constraints have no credible public evidence and are flagged inline rather than asserted: install-funnel drop-off for CLI tools (§4.1), any causal link between a hero GIF and adoption (§4.4), and any instrumented effect of zero-config first runs (§4.2). Where a vendor publishes an adoption number without an audit trail, it is not used here.

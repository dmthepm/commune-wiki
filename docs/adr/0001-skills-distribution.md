# 1. Skills ship from GitHub, the package ships from npm

- **Status:** accepted
- **Date:** 2026-09-03
- **Context:** [#10](https://github.com/dmthepm/commune-wiki/issues/10) (the authoring skills), [#20](https://github.com/dmthepm/commune-wiki/issues/20) (install and first run)
- **Plan:** `docs/plans/2026-09-03-authoring-skills-plan.md`, decisions D3 and D9, minor m2

## Context

This repository now holds two things a stranger can install, and they arrive by
different routes.

The **engine** — the Astro integration, the graph library and the `commune`
CLI — is an npm package. `package.json`'s `files` field is what it ships:
`bin`, `lib`, `src/components`, `src/styles`, the licence and the README. That
field has already been wrong once; `tests/install.test.mjs` exists because of it.

The **skills** — `commune-dump`, `commune-write`, `commune-ship`,
`commune-setup` — are markdown and a couple of scripts, installed by
`npx skills add dmthepm/commune-wiki`, which reads them out of the GitHub
repository and links them into `~/.agents/skills/` and each agent's own
directory. They are not JavaScript, nothing imports them, and no build produces
them.

The obvious-looking tidy-up is to add `skills` to `files` so "everything ships
together". That is the mistake this record exists to prevent.

## Decision

**`skills/` is not in the npm tarball, and `files` does not change.**

1. **Skills install from GitHub.** `npx skills add dmthepm/commune-wiki` walks
   the repository, finds `skills/<name>/SKILL.md`, and installs whole folders —
   `references/`, `scripts/`, `assets/`, `agents/` included. Adding them to the
   tarball would put a second copy on disk that no tool reads and that
   `npx skills update` would never refresh.
2. **The engine installs from npm**, into the wiki, as a dependency. The skills
   call it by path: `node_modules/.bin/commune` from the wiki root. They never
   run `npx @dmthepm/commune` and never install anything, so the CLI a skill
   drives is always the one the site builds with.
3. **The two are paired by a schema integer, not a version range.** Every
   `--json` payload carries `schema: 1`; every skill declares
   `metadata.commune-schema: "1"` and refuses a payload that says otherwise.
   Each skill also carries `metadata.version`, bumped in the commit that edits
   it, because the installer hashes the skill folder and a stale hash is what a
   user sees as "no update available".
4. **A version floor, checked at runtime.** `scripts/preflight.mjs` in each
   skill runs `commune --version` and stops below 0.4.0 — the release that ships
   `render`, `graph query --unreferenced` and normalised `graph related` — with
   one line the human can act on. A skill installed from `main` against a wiki
   pinned to an older engine is the expected failure, not an exotic one.
5. **Shared files are duplicated, not referenced across skills.**
   `scripts/preflight.mjs` is in all four skills and `references/handoffs.md` in
   all three loop skills, byte for byte. `tests/skills.test.mjs` fails when the
   copies drift.

## Consequences

- `pnpm pack` output is unchanged by anything under `skills/`, and CI's pack
  listing step makes that visible in the diff between two runs.
- A wiki can install the engine without the skills, and the skills without being
  a wiki — which is what makes `commune-setup` able to say "this is not a
  Commune wiki yet" instead of failing obscurely.
- Editing one skill's `preflight.mjs` breaks the build until the other three are
  edited too. That is the intended cost: each skill installs and runs alone, and
  the agentskills specification keeps file references inside the skill folder.
- A version floor bump is four `MIN` constants and four `metadata.version`
  bumps, in one commit.

## Alternatives rejected

- **Add `skills` to `files`.** Ships bytes no tool reads, and invites a consumer
  to point an agent at `node_modules/@dmthepm/commune/skills/`, which
  `npx skills update` cannot maintain.
- **A separate `@dmthepm/commune-skills` package.** Two release trains for one
  loop, and the pairing question gets worse rather than better: the skills would
  then have a version range against the engine *and* a schema.
- **`npx -y @dmthepm/commune` inside the skills.** Fetches latest on every run,
  so the skill's CLI and the site's engine drift — the exact failure this
  package exists to remove. Bare `npx commune` is worse: with no local install
  it resolves a 2022 placeholder package owned by someone else.
- **One shared `references/` outside the skill folders, referenced by `../`.**
  Breaks when a single skill is installed, and puts file references outside the
  skill folder, which the agentskills specification does not promise to carry.

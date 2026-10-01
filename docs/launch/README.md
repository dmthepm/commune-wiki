# Launch evidence checklist

Status on September 8, 2026. This is a checklist for gathering evidence, not a record of completed installs. The working demonstration is [devon.md](https://devon.md). First-run feedback already has a home. [Tell me where it broke (#85)](https://github.com/dmthepm/commune-wiki/issues/85).

## Proof still owed

- [x] Verify the [starter](../../examples/starter/README.md) from the public instructions and a publicly available revision. It must install the published Commune package without local `file:` dependencies, build two linked public notes, and provide working panes, return navigation, backlinks and markdown sources. **Verified October 1, 2026** on 0.6.1 from the public README in a fresh `node:22-bookworm` container, then in Chromium. Two panes opened, Back returned to the first note, backlinks and the markdown twin were present.
- [ ] **Timed other machine proof, still owed.** Have someone follow those instructions on a machine other than Devon’s, with no inherited project dependencies or private configuration. Record OS, Node, package manager, Astro and Commune versions, source revision, prerequisite setup time, wiki setup time, exact steps, help needed, and the resulting page. Preserve failed attempts too. The launch gate is two linked notes built within ten minutes after the stated prerequisites are ready. Ten minutes is the acceptance target, not a measured install claim. A fresh directory, CI run or local fixture alone does not satisfy this gate.
- [ ] Check public, private and draft sample notes in HTML, markdown twins, graph and search output. Confirm private and draft notes are absent. Check research, pages and updates separately. These collections enter the engine’s graph regardless of visibility. Use invented content, never a private vault as launch material. **Partly checked October 1, 2026.** `npm run verify` found no private or draft route, twin or text anywhere in `dist`, including `backlinks.json`. The search index is compressed, so that scan does not prove search output. The starter has no research or pages collections.
- [ ] **Record an actual 20-second demonstration, still owed.** Capture the running wiki opening two panes, returning to the earlier note, a real graph command and the same note’s markdown source. Use [the observed Commune source](https://devon.md/notes/what-is-commune.md) or a verified starter URL. Save the recording’s location, date, revision and commands. Do not substitute animation, mock terminal output or invented footage. Label cuts or speed changes if used.
- [ ] Check that README and site starter links reach the same working instructions and show Node 22.12+, Astro 7, expected output and where to report trouble.
- [x] **Pinned feedback issue verified September 8, 2026.** [Tell me where it broke (#85)](https://github.com/dmthepm/commune-wiki/issues/85) was confirmed pinned through `gh graphql`. This records the observed state, not a pinning action. Accept comments there, use the [first-run form](../../.github/ISSUE_TEMPLATE/first-run.yml) for separate reports, and split reproducible bugs into focused issues as needed. Do not create a duplicate.

## Local checks and their limits

From the repository root, `pnpm test:starter` checks copying, destination safeguards and dependency declarations. The registry install test is skipped by default. Run `COMMUNE_STARTER_INSTALL=1 pnpm test:starter` to also copy into a temporary directory, install from npm, build and verify generated artifacts. This exercises the published package rather than the consumer fixture’s local file dependency. It does not establish browser behavior, another person’s first-run experience or the timed other machine proof above. Record the mode and actual result in any validation receipt.

## Evidence receipt

Copy this block into a dated file here or a public issue comment for each attempt. Use a voluntary name or identifier. A public wiki URL is optional. Keep logs sanitized.

```text
Date and tester identifier (optional):
Source channel (optional):
Instructions URL and source revision:
Machine / OS and version:
Node / npm or pnpm / Astro / Commune versions:
Prerequisite setup time:
Wiki setup elapsed time:
Exact steps and commands:
Expected result:
Actual result / stopping point:
Help or workaround needed:
Two linked public notes built and opened:
Panes / return navigation / backlinks / markdown source checked:
Resulting page or sanitized evidence location:
Follow-up fix or issue:
```

A completed receipt records what happened. Do not fill missing fields with assumed success or turn a successful build into a testimonial.

## Before workflow-specific claims

- [x] Run the installed skills from setup through capture, questions, revision, author review and the shipping boundary on public sample writing. Record installed versions and actual artifacts. The hand-run workflow before skills existed does not prove the installed path. Obtain the normal author instruction before a shipping action. **Run October 1, 2026** with Claude Code on a fresh starter wiki, engine 0.6.1, skills from `npx skills add dmthepm/commune-wiki`. Setup wrote `WRITING.md`, a dictated dump became a note through one round of questions and a review page, and ship built, gated, checked every new href and committed. The wiki had no remote, so the push and pull request were not exercised. The run found that ship assumed pnpm, fixed in #99.
- [ ] Observe a second person editing their own wiki again at least seven days after setup. Record an opt-in receipt. Downloads, forks and stars do not establish continued writing.
- [ ] Open a sample wiki in Obsidian, edit a note, rebuild and compare links. Follow with a real-size wiki trial before broader compatibility claims.
- [x] Test an upgrade from the initial starter package version to the next release and document any migration steps. **Tested October 1, 2026.** A starter made at 72ad67c on 0.5.2 moved to 0.6.1 with `npm install @dmthepm/commune@0.6.1`. Build, verify and check passed with no migration steps.
- [ ] Before calling commune.md a live second consumer, verify its deployed site, public source, dependency and component imports. Audit devon.md’s imports before making a “zero copied engine code” claim.

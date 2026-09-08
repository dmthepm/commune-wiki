# Launch evidence checklist

Status on September 8, 2026. This is a checklist for gathering evidence, not a record of completed installs or a posting schedule. The working demonstration is [devon.md](https://devon.md). First-run feedback already has a home. [Tell me where it broke (#85)](https://github.com/dmthepm/commune-wiki/issues/85).

The adoption research is kept separately in [docs/research/2026-09-08-commune-adoption](../research/2026-09-08-commune-adoption/). This checklist does not replace that research.

## Before broader distribution

- [ ] Verify the [starter](../../examples/starter/README.md) from the public instructions and a publicly available revision. It must install the published Commune package without local `file:` dependencies, build two linked public notes, and provide working panes, return navigation, backlinks and markdown sources.
- [ ] **Timed other machine proof, still owed.** Have someone follow those instructions on a machine other than Devon’s, with no inherited project dependencies or private configuration. Record OS, Node, package manager, Astro and Commune versions, source revision, prerequisite setup time, wiki setup time, exact steps, help needed, and the resulting page. Preserve failed attempts too. The launch gate is two linked notes built within ten minutes after the stated prerequisites are ready. Ten minutes is the acceptance target, not a measured install claim. A fresh directory, CI run or local fixture alone does not satisfy this gate.
- [ ] Check public, private and draft sample notes in HTML, markdown twins, graph and search output. Confirm private and draft notes are absent. Check research, pages and updates separately. These collections enter the engine’s graph regardless of visibility. Use invented content, never a private vault as launch material.
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

- [ ] Run the installed skills from setup through capture, questions, revision, author review and the shipping boundary on public sample writing. Record installed versions and actual artifacts. The hand-run workflow before skills existed does not prove the installed path. Obtain the normal author instruction before a shipping action.
- [ ] Observe a second person editing their own wiki again at least seven days after setup. Record an opt-in receipt. Downloads, forks and stars do not establish continued writing.
- [ ] Open a sample wiki in Obsidian, edit a note, rebuild and compare links. Follow with a real-size wiki trial before broader compatibility claims.
- [ ] Test an upgrade from the initial starter package version to the next release and document any migration steps.
- [ ] Before calling commune.md a live second consumer, verify its deployed site, public source, dependency and component imports. Audit devon.md’s imports before making a “zero copied engine code” claim.

## Distribution and follow-up

Recheck the current rules of each destination immediately before posting. Keep affiliation clear. Where a community requires original human writing, Devon must write the post himself. No public posts, messages, issue changes or deployments are authorized by this checklist alone.

Ask for one observable action. Build two linked notes, follow and return through panes, or report the first unclear step. Accept feedback in its originating thread and link reproducible failures to #85 or a focused issue. Never ask friends for stars or manufacture votes, testimonials, usage or install times. The shared build and CLI resolver reduces duplicated logic. It cannot promise links never drift or break. Existing package keywords already include `astro-integration` and `withastro`. Check discovery before proposing metadata work.

Track voluntary attempted installs, completed builds, first edits and return edits separately from stars. Keep unmeasured conversion rates and channel reach marked unknown. Review failures before expanding distribution. After ten reported attempts, if fewer than three complete, pause new distribution and repair onboarding. If a moderator rejects a post, stop that channel rather than reposting through another account.

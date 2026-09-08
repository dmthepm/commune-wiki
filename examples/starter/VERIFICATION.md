# Local verification receipt

Recorded 2026-09-08 on Devon’s machine: macOS / Darwin arm64, Node v22.23.1, npm 10.9.8. This is an automated local install and agent-operated browser check. It is not an independent human ten-minute test on another machine.

## Published install

From the repository:

```sh
node scripts/create-wiki.mjs /private/tmp/commune-starter-verify-20260908
cd /private/tmp/commune-starter-verify-20260908
npm install
npm run build
npm run verify
npx commune graph related src/content/notes/welcome.md --json
npm run preview -- --host 127.0.0.1 --port 4347
```

Installed published Commune 0.5.2, Astro 7.2.10, and markdown-remark 7.3.0. No repository-linked dependencies. The initial npm install reported 348 packages added in 17 seconds and zero vulnerabilities. The final sample builds successfully and passes `commune gate`.

Results: six HTML pages, four byte-identical markdown twins, four public graph entries, nine backlinks, both Welcome ↔ Connected notes wikilinks resolved, and private/draft samples absent from all tested public artifacts. The graph-related command resolved two outgoing links with zero unresolved links and three inbound references.

From the repository, `COMMUNE_STARTER_INSTALL=1 node --test tests/starter.test.mjs` passed all four tests after the copier guard fix. This includes a second isolated published install/build/semantic check and rejects existing destinations, symlinks, and copying inside the starter without creating partial files there. That final test run took about 10 seconds with local npm caches already warm.

## Browser checks

Preview: `http://127.0.0.1:4347/`. Installed directory: `/private/tmp/commune-starter-verify-20260908`.

Chrome checks at 1440 × 1000: Welcome → Connected notes opened a second pane; a link inside that fetched pane opened Writing in public as a third pane; backlinks populated in every pane; closing the third pane restored the second note’s URL; browser Back returned to Welcome. Search opened from the header, matched Connected notes, and closed with Escape. Below the 1024-pixel breakpoint, links used ordinary page navigation. The temporary viewport override was reset afterward.

The dark-mode screenshot was inspected in the tool response; no screenshot file was saved. Preview was left running and its browser tab retained for Devon at handoff. The process is local and temporary, not a deployment.

## Constraints observed

- The first sample used an aliased wikilink. `npx commune gate` rejected it with `FAIL: WikiLinks must use exact page titles`. This is the intentional canonical-title publication policy, also asserted in the repository’s tests, not a renderer defect. Samples now use exact titles; the README explains the policy.
- During sliding-pane navigation, the browser tab title remains that of the initial document, although the URL changes to the opened note.
- Closing a pane replaces the current history entry with the previous note URL; this can leave duplicate adjacent history entries, so the first Back after Close may stay on that same URL. A further Back returned to Welcome in this check.
- Search and backlinks depend on the generated graph; restart development after content changes or rebuild production output. Static search has no semantic AI endpoint.
- Only notes have a private/draft publication filter in Commune 0.5.2. Updates, research, and pages are public; repository access and files in `public/` are separate from note visibility.
- No unresolved install/build blocker remained on the tested machine. Another-machine human onboarding, deployment at a real domain, and broader browser/accessibility testing remain unproven.

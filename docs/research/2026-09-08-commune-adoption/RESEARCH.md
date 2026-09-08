# What would make someone keep using Commune

Research date 2026-09-08. This file records evidence for the adoption roadmap and can be adapted into a research page on devon.md. The shorter companion is DEVON-NOTE.md. Neither has been published.

## The finding

Commune has a plausible first audience among Astro builders who already keep markdown notes. The immediate job is publishing and maintaining connected writing. The most promising demonstration joins three things a visitor can inspect, a note in the browser, the same note as markdown, and the graph answering a question before a build.

That is an inference from the discussions below. It is not evidence that visitors will install, star the repository or keep writing. The first independent install and second edit are the tests of that inference.

## What we checked

We read the supplied issue, current README and changelog, Devon’s home note and writing rules, prior positioning research and supplied repository facts. We then read community-owned rules and discussion pages, newsletter issues, official distribution instructions and GitHub documentation.

The discussion window is March 8 through September 8, 2026. A thread’s publication date is distinct from the date we read it. Reddit and search results sometimes contain cached snapshots. We do not treat vote counts as current measures or as evidence of conversion. For HN items whose web pages failed to load, the HN Algolia item API supplied their dated text and replies.

The strongest dated coverage is Astro, DigitalGardens, ClaudeAI, ObsidianMD, PKMS and HN. We found no sufficiently specific dated demand thread for SideProject. The opensource sample was weak. Astro Discord’s public invite did not expose its rules or discussion history. X audience research is pending the optional Grok query. These are gaps in coverage, not findings of absent demand.

## Repository evidence

| Fact | Source and date read | Implication |
| --- | --- | --- |
| Six stars, one fork, npm 0.5.2 | [Supplied snapshot](repo-facts.txt), read 2026-09-08 | Use as the baseline. Count future stars separately from authors. |
| Description and topics already describe the engine, graph, skills and devon.md. Discussions are disabled | [Repository API](https://api.github.com/repos/dmthepm/commune-wiki), read 2026-09-08 | Do not spend a launch cycle fixing metadata that already exists. Record the fetched values below. |
| Astro integration, CLI and optional skills are distinct install paths | [README][repo], read 2026-09-08 | A skills install alone is not a new wiki. |
| Astro 7 and Node 22.12+ are required | [README][repo], read 2026-09-08 | Show prerequisites before starting the timer. |
| Minimal install route is plain markup. Components require further integration | [README][repo], read 2026-09-08 | Do not imply the three-file example produces devon.md’s panes. |
| Fixture depends on `file:../../..` | [Fixture package file][fixture], read 2026-09-08 | It proves a boundary against the local working tree. It is not a portable npm starter. |
| `astro-integration` and `withastro` are already package keywords | [Package file][package], read 2026-09-08 | Verify catalog discovery before adding a redundant submission task. |
| Build and CLI use the exported graph library | [README][repo], read 2026-09-08 | Shared resolution is a concrete design feature. It does not prove bug-free resolution. |
| Published content entries receive markdown twins. Handwritten routes do not | [README][repo], read 2026-09-08 | Avoid saying every possible site URL has a twin. |
| Only public notes enter the graph. Research, pages and updates are included regardless of visibility | [README][repo], read 2026-09-08 | Do not advertise a private-vault index or arbitrary vault publishing without a separate test. |
| Skills shipped September 4. Installed end-to-end use remains unverified | [CHANGELOG][changes] and [README][repo], read 2026-09-08 | Demonstrate the installed path before describing it as proven. |
| Version 0.5.1 fixes apostrophe targets and 0.5.2 fixes wrapping | [CHANGELOG][changes], read 2026-09-08 | Prefer measured reliability language over links never drift. |
| One consumer and zero copies are asserted in the supplied brief | [Brief](BRIEF.md), read 2026-09-08 | This session did not audit the consumer’s dependency tree and imports. Keep that check in the launch backlog. |

The live API description was “A personal wiki engine for Astro with a link graph, a CLI that finds connections while you write, and agent skills that turn dictated dumps into maintained notes. MIT. It runs devon.md.” Topics were agent-skills, astro, claude-code, digital-garden, knowledge-management, markdown, obsidian, personal-knowledge-management, static-site-generator and wiki. The homepage was devon.md and Discussions were disabled. [Repository API](https://api.github.com/repos/dmthepm/commune-wiki), read 2026-09-08.

The live [home page](https://devon.md), read 2026-09-08 through curl, matches the supplied working-notes voice. The linked [Commune markdown source](https://devon.md/notes/what-is-commune.md), read 2026-09-08 through curl, returns the source note. A guessed `/notes/commune.md` returned a missing-page document. That was a wrong guessed path, not evidence of a broken advertised link. Derive demonstration URLs from observed links.

## What people were discussing

**Customization and setup friction.** On May 9, a DigitalGardens author described starting with Obsidian’s Digital Garden plugin, feeling visually constrained and finding Quartz too complicated to set up. They built their own HTML site and later described reusable templates and a publishing plugin. The useful signal is a desire to control presentation while keeping an editing path. One post cannot establish broad dissatisfaction with Quartz. [Discussion](https://www.reddit.com/r/DigitalGardens/comments/1t7qh1n/taking_a_different_approach/), posted 2026-05-09, read 2026-09-08.

**Some gardeners want less technical work.** A June Blogger garden received a July 3 comment from someone seeking a solution with less tinkering. A July 10 publishing question received a reply asking whether the author was comfortable with terminal commands, and the author was not. These are counterexamples to treating all gardeners as likely Astro installers. [Blogger garden](https://www.reddit.com/r/DigitalGardens/comments/1ucgflu/blogger_digital_garden/), posted 2026-06-22, read 2026-09-08. [Publishing question](https://www.reddit.com/r/DigitalGardens/comments/1usiaq6/ideas/), posted 2026-07-10, read 2026-09-08.

**Astro builders discuss editing as well as hosting.** The April 16 AstroPress thread asks for a simpler complete experience for people accustomed to WordPress. Replies discuss headless CMSs, markdown and Obsidian. This supports serving the narrower developer who accepts files and code, while making the starter concrete. It does not show demand for another general CMS. [Discussion](https://www.reddit.com/r/astrojs/comments/1sn4wht/astropress/), posted 2026-04-16, read 2026-09-08.

**Markdown siblings already have distribution.** Astro Weekly’s May 17 issue featured an Astro integration with per-page markdown siblings, an llms.txt index and content negotiation. Its August 16 issue covered turning Starlight documentation into agent skills. These demonstrate editorial interest and competing work. They argue for explaining Commune’s writing graph and actual consumer, without claiming markdown twins or skills are unique. [Issue 131](https://newsletter.astroweekly.dev/p/astro-weekly-131), posted 2026-05-17, read 2026-09-08. [Issue 144](https://newsletter.astroweekly.dev/p/astro-weekly-144), posted 2026-08-16, read 2026-09-08.

**The official Astro ecosystem already has nearby tools.** August’s roundup lists `astro-content-links`, an Obsidiary vault integration, markdown-to-docs tools, an llms.txt helper and `starlight-to-skills`. A feature checklist alone will not distinguish Commune. The intended wedge is finding and checking connections while maintaining a personal wiki, with the same code used to publish. [Official August roundup](https://astro.build/blog/whats-new-august-2026/), August 2026, read 2026-09-08. Commune’s corresponding features are documented in [README][repo], read 2026-09-08.

**Claude users want inspectable writing artifacts.** A July 9 canvas project keeps notes as markdown and discusses messy exploration followed by clean takeaways. A March 14 thread describes avoiding unnecessary Word document conversion when the useful output is markdown. These are experiences, not controlled benchmarks. [Canvas discussion](https://www.reddit.com/r/ClaudeAI/comments/1us2mxw/i_built_a_canvas_frontend_for_claude_on_the_agent/), posted 2026-07-09, read 2026-09-08. [Markdown discussion](https://www.reddit.com/r/ClaudeAI/comments/1rtpww1/stopped_asking_claude_for_word_docs_and_my/), posted 2026-03-14, read 2026-09-08.

**Context maintenance is a stated problem.** A September 1 PKMS author describes losing earlier context and moving information between ChatGPT and Claude. Replies suggest durable markdown. The fetched thread had 20 comments and a score of zero. This is a specific pain statement with a small sample, not proof of broad popularity. [Discussion](https://old.reddit.com/r/PKMS/comments/1w4rav6/how_do_you_guys_manage_ai_memorycontext/), posted 2026-09-01, read 2026-09-08.

**Obsidian discussion contains demand and resistance.** An April 10 LLM Wiki plugin post describes local processing and answers linked to source notes. A June 20 discussion questions whether outsourcing linking and refinement helps human understanding. Preserve originals and demonstrate the author’s decisions. Avoid promising that an agent can do the understanding for them. [Plugin discussion](https://www.reddit.com/r/ObsidianMD/comments/1shntdn/new_plugin_llm_wiki_turn_your_vault_into_a/), posted 2026-04-10, read 2026-09-08. [LLM wiki discussion](https://www.reddit.com/r/ObsidianMD/comments/1uai1w2/karpathys_llm_wiki_setup/), posted 2026-06-20, read 2026-09-08.

**A current Obsidian roundup is available.** The July 21 This Week in Obsidian issue includes Digital Garden and Claudian. Its repository accepts content suggestions through issues. The form explicitly asks whether the submitter is affiliated. This gives a concrete editorial route after an Obsidian round trip is demonstrated. [Issue 31](https://thisweekinobsidian.substack.com/p/this-week-in-obsidian-31), posted 2026-07-21, read 2026-09-08. [Submission form source](https://github.com/boundless-forest/this-week-in-obsidian/blob/main/.github/ISSUE_TEMPLATE/content-suggestion.yml), read 2026-09-08 through GitHub API.

**llms.txt discussion does not establish crawler adoption.** HN’s June 5 replies distinguish individual agents reading documentation from providers crawling sites. Some report useful requests and some report none. One commenter wants markdown without JavaScript bundles. Use a direct endpoint demonstration as evidence. Do not turn these anecdotes into a universal performance or discovery claim. [Discussion](https://news.ycombinator.com/item?id=48410783), posted 2026-06-05, read 2026-09-08 through [item API](https://hn.algolia.com/api/v1/items/48410783), read 2026-09-08.

**Single-maintainer projects can attract skepticism and support.** The April 23 HN thread includes a harsh prediction of short project life and several replies defending individual builders. Quoting the hostile response alone would misrepresent the conversation. A working personal dependency and visible response to users address the concern more usefully than promising indefinite maintenance. [Discussion](https://news.ycombinator.com/item?id=47883025), posted 2026-04-23, read 2026-09-08 through [item API](https://hn.algolia.com/api/v1/items/47883025), read 2026-09-08.

## How the rules change the plan

HN, ObsidianMD, PKMS, Zettelkasten and opensource prohibit generated prose or AI-created content. Their public posts need Devon’s original writing, not this document’s paste-ready drafts. The top four drafts therefore serve Astro Reddit, DigitalGardens, ClaudeAI and Astro Weekly. Full quoted rules, URLs, reading dates and access gaps are retained in [OUTPUT.md](OUTPUT.md) and [EXPANSION-RESEARCH.md](EXPANSION-RESEARCH.md), read 2026-09-08.

Do not read the DigitalGardens sidebar’s silence on promotion as a guarantee of acceptance. The recommended garden tour is a judgment based on the sidebar and comparable discussion. Do not infer Discord rules from Astro’s public showcase invitation. No current in-server rule was readable here.

The old Obsidian Roundup introduction was written in 2021. We did not verify an active current submission route for that publication. This Week in Obsidian is a separate, current target, supported by the issue and form above. [Older introduction](https://forum.obsidian.md/t/obsidian-roundup-weekly-newsletter-for-tips-news-resources/17782), read 2026-09-08.

## Assessing the Grok suggestions

| Suggestion | Assessment | Action |
| --- | --- | --- |
| Starter before broad promotion | Supported by the local file dependency and current manual setup | Build a portable starter with published dependencies. |
| A recording and clearer README | Reasonable test, no measured conversion uplift here | Show the outcome and record first-screen questions. |
| commune.md | Strong proposed separation of product explanation and personal writing | Make it a public package consumer and source example. |
| Discussions are off | Verified by repository API above | Enable when open-ended questions justify a second venue. |
| 621 X followers and unused distribution | Not verified | Use Grok for original posts and relevant people, not assumed reach. |
| Forty to eighty stars in one day | Unsupported forecast | Measure qualified attempts and completion. |
| Tuesday morning ET is best | No official rule found | Post when Devon can respond. Treat time as an experiment. |
| One Show HN ever | Incorrect as a blanket claim | Follow the repeat guidance in the expansion research. |
| Friends for the first stars | Conflicts with issue 84 | Preserve the no-friend-star request rule. |
| Add withastro and Astro keywords | Already present in package file | Check whether the catalog already lists it. |
| GitHub traffic proves bounce reasons | Unsupported interpretation | Collect voluntary failure reports. |
| Twenty messages yield fifteen to twenty-five stars | Unsupported conversion forecast | Use a small relevance-based outreach experiment only where welcome. |

These judgments compare the supplied Grok text with the cited repository files and primary evidence. They do not assert that every tactic is ineffective.

## Implementation order for commune.md and the starter

This is a proposed backlog with acceptance criteria. Nothing in this section has been implemented during the research task.

**P0 portable starter.** Copy the fixture’s useful structure into a separately usable starter, replace the local dependency with the tested npm release, and include three public notes and one update. Include the fuller pane interface, backlinks, markdown links and working check commands. Pin the initial versions used for the timed test. Document where content belongs and what public means. Success is a fresh download outside the source repository building without access to Devon’s files.

**P0 first use.** Test on another machine with no inherited project settings or dependencies. Start from the public instructions. Record the exact steps, prerequisite time and project setup time separately. The ten minute path should start from its stated prerequisites. One participant choosing a folder, changing a note and following the built link provides stronger evidence than CI alone. Keep failed attempts too.

**P0 product site.** Implement the five routes in OUTPUT.md. Use Commune as a dependency, make the site source public and keep sample content small enough to understand. Put the testable artifact in the hero. The primary action reaches the starter in one click. A visitor should be able to identify the audience, prerequisites and expected output without reading integration internals.

**P0 visible state.** Show tested versions and the last verified install date. List the unproven skills loop until the installed path is tested. Use a real issue link only after it exists. Keep the live demonstration navigable without login.

**P1 writing proof.** Record a short public dump, an interview answer, a note diff and the resulting links. Separate author decisions from agent suggestions. Confirm the installed skills follow the review boundary and create a PR without merging. This becomes the Claude demonstration and the Writing page.

**P1 upgrades.** Before recruiting many authors, test an upgrade from the first starter version to the next release. Keep at least one older consumer fixture. Describe changed behavior and required actions. An author who can create a wiki but cannot maintain it has not received the mission’s promised outcome.

**P1 feedback and measurement.** Start with one pinned failure issue. Later add Questions and Show your wiki Discussions with a short welcome. GitHub documents Discussions as a venue for open-ended questions and community conversation, while issues track scoped work. [GitHub guidance](https://docs.github.com/en/get-started/using-github/communicating-on-github), read 2026-09-08. The decision to stage these surfaces is a capacity judgment.

**P2 discovery.** Verify the automatic integration listing. Submit the completed site to Astro’s showcase. Propose a concise tool entry to relevant lists after reading their current contribution instructions. Submit actual gardens to garden lists. Treat each acceptance as an editorial decision. The concrete routes are preserved in [EXPANSION-RESEARCH.md](EXPANSION-RESEARCH.md), read 2026-09-08.

**P2 Product Hunt.** Use only once the interactive site and starter work and there is time to support another launch surface. Prepare the maker assets and account in advance. Do not count it as a source of qualified users until reports support that. The official scheduling and eligibility requirements are in the expansion research.

## Measuring continued use

Save a weekly ledger with date, source channel, voluntary tester identifier, install attempted, own wiki built, first edit, second edit after seven days, recent-month edit and linked report. Record total and qualifying stars separately. Never treat a fork, download or page view as a person writing.

A GitHub visitor may read and leave successfully. Someone reading an issue may find an answer without commenting. Traffic cannot establish bounce rate or intent. GitHub shows visitors, full clones, referrers and popular content for the last 14 days. Save snapshots weekly if comparing launch periods. [Traffic documentation](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository), read 2026-09-08.

On commune.md, proposed anonymous events are starter opened, demo opened, docs opened and GitHub opened, with source tags. An outbound starter click is still not an install. Use voluntary completion receipts to connect acquisition with results. Do not add mandatory accounts or silent tracking inside someone’s wiki to answer a marketing question.

The roadmap’s activation and retention targets are assumptions. At ten reported attempts, inspect where people stopped. At two returning cohorts, inspect whether they edited again. At fifty activations, replace the illustrative funnel rates with observed rates and uncertainty. If there is too little evidence, report too little evidence.

## What would change the recommendation

Astro falls in priority if technically qualified people repeatedly fail the starter or decide they prefer simpler static generators after understanding the difference. The skills angle rises if outside authors repeatedly use the interview and return a week later. The broader Obsidian audience rises only after its editing and publishing round trip works with ordinary notes and the community’s rules permit the discussion.

Grok’s requested X sample should provide original URLs, dates, exact pain statements, current tools and explicit invitations to suggest projects. We will treat each returned post as a lead to verify. Follower counts, repost counts and a model’s audience description alone are insufficient to justify outreach.

[repo]: ../../../README.md
[changes]: ../../../CHANGELOG.md
[fixture]: ../../../tests/fixtures/consumer/package.json
[package]: ../../../package.json


## Implementation update on September 8

The proposed starter now exists locally in [examples/starter](../../../examples/starter/README.md), read 2026-09-08. It uses published Commune 0.5.2 with Astro 7.2.10 and has three linked public notes, an update, private and draft fixtures, generic navigation, package panes and static search. The copier creates a separate project and refuses existing destinations or paths inside the starter, including paths through symlinks.

The [local verification receipt](../../../examples/starter/VERIFICATION.md), read 2026-09-08, records a published npm install, six built HTML pages, four markdown twins and nine backlinks. Four automated tests passed. An agent checked pane navigation, backlinks, search and narrower-screen navigation in Chrome. This happened on Devon’s machine. It does not satisfy the independent human install gate.

The [README](../../../README.md), [contribution instructions](../../../CONTRIBUTING.md) and [first-run form](../../../.github/ISSUE_TEMPLATE/first-run.yml), read 2026-09-08, now lead readers to the starter and a specific feedback path. Issue 85 already existed and was pinned when checked. No duplicate issue was created. The [launch checklist](../../../docs/launch/README.md), read 2026-09-08, preserves the outstanding proof requirements.

Commune.md is in a three-concept design round. A concept image is not a deployed package consumer or a recording of working software. The twenty-second demonstration and outside-author return edit remain outstanding. No social posts have been sent. [X-LEADS.md](X-LEADS.md), read 2026-09-08, preserves supplied thread links and conditional reply drafts, with browser verification still unavailable.

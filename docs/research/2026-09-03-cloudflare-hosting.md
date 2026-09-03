# Cloudflare hosting for devon-wiki: Pages vs Workers, devon.md cutover, free-plan limits

Research date: **2026-09-03**. Every fact below is sourced to a Cloudflare-owned page
(`developers.cloudflare.com`, `blog.cloudflare.com`) or to Astro's own docs
(`docs.astro.build`), each with the URL and the date it was fetched. Where the docs are
silent, that is said outright rather than filled in.

Ticket: dmthepm/commune-wiki#37. Map: #2.

---

## Summary and recommendation

**Migrate devon-wiki from Cloudflare Pages to a Workers static-assets project, on the free
plan, with `devon.md` as a Worker Custom Domain, and leave `devonmeadows.com` as a
redirect-only zone carrying a single wildcard-free dynamic Redirect Rule.**

The four facts that decide it:

1. **Cloudflare says so, in its own words, on the Pages landing page.** "Workers supports
   most Pages use cases and offers a broader feature set. It is Cloudflare's primary
   platform for building applications. Start new projects with Workers."
   (<https://developers.cloudflare.com/pages/>, fetched 2026-09-03.) There is a first-party
   migration guide with a compatibility matrix, and Astro's own deploy guide repeats the
   recommendation.

2. **Real 404s are a config flag on Workers and are currently broken in production.** A
   live probe of `https://devonmeadows.com/definitely-not-a-real-page-xyz` on 2026-09-03
   returned **HTTP 200** with the homepage HTML — the site has no `dist/404.html` at all,
   so unknown paths are being answered `200 OK`. On Workers this is fixed declaratively:
   `assets.not_found_handling = "404-page"` makes Workers "serve the contents of the
   nearest `404.html` file with a `404 Not Found` status"
   (<https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/>,
   fetched 2026-09-03). Pages inferred this behaviour by sniffing the output directory;
   Workers makes it explicit and committable, which is exactly what "a reproducible
   'here is my Cloudflare setup' for strangers" needs.

3. **Cost is not a differentiator, and the free plan is genuinely free for this site.**
   "Requests to static assets are free and unlimited."
   (<https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>,
   fetched 2026-09-03.) With no `main` script and no `run_worker_first`, devon-wiki will
   never invoke a Worker, so the free plan's 100,000 requests/day cap is not engaged at
   all. There are no egress or bandwidth charges
   (<https://developers.cloudflare.com/workers/platform/pricing/>, fetched 2026-09-03).

4. **The one real regression is branch previews, and it is small.** Pages gives
   `<branch>.devon-wiki.pages.dev` for free. Workers gives *versioned* preview URLs shaped
   `<VERSION_PREFIX>-<WORKER_NAME>.<SUBDOMAIN>.workers.dev` — a new hostname per push, not
   per branch. Stable per-branch hostnames require aliases, and the compatibility matrix
   lists "Custom Branch Aliases" as ⏳ **Coming soon** for Workers vs ✅ for Pages
   (<https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/>,
   fetched 2026-09-03). The workaround is documented-adjacent but not documented as a
   recipe: set the non-production branch deploy command to
   `npx wrangler versions upload --preview-alias $WORKERS_CI_BRANCH`, using the
   `WORKERS_CI_BRANCH` variable Workers Builds injects. See §2 and *Open questions*.

Secondary reasons that favour Workers for this specific site: `_redirects` and `_headers`
are supported natively (§4); `.md` content-type can be pinned deterministically with
`_headers` rather than relying on undocumented MIME inference (§4); the whole hosting
config lives in a committed `wrangler.jsonc` instead of dashboard fields; and Workers Logs,
Logpush, and Gradual Deployments are Workers-only per the compatibility matrix.

**What does *not* move and stays a dashboard/zone concern either way:** the
`devonmeadows.com` → `devon.md` 301. That must be a zone-level Redirect Rule on the old
zone (§5); `_redirects` explicitly does **not** do domain-level redirects.

---

## Q1 — Does Cloudflare recommend Pages or Workers for a new static site in 2026? Is there a migration path?

### The recommendation, quoted exactly

From the Cloudflare Pages documentation landing page, in a callout headed
"Are you sure you want to use Pages?":

> **"Workers supports most Pages use cases and offers a broader feature set. It is
> Cloudflare's primary platform for building applications. Start new projects with
> Workers."**

Source: <https://developers.cloudflare.com/pages/> (page last updated Aug 25, 2026; fetched
2026-09-03).

Astro's deploy guide repeats it:

> "Cloudflare recommends using Cloudflare Workers for new projects. For existing Pages
> projects, refer to Cloudflare's migration guide and compatibility matrix."

Source: <https://docs.astro.build/en/guides/deploy/cloudflare/> (fetched 2026-09-03).

Note the shape of the claim: it is a recommendation for **new projects**. Nowhere in the
pages I fetched does Cloudflare say Pages is deprecated, end-of-life, or scheduled for
shutdown, and nowhere does it instruct existing Pages users to migrate. Pages is still
described as "Available on all plans" and still receives docs updates (the Pages index was
last updated 2026-08-25). **Staying on Pages is not against Cloudflare's stated advice for
an existing project.** The case for migrating devon-wiki is the 404 behaviour and the
config-as-code goal, not an imminent deprecation.

### The migration guide

Yes, there is a first-party guide: **"Migrate from Pages to Workers"** at
<https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/>
(last updated Aug 14, 2026; fetched 2026-09-03). It includes the compatibility matrix and
an experimental LLM prompt at
<https://developers.cloudflare.com/workers/prompts/pages-to-workers.txt>.

Cost framing from that guide:

> "Like Pages, requests for static assets on Workers are free, and Pages Functions
> invocations are charged at the same rate as Workers, so you can expect a similar cost
> structure."

> "Unlike Pages, Workers has a distinctly broader set of features available to it,
> (including Durable Objects, Cron Triggers, and more comprehensive Observability)."

### Can the custom domain move?

Yes, with a caveat that matters here:

> "If your domain's nameservers are managed by Cloudflare, you can, like Pages, configure a
> custom domain for your Worker."

> **"Unlike Pages, Workers does not support any domain whose nameservers are not managed by
> Cloudflare."**

Source: same migration guide, fetched 2026-09-03. The compatibility matrix row
"Custom domains outside Cloudflare zones" is ❌ for Workers, ✅ for Pages.

`devon.md`, `commune.md` and `devonmeadows.com` are all zones in Devon's Cloudflare account,
so this restriction does not bite. It does mean the Workers route is a one-way door for any
future domain not on Cloudflare nameservers.

The docs do **not** describe a zero-downtime handover of a hostname from a Pages project to
a Worker. What they say is that Custom Domains cannot be created on a hostname with an
existing CNAME record or on a zone you do not own
(<https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>, fetched
2026-09-03) — which implies the Pages custom domain must be removed before the Worker
Custom Domain can claim the same hostname. **The exact cutover ordering and the downtime
window are not documented.** See *Open questions*. For devon-wiki this is moot in practice:
`devon.md` is a brand-new hostname with no Pages attachment, so the Worker Custom Domain can
be created cleanly and `devonmeadows.com` is separately detached afterwards.

### Can git integration move?

Yes, and the guide is explicit about the order:

> "If you are using Pages' built-in CI/CD system, you can swap this for Workers Builds by
> first connecting your repository to Workers Builds and then disabling automatic
> deployments on your Pages project."

Rollout, per the same guide: "Once you have validated the behavior of Worker, and are
satisfied with the development workflows, and have migrated all of your production traffic,
you can delete your Pages project in the Cloudflare dashboard or with Wrangler:
`npx wrangler pages project delete`."

### Migration steps the guide lists

1. Swap any Pages-specific framework adapter for the Workers equivalent (N/A for a static
   Astro build — see §8).
2. Create `wrangler.jsonc` / `wrangler.json` / `wrangler.toml` with `name` and
   `compatibility_date`.
3. Replace `pages_build_output_dir` with `assets.directory`.
4. Set serving behaviour explicitly: "Pages would automatically attempt to determine the
   type of project you deployed… In Workers, to prevent accidental misconfiguration, this
   behavior is explicit and must be set up manually."
5. Optionally add `.assetsignore` (Pages auto-excluded `node_modules`, `.DS_Store`, `.git`).
6. Handle Pages Functions (N/A here).
7. Swap `wrangler pages dev`/`wrangler pages deploy` for `wrangler dev`/`wrangler deploy`.
   Note the port change: "`wrangler pages dev` will, by default, expose the local
   development server at `http://localhost:8788`, whereas `wrangler dev` will expose it at
   `http://localhost:8787/`."
8. Connect Workers Builds, disable Pages automatic deployments.
9. Enable preview URLs + non-production branch builds.
10. Move `_headers` / `_redirects` into the static asset directory (they already are).
11. Configure `workers.dev` subdomain in place of `pages.dev`.
12. Add the Custom Domain.
13. Delete the Pages project.

### Compatibility matrix rows that matter for a static wiki

From the migration guide (fetched 2026-09-03). Legend: ✅ supported, ⏳ coming soon,
🟡 unsupported/workaround, ❌ unsupported.

| Feature | Workers | Pages |
| --- | --- | --- |
| Custom HTTP headers for static assets (`_headers`) | ✅ | ✅ |
| Redirects (`_redirects`) | ✅ | ✅ |
| Rollbacks | ✅ | ✅ |
| Preview URLs | ✅ | ✅ |
| Gradual Deployments | ✅ | ❌ |
| Cloudflare Vite plugin | ✅ | ❌ |
| Workers Logs / Logpush / Tail Workers / Source Maps | ✅ | ❌ |
| Serve assets on a path (subdirectory) | ✅ | ❌ |
| Custom domains / custom subdomains | ✅ | ✅ |
| Custom domains outside Cloudflare zones | ❌ | ✅ |
| Non-root routes | ✅ | ❌ |
| Branch Deploy Controls | 🟡 | ✅ |
| **Custom Branch Aliases** | **⏳** | **✅** |
| Build Caching / Build Watch Paths / Deploy Hooks / Monorepos | ✅ | ✅ |
| Early Hints | 🟡 | ✅ |

The matrix's own preamble: "Unless otherwise stated below, what works in Pages works in
Workers, and what works in Workers works in Pages."

Footnote 4, on Branch Deploy Controls: "Workers Builds supports enabling non-production
branch builds, though does not yet have the same level of configurability as Pages does."

**Cloudflare Web Analytics does not appear anywhere in the compatibility matrix.** See §6.

---

## Q2 — Workers Builds: push-to-deploy, branch previews, build image, free-plan limits

Sources, all fetched 2026-09-03:
- <https://developers.cloudflare.com/workers/ci-cd/builds/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/build-image/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/>
- <https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/>

### Push-to-deploy

> "Cloudflare supports connecting your GitHub and GitLab repository to your Cloudflare
> Worker, and will automatically deploy your code every time you push a change."

GitHub and GitLab only; self-hosted instances are not supported. Bitbucket and others need
an external CI provider driving `wrangler deploy`.

Production branch: "Every push event made to this branch will trigger a build and execute
the build command, followed by the deploy command." Default deploy command is
`wrangler deploy`.

Non-production branches are **off by default**: "commits made on the production git branch
will produce a Workers Build. If you want to take advantage of preview URLs and pull request
comments, you can additionally enable 'non-production branch builds' in order to trigger a
build on all branches of your repository." The toggle lives in
**Settings → Build → Branch control → "Builds for non-production branches"**.

### Preview URLs and their format

Two kinds, both on the same hostname shape:

> "Both preview URL types follow the format:
> `<VERSION_PREFIX OR ALIAS>-<WORKER_NAME>.<SUBDOMAIN>.workers.dev`."

- **Versioned:** `<VERSION_PREFIX>-<WORKER_NAME>.<SUBDOMAIN>.workers.dev` — auto-generated
  per version, so it changes on every push.
- **Aliased:** `<ALIAS>-<WORKER_NAME>.<SUBDOMAIN>.workers.dev` — "a static, human-readable
  alias that you can manually assign to a Worker version." Created only at upload time via
  `wrangler versions upload --preview-alias staging`. "A common workflow would be to assign
  an alias for the branch that you're working on."

Alias rules: lowercase letters, numbers and dashes; must begin with a lowercase letter;
`alias + "-" + worker name` ≤ 63 characters (DNS label limit); only the 1,000 most recently
deployed aliases are retained.

Preview URLs are enabled by default when `workers_dev` is enabled, and are **public** unless
protected with Cloudflare Access. Only available for versions uploaded after 2024-09-25.
Minimum Wrangler 3.74.0 for versioned, 4.21.0 for aliased.

**This is the concrete loss versus Pages.** There is no documented automatic
`<branch>.<project>.workers.dev`. The non-production branch deploy command "defaults to
`npx wrangler versions upload`, producing a preview URL" — a versioned one. Workers Builds
injects `WORKERS_CI_BRANCH` (`<branch-name-from-push-event>`) as a default build variable,
alongside `CI`, `WORKERS_CI`, `WORKERS_CI_BUILD_UUID` and `WORKERS_CI_COMMIT_SHA`, so
`npx wrangler versions upload --preview-alias $WORKERS_CI_BRANCH` is the obvious composition.
**Cloudflare does not document that composition as a supported recipe**, and branch names
containing `/` (e.g. `feat/foo`) would violate the alias character rules. See
*Open questions*.

### Build image defaults

Preinstalled defaults, from the build image page:

| Tool | Default version |
| --- | --- |
| Node.js | 24.18.0 |
| pnpm | 10.11.1 |
| npm | 10.9.2 |
| Yarn | 4.9.1 |
| Bun | 1.2.15 |
| Python | 3.13.3 |
| Go | 1.24.3 |

The image preinstalls Node.js 22.23.2 and 24.18.0.

### Pinning versions

Two documented mechanisms:

1. **Environment variable.** "Find the environment variable name for the language or tool
   and desired version (e.g. `NODE_VERSION = 22`)". `PNPM_VERSION` is the pnpm equivalent.
   Set these as build variables in **Settings → Build → Build variables and secrets**.
2. **Version file in the repo root.** "Add the specified file name to the root directory and
   set the desired version number as the file's content." For Node.js the accepted files are
   `.nvmrc` and `.node-version`.

Wrangler's own version is taken from `package.json`: "Workers Builds will use the Wrangler
version set in your package.json."

Note: `package.json` `packageManager` is **not** named in the build-image page I fetched as
a pnpm pinning mechanism — `PNPM_VERSION` is. Treat `packageManager` as unverified here.

Note: "Currently, Workers Builds does not honor the configurations set in Custom Builds
within your Wrangler configuration file."

### Free-plan build limits

| Limit | Free | Paid |
| --- | --- | --- |
| Build minutes / month | **3,000** | 6,000 (+$0.005/min overage) |
| Concurrent builds | **1** | up to 6 |
| Build timeout | 20 minutes | 20 minutes |
| CPU | 2 vCPU | 4 vCPU |
| Memory | 8 GB | 8 GB |
| Disk | 20 GB | 20 GB |
| Environment variables | 64 | 64 |
| Variable size | 5 KB | 5 KB |

Compare Cloudflare Pages free (<https://developers.cloudflare.com/pages/platform/limits/>,
fetched 2026-09-03): **500 builds per month**, 1 build at a time, 20-minute timeout. The
units differ — Pages counts builds, Workers Builds counts minutes. For a wiki whose build is
a couple of minutes, 3,000 minutes/month is far more headroom than 500 builds/month, but
enabling non-production branch builds multiplies consumption by branch activity.

---

## Q3 — Custom domains as code

Source: <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>
and <https://developers.cloudflare.com/workers/wrangler/configuration/>, both fetched
2026-09-03.

### What a Custom Domain is

> "Custom Domains allow you to connect your Worker to a domain or subdomain, without having
> to make changes to your DNS settings or perform any certificate management. **After you
> set up a Custom Domain for your Worker, Cloudflare will create DNS records and issue
> necessary certificates on your behalf.** The created DNS records will point directly to
> your Worker. Unlike Routes, Custom Domains point all paths of a domain or subdomain to
> your Worker."

So yes — **DNS records are auto-created**, and so are certificates. Confirmed twice:
"After you have added the domain or subdomain, Cloudflare will create a new DNS record for
you. You can add multiple Custom Domains."

### Does the zone have to be in the same account?

Requirements to add a Custom Domain: "1. An active Cloudflare zone. 2. A Worker to invoke."

And the constraint:

> **"You cannot create a Custom Domain on a hostname with an existing CNAME DNS record or on
> a zone you do not own."**

Combined with the migration guide's "Workers does not support any domain whose nameservers
are not managed by Cloudflare", the practical reading is: the zone must be an active
Cloudflare zone you own. **The docs do not spell out a cross-*account* scenario** (zone in
account A, Worker in account B) — they say "a zone you do not own", not "a different
account". Treat cross-account as unverified; it is not relevant here since all three zones
are in Devon's account.

### The exact snippet

`wrangler.jsonc`:

```jsonc
{
	"routes": [
		{
			"pattern": "shop.example.com",
			"custom_domain": true
		}
	]
}
```

`wrangler.toml`:

```toml
[[routes]]
pattern = "shop.example.com"
custom_domain = true
```

Multiple domains stack as additional array entries. From the Wrangler configuration
reference:

- `pattern` `string` **required** — "The pattern that your Worker should be run on, for
  example, `"example.com"`."
- `custom_domain` `boolean` optional — "Whether the Worker should be on a Custom Domain as
  opposed to a route. Defaults to `false`."

### Certificate lifecycle gotcha

Cloudflare issues Advanced Certificates automatically, but deletion is not symmetric: when a
Custom Domain is deleted the associated Advanced Certificate is **not** automatically
deleted and must be removed manually via dashboard or API. Relevant if
`devonmeadows.com` is ever attached to the Worker and then detached.

### Limits

| Limit | Value |
| --- | --- |
| Custom domains per zone | 100 |
| Routes per zone | 1,000 |

Source: <https://developers.cloudflare.com/workers/platform/limits/> (fetched 2026-09-03).
"If you require more than 100 custom domains per zone, consider using a wildcard route."

---

## Q4 — Static assets behaviour on Workers

Sources, all fetched 2026-09-03:
- <https://developers.cloudflare.com/workers/static-assets/>
- <https://developers.cloudflare.com/workers/static-assets/binding/>
- <https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/>
- <https://developers.cloudflare.com/workers/static-assets/headers/>
- <https://developers.cloudflare.com/workers/static-assets/redirects/>
- <https://developers.cloudflare.com/workers/platform/limits/>

### Assets-only Worker (no script) — yes, this exists

The default routing rule:

> "By default, if a requested URL matches a file in the static assets directory, that file
> will be served — without invoking Worker code. If no matching asset is found and a Worker
> script is present, the request will be processed by the Worker… **If no Worker script is
> present, a `404 Not Found` response is returned.**"

And from the migration guide:

> "If your Worker will only contain assets and no Worker script, then you should remove the
> `"binding": "ASSETS"` field from your configuration file, since this is only valid if you
> have a Worker script indicated by a `main` property."

So an assets-only Worker is a first-class configuration: omit `main`, omit `assets.binding`.
This is the right shape for devon-wiki, and it is why the free plan's 100,000 requests/day
never comes into play.

### `not_found_handling`

From the Wrangler configuration reference:

> `not_found_handling`: `"single-page-application" | "404-page" | "none"` optional,
> **defaults to `"none"`**

- `"none"` (default) — no asset match and no Worker script → plain `404 Not Found`, with no
  custom body.
- `"404-page"` — "Sets your application to return a `404 Not Found` response with the
  nearest `404.html` for requests which don't match a static asset." Expanded on the SSG
  page: "When an incoming request does not match a file in the `assets.directory`, Workers
  will serve the contents of the nearest `404.html` file with a `404 Not Found` status."
  **This is how a `404.html` becomes a real 404** — status and body together, no Worker code.
- `"single-page-application"` — "Sets your application to return a `200 OK` response with
  `index.html` for requests which don't match a static asset." This is the wrong choice for
  a wiki, and is effectively what devon-wiki is doing today by accident (live probe returned
  200 + homepage HTML for a nonexistent path on 2026-09-03).

"Nearest" is Cloudflare's word; the docs do not define the search order for nested
`404.html` files beyond that adjective. A single `dist/404.html` at the root avoids the
question entirely.

### `html_handling`

> "`assets.html_handling` defaults to `auto-trailing-slash` and this will usually give you
> the desired behavior automatically: individual files (e.g. `foo.html`) will be served
> *without* a trailing slash and folder index files (e.g. `foo/index.html`) will be served
> *with* a trailing slash. Alternatively, you can force trailing slashes
> (`force-trailing-slash`) or drop trailing slashes (`drop-trailing-slash`) on requests for
> HTML pages."

Astro's default static build emits `notes/foo/index.html`, so `auto-trailing-slash` produces
`/notes/foo/` — matching current Pages behaviour and the canonical URLs already in the
sitemap.

### `run_worker_first`

Two forms:
- `true` — invoke the Worker script for all requests.
- an array of route patterns with `!`-prefixed exceptions, e.g.
  `["/api/*", "!/api/docs/*"]`.

"Common uses for `run_worker_first` include authentication checks, A/B testing, and
injecting bootstrap data into your SPA shell."

**Do not set it here.** The billing page's warning is explicit: "When using
`run_worker_first`, requests matching the specified patterns will always invoke your Worker
script. If you exceed your free tier request limits, these requests will receive a 429 (Too
Many Requests) response instead of falling back to static asset serving." An assets-only
Worker with no `run_worker_first` cannot hit that failure mode.

### `_redirects` — supported, with one disqualifying limitation

> "To apply custom redirects on a Worker with static assets, declare your redirects in a
> plain text file called `_redirects` without a file extension, in the static asset
> directory of your project. This file will not itself be served as a static asset, but will
> instead be parsed by Workers and its rules will be applied to static asset responses."

Placement: the framework's `public/` or `static/` directory works, because those are copied
into the output directory at build time. For devon-wiki that means `public/_redirects` →
`dist/_redirects`, exactly as today.

Format: `[source] [destination] [code?]`, one per line, `#` for comments, **default status
code 302**.

Limits (also in the platform limits table, identical Free and Paid):

| Limit | Value |
| --- | --- |
| Static redirects | 2,000 |
| Dynamic redirects | 100 |
| Total | 2,100 |
| Characters per rule | 1,000 |

Ordering rules: "The order of your redirects matter. If there are multiple redirects for the
same `source` path, the top-most redirect is applied. Static redirects should appear before
dynamic redirects. Redirects are always followed, regardless of whether or not an asset
matches the incoming request."

Feature support table from the redirects page:

| Feature | Support |
| --- | --- |
| Redirects (301, 302, 303, 307, 308) | ✅ |
| Rewrites (other status codes) | ❌ |
| Splats (`*` → `:splat`) | ✅ |
| Placeholders (`:name`) | ✅ |
| Query Parameters | ❌ |
| Proxying (status 200) | ✅ |
| **Domain-level redirects** | **❌** |
| Redirect by country or language | ❌ |
| Redirect by cookie | ❌ |

**Domain-level redirects are ❌.** The documented non-example is
`workers.example.com/* workers.example.com/blog/:splat 301`. This is the reason the
`devonmeadows.com` → `devon.md` 301 cannot live in `public/_redirects` and must be a
zone-level Redirect Rule (§5).

Second caveat, new relative to Pages: "Redirects defined in the `_redirects` file are not
applied to requests served by your Worker code, even if the request URL matches a rule."
Irrelevant for an assets-only Worker.

### `_headers` — supported

Same placement story ("a plain text file called `_headers` without a file extension, in the
static asset directory"), same "not itself served as a static asset" behaviour, and
crucially: **"Headers defined in the `_headers` file override what Cloudflare ordinarily
sends."**

Syntax is a URL/pattern line followed by indented `Name: Value` lines. Splats and
placeholders work the same as `_redirects`, and the docs show extension-style patterns like
`/*.jpg`. A header can be removed with `! ` prefix.

Limits (Free and Paid identical): **100 header rules**, **2,000 characters per line**.

"An incoming request which matches multiple rules' URL patterns will inherit all rules'
headers." "If a header is applied twice in the `_headers` file, the values are joined with a
comma separator."

Precedence: "redirects are applied before headers, so when a request matches both a redirect
and a header, the redirect takes priority."

Caveat: "Custom headers defined in the `_headers` file are not applied to responses
generated by your Worker code." Irrelevant for an assets-only Worker.

### Default headers Workers attaches

- `Content-Type` — see below.
- `Cache-Control: public, max-age=0, must-revalidate` — "Sent when the request does not have
  an `Authorization` or `Range` header… tells the browser that the asset can be cached, but
  that the browser should revalidate the freshness of the content every time before using
  it."
- `ETag` — "a hash of the static asset file".
- `CF-Cache-Status` — `HIT` or `MISS`.

"Cloudflare reserves the right to attach new headers to static asset responses at any time."

The live Pages site already returns `cache-control: public, max-age=0, must-revalidate`
(probed 2026-09-03), so caching behaviour is unchanged by the move.

### Content-Type for `.md` files — partially unverified

What the docs say, in full:

> "A `Content-Type` header is attached to the response if one is provided during the asset
> upload process. **Wrangler automatically determines the MIME type of the file, based on
> its extension.**"

Source: <https://developers.cloudflare.com/workers/static-assets/headers/> (fetched
2026-09-03).

**Cloudflare does not publish the extension→MIME table, and does not name `.md` anywhere in
the pages I fetched.** So "Workers will serve `.md` as `text/markdown`" is *not* a
documented claim.

Empirical datapoint (not a doc claim): on 2026-09-03,
`curl -I https://devonmeadows.com/index.md` on the **current Pages** deployment returned
`content-type: text/markdown; charset=utf-8`. That is Pages, not Workers, and is evidence
about today's behaviour only.

**Recommendation: do not rely on inference.** Pin it in `_headers`, which is documented to
override defaults:

```
/*.md
  Content-Type: text/markdown; charset=utf-8
```

This is deterministic, self-documenting for the "here is my setup" goal, and costs one of
the 100 header rules.

### Static asset limits

| Limit | Workers Free | Workers Paid |
| --- | --- | --- |
| Files per Worker version | 20,000 | 100,000 |
| Individual file size | 25 MiB | 25 MiB |
| `_headers` rules | 100 | 100 |
| `_headers` characters per line | 2,000 | 2,000 |
| `_redirects` static redirects | 2,000 | 2,000 |
| `_redirects` dynamic redirects | 100 | 100 |
| `_redirects` total | 2,100 | 2,100 |
| `_redirects` characters per rule | 1,000 | 1,000 |

"To use the increased file count limits in Wrangler, you must use version 4.34.0 or higher."

Identical to Pages free (20,000 files, 25 MiB per file), so no regression. Note that `.md`
twins double the file count — worth a sanity check against 20,000 as the wiki grows.

### `.assetsignore`

Pages auto-excluded `node_modules`, `.DS_Store`, `.git`. Workers does not; the migration
guide suggests an `.assetsignore` in the static asset directory:

```txt
**/node_modules
**/.DS_Store
**/.git
```

For an Astro `dist/` this is unnecessary — those paths are not in the build output — but
harmless.

---

## Q5 — Cross-zone path-preserving 301 on the free plan

Sources, all fetched 2026-09-03:
- <https://developers.cloudflare.com/rules/url-forwarding/> (availability tables, execution order, proxy requirement)
- <https://developers.cloudflare.com/fundamentals/manage-domains/redirect-domain/> (the canonical originless recipe)
- <https://developers.cloudflare.com/rules/url-forwarding/single-redirects/settings/>
- <https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/>
- <https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-all-different-hostname/>
- <https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-all-another-domain/>
- <https://developers.cloudflare.com/ruleset-engine/rules-language/functions/>

### Does the old zone need a proxied DNS record? Yes, unambiguously

> **"Single Redirects and Bulk Redirects require that you proxy the DNS records of your
> domain (or subdomain) through Cloudflare."**
> — <https://developers.cloudflare.com/rules/url-forwarding/>

Restated on the API page: "Single Redirects require that the incoming traffic for the
hostname referenced in visitors' requests is proxied by Cloudflare."

Cloudflare documents the originless placeholder explicitly:

> "Make sure that your alias domain has a proxied DNS A or CNAME record that properly
> resolves DNS queries. You may also want to include a subdomain DNS record for `www`.
> Use the IP address `192.0.2.1` for the `A` record. **This address does not route traffic
> to an origin server but allows Cloudflare to apply rules, redirects, and Workers to
> incoming traffic.** The equivalent IP address for an `AAAA` record is `100::`."

| Type | Name | IPv4 address | Proxy status |
| --- | --- | --- | --- |
| A | @ | 192.0.2.1 | Proxied |
| A | www | 192.0.2.1 | Proxied |

Source: <https://developers.cloudflare.com/fundamentals/manage-domains/redirect-domain/>
(last updated Apr 20, 2026; fetched 2026-09-03).

So the cutover for `devonmeadows.com` is: remove the Pages custom domain (which removes
Cloudflare's auto-created record), then create proxied placeholder A records for `@` and
`www` pointing at `192.0.2.1`, then add the redirect rule.

### Free-plan quotas

**Single Redirects** — per zone, depends on the zone plan:

| | Free | Pro | Business | Enterprise |
| --- | --- | --- | --- | --- |
| Availability | Yes | Yes | Yes | Yes |
| **Number of rules** | **10** | 25 | 50 | 300 |
| **Wildcard support** | **Yes** | Yes | Yes | Yes |
| Regex support | **No** | No | Yes | Yes |

**Bulk Redirects** — per *account*, depends on the highest plan on the account:

| | Free | Pro | Business | Enterprise |
| --- | --- | --- | --- | --- |
| Availability | Yes | Yes | Yes | Yes |
| Bulk Redirect Rules | 15 | 15 | 15 | 50 |
| Bulk Redirect Lists | 5 | 5 | 5 | 25 |
| URL redirects across lists | 10,000 | 25,000 | 50,000 | 1,000,000 |

Bulk Redirects are "essentially static. They do not support string replacement operations or
regular expressions" — so they cannot express a path-preserving wildcard 301 in one rule.
They are the wrong tool here. Ten Single Redirect rules on Free is ample for one domain
migration.

Execution order note: "if you configure URL redirects using different Cloudflare products
(Single Redirects and Bulk Redirects), the product executed first will apply, if there is a
rule match (in this case, Single Redirects)." Single Redirects run first in the Rules
pipeline, ahead of URL Rewrite Rules, Configuration Rules, Origin Rules, Bulk Redirects,
Cache Rules and Snippets.

### The exact expression — recommended form (dynamic `concat`)

This is Cloudflare's own canonical recipe for "redirect one domain to another, keeping path
and query", quoted verbatim from
<https://developers.cloudflare.com/fundamentals/manage-domains/redirect-domain/>:

> **When incoming requests match**
> - **Field:** *Hostname* · **Operator:** *equals* · **Value:** `smallshop.example.com`
> - Expression Editor: `(http.host eq "smallshop.example.com")`
>
> **Then**
> - **Type:** *Dynamic*
> - **Expression:** `concat("https://globalstore.example.net", http.request.uri.path)`
> - **Status code:** *301*
> - **Preserve query string:** Enabled

Adapted for devon-wiki (apex + www in one rule, using the 10-rule Free budget frugally):

- **Filter expression:**
  `(http.host eq "devonmeadows.com" or http.host eq "www.devonmeadows.com")`
- **Type:** Dynamic
- **Target URL expression:** `concat("https://devon.md", http.request.uri.path)`
- **Status code:** 301
- **Preserve query string:** Enabled

Why `concat` over the wildcard form: it is the form Cloudflare itself uses for exactly this
scenario, it needs no wildcard capture-group bookkeeping, and `http.request.uri.path` always
begins with `/` so the concatenation is well-formed for `/` as well as `/notes/foo/`.

### The exact expression — wildcard alternative

Cloudflare's two wildcard examples for the same job, quoted verbatim:

From <https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-all-another-domain/>:

> **Wildcard pattern → Request URL:** `http*://example.com/*`
> **Target URL:** `https://example.net/${2}`
> **Status code:** *301* · **Preserve query string:** Enabled

Documented result table: `https://example.com/my/path/to/page.htm` →
`https://example.net/my/path/to/page.htm` (301), and
`https://example.com/search?q=term` → `https://example.net/search?q=term` (301).

From <https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-all-different-hostname/>:

> **Request URL:** `http*://smallshop.example.com/*` → **Target URL:**
> `https://globalstore.example.net/${2}`, 301, preserve query string enabled.

Adapted: Request URL `http*://devonmeadows.com/*` → Target URL `https://devon.md/${2}`,
301, preserve query string enabled. A second rule (or a second pattern) is needed for
`www.devonmeadows.com`, which is why the `concat` form is cheaper against the 10-rule cap.

Wildcard support is confirmed **Yes on Free**. Under the hood: "Wildcard URL redirects are
regular dynamic URL redirects that use the `wildcard_replace()` function in the
`target_url.expression` parameter", with syntax
`wildcard_replace(http.request.full_uri, r"<REQUEST_URL_PATTERN>", r"<TARGET_URL_PATTERN>")`.
Constraints from the functions reference: up to eight replacement references; "the entire
`source` value must match the `wildcard_pattern` parameter"; lazy matching; usable only once
per expression; **"you can only use the `wildcard_replace()` function in rewrite expressions
of URL rewrites and target URL expressions of dynamic URL redirects."**

Regex (`regex_replace`) is **not available on Free** per the availability table, so any
approach requiring it is out.

### Status codes and query-string preservation

Allowed status codes: 301 (permanent), 302 (temporary), 307 (temporary, method preserved),
308 (permanent, method preserved). Default is 301.

> "**Preserve query string:** Whether to preserve the query string when redirecting
> (**disabled by default**)."

It must be turned on explicitly. The `concat(...)` expression only carries the path.

### As code (Rulesets API)

Redirect rules live in the zone-level `http_request_dynamic_redirect` phase entry-point
ruleset. Shape, from the settings page:

```json
"action_parameters": {
  "from_value": {
    "target_url": {
      "expression": "<DYNAMIC_URL_EXPRESSION>"
    },
    "status_code": <STATUS_CODE>,
    "preserve_query_string": <BOOLEAN_VALUE>
  }
}
```

The full create call is in *Exact config* below. Required API token permission: any one of a
long list including `Dynamic URL Redirects Write`.

---

## Q6 — Cloudflare Web Analytics

Sources, all fetched 2026-09-03:
- <https://developers.cloudflare.com/web-analytics/>
- <https://developers.cloudflare.com/web-analytics/get-started/>
- <https://developers.cloudflare.com/web-analytics/limits/>
- <https://developers.cloudflare.com/web-analytics/faq/>
- <https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/>
- <https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/>
- <https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/>
- <https://blog.cloudflare.com/privacy-first-web-analytics/> (Cloudflare blog, published 2020-12-09)

### Free plan availability

The docs page carries the badge **"Available on all plans"**. Cloudflare's own announcement
blog states: "Best of all, our analytics is free. We don't have limits based on the amount
of traffic you can send it."

### Privacy — no cookies, no fingerprinting (Cloudflare's own claims)

From the Cloudflare blog (2020-12-09):

> "We don't use any client-side state (like cookies or localStorage) for analytics
> purposes."

> "Cloudflare also doesn't track users over time via their IP address, User Agent string, or
> any other immutable attributes for the purposes of displaying analytics — we consider
> 'fingerprinting' even more intrusive than cookies, because users have no way to opt out."

From the docs: "Web Analytics collects the minimum amount of information - timing metrics -
to show customers how their websites perform. Cloudflare does not track individual end users
across our customers' Internet properties."

Note this blog post is from 2020. It is Cloudflare's own current-linked statement of the
privacy model, but it is six years old; the current docs restate the substance in weaker
language ("minimum amount of information"), and I found **no 2026-dated page that repeats
the literal 'no cookies' sentence**.

### Snippet vs auto-injection

Two setup paths.

**Sites proxied through Cloudflare** — dashboard → Web Analytics → Add a site → pick the
hostname from a drop-down. "Your website is now using Web Analytics through the automatic
setup, which is enabled by default." Options under **Manage Site**: automatic; automatic but
"Enable, excluding visitor data in the EU"; "Enable with JS Snippet installation"; Disable.

**Sites not proxied** — copy the JS snippet from Manage site and "Add the JS snippet to any
of your website's HTML pages before the ending body tag."

Two documented blockers for automatic injection:

> "If you have a `Cache-Control` header set to `public, no-transform`, Cloudflare proxy will
> not be able to modify the original payload of the website. Therefore, the Beacon script
> will not be automatically injected to your site, and Web Analytics will not work."

> "For Cloudflare to automatically add the JavaScript snippet, your pages need to have valid
> HTML."

And: "you can only use the automatic setup with JS snippet injection if traffic to your
domain is proxied through Cloudflare (orange-clouded). If you have a DNS-only domain, you
will have to do a manual setup instead."

The Workers default asset `Cache-Control` is `public, max-age=0, must-revalidate` — it does
**not** contain `no-transform`, so that particular blocker does not apply.

### Does it work for a Workers static-asset site?

**Not directly answered in the docs.** The get-started page has a dedicated section
"**Pages projects**" — "Cloudflare Pages offers a one-click setup for Web Analytics… Go to
**Metrics** and select **Enable** under Web Analytics. Cloudflare will automatically add the
JavaScript snippet to your Pages site on the next deployment." **There is no equivalent
Workers section**, and Web Analytics does not appear in the Pages→Workers compatibility
matrix at all.

The nearest relevant statement is a FAQ that is easy to misread:

> **"Can I use Real User Monitoring (RUM) with Cloudflare Workers?"**
> "Cloudflare's Real User Monitoring (RUM) operates exclusively on the initial client
> request and cannot collect metrics from Worker subrequests. This is a fundamental
> architectural limitation designed to ensure accurate performance measurements and prevent
> duplicate or misleading analytics data."

That is about *subrequests made by a Worker*, not about a Worker serving the initial
document — but the docs never state the positive case. See *Open questions*. The
low-risk mitigation is the manual snippet path (add the beacon `<script>` to the Astro
layout), which is documented, deterministic, works regardless of proxying, and does not
depend on undocumented proxy behaviour.

### What it records

High-level metrics:
- **Visits** — "A page view that originated from a different website or direct link.
  Cloudflare checks where the HTTP referer does not match the hostname. One visit can consist
  of multiple page views."
- **Page views** — "A successful HTTP response with a content-type of HTML."
- **Page load time**
- **Core Web Vitals**

Dimensions: Country, Host, Path, Referer (referer host in dashboard, referer path via
GraphQL), Device type, Browser, Operating system, Site, Exclude Bots, Navigation type
(Navigate, Navigate Cache, Prerender, Reload, Back-forward, Restore, Soft Navigation,
Routing APIs, etc.).

Collection mechanics: the beacon loads from
`https://static.cloudflareinsights.com/beacon.min.js`; data posts to
`https://<yourdomainname>/cdn-cgi/rum` for proxied sites or
`https://cloudflareinsights.com/cdn-cgi/rum` otherwise. Metrics derive from
`performance.getEntriesByType('navigation')`. For non-SPA sites the beacon reports "when the
page has finished loading (load event) and when the user leaves the page."

### Limits and known gaps (the facts that matter vs Plausible)

| | Cloudflare Web Analytics |
| --- | --- |
| Cost | Free on all plans; no traffic-based limits |
| Sites (not proxied) | 10 |
| Sites (proxied) | No limit |
| Sites — soft limit | "a soft limit of ten sites per account, but that can be adjusted by contacting Cloudflare support" |
| Rules (Free plan) | **0** — "For plans with a limit of zero, Web Analytics injects the JS snippet on all subdomains." Rules are proxied-only. |
| Data retention | "you can access data for the previous six months" |
| Sampling | "We retain unsampled beacon data for the past 7 days, after this point data is aggregated down to around 10%." Dashboard/GraphQL apply dynamic sampling between 0.0001% and 100%. |
| **UTM parameters** | **Not supported.** "Currently, Cloudflare Web Analytics do not log query strings to avoid collecting potentially sensitive data, but we may add support for this in the future." |
| **Custom events** | **Not supported.** "Not yet, but we may add support for this in the future." |
| Server-side / by-URL traffic analytics | Not on Free — "users on Pro, Business, and Enterprise plans get advanced HTTP traffic analytics" |
| Ad-blocker susceptibility | Acknowledged in the FAQ: the beacon is blocked by adblockplus, Brave, DuckDuckGo extension, etc. |
| GraphQL API | Yes, exposes `sampleInterval` |

### Versus self-hosted Plausible — scope limit

The brief asked for a feature comparison with self-hosted Plausible. **Plausible's feature
set cannot be sourced from Cloudflare's docs, and this research is primary-Cloudflare-only,
so no Plausible claims are made here.** What can be said without leaving primary sources is
which Cloudflare capabilities are *absent*, and those are the ones that decide the swap:
**no UTM/campaign attribution, no custom events/goals, no query-string logging, 6-month
retention, ~10% aggregation after 7 days, and no per-URL server-side analytics on Free.**
If devon-wiki's current Plausible install is used for any of those, Cloudflare Web Analytics
is not a replacement; if it is used only for "how many people read which note, from where",
it is. That determination needs a look at the existing Plausible dashboard, not more docs.

**Operationally, analytics is orthogonal to the hosting decision.** Self-hosted Plausible
works identically on Pages and Workers — it is a `<script>` tag in the Astro layout. Nothing
in §1–§5 forces an analytics change.

---

## Q7 — Free-plan limits relevant to a small static site

Sources fetched 2026-09-03:
<https://developers.cloudflare.com/workers/platform/limits/>,
<https://developers.cloudflare.com/workers/platform/pricing/>,
<https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>,
<https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/>,
<https://developers.cloudflare.com/pages/platform/limits/>.

### Do static asset requests count against 100,000/day? No.

> **"Requests to static assets are free and unlimited.** Requests to the Worker script (for
> example, in the case of SSR content) are billed according to Workers pricing."

> "There is no additional cost for storing Assets."

The pricing page repeats it as footnote 3 — "Requests to static assets are free and
unlimited" — and works Example 2 (15M requests/month, 80% static assets) to **$0** for both
static-asset requests and Worker requests.

The one exception, already covered in §4: `run_worker_first` forces Worker invocation, and
"If you exceed your free tier request limits, these requests will receive a 429 (Too Many
Requests) response instead of falling back to static asset serving." devon-wiki will not set
it.

There is also a subtler caveat worth knowing: footnote 4 on the pricing page — "When Workers
Caching is enabled, requests served from the Worker's cache are billed at the same
per-request rate as requests that invoke the Worker. This includes requests to static
assets". That concerns the explicit Workers Cache API, which an assets-only Worker does not
use.

### Workers account plan limits (free)

| Feature | Workers Free | Workers Paid |
| --- | --- | --- |
| **Requests** | **100,000/day** (resets midnight UTC) | No limit |
| CPU time | 10 ms | 5 min |
| Memory | 128 MB | 128 MB |
| Subrequests | 50/request | 10,000/request |
| Simultaneous outgoing connections/request | 6 | 6 |
| Environment variables | 64/Worker | 128/Worker |
| Worker size | 3 MB (gzipped) | 10 MB |
| Worker startup time | 1 second | 1 second |
| Number of Workers | 100 | 500 |
| Static asset files per Worker version | 20,000 | 100,000 |
| Individual static asset file size | 25 MiB | 25 MiB |

The docs do not state a requests-per-minute limit on the free plan — only the daily cap.

### Bandwidth

**There is no bandwidth or egress charge, and no documented free-plan bandwidth cap for
Workers.** "There are no additional charges for data transfer (egress) or throughput
(bandwidth)" and "There are no data transfer (egress) or throughput (bandwidth) charges."
The limits page contains no bandwidth row; the only size limit it discusses is the maximum
**request body** size, which depends on the Cloudflare *account* plan (Free: 100 MB), not
the Workers plan. Response body size: "No enforced limit."

### Build minutes

Workers Builds Free: **3,000 build minutes/month**, 1 concurrent build, 20-minute timeout
(full table in §2). Cloudflare Pages Free: **500 builds/month**, 1 build at a time,
20-minute timeout.

### Custom domain count

| | Value |
| --- | --- |
| Workers: Custom domains per zone | 100 |
| Workers: Routes per zone | 1,000 |
| Pages: custom domains per project (Free) | 100 |

Equivalent on Free. Devon needs one (`devon.md`).

### Other request/response limits

URL size 16 KB; request header size 128 KB total; response header size 128 KB total.

---

## Q8 — Astro's own docs

Source: <https://docs.astro.build/en/guides/deploy/cloudflare/> and
<https://docs.astro.build/en/basics/astro-pages/>, both fetched 2026-09-03.

### The adapter is not needed for a static build

> "If your site uses on-demand rendering, install the `@astrojs/cloudflare` adapter."

The condition is on-demand rendering. A static Astro build — which devon-wiki is — needs no
adapter. (For completeness: the on-demand adapter path requires the `nodejs_compat` and
`global_fetch_strictly_public` compatibility flags. devon-wiki needs neither.)

Consistent with the repo: `astro.config.mjs` declares no adapter and no `output` mode, so
`astro build` emits a static `dist/`. Confirmed by `dist/` containing `index.html`,
`_astro/`, `notes/`, `sitemap-*.xml`.

### Workers vs Pages, per Astro

> "Cloudflare recommends using Cloudflare Workers for new projects. For existing Pages
> projects, refer to Cloudflare's migration guide and compatibility matrix."

Astro's Cloudflare guide is written around **Workers**, and gives the wrangler config for a
static site directly.

### Astro's recommended config and commands

```json
{
  "name": "my-astro-app",
  "compatibility_date": "YYYY-MM-DD",
  "assets": {
    "directory": "./dist"
  }
}
```

- Local preview: `npx astro build && npx wrangler dev`
- Deploy: `npx astro build && npx wrangler deploy`

Note that Astro's minimal snippet omits `not_found_handling`. Combined with Cloudflare's
"defaults to `none`", an Astro site deployed with exactly Astro's snippet gets bare 404s
with no custom page. Adding `"not_found_handling": "404-page"` is required to serve
`dist/404.html`.

### Custom 404 page in Astro

> "For a custom 404 error page, you can create a `404.astro` or `404.md` file in
> `src/pages`." … "This will build to a `404.html` page."

**devon-wiki has no `src/pages/404.astro` today** — `dist/` contains no `404.html`, which is
exactly why the live probe returns 200 for unknown paths. Creating one is a prerequisite for
`not_found_handling: "404-page"` to do anything useful, and is a code change in the
devon-wiki repo, independent of the hosting decision.

**There is no dedicated "Astro + Workers static assets" guide beyond this deploy page** in
what I fetched. Cloudflare's framework guides index
(<https://developers.cloudflare.com/workers/framework-guides/>) is referenced by the
migration guide but I did not fetch an Astro-specific page from it — see *Open questions*.

---

## Exact config

### `wrangler.jsonc` (devon-wiki repo root)

Assets-only Worker: no `main`, and therefore no `assets.binding` (per the migration guide's
note). `compatibility_date` set to the migration date.

```jsonc
{
	"$schema": "./node_modules/wrangler/config-schema.json",
	"name": "devon-wiki",
	"compatibility_date": "2026-09-03",

	// Astro's static build output. No `main`, so no Worker script ever runs:
	// every request is served from assets, which are free and unlimited.
	"assets": {
		"directory": "./dist",

		// Serve dist/404.html with a real 404 status for unmatched paths.
		// Requires src/pages/404.astro to exist in the repo.
		"not_found_handling": "404-page",

		// Default. foo.html -> /foo ; foo/index.html -> /foo/
		// Matches the trailing-slash URLs already in the sitemap.
		"html_handling": "auto-trailing-slash"
	},

	// Cloudflare creates the DNS record and the certificate for this hostname.
	"routes": [
		{
			"pattern": "devon.md",
			"custom_domain": true
		}
	],

	// workers.dev subdomain + preview URLs for branch builds.
	"workers_dev": true,
	"preview_urls": true
}
```

`wrangler.toml` equivalent, if TOML is preferred:

```toml
name = "devon-wiki"
compatibility_date = "2026-09-03"
workers_dev = true
preview_urls = true

[assets]
directory = "./dist"
not_found_handling = "404-page"
html_handling = "auto-trailing-slash"

[[routes]]
pattern = "devon.md"
custom_domain = true
```

### `public/_headers` (copied to `dist/_headers` by the Astro build)

```
# Pin the content type of the .md twins. Wrangler infers MIME types from the
# file extension, but Cloudflare does not publish the extension->MIME table,
# so this makes the behaviour explicit rather than inferred.
/*.md
  Content-Type: text/markdown; charset=utf-8

# Fingerprinted Astro assets are immutable; cache them hard in the browser.
/_astro/*
  Cache-Control: public, max-age=31556952, immutable

# Keep the workers.dev preview hostnames out of search results.
https://:version.:subdomain.workers.dev/*
  X-Robots-Tag: noindex
```

Budget: 3 of the 100 permitted header rules.

### `public/_redirects` (in-site path moves only)

```
# Same-origin path changes go here. One per line: [source] [destination] [code]
# The default status code is 302, so always write 301 explicitly for permanent moves.
#
# Domain-level redirects are NOT supported here - devonmeadows.com -> devon.md
# must be a zone-level Redirect Rule on the devonmeadows.com zone. See below.
#
# /old-note-slug /notes/new-note-slug/ 301
```

### Prerequisite in the devon-wiki repo

`src/pages/404.astro` must exist, so `astro build` emits `dist/404.html`. Without it,
`not_found_handling: "404-page"` has no page to serve.

### Redirect rule: `devonmeadows.com/*` → `https://devon.md/${path}` (dashboard form)

On the **devonmeadows.com** zone:

- **Rule name:** `devonmeadows.com -> devon.md (path-preserving 301)`
- **When incoming requests match** (Expression Editor):
  ```
  (http.host eq "devonmeadows.com" or http.host eq "www.devonmeadows.com")
  ```
- **Then → Type:** Dynamic
- **Expression:**
  ```
  concat("https://devon.md", http.request.uri.path)
  ```
- **Status code:** 301
- **Preserve query string:** **Enabled** (off by default — must be turned on)

Prerequisite DNS on the devonmeadows.com zone (rules only fire on proxied traffic):

| Type | Name | Content | Proxy status |
| --- | --- | --- | --- |
| A | `@` | `192.0.2.1` | Proxied |
| A | `www` | `192.0.2.1` | Proxied |

### Same rule as code (Rulesets API)

Creates the `http_request_dynamic_redirect` phase entry-point ruleset on the zone. Use this
form only if the phase entry point does not exist yet; otherwise PUT the rules onto the
existing ruleset.

```bash
curl "https://api.cloudflare.com/client/v4/zones/$DEVONMEADOWS_ZONE_ID/rulesets" \
  --request POST \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --json '{
    "name": "Redirect rules ruleset",
    "kind": "zone",
    "phase": "http_request_dynamic_redirect",
    "rules": [
      {
        "ref": "devonmeadows_to_devon_md",
        "description": "301 devonmeadows.com (and www) to devon.md, preserving path and query.",
        "expression": "(http.host eq \"devonmeadows.com\" or http.host eq \"www.devonmeadows.com\")",
        "action": "redirect",
        "action_parameters": {
          "from_value": {
            "target_url": {
              "expression": "concat(\"https://devon.md\", http.request.uri.path)"
            },
            "status_code": 301,
            "preserve_query_string": true
          }
        }
      }
    ]
  }'
```

API token needs one of the documented permissions, most narrowly
**`Dynamic URL Redirects Write`**.

### Wildcard variant (if the wildcard UI is preferred over the expression editor)

- **Request URL:** `http*://devonmeadows.com/*`
- **Target URL:** `https://devon.md/${2}`
- **Status code:** 301 · **Preserve query string:** Enabled

Plus a second rule for `http*://www.devonmeadows.com/*`. Two of the ten Free rules instead
of one; the `concat` form is preferred for that reason.

### Optional: stable per-branch preview hostnames

Not a documented recipe — see *Open questions*. In **Settings → Build**, set the
**non-production branch deploy command** to:

```
npx wrangler versions upload --preview-alias $WORKERS_CI_BRANCH
```

This yields `<branch>-devon-wiki.<subdomain>.workers.dev`, approximating
`<branch>.devon-wiki.pages.dev`. It will fail on branch names containing `/`, uppercase
letters, or a leading non-letter, because aliases "must use only lowercase letters, numbers,
and dashes" and "must begin with a lowercase letter". Verify on a throwaway branch before
relying on it.

---

## Steps that require the dashboard

These have no documented config-file or single-command equivalent. They are the irreducible
manual part of the "here is my Cloudflare setup" writeup.

1. **Install the Cloudflare GitHub App / connect the repository to Workers Builds.** "If you
   do not have a Git account linked to your Cloudflare account, you will be prompted to set
   up an installation to GitHub or GitLab when connecting a repository for the first time…
   Follow the prompts and authorize the Cloudflare Git integration." Managed at
   **Workers & Pages → your Worker → Settings → Builds → Git Repository → Manage**. There is
   a Builds API reference for triggering builds and managing triggers, but the *initial*
   Git app authorization is an OAuth flow.
   (<https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/>)

2. **Enable non-production branch builds.** "Go to **Settings → Build → Branch control**.
   The checkbox **Builds for non-production branches** allows you to enable or disable
   builds for non-production branches." Not expressible in `wrangler.jsonc`.
   (<https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/>)

3. **Set the production branch, build command, deploy command, non-production branch deploy
   command, root directory, and build variables.** All under **Settings → Build**.
   (<https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>)

4. **Configure the account's `workers.dev` subdomain.** "You can configure this subdomain in
   the Cloudflare dashboard, and opt-in to using it with the `workers_dev` option in your
   configuration file." The `workers_dev` boolean is code; the subdomain *name* is a
   dashboard setting.
   (<https://developers.cloudflare.com/workers/configuration/routing/workers-dev/>)

5. **Create the placeholder proxied DNS records on devonmeadows.com** (`A @ 192.0.2.1`
   proxied, `A www 192.0.2.1` proxied). Dashboard DNS, or the DNS API — but not
   `wrangler.jsonc`.
   (<https://developers.cloudflare.com/fundamentals/manage-domains/redirect-domain/>)

6. **Remove the Pages custom domain from devonmeadows.com** and, at the end,
   **disable automatic deployments on the Pages project**.
   (<https://developers.cloudflare.com/pages/configuration/git-integration/#disable-automatic-deployments>,
   referenced by the migration guide.)

7. **Add the site to Web Analytics** (if adopting it). Dashboard → Web Analytics → Add a
   site. No documented config-file route.
   (<https://developers.cloudflare.com/web-analytics/get-started/>)

8. **Delete the Advanced Certificate** if a Custom Domain is ever removed — "When you delete
   a Custom Domain, the associated Advanced Certificate is **not** automatically deleted.
   You must manually remove the certificate."
   (<https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>)

## Steps that are code or API

1. **`wrangler.jsonc`** — Worker name, compatibility date, `assets.directory`,
   `assets.not_found_handling`, `assets.html_handling`, the `devon.md` Custom Domain via
   `routes[].custom_domain`, `workers_dev`, `preview_urls`. Committed to the repo.

2. **`public/_headers`** and **`public/_redirects`** — committed, copied into `dist/` by the
   Astro build, parsed by Workers at deploy time.

3. **`src/pages/404.astro`** — committed; produces `dist/404.html`.

4. **Node/pnpm pinning** — `.nvmrc` or `.node-version` in the repo root (code), or
   `NODE_VERSION` / `PNPM_VERSION` build variables (dashboard). Prefer the repo files; they
   are visible to strangers reading the repo. `package.json` already declares
   `"engines": { "node": ">=22.18.0" }`; the build image defaults to Node 24.18.0, which
   satisfies it.

5. **Deploy** — `npx astro build && npx wrangler deploy` locally, or the Workers Builds
   deploy command (`npx wrangler deploy`) on push to the production branch. Custom Domains
   declared in `routes` are applied by `wrangler deploy`.

6. **The redirect rule** — the Rulesets API `POST /zones/$ZONE_ID/rulesets` call above, or
   the equivalent Terraform (`cloudflare_ruleset` on the
   `http_request_dynamic_redirect` phase; Cloudflare publishes a Terraform example at
   <https://developers.cloudflare.com/rules/url-forwarding/single-redirects/terraform-example/>,
   which I did not fetch in full).

7. **The DNS placeholder records** — creatable via the Cloudflare DNS API, though the docs
   present them as a dashboard task.

---

## Open questions / unverified

These are the places where the docs are silent or where I am extrapolating. None of them
blocks the recommendation; all of them should be checked before or during the cutover.

1. **`.md` → `text/markdown` on Workers is not documented.** Cloudflare says only "Wrangler
   automatically determines the MIME type of the file, based on its extension" and publishes
   no extension table. The `_headers` pin in *Exact config* removes the dependency, but the
   pin itself should be verified against a real deployment (`curl -I https://devon.md/index.md`).

2. **Web Analytics automatic injection on a Workers static-asset site is not documented.**
   The get-started page has a Pages section and no Workers section; the RUM/Workers FAQ
   answer is about Worker *subrequests*, not about a Worker serving the initial document.
   Verify empirically, or just use the manual snippet, which is documented and unambiguous.

3. **Per-branch preview aliases via `--preview-alias $WORKERS_CI_BRANCH` is a composition,
   not a documented recipe.** `WORKERS_CI_BRANCH` is documented; `--preview-alias` is
   documented; combining them in the non-production branch deploy command is not shown
   anywhere I fetched. Branch names with `/` will break it. "Custom Branch Aliases" is ⏳ in
   the compatibility matrix, so a first-party answer may land.

4. **Pages → Workers hostname handover ordering and downtime are not documented.** Cloudflare
   says a Custom Domain cannot be created "on a hostname with an existing CNAME DNS record",
   which implies detach-then-attach, but never states the sequence or the gap. Not on the
   critical path for devon-wiki (devon.md is a fresh hostname), but relevant if
   devonmeadows.com is ever pointed at the Worker.

5. **Cross-*account* zones for Custom Domains.** Docs say "a zone you do not own" and
   "nameservers managed by Cloudflare"; they do not address zone-in-account-A /
   Worker-in-account-B. Not relevant here (all zones in one account) but noted.

6. **`package.json` `packageManager` as a pnpm pin.** The build-image page names
   `PNPM_VERSION`; it does not mention `packageManager`. Unverified.

7. **`not_found_handling: "404-page"` and "nearest `404.html`".** The docs use the word
   "nearest" without defining the lookup order for nested 404 pages. A single root
   `dist/404.html` sidesteps it.

8. **No Astro-specific Cloudflare framework guide was fetched.** Cloudflare's framework
   guides index is linked from the migration guide; I read Astro's own deploy page instead.
   If a Cloudflare-authored Astro guide exists it may carry additional specifics.

9. **The "no cookies" privacy claim is from a 2020 blog post.** Cloudflare's 2026-dated docs
   restate the substance in softer language. If the privacy property is load-bearing for the
   Plausible→Cloudflare swap, it deserves a current-dated confirmation.

10. **Plausible feature parity was not researched** — deliberately, since the brief restricts
    this to primary Cloudflare sources. §6 lists what Cloudflare Web Analytics *cannot* do;
    matching that against actual Plausible usage is a separate task.

11. **Live-site facts are empirical, not documentation.** The 200-on-unknown-path finding and
    the `text/markdown` content type were obtained by `curl` against
    `https://devonmeadows.com` on 2026-09-03. They describe today's Pages deployment and
    could change.

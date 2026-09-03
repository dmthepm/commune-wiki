# Release setup — the parts a workflow cannot do

Everything in `.github/workflows/release.yml`, `release-please-config.json` and
`.release-please-manifest.json` is already in the repository. What is left is
the handful of things that live behind a login: an npm account, one GitHub
repository setting, and the one-time token that gets `v0.1.0` onto the registry
so that every release after it can publish without a token at all.

Do them in order. Each step says where to click and how to know it worked.

**Where this ends up:** `@dmthepm/commune` on npm, published from the tag by
GitHub Actions, with a provenance attestation linking the tarball to the commit
and the workflow run that built it. After step 5 there is no long-lived
credential anywhere.

---

## How a release works once this is done

1. Conventional commits land on `main` (`feat:`, `fix:`, `ci:` …).
2. `release.yml` runs release-please on every push to `main`. It keeps one pull
   request open, titled `chore(main): release X.Y.Z`, containing the version
   bump in `package.json`, the `CHANGELOG.md` entry, and the new
   `.release-please-manifest.json`.
3. **Merging that pull request is the release.** The next run tags `vX.Y.Z`,
   creates the GitHub Release, and starts the publish job.
4. The publish job checks out the tag, installs, tests, builds `lib/`, and runs
   `npm publish --provenance --access public`.

Nothing is published by pushing a tag by hand, and nothing needs a tag to be cut
by hand.

---

## Step 1 — an npm account that owns the `@dmthepm` scope

**Do:** sign in (or sign up) at <https://www.npmjs.com/>. The account's username
determines the scope: a user named `dmthepm` owns `@dmthepm/*` with no further
setup. If the username is something else, create an npm **organization** named
`dmthepm` at <https://www.npmjs.com/org/create> — an org of that name owns the
same scope.

**Verify:** in a terminal, `npm whoami` after `npm login` prints the account,
and `npm access ls-packages` runs without an error about the scope. The package
itself is not there yet; `npm view @dmthepm/commune` returning `404` is the
expected answer at this point and stays true until step 3.

**Why it is a human step:** an account is an identity. Nothing in CI can create
one.

---

## Step 2 — let GitHub Actions open the release pull request

release-please's whole job is to open a pull request using the built-in
`GITHUB_TOKEN`, and on personal-account repositories that is switched off by
default.

**Do:** <https://github.com/dmthepm/commune-wiki/settings/actions> → **Workflow
permissions** → confirm **"Allow GitHub Actions to create and approve pull
requests"** is ticked; tick it and **Save** if it is not. (Issue #39 records it
as already on for this repository, which is not the default — so this is a check
rather than a change, and it is written down because it is the first thing that
fails if it ever gets turned back off.) Leave the read/write radio buttons
alone; the workflow declares the `contents: write` and `pull-requests: write` it
needs per job.

**Verify:** merge anything to `main` (or re-run the latest `Release` workflow
from the Actions tab). Within a minute there should be an open pull request
titled `chore(main): release 0.1.0`. If instead the run fails with
`GitHub Actions is not permitted to create or approve pull requests`, the
checkbox did not save.

**Check the version in that PR title before merging it.** It must say `0.1.0`.
The manifest is intentionally empty (`{}`) and the config sets
`"initial-version": "0.1.0"`, so `0.1.0` is what release-please should propose
for a package it has never released. If the title says anything else, do not
merge — that means release-please found a release it thinks already happened,
and the fix is in `release-please-config.json`, not on npmjs.com.

---

## Step 3 — one token, for the first publish only

npm cannot publish a package's **first** version over OIDC. A trusted publisher
is configured inside a package's settings page, and a package that has never
been published has no settings page. `npm/cli#8544`, "Allow publishing initial
version with OIDC", has been open since 2025-09-01 and was last updated
2026-08-05 — still open, so this is still true. One token gets `0.1.0` onto the
registry; step 5 takes it away again.

**Do:**

1. <https://www.npmjs.com/settings/~/tokens> → **Generate New Token** →
   **Granular Access Token**.
   - Expiration: 7 days is plenty; this token has one job.
   - Packages and scopes: **Read and write**, restricted to the `@dmthepm`
     scope.
   - Organizations: none needed.
2. Copy the token. npm shows it once.
3. <https://github.com/dmthepm/commune-wiki/settings/secrets/actions> → **New
   repository secret** → name it exactly `NPM_TOKEN` → paste → **Add secret**.

**Verify:** the secret appears in that list as `NPM_TOKEN`. The workflow reads
it as the empty string when it is absent, so adding it is the only switch —
there is no workflow edit.

**Then merge the `chore(main): release 0.1.0` pull request.** Watch the
`Release` run in the Actions tab: the `publish` job should log `NPM_TOKEN is set
— publishing with the token fallback` and finish green.

**Verify:** `npm view @dmthepm/commune version` prints `0.1.0`, and
<https://www.npmjs.com/package/@dmthepm/commune> shows a **Provenance** panel
naming the workflow run.

---

## Step 4 — configure the trusted publisher

Now the package exists, so it has a settings page.

**Do:** <https://www.npmjs.com/package/@dmthepm/commune/access> → the **Trusted
Publisher** section → **GitHub Actions**, and enter these exactly. Every field
is case-sensitive.

| Field | Value |
| --- | --- |
| Organization or user | `dmthepm` |
| Repository | `commune-wiki` |
| Workflow filename | `release.yml` |
| Environment name | *leave empty* |
| Allowed actions | `npm publish` |

**Workflow filename is the filename only**, not `.github/workflows/release.yml`,
and it includes the `.yml`. If `release.yml` is ever renamed, this entry has to
be edited in the same change or publishing stops. There is a comment at the top
of the workflow saying so.

**Verify:** the section lists the publisher after saving. There is nothing to
test until the next release, which is exactly what step 5 sets up.

---

## Step 5 — take the token away

**Do:**

1. <https://github.com/dmthepm/commune-wiki/settings/secrets/actions> → the
   `NPM_TOKEN` row → **Remove**.
2. <https://www.npmjs.com/settings/~/tokens> → revoke the granular token from
   step 3.

**Verify:** the next release's `publish` job logs `No NPM_TOKEN — publishing
over OIDC as the trusted publisher` and still succeeds. Deleting the secret is
hygiene rather than a cutover — the npm CLI "automatically detects OIDC
environments and uses them for authentication before falling back to traditional
tokens", so OIDC would have won anyway — but a credential that exists is a
credential that can leak, and this one has no remaining job.

---

## Step 6 — point devon-wiki at the registry

Once `@dmthepm/commune` is on npm, devon-wiki's dependency stops being a git
ref. In devon-wiki's `package.json`:

```diff
-    "@dmthepm/commune": "github:dmthepm/commune-wiki#v0.1.0"
+    "@dmthepm/commune": "^0.1.0"
```

and delete its `pnpm.onlyBuiltDependencies` entry for the package — a published
tarball ships `lib/` prebuilt, so there is no `prepare` to approve. This is
#7's step 7 and is tracked there, listed here because it is the last human step
in the chain and the one that makes the publish worth having.

**Verify:** `pnpm install` in devon-wiki rewrites `pnpm-lock.yaml` with a
`registry.npmjs.org` resolution, and `pnpm build` still ends in `PASS`.

---

## If something goes wrong

**The release PR proposes the wrong version.** Do not merge it. Fix
`release-please-config.json` (`initial-version`, or `bootstrap-sha` if the
changelog is reaching too far back), push to `main`, and release-please rewrites
the same pull request on the next run.

**The publish job fails with a 404 or `ENEEDAUTH`.** Under trusted publishing
npm reports several distinct failures as a misleading 404. In order of
likelihood: the trusted publisher's workflow filename does not match
`release.yml`; the repository or user field is misspelled; the job is missing
`id-token: write` (it is not — it is declared, but a workflow edit could drop
it); or the npm CLI on the runner is older than 11.5.1, which the
`npm install --global npm@latest` step exists to prevent.

**Provenance is missing from the published version.** Provenance needs a public
repository, a public package, and `id-token: write`. All three hold here; if it
still does not appear, check that `package.json`'s `repository` URL still points
at `github.com/dmthepm/commune-wiki` — npm requires it to match, case-sensitively,
where the publish came from.

**A release has to be undone.** Do not unpublish; npm's unpublish window is
narrow and the version number is burned either way. Publish a new patch and, if
the bad version is dangerous, deprecate it: `npm deprecate @dmthepm/commune@0.1.0
"broken, use 0.1.1"`.

---

## Sources

All fetched 2026-09-03.

- npm, *Trusted publishing for npm packages* — <https://docs.npmjs.com/trusted-publishers>.
  "Trusted publishing requires npm CLI version 11.5.1 or later and Node version
  22.14.0 or higher." "The npm CLI automatically detects OIDC environments and
  uses them for authentication before falling back to traditional tokens."
  "Verify that the workflow filename matches exactly what you configured on
  npmjs.com, including the `.yml` extension. All fields are case-sensitive and
  must be exact." Provenance under trusted publishing "happens by default — you
  don't need to add the `--provenance` flag", for public repositories and public
  packages.
- npm, *Generating provenance statements* — <https://docs.npmjs.com/generating-provenance-statements>.
  `--provenance`, `permissions: id-token: write`, and "If you are publishing a
  package for the first time you will also need to explicitly set access to
  public: `npm publish --provenance --access public`."
- npm CLI issue #8544, *Allow publishing initial version with OIDC* —
  <https://github.com/npm/cli/issues/8544>. Open; created 2025-09-01, updated
  2026-08-05. The reason step 3 exists.
- pnpm issue #9812, *Support OIDC publishing ("trusted publishing")* —
  <https://github.com/pnpm/pnpm/issues/9812>. Closed 2025-07-30 with "`pnpm
  publish` runs `npm publish` under the hood"; a 2026-01-14 comment on the same
  thread reports trusted publishing failing under `pnpm publish` on a GitHub
  runner with npm 11.6 where plain `npm publish` succeeded. The reason the
  workflow publishes with `npm` and installs with `pnpm`.
- release-please, *Manifest Driven release-please* —
  <https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md>.
  Bootstrapping, `bootstrap-sha`, and: "The resulting PR will assume a default
  starting version for your package (currently 0.1.0 for 'node')."
- release-please config schema —
  <https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json>.
  `initial-version`, `include-component-in-tag`. The schema is
  `additionalProperties: false`, which is why the config file carries no
  comments and this document exists instead.
- `googleapis/release-please-action` — <https://github.com/googleapis/release-please-action>.
  v4 is current; `permissions: contents: write, pull-requests: write`;
  `release_created` and `tag_name` outputs.
- GitHub, *Managing GitHub Actions settings for a repository* —
  <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository>.
  "Allow GitHub Actions to create and approve pull requests", under Settings →
  Actions → General → Workflow permissions; disabled by default on
  personal-account repositories.
- GitHub, *Supported ecosystems and repositories* —
  <https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories>.
  pnpm is served by the `npm` ecosystem (v7–v10).

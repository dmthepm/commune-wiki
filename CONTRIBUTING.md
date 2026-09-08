# Contributing to Commune

First-run reports, clearer instructions and small reproducible fixes are useful contributions. Be respectful, describe the problem concretely and leave room for other people’s experience.

## Report a problem

For setup trouble, comment on [Tell me where it broke (#85)](https://github.com/dmthepm/commune-wiki/issues/85) or use the [first-run form](https://github.com/dmthepm/commune-wiki/issues/new?template=first-run.yml). Report where you stopped even if you do not know whether it is a bug. Include your OS, Node and package versions, approximate time spent, attempted step, expected result and actual result. Where you found Commune is optional.

For other bugs or feature ideas, [open an issue](https://github.com/dmthepm/commune-wiki/issues/new) describing what you were trying to do. Check existing issues for the same problem. For a feature, explain the use case and any workaround before proposing an implementation.

Use public sample notes or a small invented reproduction. Do not upload a private vault, credentials or unredacted personal logs. Screenshots and sanitized error output are optional. Questions can go in issues too.

## Develop the engine

To create your own wiki, start with [the starter](examples/starter/README.md). These steps are for changing Commune itself.

You need

- Node **22.18+**. `.nvmrc` selects Node 22. Use its current release. Tests and the repository’s Astro config import TypeScript source directly and need default type stripping. Published-package consumers need Node **22.12+** and Astro **7**.
- pnpm **10**, matching CI.
- Git.

Clone your fork, then run.

```bash
git clone https://github.com/YOUR_USERNAME/commune-wiki.git
cd commune-wiki
pnpm install --frozen-lockfile
pnpm dev
```

The dev server prints its local URL. To inspect a production build.

```bash
pnpm build
pnpm preview
```

The graph lives in `src/lib/`, the CLI in `src/cli/`, and the integration and markdown plugins in `src/`. Package components and styles live in `src/components/` and `src/styles/`. `bin/commune.mjs` runs the compiled `lib/` output. The [consumer fixture](tests/fixtures/consumer) tests the package against the local working tree. The [starter](examples/starter) is a separate project using published dependencies. Authoring skills live in `skills/`.

## Validate a change

Run checks appropriate to the files and behavior you changed. Engine or CLI changes should pass.

```bash
pnpm build:lib
pnpm test
pnpm build
```

`pnpm build` compiles the library, builds the wiki and gates the output. `pnpm test:consumer` explicitly installs and builds the consumer fixture. The test suite also exercises that boundary. For component or styling changes, inspect the affected routes in a browser, including narrow screens and keyboard navigation. For documentation changes, check commands, paths and links against the implementation.

For starter changes, run these from the repository root.

```bash
pnpm test:starter
COMMUNE_STARTER_INSTALL=1 pnpm test:starter
```

The first command checks the copier, destination safeguards and published dependency declarations. It skips the registry install test. The second also installs the copied starter’s dependencies from npm in a temporary directory, builds it and verifies the generated links and privacy checks. It needs registry access. Neither mode exercises browser interactions or proves a timed first install on another machine.

`commune check` reports findings in its output. Exit code 0 means the check completed, not that no problems were found. `commune gate` fails when the built output violates its checks.

Report exactly what you ran and any remaining limitations. A local build or automated fixture does not prove that a new person can finish setup on another machine.

## Submit a pull request

Create a branch in your fork and keep changes focused on one problem. Follow nearby code conventions, add tests for changed behavior where useful, and update affected docs. Do not revert unrelated changes from someone else working in the same checkout.

Use a descriptive title such as `fix: resolve apostrophes in note titles` or `docs: clarify starter prerequisites`. Explain the concrete problem, what changes for the user, and how you validated it. Include screenshots when a visual change needs them. Call out breaking changes and migration steps.

For sample notes, use the target title verbatim in `[[Note Title]]`. Aliases and display text can resolve, but `check` and `gate` report noncanonical spellings. Notes require a title and `visibility: public` to publish. Other frontmatter requirements depend on the consuming site’s schema. Research, pages and updates enter the engine’s graph regardless of visibility, so use public samples in those collections.

Contributions are licensed under the [MIT License](LICENSE).

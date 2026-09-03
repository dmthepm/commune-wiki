# Hosting

Commune builds to `dist/`, a directory of static files with no runtime and no
database. Any static host serves it: point the build command at `astro build`,
publish `dist/`, and you are done. Three things are worth setting whatever you
deploy to — serve the `.md` twins as `text/markdown` rather than letting the
host guess or offer them as a download (on Cloudflare Pages and Netlify that is
a `public/_headers` entry), add `src/pages/404.astro` so Astro emits a real
`dist/404.html` instead of the host's default, and pin the Node version your
host uses, because build images move. The concrete Cloudflare Pages trail —
headers file, Node pin, preview deploys — is
[issue #37](https://github.com/dmthepm/commune-wiki/issues/37).

A fourth thing if your dates are not written in frontmatter: the engine derives
them from commit history, and a host that clones shallowly has none to give. It
refuses to guess and prints `git history is shallow: dates come from frontmatter
only` once in the build log, so check the log for that line. On GitHub Actions
the fix is `fetch-depth: 0`; on a host with no clone-depth setting, either run
`git fetch --unshallow` as a build step or keep `updated:` in frontmatter, which
wins over history anyway. The full rule is in the README's
[Dates](../README.md#dates) section.

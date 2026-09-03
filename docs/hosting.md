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

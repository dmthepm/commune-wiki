# commune.md

The site for [Commune](https://github.com/dmthepm/commune-wiki), built as a Commune wiki on the published `@dmthepm/commune` package (0.13.0) and Astro 7. Its three sample notes (Small notes, Useful links, Writing in public) are real notes: their wikilinks, backlinks and markdown twins come from the engine, and the home page renders two of them beside their markdown source.

The design is Publishing Workshop: aubergine ink, pale pink paper, vermilion. The display face is Instrument Serif and the text face is Instrument Sans, both under the SIL Open Font License 1.1 and self-hosted through `@fontsource` packages. The page makes no third-party requests.

## Run it locally

You need Node 22.12 or newer and npm.

```sh
cd examples/commune-site
npm install
npm run dev        # http://localhost:4321
npm run build      # astro build, then commune gate
npm run preview    # serve dist/
npm run check      # commune check on the notes
```

This directory is standalone. It depends on the npm release, not on the repository's workspace, and it is not part of the published package.

## Deploy

It deploys through Cloudflare Workers Builds, connected to this repository from the Cloudflare dashboard:

- Root directory: `examples/commune-site`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

`wrangler.jsonc` serves `./dist` as static assets with no Worker script, answers unmatched paths with `404.html`, and routes `commune.md` and `www.commune.md` as custom domains. `wrangler` is pinned to an exact version. No account id or token is kept in this repository; the connection is made in the dashboard.

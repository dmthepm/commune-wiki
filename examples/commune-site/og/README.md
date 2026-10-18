# Share card and icons

`og.html` is the source for `public/og.png`, the 1200 by 630 share card. `icon.html` is the source for `public/favicon-32.png` and `public/apple-touch-icon.png`.

To regenerate them, run `npm install` in `examples/commune-site` so the fonts exist in `node_modules`, then render with any headless Chromium. Run these from `examples/commune-site`.

The share card, with Playwright's CLI:

```sh
npx playwright screenshot --viewport-size=1200,630 --wait-for-timeout=500 "file://$PWD/og/og.html" public/og.png
```

The icons need a transparent background for the rounded 32 px tile, so use a small script with `page.screenshot({ omitBackground: true })` at a viewport that matches the size. Load `og/icon.html?size=180` for the touch icon and `og/icon.html?size=32` for the favicon.

Open the results and check that nothing is clipped before committing.

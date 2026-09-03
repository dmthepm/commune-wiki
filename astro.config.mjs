import { defineConfig } from 'astro/config';
import tailwindcss from 'tailwindcss';
import sitemap from '@astrojs/sitemap';
import commune from './src/integration.ts';
import { communeMarkdown } from './src/markdown.ts';

// The deployed origin, declared once. `src/rehype-external-links.ts` decides what
// counts as external by comparing hosts against it, so the site's own host is
// configuration here rather than a constant baked into the engine.
const site = 'https://devonmeadows.com';

// https://astro.build/config
export default defineConfig({
	site,
	// Astro 7 renders markdown with Sätteri and no longer installs
	// `@astrojs/markdown-remark`. `src/remark-wikilinks.ts` is the mechanism this
	// whole project exists for, so the unified pipeline is reinstalled and kept
	// rather than ported: a Sätteri port is a rewrite of the product's core, not
	// a step in an engine upgrade, and it gets its own ticket.
	//
	// `communeMarkdown` is that pipeline, assembled by the package rather than
	// here: the plugin order and the option shapes are engine knowledge, and
	// this config is the same three lines every consumer writes. It goes to
	// `markdown.processor` rather than to `markdown.remarkPlugins` and
	// `markdown.rehypePlugins`, which Astro 7 deprecates and forwards here with
	// a warning.
	//
	// Imported from `./src/markdown.ts`, not from `@dmthepm/commune/markdown`:
	// the engine's own site builds from source, so a type error is a build
	// failure here rather than a surprise for whoever installs the next tag.
	markdown: {
		processor: communeMarkdown({ site }),
	},
	// Tailwind runs as a plain PostCSS plugin rather than through
	// `@astrojs/tailwind`, whose peer range stops at Astro 5. The integration
	// only ever did two things here: register the PostCSS plugin, and inject
	// Tailwind's base styles — which this project turns off, because the design
	// system in `src/styles/design-system.css` owns the reset. Declaring the
	// plugin inline also stops PostCSS looking for a config file it will not
	// find.
	//
	// Autoprefixer is deliberately absent: under Vite 8 the CSS goes through
	// Lightning CSS, whose own `targets` handling covers the prefixes this
	// project needs (#52's audit measured the difference at one obsolete
	// `-webkit-backdrop-filter` line Tailwind's preflight emits).
	vite: {
		css: {
			postcss: {
				plugins: [tailwindcss()],
			},
		},
	},
	integrations: [
		commune(),
		sitemap({
			changefreq: 'weekly',
			priority: 0.7,
			lastmod: new Date(),
		}),
	],
});

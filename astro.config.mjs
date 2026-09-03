import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import sitemap from '@astrojs/sitemap';
import backlinks from './src/integration.ts';
import remarkWikiLinks from './src/remark-wikilinks.ts';
import rehypeExternalLinks from './src/rehype-external-links.ts';

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
	// The plugins go to `unified()` rather than to `markdown.remarkPlugins` and
	// `markdown.rehypePlugins`, which Astro 7 deprecates and forwards here with
	// a warning.
	markdown: {
		processor: unified({
			remarkPlugins: [remarkWikiLinks],
			rehypePlugins: [[rehypeExternalLinks, { site }]],
		}),
	},
	// Tailwind runs as a plain PostCSS plugin rather than through
	// `@astrojs/tailwind`, whose peer range stops at Astro 5. The integration
	// only ever did two things here: register these two PostCSS plugins, and
	// inject Tailwind's base styles — which this project turns off, because the
	// design system in `src/styles/design-system.css` owns the reset. Declaring
	// the plugins inline also stops PostCSS looking for a config file it will
	// not find.
	vite: {
		css: {
			postcss: {
				plugins: [tailwindcss(), autoprefixer()],
			},
		},
	},
	integrations: [
		backlinks(),
		sitemap({
			changefreq: 'weekly',
			priority: 0.7,
			lastmod: new Date(),
		}),
	],
});

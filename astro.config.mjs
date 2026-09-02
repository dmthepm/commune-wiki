import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import sitemap from '@astrojs/sitemap';
import backlinks from './astro.backlinks.ts';
import remarkWikiLinks from './remark-wikilinks.ts';

// https://astro.build/config
export default defineConfig({
	site: 'https://devonmeadows.com',
	// Astro 7 renders markdown with Sätteri and no longer installs
	// `@astrojs/markdown-remark`. `remark-wikilinks.ts` is the mechanism this
	// whole project exists for, so the unified pipeline is reinstalled and kept
	// rather than ported: a Sätteri port is a rewrite of the product's core, not
	// a step in an engine upgrade, and it gets its own ticket.
	markdown: {
		processor: unified({
			remarkPlugins: [remarkWikiLinks],
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

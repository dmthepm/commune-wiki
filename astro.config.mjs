import { defineConfig } from 'astro/config';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import sitemap from '@astrojs/sitemap';
import backlinks from './astro.backlinks.ts';
import remarkWikiLinks from './remark-wikilinks.ts';

// https://astro.build/config
export default defineConfig({
	site: 'https://devonmeadows.com',
	markdown: {
		remarkPlugins: [remarkWikiLinks],
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

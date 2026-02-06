import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
// import sitemap from '@astrojs/sitemap'; // TODO: re-enable once upstream bug is fixed
import backlinks from './astro.backlinks.ts';
import remarkWikiLinks from './remark-wikilinks.ts';
import { config } from './src/config.ts';

// https://astro.build/config
export default defineConfig({
	site: config.siteUrl,
	markdown: {
		remarkPlugins: [remarkWikiLinks],
	},
	integrations: [
		tailwind({
			// Don't apply Tailwind's base styles - preserve our design system
			applyBaseStyles: false,
		}),
		backlinks(),
		// sitemap({ changefreq: 'weekly', priority: 0.7, lastmod: new Date() }), // TODO: re-enable
	],
});

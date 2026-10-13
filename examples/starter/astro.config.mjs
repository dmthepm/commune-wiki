import { defineConfig } from 'astro/config';
import commune from '@dmthepm/commune/astro';
import { communeMarkdown } from '@dmthepm/commune/markdown';
import { siteConfig } from './src/site.config.ts';

const site = siteConfig.url;

export default defineConfig({
  site,
  markdown: { processor: communeMarkdown({ site }) },
  integrations: [commune()],
});

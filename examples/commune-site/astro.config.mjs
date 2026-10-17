import { defineConfig } from 'astro/config';
import commune from '@dmthepm/commune/astro';
import { communeMarkdown } from '@dmthepm/commune/markdown';
import { siteConfig } from './src/site.config.ts';

const site = siteConfig.url;

export default defineConfig({
  site,
  markdown: { processor: communeMarkdown({ site }) },
  integrations: [commune()],
  // Use this site's tsconfig. Without it, a build from a fresh clone of the
  // repo also loads the repo-root tsconfig, whose base lives in root
  // node_modules that a site-only install never creates.
  vite: { tsconfig: './tsconfig.json' },
});

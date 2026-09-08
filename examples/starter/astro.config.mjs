import { defineConfig } from 'astro/config';
import commune from '@dmthepm/commune/astro';
import { communeMarkdown } from '@dmthepm/commune/markdown';

// Change this to your deployment origin before publishing at a domain root.
const site = 'https://example.com';

export default defineConfig({
  site,
  markdown: { processor: communeMarkdown({ site }) },
  integrations: [commune()],
});

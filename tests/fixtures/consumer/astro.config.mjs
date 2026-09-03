import { defineConfig } from 'astro/config';
import commune from '@dmthepm/commune/astro';
import { communeMarkdown } from '@dmthepm/commune/markdown';

// A stranger's wiki, in full. Everything below is what the README asks a
// consumer to write: one origin, one processor, one integration. If this file
// ever needs a fourth line to make wikilinks work, the package has leaked
// something it should be keeping.
const site = 'https://example.com';

export default defineConfig({
	site,
	markdown: { processor: communeMarkdown({ site }) },
	integrations: [commune()],
});

/**
 * The markdown processor, assembled once.
 *
 * Astro 7 renders markdown with Sätteri and no longer installs the unified
 * pipeline, so a consumer who wants `[[WikiLinks]]` has to build a processor
 * and hand it to `markdown.processor`. That is three imports, an option shape
 * and one ordering rule (the remark plugin turns wikilinks into links; the
 * rehype plugin then decides which links are external) — all of it engine
 * knowledge, none of it a decision a wiki's author should have to re-derive.
 * This function is that assembly, so `astro.config.mjs` reads as one line.
 *
 * `site` is a parameter and not a constant because the engine has no host of
 * its own: what counts as an external link is decided against the consumer's
 * own origin, which lives once in their `defineConfig({ site })`.
 */

import { unified } from '@astrojs/markdown-remark';
import remarkWikiLinks from './remark-wikilinks.ts';
import rehypeExternalLinks from './rehype-external-links.ts';
import type { GraphOptions } from './lib/graph.ts';

export interface CommuneMarkdownOptions extends GraphOptions {
	/** The site's own origin, exactly as `astro.config.mjs` declares `site`. */
	site?: string | URL;
	/**
	 * The project root, for resolving `[[WikiLinks]]` against its content tree.
	 *
	 * Inherited from `GraphOptions`, and almost never worth passing: it
	 * defaults to `process.cwd()`, which is also the default Astro resolves
	 * `root` to. Pass it when the build runs from somewhere other than the
	 * project directory — the same case `astro build --root` exists for.
	 */
	root?: string;
}

export function communeMarkdown({ site, root }: CommuneMarkdownOptions = {}) {
	return unified({
		remarkPlugins: [[remarkWikiLinks, { root }]],
		rehypePlugins: [[rehypeExternalLinks, { site }]],
	});
}

/**
 * Rehype plugin to open every external link in a new tab.
 *
 * The design system marks `a[target="_blank"]` with an arrow, so setting the
 * attribute here is what makes that marker automatic for plain markdown links.
 */

import { visit } from 'unist-util-visit';
import type { Root } from 'hast';

export interface ExternalLinksOptions {
	/** The site's own origin, exactly as `astro.config.mjs` declares `site`. */
	site?: string | URL;
}

/**
 * Rehype plugin function
 */
export default function rehypeExternalLinks({ site }: ExternalLinksOptions = {}) {
	// A link is internal because it points at the site's own host, and the
	// engine has no host of its own: it comes from the Astro `site` config.
	// Without one, nothing can be recognised as internal by hostname — only
	// relative links stay untouched.
	const siteHost = site ? new URL(site).hostname : null;

	return function transformer(tree: Root) {
		visit(tree, 'element', (node) => {
			if (node.tagName !== 'a') return;

			// A link that already declares `target` was written by hand — raw
			// HTML in a note, or a component — and owns its own `rel`.
			// Overwriting it would drop attributes its author chose.
			if (node.properties?.target !== undefined) return;

			const href = node.properties?.href;
			if (typeof href !== 'string') return;

			// Wikilinks and internal links are relative, so they have no
			// protocol, never match here, and are left alone.
			if (!href.startsWith('http://') && !href.startsWith('https://')) return;

			let hostname;
			try {
				hostname = new URL(href).hostname;
			} catch {
				return;
			}
			if (hostname === siteHost) return;

			node.properties.target = '_blank';
			node.properties.rel = ['noopener', 'noreferrer'];
		});
	};
}

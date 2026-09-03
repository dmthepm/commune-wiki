/**
 * Remark plugin to transform WikiLinks [[Note Title]] into proper markdown links.
 *
 * Transforms:
 *   [[Atomic Notes]] → [Atomic Notes](/notes/atomic-notes/)
 *   [[Note Title|Display Text]] → [Display Text](/notes/note-title/)
 *
 * This runs at build time during markdown compilation, before HTML generation.
 * Which content exists, and the URL each piece lives at, is decided by the
 * graph core in `src/lib/graph.ts` — not here.
 */

import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import { getLinkLookup } from './lib/graph.ts';

/**
 * Remark plugin function
 */
export default function remarkWikiLinks() {
	return async function transformer(tree: Root) {
		const lookup = await getLinkLookup();

		visit(tree, 'text', (node, index, parent) => {
			if (!parent || index === undefined) return;

			const text = node.value;
			const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

			// Check if this text node contains WikiLinks
			if (!wikiLinkRegex.test(text)) return;

			// Reset regex
			wikiLinkRegex.lastIndex = 0;

			const newNodes: any[] = [];
			let lastIndex = 0;
			let match;

		while ((match = wikiLinkRegex.exec(text)) !== null) {
			const [fullMatch, linkText, displayText] = match;
			const startIndex = match.index;

			// Add text before the WikiLink
			if (startIndex > lastIndex) {
				newNodes.push({
					type: 'text',
					value: text.slice(lastIndex, startIndex),
				});
			}

			// Resolve WikiLink to URL path
			const trimmedLinkText = linkText.trim();
			const lookupKey = trimmedLinkText.toLowerCase();
			const resolved = lookup.get(lookupKey);

			if (resolved) {
				// Create a proper link node with correct URL for collection
				// Add data-collection attribute to identify research links for styling
				const linkNode: any = {
					type: 'link',
					url: resolved.urlPath,
					children: [
						{
							type: 'text',
							value: displayText?.trim() || trimmedLinkText,
						},
					],
				};

				// Add data attribute for research links (will be used for new tab behavior)
				if (resolved.collection === 'research') {
					linkNode.data = {
						hProperties: {
							'data-collection': 'research',
							'class': 'wikilink research-link'
						}
					};
				} else {
					linkNode.data = {
						hProperties: {
							'class': 'wikilink'
						}
					};
				}

				newNodes.push(linkNode);
			} else {
				// Leave unresolved WikiLinks as plain text (without brackets)
				// These are notes that don't exist yet in the public wiki
				newNodes.push({
					type: 'text',
					value: displayText?.trim() || trimmedLinkText,
				});
			}

			lastIndex = startIndex + fullMatch.length;
		}

			// Add remaining text
			if (lastIndex < text.length) {
				newNodes.push({
					type: 'text',
					value: text.slice(lastIndex),
				});
			}

			// Replace the text node with our transformed nodes
			if (newNodes.length > 0) {
				parent.children.splice(index, 1, ...newNodes);
			}
		});
	};
}

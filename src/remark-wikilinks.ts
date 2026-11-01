/**
 * Remark plugin to transform WikiLinks [[Note Title]] into proper markdown links.
 *
 * Transforms:
 *   [[Atomic Notes]] → [Atomic Notes](/notes/atomic-notes/)
 *   [[Note Title|Display Text]] → [Display Text](/notes/note-title/)
 *   [[Note Title#Some Heading]] → [Note Title#Some Heading](/notes/note-title/#some-heading)
 *   [[#Some Heading]] → [#Some Heading](#some-heading), on the page it is written in
 *
 * A block ref (`[[Note Title^id]]`) links to the note and no further.
 *
 *   [[Folder/Note]] → the note at that path, when no title is spelled that way
 *   ![[photo.png]] → an image, found by file name under `public/attachments`
 *   ![[photo.png|300]] → the same image, 300 pixels wide
 *   ![alt](img/photo.png) → left to Astro when the file is beside the note,
 *     else the image under `public/attachments`, else its alt text. Astro stops
 *     the whole build on a relative image it cannot find, so none is left to it
 *     that is not there. External and absolute URLs are never touched.
 *
 * Inside a table Obsidian writes `[[Name\|label]]`; the backslash is not part
 * of the name.
 *
 * This runs at build time during markdown compilation, before HTML generation.
 * Which content exists, and the URL each piece lives at, is decided by the
 * graph core in `src/lib/graph.ts` — not here.
 */

import { visit, SKIP } from 'unist-util-visit';
import type { Root } from 'mdast';
import path from 'node:path';
import { statSync } from 'node:fs';
import {
	getImageIndex,
	getLinkLookup,
	imageUrl,
	isImageName,
	linkKey,
	noteDir,
	relativeImagePath,
	resolveImage,
	resolveMarkdownImage,
	splitWikilinkTarget,
	type GraphOptions,
} from './lib/graph.ts';

export type WikiLinksOptions = GraphOptions;

/**
 * Remark plugin function.
 *
 * Takes the project root rather than assuming one, because the plugin resolves
 * links against the content tree of whichever project is being built — which,
 * once this is a package in somebody else's `node_modules`, is not the
 * directory this file lives in. Omitting it falls back to `process.cwd()`,
 * which is also Astro's own default for `root`, so a consumer who does not
 * pass one gets the project they ran `astro build` in.
 */
export default function remarkWikiLinks({ root }: WikiLinksOptions = {}) {
	return async function transformer(tree: Root, file?: { path?: string }) {
		const lookup = await getLinkLookup({ root });
		const images = await getImageIndex({ root });
		// The folder the note sits in decides which of two same-named images is meant.
		const relative = file?.path ? path.relative(path.resolve(root ?? process.cwd()), file.path) : '';
		const fromDir = relative && !relative.startsWith('..') ? noteDir(relative) : '';

		visit(tree, 'text', (node, index, parent) => {
			if (!parent || index === undefined) return;

			const text = node.value;
			const wikiLinkRegex = /\[\[([^\]|]+?)\\?(?:\|([^\]]+))?\]\]/g;

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

			// Add text before the WikiLink. A `!` right before it makes it an embed.
			const embed = startIndex > 0 && text.charAt(startIndex - 1) === '!';
			const before = text.slice(lastIndex, embed ? startIndex - 1 : startIndex);
			if (before) newNodes.push({ type: 'text', value: before });

			// An image: `![[photo.png|300]]` is the file, and the pipe holds a size or a caption.
			const imageName = splitWikilinkTarget(linkText.trim()).target;
			const image = isImageName(imageName) ? resolveImage(images, imageName, fromDir) : undefined;
			if (image) {
				const size = displayText?.trim().match(/^(\d+)(?:x(\d+))?$/);
				const caption = size ? '' : displayText?.trim() ?? '';
				if (embed) {
					newNodes.push({
						type: 'image',
						url: imageUrl(image),
						alt: caption || imageName.split('/').pop(),
						...(size ? { data: { hProperties: { width: size[1], ...(size[2] ? { height: size[2] } : {}) } } } : {}),
					});
				} else {
					newNodes.push({
						type: 'link',
						url: imageUrl(image),
						children: [{ type: 'text', value: caption || linkText.trim() }],
						data: { hProperties: { class: 'wikilink' } },
					});
				}
				lastIndex = startIndex + fullMatch.length;
				continue;
			}
			if (embed) newNodes.push({ type: 'text', value: '!' });

			// Resolve WikiLink to URL path
			const trimmedLinkText = linkText.trim();
			const { target, anchor } = splitWikilinkTarget(trimmedLinkText);
			const resolved = target ? lookup.get(linkKey(target)) : undefined;
			// `[[#Heading]]` names no note: it points inside the page it is written on.
			const sameNote = !target && anchor !== undefined;

			if (sameNote) {
				newNodes.push({
					type: 'link',
					url: `#${anchor}`,
					children: [{ type: 'text', value: displayText?.trim() || trimmedLinkText }],
					data: { hProperties: { class: 'wikilink' } },
				});
			} else if (resolved) {
				// Create a proper link node with correct URL for collection
				// Add data-collection attribute to identify research links for styling
				const linkNode: any = {
					type: 'link',
					url: anchor ? `${resolved.urlPath}#${anchor}` : resolved.urlPath,
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

		const here = file?.path ? path.dirname(file.path) : '';
		visit(tree, 'image', (node, index, parent) => {
			const wanted = relativeImagePath(node.url);
			if (!wanted || !parent || index === undefined) return;
			if (here && statSync(path.join(here, ...wanted.split('/')), { throwIfNoEntry: false })?.isFile()) return;
			const found = resolveMarkdownImage(images, wanted, fromDir);
			if (found) {
				node.url = imageUrl(found);
				return;
			}
			parent.children.splice(index, 1, ...(node.alt ? [{ type: 'text' as const, value: node.alt }] : []));
			return [SKIP, index];
		});
	};
}

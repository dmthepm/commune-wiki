/**
 * Split a markdown file into its YAML frontmatter and its body.
 *
 * This replaced gray-matter (#131), whose js-yaml 3 chain carried an advisory
 * with no fix into every install. The rules are the ones the engine already
 * relied on, so the split point and the body's bytes do not move:
 *
 *   - the opening `---` must be the first thing in the file, after an optional
 *     BOM. `----`, an indented fence or a blank line before it means no block;
 *   - the block ends at the first line that starts with `---`, and the one
 *     newline that ends that line (`\n` or `\r\n`) is not part of the body;
 *   - a block with nothing but blank lines and comments is `{}`;
 *   - a fence that never closes takes the rest of the file, as it always has.
 *
 * A language tag (`---yaml`, `---toml`, `---json`) is skipped and the block is
 * always read as YAML.
 *
 * js-yaml's default schema is what Astro's content layer parses with, and it
 * reads `2024-01-02` and full timestamps as `Date` objects.
 */

import { load } from 'js-yaml';

export interface ParsedFrontmatter {
	/** The parsed block. `{}` when there is no block or it holds nothing but comments. */
	data: Record<string, unknown>;
	/** Everything after the closing fence, with the one newline that ends the fence removed. */
	content: string;
}

const FENCE = '---';

/** Throws when the block is not valid YAML. */
export function parseFrontmatter(source: string): ParsedFrontmatter {
	let text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;

	if (!text.startsWith(FENCE) || text.charAt(FENCE.length) === '-') {
		return { data: {}, content: text };
	}
	text = text.slice(FENCE.length);

	// Anything between the fence and the end of its line, such as `---yaml`, is a
	// language tag. Only YAML is read, but a tag must not be mistaken for YAML.
	const firstLineEnd = text.indexOf('\n');
	const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
	if (/^[ \t]*[A-Za-z][\w-]*[ \t]*\r?$/.test(firstLine)) text = text.slice(firstLine.length);

	const closeIndex = text.indexOf('\n' + FENCE);
	const block = closeIndex === -1 ? text : text.slice(0, closeIndex);

	let content = '';
	if (closeIndex !== -1) {
		content = text.slice(closeIndex + 1 + FENCE.length);
		if (content.startsWith('\r')) content = content.slice(1);
		if (content.startsWith('\n')) content = content.slice(1);
	}

	const data = load(block);
	return { data: (data ?? {}) as Record<string, unknown>, content };
}

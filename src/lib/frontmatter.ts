/**
 * Split a markdown file into its YAML frontmatter and its body.
 */

import matter from 'gray-matter';

export interface ParsedFrontmatter {
	/** The parsed block. `{}` when there is no block or it holds nothing but comments. */
	data: Record<string, unknown>;
	/** Everything after the closing fence, with the one newline that ends the fence removed. */
	content: string;
}

/** Throws when the block is not valid YAML. */
export function parseFrontmatter(source: string): ParsedFrontmatter {
	const { data, content } = matter(source);
	return { data, content };
}

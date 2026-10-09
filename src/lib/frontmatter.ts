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
 * The YAML is read the way Astro's content layer reads it. As of
 * `@astrojs/internal-helpers` 0.12.0 that is the `yaml` package (before it,
 * js-yaml), through `parseYaml` in `dist/yaml.js` and `parseFrontmatter` in
 * `dist/frontmatter.js` of that package (#148):
 *
 *   parseDocument(source, { schema: 'core', merge: true, customTags: ['timestamp'] })
 *
 * The core schema is YAML 1.2, so `yes`/`no` are strings and `010` is 10. The
 * `timestamp` tag keeps `2024-01-02` and full timestamps as `Date` objects, which
 * is what the content collections' `z.date()` expects. `merge: true` honours
 * `<<` keys. Duplicate keys and any other parse error throw, as `yaml`'s
 * defaults (`uniqueKeys`, `maxAliasCount: 100`) are left alone. A block with no
 * contents (empty or comments only), or one that is not a mapping or a list, is `{}`.
 *
 * Astro's own helper splits the block with a looser regex and also accepts
 * `+++` TOML. The split rules above are kept as they are.
 */

import { parseDocument } from 'yaml';

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
	// The newline before the closing fence stays in the block, as in Astro's helper.
	// `yaml` reads a final `\r` without its `\n` as part of the last value.
	const block = closeIndex === -1 ? text : text.slice(0, closeIndex + 1);

	let content = '';
	if (closeIndex !== -1) {
		content = text.slice(closeIndex + 1 + FENCE.length);
		if (content.startsWith('\r')) content = content.slice(1);
		if (content.startsWith('\n')) content = content.slice(1);
	}

	return { data: parseYaml(block), content };
}

/** Mirrors `parseYaml` in `@astrojs/internal-helpers` 0.12.0 (`dist/yaml.js`). */
function parseYaml(source: string): Record<string, unknown> {
	const document = parseDocument(source, {
		customTags: ['timestamp'],
		merge: true,
		schema: 'core',
	});
	const [error] = document.errors;
	if (error) throw error;
	if (document.contents === null) return {};
	const value: unknown = document.toJS();
	return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

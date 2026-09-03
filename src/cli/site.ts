/**
 * Finding the site's own origin, without starting Astro.
 *
 * `site` is what tells the rehype plugin which links are the wiki's own, so
 * rendering with the wrong one marks every internal absolute link as external.
 * The value lives in the consumer's `astro.config.*` — but importing that file
 * would load Astro, the integrations and whatever else the config pulls in,
 * which is exactly the process this CLI exists to avoid, and would execute the
 * consumer's code to answer a question about a string.
 *
 * So the config is read as text and searched for the two spellings that
 * actually occur: the property inside `defineConfig`, and the `const` above it
 * that the property is a shorthand for. Both real wikis use the second. This is
 * a best effort by construction: `--site` overrides it, and when neither
 * produces an answer the fallback is announced on stderr rather than assumed.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The origin used when nothing else names one.
 *
 * A reserved example domain, so a link to it can never collide with a real
 * host: with this in force, every absolute link renders as external, which is
 * the safe way to be wrong.
 */
export const DEFAULT_SITE = 'https://example.com';

const CONFIG_FILES = ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.mts'];

/** `site: 'https://…'` inside the config object, or `const site = 'https://…'` above it. */
const SITE_PATTERNS = [/\bsite\s*:\s*['"`]([^'"`]+)['"`]/, /\bsite\s*=\s*['"`]([^'"`]+)['"`]/];

export type SiteSource = 'flag' | 'config' | 'default';

export interface ResolvedSite {
	site: string;
	source: SiteSource;
}

/** Read `site` out of a project's Astro config, if it declares one this way. */
async function readSiteFromConfig(root: string): Promise<string | undefined> {
	for (const name of CONFIG_FILES) {
		let source: string;
		try {
			source = await readFile(path.join(root, name), 'utf8');
		} catch {
			continue;
		}

		for (const pattern of SITE_PATTERNS) {
			const value = pattern.exec(source)?.[1];
			// Only a real origin: `site: undefined` and a templated string are
			// both better answered by the default than by a guess.
			if (value && URL.canParse(value)) return value;
		}
	}

	return undefined;
}

export async function resolveSite(flag: string | undefined, root: string): Promise<ResolvedSite> {
	if (flag !== undefined) return { site: flag, source: 'flag' };

	const configured = await readSiteFromConfig(root);
	if (configured !== undefined) return { site: configured, source: 'config' };

	return { site: DEFAULT_SITE, source: 'default' };
}

/**
 * `commune render` — a draft as the site will render it.
 *
 * The review surface the map listed as "not yet specified" needs one thing the
 * rest of the CLI does not provide: the actual HTML, with `[[WikiLinks]]`
 * resolved against the real content tree and external links marked, for a
 * document that is not a page yet and may never be committed. Astro can produce
 * that, but only by building the whole site, which is a per-turn cost nobody
 * pays to look at one paragraph.
 *
 * So the pipeline is borrowed rather than reimplemented: `communeMarkdown` is
 * the same processor `astro.config.mjs` hands to `markdown.processor`, and this
 * verb drives it directly. The rule that keeps it honest is that this file adds
 * no plugin, no option and no post-processing of its own — anything that made
 * the CLI's HTML differ from the site's would make the review surface a liar.
 *
 * `links` and `unresolved` come from the graph core rather than from the
 * rendered tree. An unresolved wikilink renders as plain text on purpose, so by
 * the time there is HTML the broken link is indistinguishable from a sentence,
 * and the one thing a reviewer most needs to be told is gone.
 */

import { communeMarkdown } from '../markdown.ts';
import {
	buildLinkLookup,
	buildUrlLookup,
	extractLinks,
	loadContentEntries,
	resolveLink,
} from '../lib/graph.ts';
import { SCHEMA, writeJson } from './output.ts';
import { EXIT_OK } from './errors.ts';
import { readSource } from './source.ts';
import { resolveSite } from './site.ts';

export async function renderCommand(
	root: string,
	input: string,
	siteFlag: string | undefined,
	json: boolean
): Promise<number> {
	// Read before anything else: `-` has to consume stdin before a slow scan of
	// the content tree, or a producer writing into the pipe waits on us.
	const source = await readSource(input, root, { allowText: false });
	const { site, source: siteSource } = await resolveSite(siteFlag, root);

	if (siteSource === 'default') {
		// On stderr, and only when nothing named an origin: `site` decides which
		// links are the wiki's own, so a caller who did not supply one is
		// looking at every absolute link marked external and deserves to know
		// why. In `--json` the field says it too, without the noise.
		process.stderr.write(
			`commune: no --site and none found in the Astro config; rendering against ${site}, ` +
				`so every absolute link counts as external\n`
		);
	}

	const entries = await loadContentEntries({ root });
	const byName = buildLinkLookup(entries);
	const byUrl = buildUrlLookup(entries);
	const byUrlPath = new Map(entries.map((entry) => [entry.urlPath, entry]));

	const links = extractLinks(source.text, source.frontmatter).map((link) => {
		const target = resolveLink(link, byName, byUrl);
		const entry = target ? byUrlPath.get(target.urlPath) : undefined;
		return {
			kind: link.kind,
			target: link.target,
			resolved: entry
				? { urlPath: entry.urlPath, title: entry.title, collection: entry.collection }
				: null,
		};
	});

	const renderer = await communeMarkdown({ site, root }).createRenderer({});
	const { code } = await renderer.render(source.text, { frontmatter: source.frontmatter });

	if (json) {
		writeJson({
			schema: SCHEMA,
			root,
			site,
			source: { kind: source.kind, ...(source.file ? { file: source.file } : {}) },
			html: code,
			links,
			// The projection a reviewer acts on: the names in the draft that
			// point at nothing, which the HTML has already turned into prose.
			unresolved: links.filter((link) => !link.resolved).map((link) => link.target),
		});
		return EXIT_OK;
	}

	process.stdout.write(code.endsWith('\n') ? code : `${code}\n`);
	return EXIT_OK;
}

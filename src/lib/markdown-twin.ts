/**
 * The dev server's lookup of a `<url>.md` request. Internal: it lives apart
 * from `integration.ts` because everything that module exports is the public
 * `@dmthepm/commune/astro` entry, which is `commune()` alone.
 */

import path from 'node:path';
import { loadContentEntries, toMarkdownPath } from './graph.ts';

/**
 * The dev server's answer to a `<url>.md` request: the same source file the
 * build copies, read on each request so an edit shows up without a restart.
 *
 * The build writes twins in `astro:build:done`, which `astro dev` never runs,
 * so without this a page's "view as markdown" link 404s in exactly the server
 * a first run lands in. The lookup goes through `toMarkdownPath`, the mapping
 * the build writer uses, so dev and build cannot disagree about which URL is
 * which file. Anything that is not a twin falls through to Astro.
 */
export async function findMarkdownTwin(root: string, pathname: string): Promise<string | undefined> {
	if (!pathname.endsWith('.md')) return undefined;

	let requested: string;
	try {
		requested = decodeURI(pathname).replace(/^\/+/, '');
	} catch {
		return undefined;
	}

	const entries = await loadContentEntries({ root });
	const owners = entries.filter((candidate) =>
		[candidate.urlPath, ...candidate.routes].some((urlPath) => {
			try {
				return toMarkdownPath(urlPath) === requested;
			} catch {
				return false;
			}
		})
	);

	// The build refuses this; the dev server must not hide it by answering with
	// whichever entry happens to come first.
	if (owners.length > 1) {
		throw new Error(
			`${requested} is the markdown twin of more than one entry: ${owners
				.map((owner) => owner.file)
				.join(', ')}. Run \`commune check\` for the route-collision.`
		);
	}

	return owners.length ? path.join(root, owners[0].file) : undefined;
}

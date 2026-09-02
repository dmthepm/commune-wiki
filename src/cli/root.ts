/**
 * Resolving `--root`.
 *
 * `--root` names the *project* root: the directory that contains `src/content`.
 * Not `src/content` itself — every slug and every `file` value in the graph is
 * derived by stripping `src/content/<collection>/` off the front of a path, so
 * a root one level too deep produces a complete, confident, wrong answer with
 * no error anywhere. Requiring `src/content` to exist under the root turns that
 * silent corruption into an exit 1 on the first command.
 */

import { stat } from 'node:fs/promises';
import path from 'node:path';
import { failure } from './errors.ts';

export async function resolveRoot(value: string | undefined): Promise<string> {
	const root = path.resolve(value ?? process.cwd());
	const content = path.join(root, 'src', 'content');

	let stats;
	try {
		stats = await stat(content);
	} catch {
		throw failure(
			'ENOCONTENT',
			`${root} is not a project root: no src/content directory. --root names the directory that contains src/content, not src/content itself.`
		);
	}

	if (!stats.isDirectory()) {
		throw failure('ENOCONTENT', `${content} is not a directory`);
	}

	return root;
}

/**
 * Where a verb's markdown comes from: a file, stdin, or the argument itself.
 *
 * One reader for `graph related` and `render`, because they take the same
 * positional and have to agree about what it means — including the part that is
 * easy to get subtly different, which is that a path is tried against `--root`
 * before the cwd. The root is the vault being asked about; the cwd is wherever
 * the operator happens to be standing.
 *
 * The one difference between the two callers is what a string that names no
 * file means. `graph related` answers questions about prose, so it is text.
 * `render` renders a document, and a mistyped path silently rendering as its
 * own filename would be a wrong answer with no error anywhere, so it fails.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { failure } from './errors.ts';

export interface Source {
	kind: 'file' | 'text' | 'stdin';
	/** Root-relative and POSIX-separated, for a file. */
	file?: string;
	/** The markdown body, with any frontmatter split off. */
	text: string;
	frontmatter: Record<string, unknown>;
}

export interface ReadSourceOptions {
	/** Whether a string naming no file is prose (`graph related`) or an error (`render`). */
	allowText: boolean;
}

async function isFile(candidate: string): Promise<boolean> {
	try {
		return (await stat(candidate)).isFile();
	} catch {
		return false;
	}
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString('utf8');
}

/**
 * Resolve the positional into markdown and its frontmatter.
 *
 * `-` is stdin, which is how a draft that is not a file yet gets asked about —
 * and it is frontmatter-aware there too, so piping a whole note in behaves the
 * same as naming it.
 */
export async function readSource(
	input: string,
	root: string,
	{ allowText }: ReadSourceOptions
): Promise<Source> {
	if (input === '-') {
		const { content, data } = matter(await readStdin());
		return { kind: 'stdin', text: content, frontmatter: data };
	}

	const candidates = path.isAbsolute(input) ? [input] : [path.join(root, input), path.resolve(input)];

	for (const candidate of candidates) {
		if (!(await isFile(candidate))) continue;

		let source: string;
		try {
			source = await readFile(candidate, 'utf8');
		} catch (error) {
			throw failure('EPARSE', `cannot read ${candidate}: ${(error as Error).message}`);
		}

		let parsed;
		try {
			parsed = matter(source);
		} catch (error) {
			throw failure(
				'EPARSE',
				`cannot parse frontmatter in ${candidate}: ${(error as Error).message}`
			);
		}

		return {
			kind: 'file',
			file: path.relative(root, candidate).split(path.sep).join('/'),
			text: parsed.content,
			frontmatter: parsed.data,
		};
	}

	if (!allowText) {
		throw failure('EPARSE', `cannot read ${input}: no such file under ${root} or the cwd`);
	}

	return { kind: 'text', text: input, frontmatter: {} };
}

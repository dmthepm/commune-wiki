/**
 * Argument parsing and dispatch.
 *
 * `node:util.parseArgs` has no notion of subcommands, so routing is two passes
 * over the same argv. The first is non-strict and only looks for positionals —
 * enough to learn that this is `graph query` — while still consuming `--root`'s
 * value correctly, since declared string options keep their type even in
 * non-strict mode. The second pass is strict against that subcommand's schema,
 * which is what turns a typo into exit 2 instead of a silently ignored flag.
 *
 * Being non-strict first is also what lets a parse *failure* be rendered as
 * JSON: `--json` is known before the strict parse that rejects the argv.
 */

import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';
import { CliError, EXIT_OK, EXIT_USAGE, isParseArgsError, usageError } from './errors.ts';
import { writeError } from './render.ts';
import { resolveRoot } from './root.ts';
import { parseRecent, queryCommand, type QueryFilters } from './query.ts';
import { checkCommand } from './check.ts';
import { gateCommand } from './gate.ts';
import { relatedCommand } from './related.ts';
import { updateCommand } from './update.ts';
import { COMMAND_USAGE, USAGE } from './usage.ts';
import { readVersion } from './version.ts';

/** Options understood everywhere, in any position. */
const GLOBAL: ParseArgsOptionsConfig = {
	root: { type: 'string' },
	json: { type: 'boolean', default: false },
	help: { type: 'boolean', default: false },
};

const QUERY_OPTIONS: ParseArgsOptionsConfig = {
	...GLOBAL,
	collection: { type: 'string', multiple: true, default: [] },
	tag: { type: 'string', multiple: true, default: [] },
	status: { type: 'string' },
	orphans: { type: 'boolean', default: false },
	deadends: { type: 'boolean', default: false },
	recent: { type: 'string' },
};

const UPDATE_OPTIONS: ParseArgsOptionsConfig = {
	...GLOBAL,
	recent: { type: 'string', default: '7d' },
	write: { type: 'boolean', default: false },
};

const GATE_OPTIONS: ParseArgsOptionsConfig = {
	...GLOBAL,
	dist: { type: 'string' },
};

/** Every route, longest first, so `graph query` is matched before a bare `graph`. */
const ROUTES = ['graph query', 'graph related', 'check', 'gate', 'update'];

interface Route {
	name: string;
	/** argv with the route's own words removed, ready for a strict parse. */
	rest: string[];
}

/**
 * Find which command this argv names, without committing to its schema yet.
 *
 * Route words are positionals wherever they appear, so `--root x graph query`
 * and `graph query --root x` route identically — which matters because the two
 * spellings are equally natural and only one of them can be the documented one.
 */
function route(args: string[]): Route {
	const { positionals, tokens } = parseArgs({
		args,
		options: GLOBAL,
		allowPositionals: true,
		strict: false,
		tokens: true,
	});

	const indices = tokens.filter((token) => token.kind === 'positional').map((token) => token.index);

	for (const candidate of ROUTES) {
		const words = candidate.split(' ');
		if (words.every((word, i) => positionals[i] === word)) {
			const consumed = new Set(indices.slice(0, words.length));
			return { name: candidate, rest: args.filter((_, i) => !consumed.has(i)) };
		}
	}

	if (!positionals.length) {
		throw usageError('no command given', USAGE);
	}
	throw usageError(`unknown command: ${positionals.slice(0, 2).join(' ')}`, USAGE);
}

/**
 * Resolve `--recent` to a day, or fail the invocation.
 *
 * Resolved here rather than inside a command so an unparseable duration is
 * exit 2 beside every other bad flag, instead of an empty result set that
 * looks like an answer.
 */
function resolveRecent(value: string | undefined, usage: string): string | undefined {
	if (value === undefined) return undefined;

	const since = parseRecent(value);
	if (since === undefined) {
		throw usageError(
			`--recent takes a number of days or weeks (7d, 2w) or a date (2026-09-01), not ${value}`,
			usage
		);
	}
	return since;
}

/** Today, as a local calendar day: the date a scaffolded update is filed under. */
function today(): string {
	const now = new Date();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Turn `parseArgs`'s typed failures into the CLI's usage error. */
function parseStrict(
	args: string[],
	options: ParseArgsOptionsConfig,
	allowPositionals: boolean,
	usage: string
) {
	try {
		return parseArgs({ args, options, allowPositionals, strict: true });
	} catch (error) {
		if (isParseArgsError(error)) throw usageError(error.message, usage);
		throw error;
	}
}

async function dispatch(args: string[]): Promise<number> {
	const { name, rest } = route(args);
	const usage = COMMAND_USAGE[name];

	switch (name) {
		case 'graph query': {
			const { values } = parseStrict(rest, QUERY_OPTIONS, false, usage);
			if (values.help) {
				process.stdout.write(`${usage}\n`);
				return EXIT_OK;
			}
			const since = resolveRecent(values.recent as string | undefined, usage);
			const filters: QueryFilters = {
				collections: values.collection as string[],
				tags: values.tag as string[],
				status: values.status as string | undefined,
				orphans: values.orphans as boolean,
				deadends: values.deadends as boolean,
				...(since !== undefined ? { since } : {}),
			};
			return queryCommand(await resolveRoot(values.root as string | undefined), filters, values.json as boolean);
		}
		case 'graph related': {
			const { values, positionals } = parseStrict(rest, GLOBAL, true, usage);
			if (values.help) {
				process.stdout.write(`${usage}\n`);
				return EXIT_OK;
			}
			if (positionals.length !== 1) {
				throw usageError(
					positionals.length
						? `graph related takes one argument, got ${positionals.length}: ${positionals.join(' ')}. A path containing spaces has to be quoted.`
						: 'graph related needs a path, a quoted string of text, or - for stdin',
					usage
				);
			}
			return relatedCommand(
				await resolveRoot(values.root as string | undefined),
				positionals[0],
				values.json as boolean
			);
		}
		case 'check': {
			const { values } = parseStrict(rest, GLOBAL, false, usage);
			if (values.help) {
				process.stdout.write(`${usage}\n`);
				return EXIT_OK;
			}
			return checkCommand(
				await resolveRoot(values.root as string | undefined),
				values.json as boolean
			);
		}
		case 'update': {
			const { values } = parseStrict(rest, UPDATE_OPTIONS, false, usage);
			if (values.help) {
				process.stdout.write(`${usage}\n`);
				return EXIT_OK;
			}
			return updateCommand(
				await resolveRoot(values.root as string | undefined),
				resolveRecent(values.recent as string, usage)!,
				today(),
				values.write as boolean,
				values.json as boolean
			);
		}
		case 'gate': {
			const { values } = parseStrict(rest, GATE_OPTIONS, false, usage);
			if (values.help) {
				process.stdout.write(`${usage}\n`);
				return EXIT_OK;
			}
			return gateCommand(
				await resolveRoot(values.root as string | undefined),
				(values.dist as string | undefined) ?? 'dist',
				values.json as boolean
			);
		}
		default:
			throw usageError(`${name} is not implemented yet`, usage);
	}
}

/**
 * Run the CLI and return its exit code.
 *
 * Returns rather than calls `process.exit`, so a buffered stdout write is never
 * truncated by the process going away underneath it.
 */
export async function run(args: string[]): Promise<number> {
	// Read before parsing: the errors most worth emitting as JSON are the ones
	// thrown by the parse itself.
	const json = args.includes('--json');

	try {
		// Before the route table, not in it: `--version` is a question about the
		// installed package, not about a project, so it must answer from
		// anywhere — including a directory with no `src/content` in it, where
		// every real verb exits 1. Plain stdout and nothing else, because the
		// thing most likely to read it is a script.
		//
		// Read out of argv wherever it appears, like `--json` two lines above
		// and for the same reason as `--root`: every other flag in this CLI is
		// position-insensitive, and a `--version` that only worked first would
		// be the one exception nobody would remember. No `-v` alias — `-v` is
		// "verbose" in enough tools to be worth not claiming for something else.
		if (args.includes('--version')) {
			process.stdout.write(`${await readVersion()}\n`);
			return EXIT_OK;
		}
		if (!args.length || args[0] === '--help' || args[0] === '-h') {
			process.stdout.write(`${USAGE}\n`);
			return args.length ? EXIT_OK : EXIT_USAGE;
		}
		return await dispatch(args);
	} catch (error) {
		if (error instanceof CliError) {
			writeError(error, json);
			return error.exitCode;
		}
		writeError(
			new CliError('EINTERNAL', error instanceof Error ? error.message : String(error), 1),
			json
		);
		return 1;
	}
}

/**
 * How a command's result reaches the caller.
 *
 * One rule, and everything else follows from it: in `--json` mode stdout holds
 * exactly one JSON document and nothing else. Progress, warnings and errors go
 * to stderr, so `commune check --json > findings.json` yields a parseable file
 * even on the run that fails.
 */

import type { CliError } from './errors.ts';

/** Every payload carries the contract version, so #10's skills can pin it. */
export const SCHEMA = 1;

export function writeJson(payload: unknown): void {
	process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

export function writeLines(lines: string[]): void {
	if (lines.length) process.stdout.write(lines.join('\n') + '\n');
}

/**
 * Render a failure, on stderr, in whichever mode the caller asked for.
 *
 * `json` is read from the raw argv rather than the parsed options, because the
 * errors most worth rendering as JSON are the ones thrown while parsing.
 */
export function writeError(error: CliError, json: boolean): void {
	if (json) {
		process.stderr.write(
			JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2) + '\n'
		);
		return;
	}

	process.stderr.write(`commune: ${error.message}\n`);
	if (error.detail) process.stderr.write(`${error.detail}\n`);
}

/**
 * Exit codes and the errors that produce them.
 *
 * The codes report *completion*, not findings: a `check` that reports 28 broken
 * links has finished its job and exits 0. An agent that cannot tell "your
 * content has problems" from "the tool fell over" has to parse stderr to find
 * out, which is the failure mode this contract exists to prevent.
 */

/** The command ran to completion. Findings, if any, are in the payload. */
export const EXIT_OK = 0;
/** The command could not finish: bad root, unreadable file, unparseable frontmatter. */
export const EXIT_FAILED = 1;
/** The command was invoked wrongly: unknown flag, missing value, unknown subcommand. */
export const EXIT_USAGE = 2;

export type ErrorCode = 'EUSAGE' | 'ENOCONTENT' | 'EPARSE' | 'EINTERNAL';

/** An error the CLI knows how to render on either side of the `--json` switch. */
export class CliError extends Error {
	readonly code: ErrorCode;
	readonly exitCode: number;
	/** Extra lines for text mode only — usage, for instance. Never in the JSON object. */
	readonly detail?: string;

	constructor(code: ErrorCode, message: string, exitCode: number, detail?: string) {
		super(message);
		this.name = 'CliError';
		this.code = code;
		this.exitCode = exitCode;
		this.detail = detail;
	}
}

export function usageError(message: string, detail?: string): CliError {
	return new CliError('EUSAGE', message, EXIT_USAGE, detail);
}

export function failure(code: ErrorCode, message: string): CliError {
	return new CliError(code, message, EXIT_FAILED);
}

/** `parseArgs` throws typed errors; every one of them means the invocation was wrong. */
export function isParseArgsError(error: unknown): error is Error & { code: string } {
	if (!(error instanceof Error)) return false;
	const code = (error as unknown as { code?: unknown }).code;
	return typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS_');
}

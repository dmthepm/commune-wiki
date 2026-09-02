/** Usage text. Hand-written: `parseArgs` generates none, which is its one real cost. */

export const USAGE = `commune — query the content graph without an Astro process

Usage:
  commune [--root <dir>] graph query   [filters] [--json]
  commune [--root <dir>] graph related <path|text|-> [--json]
  commune [--root <dir>] check         [--json]

Global options:
  --root <dir>   Project root: the directory containing src/content. Default: cwd.
  --json         Emit one JSON document on stdout. Everything else goes to stderr.
  --help         Show this text.

graph query filters (any-of within a flag, all-of across flags):
  --collection <notes|research|pages>   Repeatable.
  --tag <tag>                           Repeatable.
  --status <status>
  --orphans                             Zero inbound and zero outbound.
  --deadends                            Zero outbound.

Exit codes:
  0  finished, findings or not
  1  could not finish
  2  invalid invocation`;

export const COMMAND_USAGE: Record<string, string> = {
	'graph query':
		'Usage: commune [--root <dir>] graph query [--collection <c>]... [--tag <t>]... [--status <s>] [--orphans] [--deadends] [--json]',
	'graph related':
		'Usage: commune [--root <dir>] graph related <path|text|-> [--json]',
	check: 'Usage: commune [--root <dir>] check [--json]',
};

/** Usage text. Hand-written: `parseArgs` generates none, which is its one real cost. */

export const USAGE = `commune — query the content graph without an Astro process

Usage:
  commune [--root <dir>] graph query   [filters] [--json]
  commune [--root <dir>] graph related <path|text|-> [--json]
  commune [--root <dir>] check         [--json]
  commune [--root <dir>] gate          [--dist <dir>] [--json]

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

gate options:
  --dist <dir>   The built site to check, relative to --root. Default: dist.

Exit codes:
  0  finished, findings or not
  1  could not finish
  2  invalid invocation

  gate is the one exception, and the only verb whose exit code encodes a
  finding: it exits 1 when the build it checked is wrong. That is what a gate
  is for — a build stops on a non-zero exit — so gate cannot report a finding
  the way every other verb does, in the payload with exit 0.`;

export const COMMAND_USAGE: Record<string, string> = {
	'graph query':
		'Usage: commune [--root <dir>] graph query [--collection <c>]... [--tag <t>]... [--status <s>] [--orphans] [--deadends] [--json]',
	'graph related':
		'Usage: commune [--root <dir>] graph related <path|text|-> [--json]',
	check: 'Usage: commune [--root <dir>] check [--json]',
	gate: `Usage: commune [--root <dir>] gate [--dist <dir>] [--json]

Run after a build. Asserts that every standalone page is in the search index,
that every resolving WikiLink uses its target's exact title, and that WikiLinks
to standalone pages rendered as hrefs. Exits 1 if any of that is false — the
one verb whose exit code encodes a finding.`,
};

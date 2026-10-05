/** Usage text. Hand-written: `parseArgs` generates none, which is its one real cost. */

export const USAGE = `commune — query the content graph without an Astro process

Usage:
  commune [--root <dir>] graph query   [filters] [--json]
  commune [--root <dir>] graph related <path|text|-> [--json]
  commune [--root <dir>] render        <path|-> [--site <origin>] [--json]
  commune [--root <dir>] update        [--recent <duration|date>] [--write] [--json]
  commune [--root <dir>] rename        <from> <to> [--move-url] [--dry-run] [--json]
  commune [--root <dir>] check         [--json]
  commune [--root <dir>] gate          [--dist <dir>] [--json]
  commune --version

Global options:
  --root <dir>   Project root: the directory containing src/content. Default: cwd.
  --json         Emit one JSON document on stdout. Everything else goes to stderr.
  --help         Show this text.
  --version      Print the version of the installed package and exit.

graph query filters (any-of within a flag, all-of across flags):
  --collection <notes|research|pages|updates>   Repeatable.
  --tag <tag>                                   Repeatable.
  --status <status>
  --orphans                                     Zero inbound and zero outbound.
  --deadends                                    Zero outbound.
  --unreferenced                                Zero inbound, any outbound. Skips
                                                updates, which are expected to have
                                                none, unless --collection updates
                                                asks for them.
  --recent <7d|2w|2026-09-01>                   Updated on or since then. Entries
                                                with no date are not returned.

render options:
  --site <origin>   The wiki's own origin, which is what decides whether a link
                    is external. Read from the Astro config when it declares
                    one; otherwise https://example.com, and it says so.

update options:
  --recent <7d|2w|2026-09-01>   What to roll up. Default: 7d.
  --write                       Write src/content/updates/<today>.md. Without it,
                                the entry is printed on stdout. Never overwrites.

rename options:
  <from> <to>    Paths relative to --root, for example
                 "src/content/notes/Old.md" "src/content/notes/New.md". <to> must
                 stay inside <from>'s collection and must not exist.
  --move-url     Let the URL follow the new name and write 301s to
                 public/_redirects. Without it the URL stays: a slug: pin holding
                 the old slug is added when the new name would move it.
  --dry-run      Print the plan (the move, every line changed, the URL decision)
                 and write nothing.

gate options:
  --dist <dir>   The built site to check, relative to --root. Default: dist.

Exit codes:
  0  finished, findings or not (a dry run included)
  1  could not finish
  2  invalid invocation

  gate is the one exception, and the only verb whose exit code encodes a
  finding: it exits 1 when the build it checked is wrong. That is what a gate
  is for — a build stops on a non-zero exit — so gate cannot report a finding
  the way every other verb does, in the payload with exit 0.`;

export const COMMAND_USAGE: Record<string, string> = {
	'graph query':
		'Usage: commune [--root <dir>] graph query [--collection <c>]... [--tag <t>]... [--status <s>] [--orphans] [--deadends] [--unreferenced] [--recent <duration|date>] [--json]',
	'graph related':
		'Usage: commune [--root <dir>] graph related <path|text|-> [--json]',
	update: `Usage: commune [--root <dir>] update [--recent <duration|date>] [--write] [--json]

Scaffold a dated update entry from the pages that changed. The draft is
printed on stdout unless --write is given, and --write refuses to overwrite an
update that already exists. \`summary\` is left empty on purpose: summarizing a
week is a judgement, and this command has none.`,
	render: `Usage: commune [--root <dir>] render <path|-> [--site <origin>] [--json]

Render markdown to HTML through the site's own pipeline, with WikiLinks
resolved against the content tree and external links marked. Frontmatter is
split off and not rendered. --json adds the links the document contains and
the names among them that resolve to nothing — which the HTML cannot tell
you, since an unresolved WikiLink renders as plain text.`,
	rename: `Usage: commune [--root <dir>] rename <from> <to> [--move-url] [--dry-run] [--json]

Rename a note and rewrite every link to it: wikilinks (with labels, headings,
block refs and embeds), relative file links, and frontmatter links. Links spelled
through an alias are left alone, since the alias still resolves. Code is never
touched. The only safe way to rename a note: mv, git mv and editors leave every
link to the old name broken.

By default the URL stays. --move-url lets it follow the name and writes 301
redirects to public/_redirects. Refuses if <to> exists, if <from> is not a
content entry, if <to> leaves the collection, or if the new name would collide
with another entry's title or alias.`,
	check: 'Usage: commune [--root <dir>] check [--json]',
	gate: `Usage: commune [--root <dir>] gate [--dist <dir>] [--json]

Run after a build. Asserts that every standalone page is in the search index,
that every resolving WikiLink uses its target's exact title, and that WikiLinks
to standalone pages rendered as hrefs. Exits 1 if any of that is false — the
one verb whose exit code encodes a finding.`,
};

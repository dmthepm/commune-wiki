/**
 * `commune check` — link integrity as a payload.
 *
 * Exits 0 whether or not it finds anything. The exit code answers "did the
 * command finish", not "is your content clean" — those are different questions
 * and an agent that cannot tell them apart has to parse stderr to find out
 * whether the tool crashed. `commune gate` is the documented exception — it keeps
 * its exit 1, because a gate's job *is* to fail.
 *
 * v1 is scoped to link integrity so it does not block on #17's collection
 * collapse. Frontmatter drift is a follow-up.
 */

import {
	buildGraph,
	checkEntries,
	findBrokenAnchors,
	loadContentEntries,
	type ContentEntry,
	type Diagnostic,
	type DiagnosticRule,
} from '../lib/graph.ts';
import { addRenameHints } from '../lib/git-hints.ts';
import { SCHEMA, writeJson, writeLines } from './output.ts';
import { EXIT_OK } from './errors.ts';

const RULES: DiagnosticRule[] = [
	'broken-link',
	'ambiguous-target',
	'duplicate-name',
	'noncanonical-title',
	'broken-anchor',
	'route-collision',
];

/** A finding as it appears in the payload: no internal rendering fields. */
function toFinding(diagnostic: Diagnostic) {
	return {
		rule: diagnostic.rule,
		severity: diagnostic.severity,
		file: diagnostic.file,
		...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
		message: diagnostic.message,
		...(diagnostic.target !== undefined ? { target: diagnostic.target } : {}),
		...(diagnostic.candidates ? { candidates: diagnostic.candidates } : {}),
		...(diagnostic.canonical !== undefined ? { canonical: diagnostic.canonical } : {}),
		...(diagnostic.hint !== undefined ? { hint: diagnostic.hint } : {}),
	};
}

/**
 * The ids a note's headings have on the page, from rendering it with the
 * processor `render` and the site use.
 *
 * `@astrojs/markdown-remark` is imported only when a link needs it, so a vault
 * with no heading links never loads it. It is the unified pipeline, not the
 * Astro runtime.
 */
function headingIdsOf(root: string) {
	const state = { loadFailed: false };
	let renderer: Promise<{ render: (body: string, options: object) => Promise<{ code: string }> }> | undefined;

	const headingIds = async (entry: ContentEntry): Promise<Set<string>> => {
		renderer ??= import('../markdown.ts')
			.then(({ communeMarkdown }) => communeMarkdown({ root }).createRenderer({}))
			.catch((error) => {
				state.loadFailed = true;
				throw error;
			});
		const { code } = await (await renderer).render(entry.body, { frontmatter: entry.frontmatter });
		const ids = new Set<string>();
		for (const match of code.matchAll(/<h[1-6]\b[^>]*?\sid="([^"]*)"/g)) {
			ids.add(match[1]);
			// A slug that came out percent-encoded is the same target once decoded.
			try { ids.add(decodeURIComponent(match[1])); } catch { /* keep the raw id */ }
		}
		return ids;
	};
	return Object.assign(headingIds, { state });
}

export async function checkCommand(root: string, json: boolean): Promise<number> {
	const entries = await loadContentEntries({ root });
	const graph = buildGraph(entries);
	const headingIds = headingIdsOf(root);
	const anchors = await findBrokenAnchors(entries, headingIds, (notes) => {
		// stderr in both modes, so `--json` stays what a parser expects on stdout.
		const why = headingIds.state.loadFailed ? 'the markdown renderer could not load' : 'a note failed to render';
		process.stderr.write(`broken-anchor: ${notes} ${notes === 1 ? 'note' : 'notes'} not checked (${why})\n`);
	});
	const findings = [...checkEntries(entries, graph), ...anchors];
	// Advisory and best effort: without git, or if git fails, the findings are untouched.
	await addRenameHints(root, findings);

	const byRule = Object.fromEntries(
		RULES.map((rule) => [rule, findings.filter((finding) => finding.rule === rule).length])
	);
	const summary = {
		entries: Object.keys(graph.nodes).length,
		// Resolved edges. Every resolved outbound link is one inbound link on the
		// far side, so this is the same number counted from either end.
		edges: graph.totalBacklinks,
		errors: findings.filter((finding) => finding.severity === 'error').length,
		warnings: findings.filter((finding) => finding.severity === 'warning').length,
		byRule,
	};

	if (json) {
		writeJson({ schema: SCHEMA, root, summary, findings: findings.map(toFinding) });
		return EXIT_OK;
	}

	writeLines([
		...findings.map(
			(finding) => `${finding.severity}\t${finding.rule}\t${finding.file}\t${finding.message}${finding.hint ? ` (${finding.hint})` : ''}`
		),
		`${summary.entries} entries, ${summary.edges} edges, ${summary.errors} errors, ${summary.warnings} warnings`,
	]);
	return EXIT_OK;
}

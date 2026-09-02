/**
 * `commune check` — link integrity as a payload.
 *
 * Exits 0 whether or not it finds anything. The exit code answers "did the
 * command finish", not "is your content clean" — those are different questions
 * and an agent that cannot tell them apart has to parse stderr to find out
 * whether the tool crashed. The build gate in `scripts/test-search-index.mjs`
 * keeps its exit 1, because a gate's job *is* to fail.
 *
 * v1 is scoped to link integrity so it does not block on #17's collection
 * collapse. Frontmatter drift is a follow-up.
 */

import {
	buildGraph,
	checkEntries,
	loadContentEntries,
	type Diagnostic,
	type DiagnosticRule,
} from '../lib/graph.ts';
import { SCHEMA, writeJson, writeLines } from './render.ts';
import { EXIT_OK } from './errors.ts';

const RULES: DiagnosticRule[] = [
	'broken-link',
	'ambiguous-target',
	'duplicate-name',
	'noncanonical-title',
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
	};
}

export async function checkCommand(root: string, json: boolean): Promise<number> {
	const entries = await loadContentEntries({ root });
	const graph = buildGraph(entries);
	const findings = checkEntries(entries, graph);

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
			(finding) => `${finding.severity}\t${finding.rule}\t${finding.file}\t${finding.message}`
		),
		`${summary.entries} entries, ${summary.edges} edges, ${summary.errors} errors, ${summary.warnings} warnings`,
	]);
	return EXIT_OK;
}

/**
 * Tests for the external-link rehype pass.
 *
 * The plugin is what makes the design system's `a[target="_blank"]` marker
 * automatic, so what matters is exactly which links it claims: the attribute
 * is a visible arrow on the page, and a false positive marks an internal link
 * as leaving the site. These run the transformer over hand-built hast rather
 * than through Astro — the unit under test is the decision, not the pipeline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import rehypeExternalLinks from '../rehype-external-links.ts';

const SITE = 'https://devonmeadows.com';

/** One `<a>` element node, the shape rehype hands the plugin. */
function anchor(href, properties = {}) {
	return {
		type: 'element',
		tagName: 'a',
		properties: { href, ...properties },
		children: [{ type: 'text', value: 'link' }],
	};
}

/** Run the plugin over a tree of the given anchors, returning them mutated. */
function transform(...anchors) {
	rehypeExternalLinks({ site: SITE })({ type: 'root', children: anchors });
	return anchors;
}

test('an external link opens in a new tab and is told not to leak the referrer', () => {
	const [node] = transform(anchor('https://example.com/post'));

	assert.equal(node.properties.target, '_blank');
	assert.deepEqual(node.properties.rel, ['noopener', 'noreferrer']);
});

test("an absolute link to the site's own host is internal", () => {
	const [node] = transform(anchor(`${SITE}/notes/atomic-notes/`));

	assert.equal(node.properties.target, undefined);
	assert.equal(node.properties.rel, undefined);
});

test('a relative link — every wikilink is one — is left alone', () => {
	const [node] = transform(anchor('/notes/atomic-notes/'));

	assert.equal(node.properties.target, undefined);
	assert.equal(node.properties.rel, undefined);
});

test('a link that already carries target keeps the rel its author wrote', () => {
	const [node] = transform(
		anchor('https://example.com/post', { target: '_blank', rel: ['me'] })
	);

	assert.equal(node.properties.target, '_blank');
	assert.deepEqual(node.properties.rel, ['me']);
});

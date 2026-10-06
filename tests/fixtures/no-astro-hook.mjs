/**
 * A resolve hook that makes loading Astro an error.
 *
 * The CLI's whole reason to exist is answering graph questions without an Astro
 * process. That is easy to regress by importing one convenient type from a
 * `.astro`-adjacent module, and impossible to notice from the output — so the
 * bin is run under this hook, where an Astro import fails the process instead.
 *
 * `astro` itself and every `@astrojs/*` package count, except the three that
 * make up the markdown renderer `check` loads for heading links:
 * `markdown-remark` and the `internal-helpers` and `prism` it imports. That is
 * the unified pipeline, not the Astro runtime.
 */

import { registerHooks } from 'node:module';

const RENDERER = /^@astrojs\/(markdown-remark|internal-helpers|prism)([/@]|$)/;

registerHooks({
	resolve(specifier, context, next) {
		const astro = /(^|[/@])astro([/.-]|$)/i.test(specifier) || /^@astrojs\//.test(specifier);
		if (astro && !RENDERER.test(specifier)) {
			throw new Error(`astro module loaded from the CLI path: ${specifier}`);
		}
		return next(specifier, context);
	},
});

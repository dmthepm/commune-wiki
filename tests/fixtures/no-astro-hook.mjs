/**
 * A resolve hook that makes loading Astro an error.
 *
 * The CLI's whole reason to exist is answering graph questions without an Astro
 * process. That is easy to regress by importing one convenient type from a
 * `.astro`-adjacent module, and impossible to notice from the output — so the
 * bin is run under this hook, where an Astro import fails the process instead.
 */

import { registerHooks } from 'node:module';

registerHooks({
	resolve(specifier, context, next) {
		if (/(^|[/@])astro([/.-]|$)/i.test(specifier)) {
			throw new Error(`astro module loaded from the CLI path: ${specifier}`);
		}
		return next(specifier, context);
	},
});

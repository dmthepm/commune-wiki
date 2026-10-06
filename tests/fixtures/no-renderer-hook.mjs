/**
 * A resolve hook that makes the markdown renderer impossible to load, to stand
 * in for a `check` run where `@astrojs/markdown-remark` is missing.
 */

import { registerHooks } from 'node:module';

registerHooks({
	resolve(specifier, context, next) {
		if (/^@astrojs\/markdown-remark([/@]|$)/.test(specifier)) {
			throw new Error(`markdown renderer unavailable: ${specifier}`);
		}
		return next(specifier, context);
	},
});

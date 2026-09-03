import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// The three collections the graph core knows about, with the smallest schemas
// that still exercise it: `visibility` because notes opt in to being public,
// `url` because that is how a page declares the route it renders at. The real
// engine's schemas carry a dozen more fields; none of them change a link.
const notes = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/notes' }),
	schema: z.object({
		title: z.string(),
		visibility: z.enum(['public', 'private', 'draft']).default('private'),
	}),
});

const research = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/research' }),
	schema: z.object({ title: z.string() }),
});

const pages = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
	schema: z.object({
		title: z.string(),
		url: z.string().regex(/^\/.+\/$/),
	}),
});

export const collections = { notes, research, pages };

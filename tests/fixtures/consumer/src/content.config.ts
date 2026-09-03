import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// The four collections the graph core knows about, with the smallest schemas
// that still exercise it: `visibility` because notes opt in to being public,
// `url` because that is how a page declares the route it renders at, and
// `date`/`links` because an update is a dated thing that names what it rolls
// up. The real engine's schemas carry a dozen more fields; none of them change
// a link.
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

const updates = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/updates' }),
	schema: z.object({
		title: z.string(),
		date: z.union([z.string(), z.date()]).transform((value) =>
			value instanceof Date ? value.toISOString().split('T')[0] : value
		),
		summary: z.string(),
		aiGenerated: z.boolean().default(false),
		links: z.array(z.string()).default([]),
	}),
});

export const collections = { notes, research, pages, updates };

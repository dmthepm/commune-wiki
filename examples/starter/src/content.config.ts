import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    visibility: z.enum(['public', 'private', 'draft']).default('private'),
    summary: z.string().optional(),
    status: z.enum(['seedling', 'budding', 'evergreen']).default('seedling'),
    tags: z.array(z.string()).default([]),
  }),
});

// Commune 0.5.2 publishes all updates. Use notes for private or draft work.
const updates = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/updates' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    visibility: z.literal('public').default('public'),
    links: z.array(z.string()).default([]),
  }),
});

export const collections = { notes, updates };

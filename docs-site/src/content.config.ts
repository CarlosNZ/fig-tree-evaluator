import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'
import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'

/** An operator note's short text: added to the listing's, or replacing it. */
const noteText = z.union([
  z.string(),
  z.object({ replace: z.string(), against: z.string().optional() }).strict(),
])

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // The docs' own notes beside an operator's catalog listing, one file per
  // operator, named by its canonical name (src/lib/operatorNotes.ts)
  operatorNotes: defineCollection({
    loader: glob({
      pattern: '*.mdx',
      base: './src/content/operator-notes',
      // The file's own name, case kept, is the operator's
      generateId: ({ entry }) => entry.replace(/\.mdx$/, ''),
    }),
    schema: z
      .object({
        description: noteText.optional(),
        parameters: z.record(z.string(), noteText).optional(),
      })
      .strict(),
  }),
}

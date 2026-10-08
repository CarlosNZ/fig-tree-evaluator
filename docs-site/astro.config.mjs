// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import react from '@astrojs/react'

export default defineConfig({
  integrations: [
    starlight({
      title: 'FigTree',
      description: 'Evaluate JSON-structured expression trees: dynamic logic as data.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/CarlosNZ/fig-tree-evaluator',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/CarlosNZ/fig-tree-evaluator/edit/v3.0-dev/docs-site/',
      },
      customCss: ['./src/styles/custom.css'],
      // Expressive Code reads its plugins from ec.config.mjs, since the
      // twoslash plugin isn't serialisable into this file
    }),
    react(),
  ],
  vite: {
    resolve: {
      // Both libraries are `link:` dependencies, and each resolves its own
      // imports from its own checkout's node_modules. Deduping makes the
      // editor share this site's single copy of React, json-edit-react and
      // the evaluator, so hooks work and `instanceof` checks hold.
      dedupe: ['react', 'react-dom', 'json-edit-react', 'fig-tree-evaluator'],
    },
  },
})

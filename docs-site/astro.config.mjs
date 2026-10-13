// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import react from '@astrojs/react'
import { paletteCss } from './src/styles/palettes.mjs'

const externalLinksInNewTab = `
document.addEventListener('click', (event) => {
  const link = event.target instanceof Element && event.target.closest('a[href]')
  if (link && link.origin !== location.origin && !link.target) link.target = '_blank'
})
`

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
      // Gives the operators page its category headings' contents list
      routeMiddleware: './src/routeData.ts',
      head: [
        // The colour palette (src/styles/palettes.mjs)
        { tag: 'style', content: paletteCss() },
        // Every link to another site opens in a new tab. Set when a link is
        // clicked, so it also covers the links that components and React
        // islands render.
        { tag: 'script', content: externalLinksInNewTab },
      ],
      // The home page has no entry: the header title links to it. One group
      // per site section, each listing its folder's pages in
      // `sidebar.order`. Previous/next links follow this order.
      sidebar: [
        { label: 'Concepts', items: [{ autogenerate: { directory: 'concepts' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
        { label: 'Prototype', link: '/prototype/' },
      ],
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

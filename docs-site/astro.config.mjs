// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import react from '@astrojs/react'
import { palette, paletteCss } from './src/styles/palettes.mjs'

/**
 * The site's address. A link preview's image has to be an absolute URL, so
 * until it is set, shared links show no image. TO-DO: set it once hosting is
 * decided (open question 2 in docs-dev/doc-planning.md); a GitHub Pages
 * project site would also need Astro's `base`.
 * @type {string | undefined}
 */
const SITE = undefined

/**
 * The link preview: public/social.png, 1280×640
 * @type {{ tag: 'meta', attrs: Record<string, string> }[]}
 */
const linkPreview = SITE
  ? [
      { tag: 'meta', attrs: { property: 'og:image', content: new URL('/social.png', SITE).href } },
      { tag: 'meta', attrs: { property: 'og:image:width', content: '1280' } },
      { tag: 'meta', attrs: { property: 'og:image:height', content: '640' } },
      { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
    ]
  : []

const externalLinksInNewTab = `
document.addEventListener('click', (event) => {
  const link = event.target instanceof Element && event.target.closest('a[href]')
  if (link && link.origin !== location.origin && !link.target) link.target = '_blank'
})
`

export default defineConfig({
  site: SITE,
  integrations: [
    starlight({
      title: 'FigTree',
      description: 'Evaluate JSON-structured expression trees: dynamic logic as data.',
      // The lockup from the repo's images/logo/ (built by codegen/logo/)
      logo: {
        light: '../images/logo/figtree-logo.svg',
        dark: '../images/logo/figtree-logo-dark.svg',
        replacesTitle: true,
      },
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
      // public/'s favicon.svg, apple-touch-icon.png and social.png are
      // copied from the repo's images/logo/ by scripts/copyLogo.mjs
      head: [
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
        ...linkPreview,
        // A phone browser's toolbar in the header's colour. It follows the
        // system's light or dark mode, not the site's theme switch.
        {
          tag: 'meta',
          attrs: {
            name: 'theme-color',
            content: palette.light.grays[7],
            media: '(prefers-color-scheme: light)',
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'theme-color',
            content: palette.dark.grays[6],
            media: '(prefers-color-scheme: dark)',
          },
        },
        // The colour palette (src/styles/palettes.mjs)
        { tag: 'style', content: paletteCss() },
        // Every link to another site opens in a new tab. Set when a link is
        // clicked, so it also covers the links that components and React
        // islands render.
        { tag: 'script', content: externalLinksInNewTab },
      ],
      // The home page has no entry: the header title links to it. One group
      // per chapter, each listing its folder's pages in `sidebar.order`, and
      // a single link for each one-page chapter. The groups after the
      // Operator reference start collapsed, and Starlight opens one when the
      // current page is in it. Previous/next links follow this order. The
      // prototype page is deliberately absent: it is reachable only by its
      // URL, /prototype/.
      sidebar: [
        { label: 'Concepts', items: [{ autogenerate: { directory: 'concepts' } }] },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'API reference', items: [{ autogenerate: { directory: 'api' } }] },
        { label: 'Operator reference', link: '/reference/operators/' },
        {
          label: 'Custom operators',
          collapsed: true,
          items: [{ autogenerate: { directory: 'custom-operators' } }],
        },
        {
          label: 'Beyond evaluation',
          collapsed: true,
          items: [{ autogenerate: { directory: 'tooling' } }],
        },
        {
          label: 'Under the hood',
          collapsed: true,
          items: [{ autogenerate: { directory: 'under-the-hood' } }],
        },
        { label: 'Migrating from v2', link: '/migrating/' },
        { label: 'Playground', link: '/playground/' },
        { label: 'Visual editor component', link: '/editor/' },
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

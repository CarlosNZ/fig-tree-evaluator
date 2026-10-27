/*
Copies the logo files the site serves from public/ out of the repo's
images/logo/, where codegen/logo/ builds them (`pnpm build:logo` at the repo
root). The `dev` and `build` scripts run it first, so the site always serves
the current logo. The copies are gitignored.

The header logo and the home page's hero icon are imported from images/logo/
directly (astro.config.mjs, index.mdx); these are the files a browser or a
link preview fetches by URL, which only public/ can serve.
*/

import { copyFileSync, mkdirSync } from 'fs'

const from = (name) => new URL(`../../images/logo/${name}`, import.meta.url)
const to = (name) => new URL(`../public/${name}`, import.meta.url)

// Git keeps no empty folder, and everything in public/ is a copy
mkdirSync(to(''), { recursive: true })

const files = {
  'favicon.svg': 'favicon.svg',
  'apple-touch-icon.png': 'apple-touch-icon.png',
  // The link preview image (og:image), 1280×640
  'social.png': 'figtree-social.png',
}

for (const [published, source] of Object.entries(files)) copyFileSync(from(source), to(published))

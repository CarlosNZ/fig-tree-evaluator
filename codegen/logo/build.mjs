/*
Builds every logo file in images/logo/ from the drawings in marks.mjs.

Run with `node codegen/logo/build.mjs`. It needs opentype.js and two fonts in
codegen/logo/.cache/ (see the README beside this file), and rsvg-convert on the
PATH for the PNG exports.

The wordmark is outlined to paths, so the SVGs render the same everywhere
without the fonts.
*/

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { createRequire } from 'module'
import { homedir } from 'os'
import { execFileSync } from 'child_process'
import { lockupGraph, icon, iconSize, COLUMN, BASELINES } from './marks.mjs'
import { f } from './geometry.mjs'

const here = (p) => new URL(p, import.meta.url).pathname
const CACHE = here('./.cache/')
const OUT = here('../../images/logo/')
mkdirSync(OUT, { recursive: true })

const opentype = createRequire(CACHE)('opentype.js')

const findFont = (names) => {
  const dirs = [CACHE, homedir() + '/Library/Fonts/', '/Library/Fonts/']
  for (const dir of dirs) for (const name of names) if (existsSync(dir + name)) return dir + name
  throw new Error(`Font not found: ${names.join(' or ')}. See codegen/logo/README.md.`)
}
const headFont = opentype.loadSync(findFont(['JetBrainsMono-ExtraBold.ttf']))
const dimFont = opentype.loadSync(
  findFont(['IBMPlexSans_Condensed-Regular.ttf', 'IBMPlexSansCondensed-Regular.ttf'])
)

const COLOURS = {
  light: { graph: '#3b6c34', headline: '#1b1a1f', background: '#7f8a7b' },
  dark: { graph: '#8bc57c', headline: '#eef0f3', background: '#73806f' },
}
const BACKGROUND_OPACITY = 0.5

// ── Lockup

const SIZE = 40
const REACH = 68

// Everything below is measured from the fonts, so either can be swapped
const width = (font, word) => font.getAdvanceWidth(word, SIZE, { kerning: true })
const xHeight = (font) => {
  const fromTable = font.tables.os2?.sxHeight
  const units = fromTable || font.charToGlyph('x').getBoundingBox().y2
  return (units / font.unitsPerEm) * SIZE
}

// fig / tree / evaluator share a column; the background words hang off it to
// the left and right
const words = [
  [dimFont, COLUMN - width(dimFont, 'con'), BASELINES[0], 'con', 'background'],
  [headFont, COLUMN, BASELINES[0], 'fig', 'headline'],
  [dimFont, COLUMN + width(headFont, 'fig'), BASELINES[0], 'uration', 'background'],
  [dimFont, COLUMN - width(dimFont, 'expression'), BASELINES[1], 'expression', 'background'],
  [headFont, COLUMN, BASELINES[1], 'tree', 'headline'],
  [headFont, COLUMN, BASELINES[2], 'evaluator', 'headline'],
].map(([font, x, y, text, role]) => {
  const path = font.getPath(text, x, y, SIZE, { kerning: true })
  return { role, d: path.toPathData(2), box: path.getBoundingBox() }
})

// Each line's node sits level with the middle of the lowercase letters of the
// word it leads into: a background word on the first two lines, evaluator on
// the third
const starts = [COLUMN - width(dimFont, 'con'), COLUMN - width(dimFont, 'expression'), COLUMN]
const middles = [
  BASELINES[0] - xHeight(dimFont) / 2,
  BASELINES[1] - xHeight(dimFont) / 2,
  BASELINES[2] - xHeight(headFont) / 2,
]
const graph = lockupGraph(starts, middles, REACH)

const pad = 2
const x0 = Math.floor(graph.left - pad)
const x1 = Math.ceil(Math.max(...words.map((w) => w.box.x2)) + pad)
const y0 = Math.floor(Math.min(...words.map((w) => w.box.y1), graph.top) - pad)
const y1 = Math.ceil(Math.max(...words.map((w) => w.box.y2), graph.bottom) + pad)
const VIEWBOX = [x0, y0, x1 - x0, y1 - y0]

const lockupBody = (c) => {
  const d = (role) =>
    words
      .filter((w) => w.role === role)
      .map((w) => w.d)
      .join('')
  return (
    `<g fill="${c.graph}" color="${c.graph}">${graph.body}</g>` +
    `<path fill="${c.headline}" d="${d('headline')}"/>` +
    `<path fill="${c.background}" fill-opacity="${BACKGROUND_OPACITY}" d="${d('background')}"/>`
  )
}
const lockup = (c) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX.join(' ')}" width="${
    VIEWBOX[2]
  }" height="${VIEWBOX[3]}" role="img"><title>FigTree Evaluator</title>${lockupBody(c)}</svg>\n`

writeFileSync(OUT + 'figtree-logo.svg', lockup(COLOURS.light))
writeFileSync(OUT + 'figtree-logo-dark.svg', lockup(COLOURS.dark))

// Social preview at GitHub's 1280×640: the lockup centred on white, at 80% of
// the width, which keeps it clear of the edge crops that Slack, X and LinkedIn
// apply
const W = 1280
const H = 640
const SOCIAL_WIDTH = 0.8
const scale = (SOCIAL_WIDTH * W) / VIEWBOX[2]
const tx = (W - VIEWBOX[2] * scale) / 2 - VIEWBOX[0] * scale
const ty = (H - VIEWBOX[3] * scale) / 2 - VIEWBOX[1] * scale
writeFileSync(
  OUT + 'figtree-social.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#ffffff"/><g transform="translate(${tx.toFixed(
    2
  )} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">${lockupBody(COLOURS.light)}</g></svg>\n`
)

// ── Icon

// Spacing, as a fraction of the square each file draws into:
// - the master icon files carry only a hairline margin, so whoever places them
//   decides the spacing
// - favicons run edge to edge, keeping only the half pixel at 16px that
//   anti-aliasing needs
// - the app tile is full bleed (iOS and Android apply their own corner masks),
//   with the drawing's taller side at 83% of the tile. That is as large as it
//   goes while the corner nodes stay inside iOS's rounded mask.
// - in every square, the drawing sits left of centre, with a quarter of its
//   left-hand gap taken away: the arms and nodes spread right, so a centred
//   drawing looks pushed against the right edge
const MASTER_MARGIN = 0.03
const FAVICON_MARGIN = 0.5 / 16
const TILE_FILL = 0.83
const LEFT_GAP_CUT = 0.25

// Square viewBox around the drawing with `margin` on each side, shifted so the
// drawing sits left of centre
const fitted = (small, margin) => {
  const { w, h } = iconSize({ small })
  const side = Math.max(w, h) / (1 - 2 * margin)
  const gap = (side - w) / 2
  const o = 100 - side / 2
  return [o + gap * LEFT_GAP_CUT, o, side, side].map(f).join(' ')
}

const iconSvg = (body, fill, viewBox) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img"><title>FigTree</title><g fill="${fill}" stroke="${fill}" color="${fill}">${body}</g></svg>\n`

const MASTER = fitted(false, MASTER_MARGIN)
writeFileSync(OUT + 'figtree-icon.svg', iconSvg(icon(), COLOURS.light.graph, MASTER))
writeFileSync(OUT + 'figtree-icon-dark.svg', iconSvg(icon(), COLOURS.dark.graph, MASTER))
writeFileSync(OUT + 'figtree-icon-white.svg', iconSvg(icon(), '#ffffff', MASTER))

// Favicon: the small-size cut, following the browser's light or dark theme
const { light, dark } = COLOURS
writeFileSync(
  OUT + 'favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fitted(true, FAVICON_MARGIN)}"><style>g{fill:${
    light.graph
  };color:${light.graph}}@media (prefers-color-scheme:dark){g{fill:${dark.graph};color:${
    dark.graph
  }}}</style><g>${icon({ small: true })}</g></svg>\n`
)

// App tile: the white icon on a full-bleed leaf-green square
const tileScale = (TILE_FILL * 200) / Math.max(iconSize().w, iconSize().h)
const tileGap = (200 - iconSize().w * tileScale) / 2
const tileBody =
  `<rect width="200" height="200" fill="${light.graph}"/>` +
  `<g transform="translate(${f(100 - tileGap * LEFT_GAP_CUT)} 100) scale(${f(
    tileScale
  )}) translate(-100 -100)" fill="#fff" color="#fff">${icon()}</g>`
writeFileSync(
  OUT + 'figtree-tile.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img"><title>FigTree</title>${tileBody}</svg>\n`
)

// ── Previews

// Each file drawn on the background it is made for, for checking by eye, with
// the background filling exactly the file's own canvas. The iOS tile alone gets
// a surround, to show its masked corners. They go to codegen/logo/preview/,
// which git ignores; sheet.svg shows them all.
const PREVIEW = here('./preview/')
mkdirSync(PREVIEW, { recursive: true })
const GITHUB_DARK = '#0d1117'
const HOME_SCREEN = '#dfe3e8'
// iOS masks app icons to a rounded square with corners about 22% of its side
const IOS_CORNER = 0.2237 * 200

const panel = (viewBox, bg, body, pad) => {
  const [x, y, w, h] = viewBox.split(' ').map(Number)
  const p = pad * Math.max(w, h)
  const vb = [x - p, y - p, w + 2 * p, h + 2 * p]
  return {
    vb,
    content: `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${bg}"/>${body}`,
  }
}
const iconGroup = (fill, small = false) =>
  `<g fill="${fill}" stroke="${fill}" color="${fill}">${icon({ small })}</g>`
const FAVICON_BOX = fitted(true, FAVICON_MARGIN)
const previews = {
  'logo-light': panel(VIEWBOX.join(' '), '#ffffff', lockupBody(light), 0),
  'logo-dark': panel(VIEWBOX.join(' '), GITHUB_DARK, lockupBody(dark), 0),
  'icon-light': panel(MASTER, '#ffffff', iconGroup(light.graph), 0),
  'icon-dark': panel(MASTER, GITHUB_DARK, iconGroup(dark.graph), 0),
  'icon-white': panel(MASTER, light.graph, iconGroup('#ffffff'), 0),
  'favicon-light': panel(FAVICON_BOX, '#ffffff', iconGroup(light.graph, true), 0),
  'favicon-dark': panel(FAVICON_BOX, GITHUB_DARK, iconGroup(dark.graph, true), 0),
  'tile-ios': panel(
    '0 0 200 200',
    HOME_SCREEN,
    `<clipPath id="ios"><rect width="200" height="200" rx="${f(IOS_CORNER)}"/></clipPath><g clip-path="url(#ios)">${tileBody}</g>`,
    0.12
  ),
}
const svgOf = ({ vb, content }, width) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(f).join(' ')}"${
    width ? ` width="${width}" height="${f((width * vb[3]) / vb[2])}"` : ''
  }>${content}</svg>`
for (const [name, p] of Object.entries(previews)) {
  writeFileSync(PREVIEW + name + '.svg', svgOf(p, 600) + '\n')
}

// Contact sheet: the lockups, then the icons, then the favicon at its real
// sizes, then the tile as iOS shows it
const rows = [
  [
    ['logo-light', 560],
    ['logo-dark', 560],
  ],
  [
    ['icon-light', 200],
    ['icon-dark', 200],
    ['icon-white', 200],
    ['tile-ios', 200],
  ],
  [
    ['favicon-light', 128],
    ['favicon-dark', 128],
    ['favicon-light', 32],
    ['favicon-dark', 32],
    ['favicon-light', 16],
    ['favicon-dark', 16],
  ],
]
const GAP = 24
let y = GAP
let sheetW = 0
const placed = rows
  .map((row) => {
    let x = GAP
    let rowH = 0
    const items = row.map(([name, width]) => {
      const p = previews[name]
      const height = (width * p.vb[3]) / p.vb[2]
      const out = `<svg x="${x}" y="${f(y)}" width="${width}" height="${f(height)}" viewBox="${p.vb
        .map(f)
        .join(
          ' '
        )}">${p.content.replaceAll('id="ios"', `id="ios-${x}"`).replaceAll('url(#ios)', `url(#ios-${x})`)}</svg>`
      x += width + GAP
      rowH = Math.max(rowH, height)
      return out
    })
    sheetW = Math.max(sheetW, x)
    y += rowH + GAP
    return items.join('')
  })
  .join('')
writeFileSync(
  PREVIEW + 'sheet.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${f(y)}" width="${sheetW}" height="${f(
    y
  )}"><rect width="${sheetW}" height="${f(y)}" fill="#f3f4f2"/>${placed}</svg>\n`
)

// ── PNG exports

const FAVICON_16 = CACHE + 'favicon-16.svg'
const FAVICON_32 = CACHE + 'favicon-32.svg'
writeFileSync(FAVICON_16, iconSvg(icon({ small: true }), light.graph, fitted(true, FAVICON_MARGIN)))
writeFileSync(FAVICON_32, iconSvg(icon(), light.graph, fitted(false, FAVICON_MARGIN)))
const png = (src, size, out) =>
  execFileSync('rsvg-convert', ['-w', String(size[0]), '-h', String(size[1]), src, '-o', OUT + out])
try {
  png(FAVICON_16, [16, 16], 'favicon-16.png')
  png(FAVICON_32, [32, 32], 'favicon-32.png')
  png(OUT + 'figtree-tile.svg', [180, 180], 'apple-touch-icon.png')
  png(OUT + 'figtree-tile.svg', [512, 512], 'figtree-tile-512.png')
  png(OUT + 'figtree-icon.svg', [512, 512], 'figtree-icon-512.png')
  png(OUT + 'figtree-social.svg', [1280, 640], 'figtree-social.png')
} catch (err) {
  console.warn('PNG export skipped: rsvg-convert not available or failed.', err.message)
}

console.log(`Logo files written to images/logo/ (lockup viewBox ${VIEWBOX.join(' ')})`)

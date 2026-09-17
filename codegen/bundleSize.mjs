/**
 * Bundle size reporting for the rollup build.
 *
 * Two entry points, one implementation:
 *  - a pair of rollup plugins (used by rollup.config.mjs) that print one
 *    report at the end of `pnpm build`, including the per-module table that
 *    only rollup can supply. The build is two rollup passes — the ESM bundle,
 *    then the .d.ts roll-up — so `collectBundleSize()` rides the first and
 *    `printBundleSize()` the second, once both output files exist.
 *  - running this file directly (`pnpm size`) re-reports the sizes of whatever
 *    is already in build/ without rebuilding — the numbers recorded per phase
 *    in docs-dev/v3-specs/v3-implementation-plan.md.
 *
 * Plain JS with no dependencies: rollup loads the config as ESM, so it cannot
 * import a .ts helper.
 */
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync, brotliCompressSync, constants } from 'node:zlib'
import { relative } from 'node:path'

const BUNDLE = 'build/index.js'
const TYPES = 'build/index.d.ts'

/** Bytes in kB to 2dp, the convention npm and bundlephobia report in. */
const kB = (bytes) => `${(bytes / 1000).toFixed(2)} kB`

const pad = (text, width) => String(text).padStart(width)

/**
 * Compressed sizes of a buffer. Brotli is measured at maximum quality with
 * the window sized to the input, which is what a CDN serving a static asset
 * does; gzip at level 9, the common server setting.
 */
export const compressedSizes = (source) => ({
  raw: source.length,
  gzip: gzipSync(source, { level: 9 }).length,
  brotli: brotliCompressSync(source, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
    },
  }).length,
})

/**
 * Per-module contribution, as rendered into the chunk after tree-shaking but
 * before minification — rollup tracks module boundaries at that point and
 * terser erases them, so this is the finest breakdown available. The shares
 * are the useful part: they answer "what is the bundle made of".
 */
const moduleTable = (modules) => {
  const rows = Object.entries(modules)
    .map(([id, { renderedLength }]) => ({ id: relative(process.cwd(), id), renderedLength }))
    .filter(({ renderedLength }) => renderedLength > 0)
    .sort((a, b) => b.renderedLength - a.renderedLength)

  const total = rows.reduce((sum, { renderedLength }) => sum + renderedLength, 0)

  return [
    '',
    `  Modules (rendered, pre-minify) — ${rows.length} files, ${kB(total)} total`,
    ...rows.map(
      ({ id, renderedLength }) =>
        `    ${pad(((renderedLength / total) * 100).toFixed(1) + '%', 6)}` +
        `${pad(kB(renderedLength), 11)}  ${id}`
    ),
  ].join('\n')
}

const formatReport = ({ bundle, types, modules }) =>
  [
    '',
    `  Bundle size — ${BUNDLE} (ESM, minified)`,
    `    minified  ${pad(kB(bundle.raw), 10)}`,
    `    gzip      ${pad(kB(bundle.gzip), 10)}`,
    `    brotli    ${pad(kB(bundle.brotli), 10)}`,
    ...(types ? [`    types     ${pad(kB(types.raw), 10)}   (${TYPES}, uncompressed)`] : []),
    ...(modules ? [moduleTable(modules)] : []),
    '',
  ].join('\n')

const sizesOf = (path) => (existsSync(path) ? compressedSizes(readFileSync(path)) : undefined)

/** Carried from the ESM pass to the .d.ts pass, which reports for both. */
let collected

/**
 * Rollup plugin for the ESM pass. Captures in `writeBundle`, so the file is on
 * disk and every `renderChunk` hook (notably terser) has had its turn.
 */
export const collectBundleSize = () => ({
  name: 'fig-tree-collect-bundle-size',
  writeBundle(_options, output) {
    const chunk = Object.values(output).find((item) => item.type === 'chunk')
    if (!chunk) return
    collected = {
      bundle: compressedSizes(Buffer.from(chunk.code)),
      modules: chunk.modules,
    }
  },
})

/** Rollup plugin for the .d.ts pass: prints the report for the whole build. */
export const printBundleSize = () => ({
  name: 'fig-tree-print-bundle-size',
  writeBundle() {
    console.log(
      formatReport({ ...(collected ?? { bundle: sizesOf(BUNDLE) }), types: sizesOf(TYPES) })
    )
  },
})

/** CLI: report on the existing build output, no rebuild. */
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (!existsSync(BUNDLE)) {
    console.error(`No ${BUNDLE} — run \`pnpm build\` first.`)
    process.exit(1)
  }
  console.log(formatReport({ bundle: sizesOf(BUNDLE), types: sizesOf(TYPES) }))
}

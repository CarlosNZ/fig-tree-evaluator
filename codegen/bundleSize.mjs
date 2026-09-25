/**
 * Bundle size reporting for the rollup build.
 *
 * Two entry points, one implementation:
 *  - a pair of rollup plugins (used by rollup.config.mjs) that print one
 *    report at the end of `pnpm build`, including the per-module tables that
 *    only rollup can supply. The build is one ESM pass over every entry, then
 *    a .d.ts roll-up per entry, so `collectBundleSize()` rides the first and
 *    `printBundleSize()` the last, once every output file exists.
 *  - running this file directly (`pnpm size`) re-reports the sizes of whatever
 *    is already in build/ without rebuilding — the numbers recorded per phase
 *    in docs-dev/v3-specs/v3-implementation-plan.md. With `--json` it emits
 *    machine-readable sizes instead, which is what the PR bundle-size workflow
 *    measures both sides of a pull request with.
 *
 * What is measured follows codegen/entries.mjs: each entry's bundle and its
 * declarations, then any chunk shared between entries, and for an entry that
 * imports chunks, its total with them, which is what its budget is held to.
 * Every path that reports a size goes through `compressedSizes()` here, so
 * the figure in a PR comment is the same figure `pnpm build` prints, by
 * construction.
 *
 * Plain JS with no dependencies: rollup loads the config as ESM, so it cannot
 * import a .ts helper.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { gzipSync, brotliCompressSync, constants } from 'node:zlib'
import { posix, relative } from 'node:path'
import { CHUNKS_DIR, ENTRIES } from './entries.mjs'

const BUILD = 'build'

/** The shared chunks in build/, by their path under it, in a stable order. */
const chunkFiles = () => {
  const dir = `${BUILD}/${CHUNKS_DIR}`
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .sort()
    .map((file) => `${CHUNKS_DIR}/${file}`)
}

/**
 * The report's rows, in order: each entry's bundle, carrying its
 * declarations, then each shared chunk, which has none of its own.
 */
const outputs = () => [
  ...ENTRIES.map(({ name }) => ({ file: `${name}.js`, types: `${name}.d.ts` })),
  ...chunkFiles().map((file) => ({ file, types: null })),
]

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

const sizesOf = (file) => {
  const path = `${BUILD}/${file}`
  return existsSync(path) ? compressedSizes(readFileSync(path)) : undefined
}

/** A static import's specifier in built ESM, minified or not. */
const IMPORT_SPECIFIER = /(?:\bfrom|\bimport)\s*["']([^"']+)["']/g

/**
 * An entry's own file plus every shared chunk it imports, transitively, by
 * their paths under build/: what a consumer of that entry loads. Read from
 * the import statements rollup writes, so it follows the build as it is.
 */
export const entryFiles = (name) => {
  const files = []
  const visit = (file) => {
    if (files.includes(file) || !existsSync(`${BUILD}/${file}`)) return
    files.push(file)
    const code = readFileSync(`${BUILD}/${file}`, 'utf8')
    for (const [, specifier] of code.matchAll(IMPORT_SPECIFIER))
      if (specifier.startsWith('.')) visit(posix.join(posix.dirname(file), specifier))
  }
  visit(`${name}.js`)
  return files
}

/**
 * The brotli size an entry's budget is held to: its file plus the chunks it
 * imports, each compressed on its own as it is served. A chunk counts once
 * for every entry that imports it, so moving code into a chunk never makes
 * an entry look smaller than what it costs its consumers.
 */
export const entryBrotli = (name) =>
  entryFiles(name).reduce((sum, file) => sum + sizesOf(file).brotli, 0)

/**
 * Per-module contribution, as rendered into the chunk after tree-shaking but
 * before minification — rollup tracks module boundaries at that point and
 * terser erases them, so this is the finest breakdown available. The shares
 * are the useful part: they answer "what is the bundle made of".
 */
const moduleTable = (file, modules) => {
  const rows = Object.entries(modules)
    .map(([id, { renderedLength }]) => ({ id: relative(process.cwd(), id), renderedLength }))
    .filter(({ renderedLength }) => renderedLength > 0)
    .sort((a, b) => b.renderedLength - a.renderedLength)

  const total = rows.reduce((sum, { renderedLength }) => sum + renderedLength, 0)

  return [
    '',
    `  Modules in ${file} (rendered, pre-minify) — ${rows.length} files, ${kB(total)} total`,
    ...rows.map(
      ({ id, renderedLength }) =>
        `    ${pad(((renderedLength / total) * 100).toFixed(1) + '%', 6)}` +
        `${pad(kB(renderedLength), 11)}  ${id}`
    ),
  ].join('\n')
}

/**
 * The whole report: a table with a row per output file, then a module
 * breakdown for each output made of more than one module.
 */
const formatReport = (rows) => {
  const width = Math.max(...rows.map(({ file }) => file.length))
  const cell = (sizes, metric) => pad(sizes ? kB(sizes[metric]) : '—', 11)
  return [
    '',
    `  Bundle size — ${BUILD}/ (ESM, minified; declarations uncompressed)`,
    `    ${''.padEnd(width)}${pad('minified', 11)}${pad('gzip', 11)}${pad('brotli', 11)}${pad('types', 11)}`,
    ...rows.map(
      ({ file, sizes, types }) =>
        `    ${file.padEnd(width)}${cell(sizes, 'raw')}${cell(sizes, 'gzip')}` +
        `${cell(sizes, 'brotli')}${cell(types, 'raw')}`
    ),
    ...ENTRIES.filter(({ name }) => entryFiles(name).length > 1).map(
      ({ name }) =>
        `    ${`${name}.js with its chunks`.padEnd(width)}${pad('', 22)}${pad(kB(entryBrotli(name)), 11)}`
    ),
    ...rows
      .filter(({ modules }) => modules && Object.keys(modules).length > 1)
      .map(({ file, modules }) => moduleTable(file, modules)),
    '',
  ].join('\n')
}

/**
 * Machine-readable sizes of every output file, declarations as rows of their
 * own. A file that isn't there is reported as `missing` rather than omitted
 * or fatal: the PR workflow measures a base commit that may predate a
 * bundle's existence, and "new file" is a real answer there, not a failure.
 */
export const measure = () =>
  outputs()
    .flatMap(({ file, types }) => [
      { file, label: types ? `${file} (ESM, terser-minified)` : `${file} (shared chunk)` },
      ...(types ? [{ file: types, label: `${types} (types)` }] : []),
    ])
    .map(({ file, label }) => {
      const path = `${BUILD}/${file}`
      const sizes = sizesOf(file)
      return sizes ? { path, label, ...sizes } : { path, label, missing: true }
    })

/** Carried from the ESM pass to the last .d.ts pass, which reports. */
const collected = new Map()

/**
 * Rollup plugin for the ESM pass. Captures in `writeBundle`, so every file is
 * on disk and every `renderChunk` hook (notably terser) has had its turn.
 */
export const collectBundleSize = () => ({
  name: 'fig-tree-collect-bundle-size',
  writeBundle(_options, output) {
    for (const item of Object.values(output))
      if (item.type === 'chunk')
        collected.set(item.fileName, {
          sizes: compressedSizes(Buffer.from(item.code)),
          modules: item.modules,
        })
  },
})

const rowsFor = () =>
  outputs().map(({ file, types }) => ({
    file,
    sizes: collected.get(file)?.sizes ?? sizesOf(file),
    types: types ? sizesOf(types) : undefined,
    modules: collected.get(file)?.modules,
  }))

/** Rollup plugin for the last .d.ts pass: prints the report for the build. */
export const printBundleSize = () => ({
  name: 'fig-tree-print-bundle-size',
  writeBundle() {
    console.log(formatReport(rowsFor()))
  },
})

/** CLI: report on the existing build output, no rebuild. */
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (process.argv.includes('--json')) {
    // Tolerates a missing build on purpose — see `measure()`
    console.log(JSON.stringify(measure(), null, 2))
  } else if (!existsSync(`${BUILD}/${ENTRIES[0].name}.js`)) {
    console.error(`No ${BUILD}/${ENTRIES[0].name}.js — run \`pnpm build\` first.`)
    process.exit(1)
  } else {
    console.log(formatReport(rowsFor()))
  }
}

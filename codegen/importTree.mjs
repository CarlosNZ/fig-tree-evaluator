/**
 * `pnpm size:imports` — what each import costs a consumer, as a tree of
 * what it shares with what (docs-dev/imports.md, "What shares what").
 *
 * A row's imports are its parent's plus its own, so going down a branch is
 * adding imports to one bundle, and a row's `adds` is what that costs beside
 * everything above it. Its `alone` is the same imports bundled by
 * themselves: where `alone` is much larger than `adds`, the difference is
 * code the row shares with its parent. A set of imports from different
 * branches costs roughly the union of their paths.
 *
 * Each size is measured as docs-dev/imports.md describes: the imports
 * bundled alone from the built package with esbuild (`bundle`, `minify`,
 * `format: 'esm'`), and the brotli size of the output, through the same
 * `compressedSizes()` as the build's report. Sizes are of a whole bundle,
 * never added up from parts, since brotli sizes do not add.
 *
 * `mostly from` names the source modules of a row's added code. The
 * package is built afresh, with sourcemaps, into a temporary directory, and
 * esbuild composes those maps with its own, so each byte of a minified
 * bundle traces to a position in src/. A row's added code is the positions
 * its bundle has and its parent's does not.
 *
 * Prints the tree; with `--write`, also replaces the block between the
 * IMPORT_TREE markers in docs-dev/imports.md.
 */
import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import typescript from '@rollup/plugin-typescript'
import { TraceMap, eachMapping } from '@jridgewell/trace-mapping'
import { build } from 'esbuild'
import { rollup } from 'rollup'
import configs from '../rollup.config.mjs'
import { compressedSizes } from './bundleSize.mjs'
import { ENTRIES } from './entries.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')
const DOC = join(ROOT, 'docs-dev/imports.md')
const MARKERS = ['<!-- IMPORT_TREE:START -->', '<!-- IMPORT_TREE:END -->']
const CONSUMER = 'consumer.js'

/** A row: its imports, comma-separated, and the rows that add to them. */
const row = (imports, ...children) => ({
  imports: imports.split(',').map((name) => name.trim()),
  children,
})

/**
 * The rows, as the import map groups them: the engine and what is added to
 * it, then the imports a consumer takes without it, entry by entry.
 */
const TREE = [
  row(
    'coreOperators',
    row(
      'FigTree',
      row('inspect'),
      row('defineOperator'),
      row('httpOperators, FetchClient'),
      row('sqlOperators, PostgresConnection'),
      row('toCanonical, toShorthand'),
      row('fallbackCoverage')
    )
  ),
  row('defineOperator'),
  row('httpOperators, FetchClient', row('sqlOperators, PostgresConnection')),
  row('FigTreeError, isFigTreeError, ErrorCodes'),
  row('isTruthy, compareValues, renderText, deepEqual, resolvePath'),
  row('toCanonical', row('toShorthand')),
  row('recognizeReference'),
  row('toGet'),
  row('migrateV2Expression', row('migrateV2Fragments')),
  row('operatorHints, categoryHints, typeSeeds'),
]

/**
 * The package as `pnpm build` writes it, plus sourcemaps: the build's own
 * rollup config with only its output moved and its declarations dropped.
 * The TypeScript plugin is replaced rather than reconfigured, since it
 * requires its output directories inside rollup's.
 */
const buildWithSourcemaps = async (dir) => {
  const [config] = configs
  const bundle = await rollup({
    ...config,
    plugins: [
      typescript({ outDir: dir, declaration: false, declarationDir: undefined, sourceMap: true }),
      ...config.plugins.filter(
        ({ name }) => !['typescript', 'fig-tree-collect-bundle-size'].includes(name)
      ),
    ],
    onLog: (level, log) => {
      if (log.code !== 'CIRCULAR_DEPENDENCY') console.warn(`${level}: ${log.message}`)
    },
  })
  await bundle.write({ ...config.output, dir, sourcemap: true })
  await bundle.close()
}

/** Each value export's entry, by name, read from the built entries. */
const entriesByExport = async (dir) => {
  const entries = new Map()
  for (const { subpath, name } of ENTRIES)
    for (const exported of Object.keys(await import(join(dir, `${name}.js`)))) {
      if (entries.has(exported))
        throw new Error(
          `"${exported}" is exported by both ${entries.get(exported).subpath} and ${subpath}`
        )
      entries.set(exported, { subpath, name })
    }
  return entries
}

/**
 * A bundle of `imports`, measured: its brotli size, and its bytes by the
 * source position each was minified from (`module|line:column`), the
 * consumer's own code and esbuild's helpers left out.
 */
const measureBundle = async (dir, entries, imports) => {
  const byEntry = Map.groupBy(imports, (exported) => {
    if (!entries.has(exported)) throw new Error(`No entry exports "${exported}"`)
    return entries.get(exported).name
  })
  const contents = [
    ...[...byEntry].map(([name, names]) => `import { ${names.join(', ')} } from './${name}.js'`),
    `console.log(${imports.join(', ')})`,
  ].join('\n')
  const { outputFiles } = await build({
    stdin: { contents, resolveDir: dir, sourcefile: CONSUMER },
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    sourcemap: 'external',
    outdir: dir,
    logLevel: 'silent',
  })
  const code = outputFiles.find(({ path }) => path.endsWith('.js')).text
  const map = new TraceMap(outputFiles.find(({ path }) => path.endsWith('.map')).text)
  const lines = code.split('\n')

  // A mapping covers its line from its own column to the next mapping's
  const mappings = []
  eachMapping(map, (mapping) => mappings.push(mapping))
  const bytes = new Map()
  mappings.forEach((mapping, i) => {
    if (mapping.source === null) return
    const module = relative(SRC, resolve(dir, mapping.source))
    if (module.startsWith('..')) return
    const next = mappings[i + 1]
    const end =
      next?.generatedLine === mapping.generatedLine
        ? next.generatedColumn
        : lines[mapping.generatedLine - 1].length
    const key = `${module}|${mapping.originalLine}:${mapping.originalColumn}`
    bytes.set(key, (bytes.get(key) ?? 0) + end - mapping.generatedColumn)
  })
  return { brotli: compressedSizes(Buffer.from(code)).brotli, bytes }
}

/** The modules `bytes` has beyond `parent`, largest first, with shares. */
const addedModules = (bytes, parent) => {
  const modules = new Map()
  for (const [key, size] of bytes)
    if (!parent.has(key)) {
      const module = key.slice(0, key.indexOf('|')).replace(/\.ts$/, '')
      modules.set(module, (modules.get(module) ?? 0) + size)
    }
  const total = [...modules.values()].reduce((sum, size) => sum + size, 0)
  return [...modules]
    .sort(([, a], [, b]) => b - a)
    .map(([module, size]) => ({ module, share: size / total }))
}

/** Bytes as kB: two decimals under 1 kB, one above. */
const kB = (bytes) => (bytes / 1000).toFixed(bytes < 1000 ? 2 : 1)

/** The imports a row names, each tagged with its subpath unless the root. */
const label = (imports, entries) =>
  [...Map.groupBy(imports, (exported) => entries.get(exported).subpath)]
    .map(([subpath, names]) => names.join(', ') + (subpath === '.' ? '' : ` (${subpath})`))
    .join(' + ')

/**
 * Measures every row and renders the tree: a line per row, with its branch
 * drawn, then its columns. Bundles are measured once per distinct set of
 * imports.
 */
const renderTree = async (dir, entries) => {
  const measured = new Map()
  const measure = (imports) => {
    const key = [...imports].sort().join()
    if (!measured.has(key)) measured.set(key, measureBundle(dir, entries, imports))
    return measured.get(key)
  }

  const rows = []
  const visit = async (node, parent, prefix, branch) => {
    const imports = [...new Set([...parent.imports, ...node.imports])]
    const [total, alone] = await Promise.all([measure(imports), measure(node.imports)])
    rows.push({
      tree: `${prefix}${branch}${label(node.imports, entries)}`,
      adds: total.brotli - parent.brotli,
      total: total.brotli,
      alone: alone.brotli,
      from: addedModules(total.bytes, parent.bytes),
    })
    const childPrefix = prefix + (branch === '├─ ' ? '│  ' : branch === '└─ ' ? '   ' : '')
    for (const [i, child] of node.children.entries())
      await visit(
        child,
        { imports, ...total },
        childPrefix,
        i === node.children.length - 1 ? '└─ ' : '├─ '
      )
  }
  const none = { imports: [], brotli: 0, bytes: new Map() }
  for (const node of TREE) {
    if (rows.length > 0) rows.push(null)
    await visit(node, none, '', '')
  }

  const width = Math.max(...rows.filter(Boolean).map(({ tree }) => tree.length))
  const column = (text) => String(text).padStart(7)
  const mostly = (from) =>
    from
      .filter(({ share }) => share >= 0.05)
      .slice(0, 3)
      .map(({ module, share }) => `${module} ${Math.round(share * 100)}%`)
      .join(', ')
  return [
    `${''.padEnd(width)}${column('adds')}${column('total')}${column('alone')}   mostly from`,
    ...rows.map((row) =>
      row === null
        ? ''
        : `${row.tree.padEnd(width)}${column(kB(row.adds))}${column(kB(row.total))}` +
          `${column(kB(row.alone))}   ${mostly(row.from)}`
    ),
  ].join('\n')
}

/** The commit the tree was measured at, marked when src/'s files differ. */
const revision = () => {
  const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  const dirty =
    execSync('git status --porcelain --untracked-files=no -- src', { encoding: 'utf8' }).trim() !==
    ''
  return dirty ? `${commit}, with uncommitted changes to src/` : commit
}

/** Replaces the block between the markers in docs-dev/imports.md. */
const writeDoc = (tree) => {
  const doc = readFileSync(DOC, 'utf8')
  const [start, end] = MARKERS.map((marker) => doc.indexOf(marker))
  if (start === -1 || end < start)
    throw new Error(`${relative(ROOT, DOC)} has no ${MARKERS.join(' … ')} block`)
  const block = [
    MARKERS[0],
    '',
    `Generated by \`pnpm size:imports --write\` at ${revision()}. Sizes in kB, brotli.`,
    '',
    '```text',
    tree,
    '```',
    '',
    '',
  ].join('\n')
  writeFileSync(DOC, doc.slice(0, start) + block + doc.slice(end))
}

// Real, since macOS's tmpdir is behind a symlink and sourcemaps hold paths
// relative to the real one
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'fig-tree-import-tree-')))
try {
  await buildWithSourcemaps(dir)
  const tree = await renderTree(dir, await entriesByExport(dir))
  console.log(`\n${tree}\n`)
  if (process.argv.includes('--write')) {
    writeDoc(tree)
    console.log(`Wrote the tree into ${relative(ROOT, DOC)}`)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

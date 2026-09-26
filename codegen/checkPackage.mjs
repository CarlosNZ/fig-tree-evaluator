/**
 * `pnpm check:package` — the packaging checks that need the built package
 * ("Build & CI mechanics" in docs-dev/v3-specs/v3-packaging.md). Run after
 * `pnpm build`, in CI and in `pnpm release`:
 *
 *  1. Size budgets: each entry's brotli size, with the shared chunks it
 *     imports, under its ceiling (codegen/entries.mjs), and each consumer's
 *     under its own.
 *  2. Tree-shaking: a consumer importing only `{ FigTree, coreOperators }`,
 *     bundled from build/ with esbuild, carries none of the I/O toolkit, the
 *     inspector, `defineOperator()`'s checks or any subpath; one importing
 *     only `{ isTruthy, parsePath }` carries none of those, the engine or
 *     the core operators. esbuild rather than rollup, because rollup infers
 *     purity of its own and would pass a build whose `/*#__PURE__*\/`
 *     annotations had stopped matching, as esbuild and webpack would
 *     not. Absence is found
 *     by marker strings — string literals, because minification renames
 *     identifiers, so a scan for `FetchClient` would pass with the class
 *     present. Each marker is first found in a bundle of everything its
 *     entry exports, so a reworded message fails the check instead of
 *     passing it trivially. Markers are ASCII: esbuild escapes the rest.
 *  3. The packed package: `pnpm pack`, installed into a temporary directory,
 *     where every entry imports by name as ESM, `require()`s from CommonJS
 *     (Node >= 22.12's require(esm)), and typechecks from TypeScript through
 *     the `exports` map's `types` conditions and through the `typesVersions`
 *     fallback of the legacy `node` resolution — the package as npm delivers
 *     it, which none of the other checks see.
 *
 * Every check runs and reports; the script fails at the end if any did.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { compressedSizes, entryBrotli, entryFiles } from './bundleSize.mjs'
import { ENTRIES } from './entries.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name

/** What a host that only evaluates imports — the fixture's consumer. */
const ENGINE_ONLY = `
import { FigTree, coreOperators } from './build/index.js'
export default new FigTree({ operators: [coreOperators] })
`
const ENGINE_ONLY_BUDGET = 31_000

/**
 * What the engine-only consumer must not carry from the root entry, by the
 * strings that give each part away. Subpath entries carry their own marker
 * in codegen/entries.mjs.
 */
const ROOT_MARKERS = [
  {
    part: 'the I/O toolkit',
    markers: [
      'FetchClient(): this runtime has no global fetch',
      'AxiosClient(axios): pass the axios import itself',
      'PostgresConnection(client): pass a connected',
      'SQLiteConnection(db): pass an open sqlite Database',
      'One GraphQL query',
    ],
  },
  { part: 'the inspector', markers: ['inspect() takes a CompiledExpression'] },
  { part: "defineOperator()'s checks", markers: ['a definition must be a plain object'] },
]

/**
 * What a host that borrows only the engine-parity helpers imports — a
 * custom-operator package, say. The root ships as one file, so only
 * `/*#__PURE__*\/` annotations (rollup.config.mjs) and a class definition
 * free of side effects let a bundler leave the engine out (#193). The
 * helpers alone are ~0.65 kB. The budget is set to catch even the smallest
 * leak measured, the five array operators (+1.2 kB, kept by an object
 * spread in their definitions); the engine alone is ~25 kB.
 */
const SMALL_IMPORT = `
import { isTruthy, parsePath } from './build/index.js'
export default [isTruthy, parsePath]
`
const SMALL_IMPORT_BUDGET = 1_500

/**
 * What the small-import consumer must not carry beyond ROOT_MARKERS. The
 * operators get a marker per factory, since each factory's calls are kept
 * or dropped by their own entry in rollup.config.mjs's PURE_CALLEES: a
 * renamed factory leaks its operators and nothing else.
 */
const ENGINE_MARKERS = [
  {
    part: 'the engine',
    markers: [
      "'cache.maxSize' must be a positive integer",
      'a shielded artifact has a hole with no static fallback',
    ],
  },
  {
    part: 'the core operators',
    markers: [
      'Transform every element of an array', // declareOperator
      'Is the first value strictly greater than the second?', // ordering
      'Round down toward negative infinity', // unary
      'The smallest of the values', // extremum
      'Strip whitespace (the JS trim set) from both ends of a string', // normalizer
      'array is a dead expression', // emptyArrayWarning
    ],
  },
]

const failures = []
const pass = (line) => console.log(`    ✓ ${line}`)
const fail = (line) => {
  failures.push(line)
  console.log(`    ✖ ${line}`)
}
const section = (title) => console.log(`\n▸ ${title}`)
const kB = (bytes) => `${(bytes / 1000).toFixed(2)} kB`

const specifier = (subpath) => (subpath === '.' ? PACKAGE : `${PACKAGE}${subpath.slice(1)}`)

/** A consumer module bundled from build/ as a host's bundler would. */
const bundle = async (contents) => {
  const { outputFiles } = await build({
    stdin: { contents, resolveDir: ROOT, loader: 'js' },
    bundle: true,
    format: 'esm',
    minify: true,
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
  })
  return Buffer.from(outputFiles[0].contents)
}

const everythingFrom = (name) => `export * from './build/${name}.js'`

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')}\n${result.stdout}${result.stderr}`.trim())
  return result.stdout
}

// ── 1 & 2 · Size budgets and tree-shaking ─────────────────────────────────

const engineOnly = await bundle(ENGINE_ONLY)
const smallImport = await bundle(SMALL_IMPORT)

section('Size budgets (brotli)')
const entryLabel = (name) => `${name}.js${entryFiles(name).length > 1 ? ' + chunks' : ''}`
const width = Math.max(
  ...ENTRIES.map(({ name }) => entryLabel(name).length),
  'small-import consumer'.length
)
const budgetLine = (label, size, budget) => {
  const line = `${label.padEnd(width)}  ${kB(size).padStart(9)} of ${kB(budget).padStart(9)}`
  if (size <= budget) pass(line)
  else fail(`${line} — over budget`)
}
for (const { name, budget } of ENTRIES) budgetLine(entryLabel(name), entryBrotli(name), budget)
budgetLine('engine-only consumer', compressedSizes(engineOnly).brotli, ENGINE_ONLY_BUDGET)
budgetLine('small-import consumer', compressedSizes(smallImport).brotli, SMALL_IMPORT_BUDGET)

const rootGroups = (markerGroups) =>
  markerGroups.map(({ part, markers }) => ({ part, markers, entry: 'index' }))
const subpathGroups = ENTRIES.filter(({ subpath }) => subpath !== '.').map(
  ({ subpath, name, marker }) => ({
    part: `the ${subpath} subpath`,
    markers: marker ? [marker] : [],
    entry: name,
  })
)

/** Everything each entry exports, bundled once, where markers are proved. */
const everything = new Map()

/** Each group's markers, found in its own entry and absent from `consumer`. */
const checkAbsent = async (consumer, label, groups) => {
  for (const { part, markers, entry } of groups) {
    if (markers.length === 0) {
      fail(`${part} has no marker in codegen/entries.mjs, so its absence cannot be checked`)
      continue
    }
    if (!everything.has(entry))
      everything.set(entry, (await bundle(everythingFrom(entry))).toString())
    const missing = markers.filter((marker) => !everything.get(entry).includes(marker))
    const leaked = markers.filter((marker) => consumer.includes(marker))
    if (missing.length > 0)
      fail(
        `${part}: marker not found in its own entry, so the check proves nothing — ${missing.join(' | ')}`
      )
    else if (leaked.length > 0) fail(`${part} is in the ${label} bundle — ${leaked.join(' | ')}`)
    else pass(`none of ${part}`)
  }
}

section('Tree-shaking: `{ FigTree, coreOperators }` alone')
await checkAbsent(engineOnly, 'engine-only', [...rootGroups(ROOT_MARKERS), ...subpathGroups])

section('Tree-shaking: `{ isTruthy, parsePath }` alone')
await checkAbsent(smallImport, 'small-import', rootGroups([...ROOT_MARKERS, ...ENGINE_MARKERS]))

// ── 3 · The packed package ────────────────────────────────────────────────

section('The packed package, installed as a consumer would')
const dir = mkdtempSync(join(tmpdir(), 'fig-tree-pack-'))
try {
  run('pnpm', ['pack', '--pack-destination', dir], ROOT)
  const tarball = readdirSync(dir).find((file) => file.endsWith('.tgz'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true }))
  run(
    'npm',
    ['install', `./${tarball}`, '--offline', '--no-audit', '--no-fund', '--ignore-scripts'],
    dir
  )
  const specifiers = ENTRIES.map(({ subpath }) => specifier(subpath))

  // Each import must be non-empty: an `exports` path to the wrong file can
  // still load a module that exports nothing
  const importAll = specifiers
    .map((spec) => `if (!Object.keys(await import('${spec}')).length) throw new Error('${spec}')`)
    .join('\n')
  writeFileSync(join(dir, 'esm.mjs'), importAll)
  run('node', ['esm.mjs'], dir)
  pass(`imports as ESM: ${specifiers.join(', ')}`)

  const requireAll = specifiers
    .map((spec) => `if (!Object.keys(require('${spec}')).length) throw new Error('${spec}')`)
    .join('\n')
  writeFileSync(join(dir, 'cjs.cjs'), requireAll)
  run('node', ['--disable-warning=ExperimentalWarning', 'cjs.cjs'], dir)
  pass(`require()s from CommonJS: ${specifiers.join(', ')}`)

  // A browser host's view: the DOM library and no @types/node, so a
  // declaration that leans on a Node type fails here. Once through the
  // `exports` map, and once as TypeScript's legacy `node` resolution sees the
  // package: it ignores `exports`, so there the subpaths resolve only
  // through `typesVersions`
  writeFileSync(
    join(dir, 'types.ts'),
    specifiers.map((spec, i) => `import * as entry${i} from '${spec}'`).join('\n') +
      `\nexport const entries = [${specifiers.map((_, i) => `entry${i}`).join(', ')}]\n`
  )
  const resolutions = [
    { module: 'nodenext', moduleResolution: 'nodenext', via: 'the exports map' },
    { module: 'esnext', moduleResolution: 'node', via: 'typesVersions, under resolution "node"' },
  ]
  for (const { via, ...resolution } of resolutions) {
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          ...resolution,
          target: 'es2022',
          lib: ['es2022', 'dom'],
          types: [],
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        files: ['types.ts'],
      })
    )
    run(join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.json'], dir)
    pass(`typechecks through ${via}, declarations included (DOM, no @types/node)`)
  }
} catch (error) {
  fail(error.message)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n✖ ${failures.length} packaging check${failures.length === 1 ? '' : 's'} failed`)
  process.exit(1)
}
console.log('\nAll packaging checks passed.')

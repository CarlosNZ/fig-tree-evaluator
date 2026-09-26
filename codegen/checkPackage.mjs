/**
 * `pnpm check:package` — the packaging checks that need the built package
 * ("Build & CI mechanics" in docs-dev/v3-specs/v3-packaging.md). Run after
 * `pnpm build`, in CI and in `pnpm release`:
 *
 *  1. Size budgets: each entry's brotli size, with the shared chunks it
 *     imports, under its ceiling (codegen/entries.mjs), and the engine-only
 *     consumer's under its own.
 *  2. Tree-shaking: a consumer importing only `{ FigTree, coreOperators }`,
 *     bundled from build/ with esbuild, carries none of the I/O toolkit, the
 *     inspector, `defineOperator()`'s checks or any subpath. Absence is found
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

section('Size budgets (brotli)')
const entryLabel = (name) => `${name}.js${entryFiles(name).length > 1 ? ' + chunks' : ''}`
const width = Math.max(
  ...ENTRIES.map(({ name }) => entryLabel(name).length),
  'engine-only consumer'.length
)
const budgetLine = (label, size, budget) => {
  const line = `${label.padEnd(width)}  ${kB(size).padStart(9)} of ${kB(budget).padStart(9)}`
  if (size <= budget) pass(line)
  else fail(`${line} — over budget`)
}
for (const { name, budget } of ENTRIES) budgetLine(entryLabel(name), entryBrotli(name), budget)
budgetLine('engine-only consumer', compressedSizes(engineOnly).brotli, ENGINE_ONLY_BUDGET)

section('Tree-shaking: `{ FigTree, coreOperators }` alone')
const groups = [
  ...ROOT_MARKERS.map(({ part, markers }) => ({ part, markers, entry: 'index' })),
  ...ENTRIES.filter(({ subpath }) => subpath !== '.').map(({ subpath, name, marker }) => ({
    part: `the ${subpath} subpath`,
    markers: marker ? [marker] : [],
    entry: name,
  })),
]
const everything = new Map()
for (const { part, markers, entry } of groups) {
  if (markers.length === 0) {
    fail(`${part} has no marker in codegen/entries.mjs, so its absence cannot be checked`)
    continue
  }
  if (!everything.has(entry))
    everything.set(entry, (await bundle(everythingFrom(entry))).toString())
  const missing = markers.filter((marker) => !everything.get(entry).includes(marker))
  const leaked = markers.filter((marker) => engineOnly.includes(marker))
  if (missing.length > 0)
    fail(
      `${part}: marker not found in its own entry, so the check proves nothing — ${missing.join(' | ')}`
    )
  else if (leaked.length > 0) fail(`${part} is in the engine-only bundle — ${leaked.join(' | ')}`)
  else pass(`none of ${part}`)
}

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

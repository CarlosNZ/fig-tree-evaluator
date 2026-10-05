/**
 * The package's entry points, as the build sees them ("The package at a
 * glance" in docs-dev/v3-specs/v3-packaging.md). One list, read by
 * rollup.config.mjs for the build's inputs and by codegen/bundleSize.mjs for
 * the size report and the PR comment, so a new subpath is one row here plus
 * its `exports` entry in package.json — which the build checks against this
 * list, failing when the two disagree.
 *
 * `name` is the output path under build/, without extension: the bundle is
 * `build/<name>.js`, its declarations `build/<name>.d.ts`. `budget` is the
 * brotli ceiling in bytes for the bundle together with the shared chunks it
 * imports (`entryBrotli` in codegen/bundleSize.mjs), set from measurement
 * plus about 5%; raising one is a deliberate edit, visible in review.
 * `marker` is a string literal only this entry's code contains, which
 * `pnpm check:package` finds in the entry's own bundle and requires to be
 * absent from an engine-only one — every entry but the root needs one.
 */
export const ENTRIES = [
  { subpath: '.', name: 'index', source: 'src/index.ts', budget: 37_850 },
  {
    subpath: './migrate',
    name: 'migrate/index',
    source: 'src/migrate/index.ts',
    budget: 20_500,
    marker: 'is not a v2 operator',
  },
  {
    subpath: './editor-hints',
    name: 'editor-hints/index',
    source: 'src/editor-hints/index.ts',
    budget: 2_000,
    marker: 'String builder',
  },
  {
    subpath: './format',
    name: 'format/index',
    source: 'src/format/index.ts',
    budget: 6_950,
    marker: 'referencesAsGet',
  },
  {
    subpath: './authoring',
    name: 'authoring/index',
    source: 'src/authoring/index.ts',
    budget: 41_730,
    marker: 'fallbackCoverage() takes',
  },
]

/**
 * Where code shared between entries lands. The build is one rollup pass over
 * every entry, so a module two entries import is emitted once, here, rather
 * than copied into each — two copies of the brand symbol, `EvaluationData`
 * or `FigTreeError` would break identity across subpaths.
 */
export const CHUNKS_DIR = 'chunks'

/**
 * Each shared chunk's name, after a module only that chunk holds: the
 * engine `./authoring` shares with the root, and the small modules
 * `./format` shares with both. Named by what a chunk holds rather than by
 * rollup's numbering, so a chunk keeps its name as its contents change and
 * the PR comment can compare it. A chunk holding none of these fails the
 * build (rollup.config.mjs) rather than taking a number, so a new one gets a
 * row here.
 */
export const CHUNK_NAMES = [
  { module: 'src/FigTree.ts', name: 'engine' },
  { module: 'src/compile/grammar.ts', name: 'shared' },
]

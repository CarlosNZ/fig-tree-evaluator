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
  { subpath: '.', name: 'index', source: 'src/index.ts', budget: 36_000 },
  {
    subpath: './migrate',
    name: 'migrate/index',
    source: 'src/migrate/index.ts',
    budget: 19_500,
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
    budget: 6_550,
    marker: 'referencesAsGet',
  },
]

/**
 * Where code shared between entries lands. The build is one rollup pass over
 * every entry, so a module two entries import is emitted once, here, rather
 * than copied into each — two copies of the brand symbol, `EvaluationData`
 * or `FigTreeError` would break identity across subpaths. Unhashed, so a
 * chunk keeps its name from one build to the next and the PR comment can
 * compare it.
 */
export const CHUNKS_DIR = 'chunks'

/**
 * `fig-tree-evaluator/migrate` — converts v2 expressions and fragment
 * definitions to v3 (docs-dev/v3-specs/v3-converter.md, and
 * docs-dev/v3-specs/v3-migration.md for what conversion promises). The
 * engine never imports this, and this imports only types from the engine.
 *
 * Both functions are pure over their arguments and the converter's own v2
 * tables, and never throw: whatever they cannot convert comes back as the
 * closest safe v3, with an issue saying so.
 */
import type { FragmentMigrationResult, MigrationResult, V2Options } from '../migrationTypes'
import { convertV2, convertV2Fragments } from './convert'

/**
 * One v2 expression as v3. `options` is the part of the host's v2 options
 * that changes how the expression reads: its fragments, custom functions and
 * flags. The result is best-effort wherever `issues` is not empty.
 */
export const migrateV2Expression = (expression: unknown, options?: V2Options): MigrationResult =>
  convertV2(expression, options)

/**
 * The fragment definitions in `options.fragments` as v3's, keyed as in the
 * input unless a name had to change, with issue paths rooted at the
 * fragments object.
 */
export const migrateV2Fragments = (options: V2Options): FragmentMigrationResult =>
  convertV2Fragments(options)

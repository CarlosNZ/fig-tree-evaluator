/**
 * `fig-tree-evaluator/migrate` — converts v2 expression trees to v3
 * ("`./migrate`" in docs-dev/v3-specs/v3-packaging.md, and
 * docs-dev/v3-specs/v3-migration.md for what it converts and how). The
 * engine never imports this, and this imports only types from the engine.
 *
 * TO-DO: the conversion itself (Phase 15.1, designed in
 * docs-dev/v3-specs/v3-converter.md). The placeholder returns its input
 * unchanged, with one issue at the root saying so, since an empty `issues`
 * would claim a clean conversion.
 */
import type { MigrationResult } from '../migrationTypes'

export const migrateV2Expression = (expression: unknown): MigrationResult => ({
  expression,
  issues: [
    {
      tag: 'non-convertible',
      path: [],
      message: 'migrateV2Expression is a placeholder: the expression is returned unconverted',
    },
  ],
})

/**
 * The shapes `migrateV2Expression` returns ("`./migrate` — the module
 * surface" in docs-dev/v3-specs/v3-migration.md). Types only, exported from
 * the root, so the `fig-tree-evaluator/migrate` subpath stays a function
 * module with no type surface of its own ("Types" in
 * docs-dev/v3-specs/v3-packaging.md).
 */

/** One catalogued divergence between a v2 tree and its conversion. */
export interface MigrationIssue {
  /**
   * The divergence-catalog vocabulary of
   * docs-dev/v3-specs/v3-testing-strategy.md, so a converted tree's issues and
   * the differential runner's catalog have the same shape.
   */
  tag: 'non-convertible' | 'intentional-semantic-change' | 'lossy-default'
  /** Where the divergence is, in the source (v2) tree. */
  path: (string | number)[]
  /** What happened, and what a person must check. */
  message: string
}

/**
 * The converter never throws: a node it cannot convert becomes the closest
 * safe v3 node, with an issue saying so.
 */
export interface MigrationResult {
  /** The converted v3 tree, best-effort wherever there are issues. */
  expression: unknown
  /** Empty only for a clean, fully mechanical conversion. */
  issues: MigrationIssue[]
}

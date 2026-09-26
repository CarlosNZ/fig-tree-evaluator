/**
 * The shapes `fig-tree-evaluator/migrate` takes and returns ("Surface" in
 * docs-dev/v3-specs/v3-converter.md). Types only, exported from the root, so
 * the subpath stays a function module with no type surface of its own
 * ("Types" in docs-dev/v3-specs/v3-packaging.md).
 */
import type { FragmentDefinition } from './fragments'

/** One catalogued divergence between a v2 tree and its conversion. */
export interface MigrationIssue {
  /**
   * What the divergence is, one of the codes in "The issue catalogue" in
   * docs-dev/v3-specs/v3-converter.md. A code keeps its meaning, and its
   * message can be reworded.
   */
  code:
    | 'split-trailing-empty'
    | 'remainder-sign'
    | 'template-numbering'
    | 'named-token-source'
    | 'response-collapse'
    | 'computed-delimiter'
    | 'computed-branches'
    | 'graphql-relative-url'
    | 'output-type'
    | 'missing-data-fallback'
    | 'unprefixed-parameter'
    | 'instance-case-insensitive'
    | 'values-cut'
    | 'fallback-converted'
    | 'malformed-entry'
    | 'unreachable-branches'
    | 'overridden-value'
    | 'discarded-expression'
    | 'fragment-shorthand-payload'
    | 'shadowed-argument'
    | 'unknown-argument'
    | 'fragment-use-cache'
    | 'name-renamed'
    | 'unknown-parameter-type'
    | 'default-outside-type'
    | 'unused-output-type'
    | 'deciding-value'
    | 'drilled-substitution-token'
    | 'number-mapping'
    | 'template-escape'
    | 'computed-dollar-template'
    | 'custom-function-call'
    | 'computed-function-name'
    | 'computed-arguments'
    | 'body-override'
    | 'computed-fragment-name'
    | 'replaced-output-type'
    | 'computed-children'
    | 'unknown-operator'
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

/** v2's fragment definitions as v3's, with what their conversion found. */
export interface FragmentMigrationResult {
  /** Every definition, keyed as in the input unless renamed. */
  fragments: Record<string, FragmentDefinition>
  /** Paths are rooted at the fragments object: `['getFlag', …]`. */
  issues: MigrationIssue[]
}

/**
 * The part of v2's options that changes how an expression is read ("The v2
 * options" in docs-dev/v3-specs/v3-converter.md). Any other key is ignored,
 * so a migration script can pass its v2 options object as it is.
 */
export interface V2Options {
  /** v2's fragment definitions, read for their names and parameters */
  fragments?: Record<string, unknown>
  /**
   * The host's custom functions, as names or as v2's `functions` object, of
   * which only the keys are read
   */
  functions?: readonly string[] | Record<string, unknown>
  /** Whether v2 looked for nodes inside plain objects. v2's default is off. */
  evaluateFullObject?: boolean
  /** Whether `$name` keys were never shorthand. v2's default is off. */
  noShorthand?: boolean
  /** v2's instance-wide default for `equal` and `notEqual` */
  caseInsensitive?: boolean
  /** v2's instance-wide cache default, read for POST alone */
  useCache?: boolean
}

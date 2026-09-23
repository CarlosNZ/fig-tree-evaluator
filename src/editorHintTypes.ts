/**
 * The editor-hints vocabulary ("The editor-hints module" in
 * docs-dev/v3-specs/v3-operator-parameters.md, "`./editor-hints`" in
 * docs-dev/v3-specs/v3-packaging.md): the shapes of the display data that
 * `fig-tree-evaluator/editor-hints` ships for the core and I/O operators.
 *
 * Types only, exported from the root, so the subpath stays a plain data
 * module with no type surface of its own. They are also the key convention
 * for anyone else: a plugin author describes their operators with an
 * `OperatorHintMap`, and a host describes a fragment by putting a
 * `FragmentHints` object in the fragment definition's `metadata`.
 */
import type { OperatorCategory } from './operatorDefinition'
import type { BasicType } from './typeCheck'

/** How an operator displays in an editor, and what its parameters start as. */
export interface OperatorHints {
  /** A label for listings and node headers — `'String builder'`. */
  displayName: string
  /** The operator's documentation, which an editor links each node to. */
  docUrl: string
  /** A CSS colour; `textColor` on it reaches 4.5:1 contrast (WCAG AA). */
  backgroundColor: string
  textColor: string
  /**
   * Starting values for parameters, by name, for an editor to fill in when a
   * parameter is added. A parameter without one starts from `TypeSeeds`: a
   * literal union's first member, a union's first non-null member's entry,
   * otherwise its own type's entry. The parameter's runtime `default` is
   * deliberately not a starting value: a parameter is usually added to
   * change it from its default.
   */
  seeds?: { [parameter: string]: unknown }
}

/**
 * How a fragment displays — a convention only: a host puts one in the
 * fragment definition's `metadata`, which the engine never reads. The
 * operator shape with `docUrl` optional, since a host's own fragments rarely
 * have published documentation.
 */
export type FragmentHints = Omit<OperatorHints, 'docUrl'> & { docUrl?: string }

/** How a `category` displays: its label, place and colour in a listing. */
export interface CategoryHints {
  /** A label for a group heading — `'Arrays & iteration'`. */
  displayName: string
  /** Position in a grouped listing, from 0. */
  order: number
  /** The category's hue; its operators' colours are shades of it. */
  backgroundColor: string
  textColor: string
}

export type OperatorHintMap = { [operator: string]: OperatorHints }

export type CategoryHintMap = { [category in OperatorCategory]: CategoryHints }

/** A starting value for each type in the metadata vocabulary. */
export type TypeSeeds = { [type in BasicType]: unknown }

/**
 * The catalog vocabulary ("The catalog module" in
 * docs-dev/v3-specs/v3-operator-parameters.md, "`./catalog`" in
 * docs-dev/v3-specs/v3-packaging.md): the listings that
 * `fig-tree-evaluator/catalog` ships for the core and I/O operators, and the
 * catalog `getCatalog` builds from them.
 *
 * Types only, exported from the root, so the subpath stays a plain data
 * module with no type surface of its own. They are also the key convention
 * for anyone else: a plugin author lists their operators with an
 * `OperatorListingMap`, and a host lists a fragment by making the fragment
 * definition's `metadata` a `FragmentListing`.
 */
import type { FragmentParameter } from './fragments'
import type { FragmentInfo, OperatorInfo, ParameterInfo } from './introspect'
import type { OperatorCategory } from './operatorDefinition'
import type { BasicType } from './typeCheck'

/**
 * How an operator is presented: its label, text, documentation, colours,
 * and what its parameters start as. Every field is optional, so a plugin
 * gives only what it has; the package's own listings are complete
 * (test/catalog.test.ts). `getCatalog` fills the gaps.
 *
 * A listing can also override another: `getCatalog` merges each over the
 * package's, field by field and, for `seeds` and `parameterDescriptions`,
 * parameter by parameter, so `{ plus: { displayName: 'Add' } }` keeps the
 * rest of `plus`'s. A field set to `undefined` changes nothing.
 */
export interface OperatorListing {
  /** A label for listings and node headers — `'String builder'`. */
  displayName?: string
  /**
   * What the operator does, in a line. It lives here rather than in the
   * definition, so a host that never shows it never ships it.
   */
  description?: string
  /** Each parameter's description, by name, as `description` is its own. */
  parameterDescriptions?: { [parameter: string]: string }
  /** The operator's documentation, which an editor links each node to. */
  docUrl?: string
  /**
   * A CSS colour; `textColor` on it reaches 4.5:1 contrast (WCAG AA). The
   * two are a pair: `getCatalog` takes both or neither, so a listing giving
   * one changes neither.
   */
  backgroundColor?: string
  textColor?: string
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
 * How a fragment is presented — a convention only: a host makes the fragment
 * definition's `metadata` one, which the engine never reads. The fragment's
 * descriptions are its definition's own, so the listing has none.
 */
export type FragmentListing = Omit<OperatorListing, 'description' | 'parameterDescriptions'>

/** How a `category` is presented: its label, place and colour in a listing. */
export interface CategoryListing {
  /** A label for a group heading — `'Arrays & iteration'`. */
  displayName: string
  /** Position in a grouped listing, from 0. */
  order: number
  /** The category's hue; its operators' colours are shades of it. */
  backgroundColor: string
  textColor: string
}

/**
 * Listings by operator name: a plugin's for its operators, or a host's
 * overrides, which `getCatalog` merges over the package's in order.
 */
export type OperatorListingMap = { [operator: string]: OperatorListing }

export type CategoryListingMap = { [category in OperatorCategory]: CategoryListing }

/** A starting value for each type in the metadata vocabulary. */
export type TypeSeeds = { [type in BasicType]: unknown }

/** A category in the catalog: its listing, under its name. */
export interface CatalogCategory extends CategoryListing {
  name: OperatorCategory
}

/** An operator's parameter in the catalog: the snapshot's, and its text. */
export interface CatalogParameter extends ParameterInfo {
  description?: string
  /**
   * What the parameter starts as when an editor adds it: the listing's
   * seed, else the `TypeSeeds` rule's. Shared with the listings, so copy
   * an object or array seed before changing it.
   */
  seed: unknown
}

/**
 * An operator in the catalog: its `getOperators()` entry with its listing
 * joined in. `displayName` falls back to the name, and the colours to the
 * category's.
 */
export interface CatalogOperator extends Omit<OperatorInfo, 'parameters'> {
  displayName: string
  description?: string
  docUrl?: string
  backgroundColor: string
  textColor: string
  parameters: Record<string, CatalogParameter>
}

/** A fragment's parameter in the catalog: the snapshot's, and its seed. */
export interface CatalogFragmentParameter extends FragmentParameter {
  /** As `CatalogParameter.seed`, from the fragment's listing. */
  seed: unknown
}

/**
 * A fragment in the catalog: its `getFragments()` entry with the listing in
 * its `metadata` joined in. `displayName` falls back to the name. A
 * fragment has no category, so its colours are only ever its listing's,
 * and an editor picks its own for a fragment without them.
 */
export interface CatalogFragment extends Omit<FragmentInfo, 'parameters'> {
  displayName: string
  docUrl?: string
  backgroundColor?: string
  textColor?: string
  parameters: Record<string, CatalogFragmentParameter>
}

/**
 * Everything an instance offers, as `getCatalog` presents it: every
 * category in its `order`, then the operators and fragments in
 * registration order.
 */
export interface Catalog {
  categories: CatalogCategory[]
  operators: CatalogOperator[]
  fragments: CatalogFragment[]
}

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
 * `OperatorListingMap`, and a host presents a fragment through its
 * definition's `metadata`, a `FragmentMetadata`.
 */
import type { FragmentParameter } from './fragments'
import type { FragmentInfo, OperatorInfo, ParameterInfo } from './introspect'
import type { CompiledNullPolicy, NullPolicyValue, OperatorCategory } from './operatorDefinition'
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
 * How a fragment is presented: its definition's `metadata`, by convention
 * only, since the engine never reads it. The fragment's descriptions are its
 * definition's own, so its metadata has none.
 */
export type FragmentMetadata = Omit<OperatorListing, 'description' | 'parameterDescriptions'>

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

/**
 * What a `null` at a parameter does:
 * - `propagate`: the node resolves to `null` without its operator running;
 * - `value`: the operator receives the `null` as a value;
 * - `unset`: the `null` counts as leaving the parameter out, so its default
 *   applies, the host's or the declared one, else the operator runs without
 *   it;
 * - `error`: a type error;
 * - `none`: nothing of its own. Only a null-replacement holder
 *   (`replacesNullAt`) reports it: a `null` there replaces a `null` with a
 *   `null`, and the target's outcome follows.
 */
export type NullOutcome = 'propagate' | 'value' | 'unset' | 'error' | 'none'

/** An operator's parameter in the catalog: the snapshot's, and its text. */
export interface CatalogParameter extends ParameterInfo {
  /**
   * What a `null` at the parameter does, as the engine resolves it. Unlike
   * `nullPolicy`, the declaration with its default filled in, this answers
   * for every parameter, in the engine's order: a holder has `none`; an
   * iterator's `as` binding gives `error`, since it must be a literal name;
   * a type that doesn't name `null` gives `error`, or `unset` at an optional
   * parameter the engine resolves before the body runs; a lazily delivered
   * parameter gives `value`, since `propagate` cannot fire once the body is
   * running; otherwise the declared policy applies. A conditional policy
   * reports its table, whose rows are outcomes too.
   *
   * It describes a `null` with no holder supplied: where a `…Default`
   * sibling names this parameter in its `replacesNullAt`, supplying it
   * replaces the `null` first. A container's elements are
   * `elementNullOutcome`'s.
   */
  nullOutcome: NullOutcome | CompiledNullPolicy
  /**
   * What a `null` element (or an object's `null` value) does, at a
   * parameter that takes only arrays or objects: the declared
   * `elementNullPolicy`; else `error` where a `homogeneous` constraint
   * without `any`, or an `elementShape`, rules a `null` out; else `value`,
   * since an element nothing covers reaches the operator as it is. Absent
   * at every other parameter, and at a holder, whose `null` elements are
   * the target's business as its `null` is.
   */
  elementNullOutcome?: NullPolicyValue | 'error'
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
  /** As `CatalogParameter.seed`, from the fragment's metadata. */
  seed: unknown
}

/**
 * A fragment in the catalog: its `getFragments()` entry with its `metadata`
 * joined in. `displayName` falls back to the name. A fragment has no
 * category, so its colours are only ever its metadata's, and an editor
 * picks its own for a fragment without them.
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

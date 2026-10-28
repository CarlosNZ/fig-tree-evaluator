/**
 * The catalog vocabulary ("The catalog module" in
 * docs-dev/v3-specs/v3-operator-parameters.md, "`./catalog`" in
 * docs-dev/v3-specs/v3-packaging.md): the listings that
 * `fig-tree-evaluator/catalog` ships for the core and I/O operators, and the
 * catalog `getCatalog` builds from them.
 *
 * Types only, exported from the root, so the subpath stays a plain data
 * module with no type surface of its own. They are also the key convention
 * for anyone else: a plugin author lists their operators with a
 * `ListingMap`, and a host presents a fragment through its definition's
 * `listing`.
 */
import type { FragmentParameter } from './fragments'
import type { FragmentInfo, OperatorInfo, ParameterInfo } from './introspect'
import type { CompiledNullPolicy, NullPolicyValue, OperatorCategory } from './operatorDefinition'
import type { BasicType } from './typeCheck'

/**
 * How an operator or a fragment is presented, and what helps someone author
 * with it: its label, text, documentation, colours, and what its parameters
 * start as and can be tried with. Every field is optional, so a plugin
 * gives only what it has; the package's own listings are complete
 * (test/catalog.test.ts). `getCatalog` fills the gaps. The engine never
 * reads a listing, so an app that only evaluates never carries one.
 *
 * A listing can also override another: `getCatalog` merges each over the
 * package's, field by field and, for `seeds` and `parameterDescriptions`,
 * parameter by parameter, so `{ plus: { displayName: 'Add' } }` keeps the
 * rest of `plus`'s. A field set to `undefined` changes nothing.
 */
export interface Listing {
  /** A label for listings and node headers — `'String builder'`. */
  displayName?: string
  /** What it does, in a line. */
  description?: string
  /** Each parameter's description, by name, as `description` is its own. */
  parameterDescriptions?: { [parameter: string]: string }
  /** Its documentation, which an editor links each node to. */
  docUrl?: string
  /** The colours an editor draws it in. */
  colors?: ColorPair
  /**
   * Starting values for parameters, by name, for an editor to fill in when a
   * parameter is added. A parameter without one starts from `TypeSeeds`: a
   * literal union's first member, a union's first non-null member's entry,
   * otherwise its own type's entry. The parameter's runtime `default` is
   * deliberately not a starting value: a parameter is usually added to
   * change it from its default.
   */
  seeds?: { [parameter: string]: unknown }
  /**
   * Example values, by parameter name: realistic arguments to run it with,
   * for trying it out, testing and documentation. Unlike a seed, which is
   * often a placeholder, a sample is a value worth running.
   */
  samples?: { [parameter: string]: unknown }
  /** The host's own keys, for tools. Never interpreted by FigTree. */
  metadata?: Record<string, unknown>
}

/**
 * Two CSS colours: `text` on `background` reaches 4.5:1 contrast (WCAG
 * AA). One field, so a listing gives both or neither. It is the pair for a
 * light theme; a tool with a dark one derives its own from it.
 */
export interface ColorPair {
  background: string
  text: string
}

/** How a `category` is presented: its label, place and colour in a listing. */
export interface CategoryListing {
  /** A label for a group heading — `'Arrays & iteration'`. */
  displayName: string
  /** Position in a grouped listing, from 0. */
  order: number
  /** The category's hue; its operators' colours are shades of it. */
  colors: ColorPair
}

/**
 * Listings by canonical operator name, fragment name, or `literal`: a
 * plugin's for its operators, or a host's overrides, which `getCatalog`
 * merges in order over each entry's own.
 */
export type ListingMap = { [name: string]: Listing }

export type CategoryListingMap = { [category in OperatorCategory]: CategoryListing }

/** Changes to categories' listings, merged in order over the package's. */
export type CategoryOverrides = { [category in OperatorCategory]?: Partial<CategoryListing> }

/** What `getCatalog` joins with an instance's snapshots. */
export interface CatalogOptions {
  /** A listing layer, or layers merged in order, over each entry's own. */
  listings?: ListingMap | ListingMap[]
  /**
   * Category overrides, or layers of them merged in order, over
   * `categoryListings`.
   */
  categories?: CategoryOverrides | CategoryOverrides[]
}

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
export interface CatalogOperatorParameter extends ParameterInfo {
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
  /**
   * A realistic value to run with: the listing's sample, absent where it
   * gives none. Shared with the listings, as `seed` is.
   */
  sample?: unknown
}

/**
 * An operator in the catalog: its `getOperators()` entry with its listing
 * joined in. `displayName` falls back to the name, and the colours to the
 * category's. `metadata` is the definition's with the listing's merged over
 * it, key by key, and `{}` where neither gives any.
 */
export interface CatalogOperator extends Omit<OperatorInfo, 'parameters' | 'metadata'> {
  displayName: string
  description?: string
  docUrl?: string
  colors: ColorPair
  metadata: Record<string, unknown>
  parameters: Record<string, CatalogOperatorParameter>
}

/** A fragment's parameter in the catalog: the snapshot's, and its text. */
export interface CatalogFragmentParameter extends FragmentParameter {
  /** The listing's `parameterDescriptions` entry. */
  description?: string
  /** As `CatalogOperatorParameter.seed`, from the fragment's listing. */
  seed: unknown
  /** As `CatalogOperatorParameter.sample`. */
  sample?: unknown
}

/**
 * A fragment in the catalog: its `getFragments()` entry with its listing
 * resolved onto it, in place of the raw `listing`. `displayName` falls back
 * to the name. A fragment has no category, so its colours fall back to the
 * one pair every fragment shares, `fragmentColors`. `metadata` is merged as
 * an operator's is.
 */
export interface CatalogFragment extends Omit<FragmentInfo, 'parameters' | 'listing' | 'metadata'> {
  displayName: string
  description?: string
  docUrl?: string
  colors: ColorPair
  metadata: Record<string, unknown>
  parameters: Record<string, CatalogFragmentParameter>
}

/**
 * `literal`, which an editor draws as an operator node. It is grammar, not
 * an operator definition, so it has no category and no `getOperators()`
 * entry, and its listing is all there is of it.
 */
export interface CatalogLiteral {
  displayName: string
  description?: string
  docUrl?: string
  colors: ColorPair
  metadata: Record<string, unknown>
  parameters: { value: { description?: string; seed: unknown; sample?: unknown } }
}

/**
 * A value `getCatalog` skipped: an option it doesn't know, or a listing, a
 * field or an override of the wrong type.
 */
export interface CatalogIssue {
  /** Where the value sits: `['listings', 1, 'plus', 'description']`. */
  path: (string | number)[]
  /** `'expected string, got number'`. */
  message: string
}

/**
 * Everything an instance offers, as `getCatalog` presents it: the
 * categories its operators are in, in their `order`, then the operators and
 * fragments in registration order, and `literal`. `issues` holds whatever
 * was skipped, and is empty when every input is well formed.
 */
export interface Catalog {
  categories: CatalogCategory[]
  operators: CatalogOperator[]
  fragments: CatalogFragment[]
  literal: CatalogLiteral
  issues: CatalogIssue[]
}

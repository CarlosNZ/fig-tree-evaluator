# FigTree v3 — listings

_Status: **Draft** (October 2026, Claude, from discussion with Carl). It settles [issue #284](https://github.com/CarlosNZ/fig-tree-evaluator/issues/284), and revises "`./catalog`" in [v3-packaging.md](v3-packaging.md) and the fragment wrapper in "Fragments" in [v3-api.md](v3-api.md). It covers the concept, the definition types, registration's checks, the snapshots, the catalog, the v2 converter and the exports, then the changes against the current code and what they reach outside it._

## The concept

An operator or a fragment has two kinds of data:

- **Its definition**: everything the package reads at runtime. That is what the engine needs to compile and evaluate it, and for an operator its `category`, which `operatorSet()`'s category selectors read. How a category is presented is a `CategoryListing`, in `./catalog`.
- **Its listing**: everything else. That is what a tool needs to present it and help someone author with it: a label, text, a docs link, colours, starting values for its parameters, and example values to run it with.

The engine never reads a listing. `getCatalog()` (in `./catalog`) joins listings with what an instance reports, for tools.

Operators and fragments have **one `Listing` type**. Their listings differ only in where they come from:

- **An operator's listing never sits on its definition.** A definition is code in the app's bundle, so an app that only evaluates never carries presentation. The package's own operators get theirs from `operatorListings` in `./catalog`, and any operator's listing can come from the listing maps passed to `getCatalog()`. For a plugin's or a host's operator, a map is its only source.
- **A fragment's listing can sit on its definition**, in a `listing` field, because a fragment definition is data the host already loads. Listing maps passed to `getCatalog()` merge over it, so a host can override or translate a fragment it didn't write.

**`metadata` is an opaque bag**, which neither the engine nor `getCatalog()` interprets. Both definitions and listings can have one, and a host distributes its keys between them freely: a key the host's runtime reads goes on the definition, which ships with it; a key only tools read goes in the listing, which an evaluate-only app never carries. `getCatalog()` reports the definition's `metadata` with the resolved listing's merged over it, one level deep, so on a clash the listing wins. `getOperators()` and `getFragments()` report the definition's own, as written. Parameters have no `metadata` of their own: a host that wants per-parameter data keys it inside the definition's or the listing's bag.

## `Listing`

```ts
/**
 * How an operator or a fragment is presented, and what helps someone author
 * with it. Every field is optional. Never read by the engine.
 */
interface Listing {
  /** A label for listings and node headers — 'String builder'. */
  displayName?: string
  /** What it does, in a line. */
  description?: string
  /** Each parameter's description, by parameter name. */
  parameterDescriptions?: { [parameter: string]: string }
  /** Its documentation, which an editor links each node to. */
  docUrl?: string
  /** The colours an editor draws it in. */
  colors?: ColorPair
  /**
   * Starting values, by parameter name: what an editor fills in when a
   * parameter is added. Often a placeholder.
   */
  seeds?: { [parameter: string]: unknown }
  /**
   * Example values, by parameter name: realistic arguments to run it with,
   * for trying it out, testing and documentation.
   */
  samples?: { [parameter: string]: unknown }
  /** The host's own keys, for tools. Never interpreted by FigTree. */
  metadata?: Record<string, unknown>
}

/** Two CSS colours: `text` on `background` reaches 4.5:1 contrast (WCAG AA). */
interface ColorPair {
  background: string
  text: string
}
```

**The colours are one field**, so a listing gives both or neither, and the type says so. There is one pair, for a light theme. A tool with a dark theme derives its own colours from it, such as the same hue at a different lightness. If a dark pair is ever wanted, it is a second optional `ColorPair` field, which breaks nothing.

**Seeds and samples differ in purpose.** A seed is what a parameter starts as when someone adds it, and is usually a placeholder for them to replace. A sample is a realistic value to run with. A parameter with no seed starts from `typeSeeds` (the rule is in "`./catalog`" in [v3-packaging.md](v3-packaging.md)). A parameter with no sample has none.

## `FragmentDefinition`

```ts
/**
 * A fragment definition. The wrapper is mandatory even for a zero-parameter
 * fragment: a bare-expression form becomes ambiguous the moment the
 * expression itself holds an `expression` key.
 */
interface FragmentDefinition {
  /** Any expression — an operator node, a call, a reference, a constant. */
  expression: unknown
  /** Declarations, keyed by parameter name. */
  parameters?: Record<string, FragmentParameterDeclaration>
  /** How the fragment is presented. Never read by the engine. */
  listing?: Listing
  /** The host's own keys. Never interpreted by FigTree. */
  metadata?: Record<string, unknown>
}

/**
 * A fragment parameter declaration. It extends the same `TypeDeclaration`
 * an operator's `ParameterDeclaration` extends, so every one is also a valid
 * operator parameter declaration.
 */
interface FragmentParameterDeclaration extends TypeDeclaration {
  // From TypeDeclaration: type?, required?, constraints?
  /** A constant value, never an expression. Presence implies optional. */
  default?: unknown
}
```

## `OperatorDefinition`

```ts
/**
 * An operator definition as authored, before it passes through
 * `defineOperator()`. Generic over its own `parameters` so the body's
 * `params` is typed from them. Its presentation is a `Listing`, kept apart
 * so a host that never shows it never ships it.
 */
interface OperatorDefinition<P extends ParameterDeclarations = ParameterDeclarations> {
  /** Shared legality rule and reservation set; collision-checked. */
  name: string
  /** Exactly one; same legality and collision rules as `name`. */
  alias?: string
  /** Grouping for tooling, from the closed set; never read by the engine. */
  category: OperatorCategory
  /** The host's own keys. Never interpreted by FigTree. */
  metadata?: Record<string, unknown>
  /** Keyed by parameter name; ordering lives in `positionalParams`. */
  parameters: P
  /**
   * Ordered names; the last may be rest-marked ('...values'). Omitted means
   * named arguments only.
   */
  positionalParams?: readonly string[]
  /** The declared `integer` parameter that sets the node's timeout. */
  timeoutParam?: string
  /** Declares a caching operator. */
  cache?: true
  /** Static checks over literal parameter values, run at compile. */
  validate?: OperatorValidate
  /** What `./authoring`'s static analysis may assume of the operator. */
  analysis?: OperatorAnalysis
  /** The body, its `params` typed from the declarations above. */
  evaluate: (params: ResolvedParams<P>, context: OperatorContext) => unknown
  /** Declared result type — drives the static feeding-position check. */
  returns?: ExpectedType
}

/** A parameter declaration as authored. */
interface ParameterDeclaration extends TypeDeclaration {
  // From TypeDeclaration: type?, required?, constraints?
  /** A constant or the `EvaluationData` sentinel. Presence implies optional. */
  default?: unknown
  /** How the engine delivers the value to the body. Default 'eager'. */
  evaluationMode?: EvaluationMode
  /** 'perElement' only: the sibling array parameter iterated over. */
  over?: string
  /** The position is judged by FigTree truthiness. */
  truthiness?: boolean
  /** Legal only where the declared type names `null`. */
  nullPolicy?: NullPolicy
  /** Container parameters only: the policy per element or per value. */
  elementNullPolicy?: NullPolicyValue
  /** Marks a `…Default` parameter as the null replacement for its targets. */
  replacesNullAt?: readonly string[]
}
```

## Registration

Registration checks only that a fragment's `listing` and `metadata`, where given, are plain objects, as `defineOperator()` does for an operator's `metadata`. It never looks inside either. Every `Listing` field is optional and unknown keys are ignored, so any plain object is a legal listing. A mistyped field name (`colours` for `colors`) is silently ignored, and the root bundle carries no knowledge of listing keys.

## The snapshots

`getOperators()` and `getFragments()` report definitions as written. Merging is `getCatalog()`'s job. Each snapshot is a fresh array of fresh objects, down to its parameters. Below that, it shares what it reports: frozen structures, and a host's `listing`, `metadata` and default values by reference and unfrozen, so a host doesn't mutate them after registering them. A `listing` or `metadata` the definition doesn't give is absent.

### `getOperators()`

An operator's listing lives outside the instance, so the snapshot has none.

```ts
interface OperatorInfo {
  name: string
  alias?: string
  category: OperatorCategory
  /** The definition's, as written. */
  metadata?: Record<string, unknown>
  parameters: Record<string, ParameterInfo>
  positionalParams?: string[]
  /** The rest-marked positional parameter's name, or null. */
  restParam: string | null
  timeoutParam: string | null
  cache: boolean
  returns: ExpectedType
  /** The `validate` hook, as a flag. */
  hasValidate: boolean
  /** Where `operatorDefaults` turned the operator's caching off. */
  hostNoCache?: true
  /** `operatorDefaults`' fallback for the operator, as written. */
  hostFallback?: unknown
}

interface ParameterInfo {
  type: ExpectedType
  required: boolean
  /** As authored; may be the `EvaluationData` sentinel. */
  default?: unknown
  evaluationMode: EvaluationMode
  truthiness: boolean
  nullPolicy: NullPolicyValue | CompiledNullPolicy
  elementNullPolicy?: NullPolicyValue
  constraints?: Constraints
  over?: string
  replacesNullAt?: string[]
  /** `operatorDefaults`' value; present only where it sets one. */
  hostDefault?: unknown
}
```

### `getFragments()`

A fragment's listing sits on its definition, so the snapshot reports it. That is also how `getCatalog()`, which sees an instance only through the two methods, reads it. The body is withheld, and what a host would otherwise learn from it is reported in its place.

```ts
interface FragmentInfo {
  name: string
  /** The definition's, as written. */
  listing?: Listing
  /** The definition's, as written. */
  metadata?: Record<string, unknown>
  parameters: Record<string, FragmentParameter>
  /** What the body is known to return, inferred at registration. */
  returns: ExpectedType
  /** The body's warning-severity issues, raised at registration. */
  warnings: Issue[]
  /** What the body reads and invokes. */
  dependencies: Dependencies
  /** Whether a call can reach a node that caches. */
  caches: boolean
}

/** A declaration after normalization, every default filled. */
interface FragmentParameter {
  type: ExpectedType
  required: boolean
  default?: unknown
  constraints?: Constraints
}
```

A fragment's `samples` are reported, inside its `listing`, so a tool that uses fragments without holding their definitions, such as a panel for trying one out, has them too.

## The catalog

`getCatalog()` is `./catalog`'s one function. It joins what an instance reports with the listings, resolved, so a tool reads one list and never applies a fallback of its own.

```ts
getCatalog(fig: Pick<FigTree, 'getOperators' | 'getFragments'>, options?: CatalogOptions): Catalog

interface CatalogOptions {
  /** Listing layers, merged in order over each base layer. */
  listings?: ListingMap[]
  /** Category overrides, merged in order over `categoryListings`. */
  categories?: CategoryOverrides[]
}

/** Listings by canonical operator name, fragment name, or `literal`. */
type ListingMap = { [name: string]: Listing }

type CategoryOverrides = { [category in OperatorCategory]?: Partial<CategoryListing> }
```

It takes anything with the two snapshot methods, so the module imports nothing from the engine.

### `./catalog`'s data

- **`operatorListings`**: a complete `Listing` for each core and I/O operator, and for `literal`.
- **`categoryListings`**: a `CategoryListing` for each category.
- **`fragmentColors`**: the `ColorPair` a fragment without colours of its own is drawn in. It is one pair for every fragment, so fragments read as one kind, as an operator reads by its category.
- **`typeSeeds`**: a starting value for each type.

```ts
interface CategoryListing {
  /** A label for a group heading — 'Arrays & iteration'. */
  displayName: string
  /** Position in a grouped listing, from 0. */
  order: number
  /** The category's hue; its operators' colours are shades of it. */
  colors: ColorPair
}
```

Every pair the package ships reaches 4.5:1 contrast, which a test holds.

### Resolving a listing

An entry's listing is its base layer with each `listings` map merged over it, in order. The base layer is:

- for a core or I/O operator, or `literal`: its `operatorListings` entry;
- for a fragment: its definition's `listing`;
- for any other operator: none, so a map is its only source.

Each layer merges over the ones before it, field by field:

| Field                                       | Merge                |
| ------------------------------------------- | -------------------- |
| `displayName`, `description`, `docUrl`      | replaced             |
| `colors`                                    | replaced, as a whole |
| `seeds`, `samples`, `parameterDescriptions` | merged per parameter |
| `metadata`                                  | merged per key       |

A field, parameter entry or key set to `undefined` is skipped, so it never erases what is beneath it. Only a map's or a listing's own keys are read. Map keys are canonical names only: an alias key, or a key naming nothing on the instance, is ignored. The second matters, since a plugin ships listings for all its operators whether or not a host's `operatorSet()` keeps them.

A category's listing is its `categoryListings` entry with each `categories` override merged over it, `displayName`, `order` and `colors` each replaced, by the same rules.

Values are handed out by reference, never copied: an object or array seed, sample or `metadata` value is copied before it is changed.

### `metadata`

An entry's `metadata` is its definition's `metadata` with its resolved listing's merged over it, per key, so on a clash the listing wins. It is `{}` where neither gives any. `literal` has no definition, so its `metadata` is its listing's.

### Checking the layers

The package's own listings are held to their types by tests. Everything else is checked before anything merges: the options, each `listings` map and each `categories` override whole (so what is reported never depends on which operators the instance has), and each fragment definition's `listing`. A value of the wrong type is skipped and reported in `Catalog.issues` rather than thrown, so one malformed fragment in a host's store never breaks a tool's whole catalog. The checks are basic, by type only:

- the options are a plain object, and each of their keys is `listings` or `categories`;
- `listings` and `categories` are arrays;
- a map, an override, a listing, or a by-name field (`seeds`, `samples`, `parameterDescriptions`, `metadata`) is a plain object;
- `displayName`, `description`, `docUrl` and each `parameterDescriptions` value are strings, and `order` is a number other than `NaN`;
- `colors` is a plain object whose `background` and `text` are strings.

Where an option, a map, an override or a listing fails, it is skipped whole; where a field fails, the rest of its listing is kept. Unknown keys inside a listing or an override are ignored, as registration ignores them. An unknown option key is reported, because a map passed where the options belong, `getCatalog(fig, { plus: … })`, would otherwise reach nothing silently.

```ts
interface CatalogIssue {
  /** Where the value sits: ['listings', 1, 'plus', 'description']. */
  path: (string | number)[]
  /** "expected string, got number", or for an option, "not an option: expected listings or categories". */
  message: string
}
```

A fragment definition's `listing` is reported under `['fragments', name, 'listing', …]`, and the options themselves under `[]`.

### The output

```ts
interface Catalog {
  /** The categories at least one operator is in, in `order`. */
  categories: CatalogCategory[]
  /** In registration order. */
  operators: CatalogOperator[]
  /** In registration order. */
  fragments: CatalogFragment[]
  literal: CatalogLiteral
  /** Values skipped by the checks; empty when every layer is well formed. */
  issues: CatalogIssue[]
}

interface CatalogCategory extends CategoryListing {
  name: OperatorCategory
}

interface CatalogOperator extends Omit<OperatorInfo, 'parameters' | 'metadata'> {
  /** The listing's, else the operator's name. */
  displayName: string
  description?: string
  docUrl?: string
  /** The listing's, else its category's. */
  colors: ColorPair
  metadata: Record<string, unknown>
  parameters: Record<string, CatalogOperatorParameter>
}

interface CatalogOperatorParameter extends ParameterInfo {
  /** What a `null` here does, as the engine resolves it. */
  nullOutcome: NullOutcome | CompiledNullPolicy
  /** What a `null` element does, at an array- or object-only parameter. */
  elementNullOutcome?: NullPolicyValue | 'error'
  /** The listing's `parameterDescriptions` entry. */
  description?: string
  /** The listing's seed, else the `typeSeeds` rule's. */
  seed: unknown
  /** The listing's sample; absent where it gives none. */
  sample?: unknown
}

interface CatalogFragment extends Omit<FragmentInfo, 'parameters' | 'listing' | 'metadata'> {
  /** The listing's, else the fragment's name. */
  displayName: string
  description?: string
  docUrl?: string
  /** The listing's, else `fragmentColors`. */
  colors: ColorPair
  metadata: Record<string, unknown>
  parameters: Record<string, CatalogFragmentParameter>
}

interface CatalogFragmentParameter extends FragmentParameter {
  description?: string
  seed: unknown
  sample?: unknown
}

/** `literal`, which an editor draws as an operator node. */
interface CatalogLiteral {
  displayName: string
  description?: string
  docUrl?: string
  colors: ColorPair
  metadata: Record<string, unknown>
  parameters: { value: { description?: string; seed: unknown; sample?: unknown } }
}
```

Every snapshot field travels unchanged, except the raw `listing`, whose fields are resolved onto the entry. `nullOutcome` and `elementNullOutcome` follow the rules in "`./catalog`" in [v3-packaging.md](v3-packaging.md). A fragment's parameters have neither.

## The v2 converter

`migrateV2Fragments` writes each definition as `{ expression, parameters?, listing?, metadata? }`. A v2 operator-node body could carry a `metadata` wrapper holding `description`, `textColor`, `backgroundColor` and a `parameters` array of declarations ("Definitions" in [v3-converter.md](v3-converter.md)). It is unpacked as follows:

- **`description`**, where it is a string, becomes `listing.description`.
- **`textColor` and `backgroundColor`**, where both are strings, become `listing.colors`. They were the fragment's presentation in v2, and stay its presentation.
- **Every other key** goes into the definition's `metadata`, including a `description` that is not a string and a colour without its partner. The bag is opaque, so nothing placed there is read as presentation.
- **Each declaration's `description`**, where it is a string, becomes the listing's `parameterDescriptions` entry for that parameter.
- **Any other key on a declaration** is dropped, with a `lossy-default` issue for each: v3 has no per-parameter `metadata`, and where such keys belong is the author's call. That includes a `description` that is not a string.

| Code                    | Emitted when                                                                                             | Path    | Message                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `parameter-key-dropped` | a v2 parameter declaration holds a key v3's declaration and listing have no place for, one issue per key | the key | ``A v3 parameter declaration has no place for `{key}`, and no per-parameter metadata. Removed.`` |

`listing` is absent where none of its fields is given, as `metadata` is.

## Exports

The types export from the root, as all of `./catalog`'s shapes do:

| Type                                                           | What it is                                    |
| -------------------------------------------------------------- | --------------------------------------------- |
| `Listing`, `ColorPair`                                         | a listing, and its colours                    |
| `ListingMap`                                                   | listings by name, a `listings` layer          |
| `CategoryListing`, `CategoryListingMap`, `CategoryOverrides`   | a category's listing, all of them, a layer    |
| `CatalogOptions`                                               | `getCatalog()`'s options                      |
| `Catalog`, `CatalogCategory`, `CatalogLiteral`, `CatalogIssue` | what `getCatalog()` returns                   |
| `CatalogOperator`, `CatalogOperatorParameter`                  | an operator in the catalog, and its parameter |
| `CatalogFragment`, `CatalogFragmentParameter`                  | a fragment in the catalog, and its parameter  |
| `NullOutcome`, `TypeSeeds`                                     | unchanged                                     |

`OperatorListing`, `OperatorListingMap`, `FragmentMetadata` and `CatalogParameter` are deleted.

`./catalog` exports four values and one function: `operatorListings`, `categoryListings`, `fragmentColors`, `typeSeeds` and `getCatalog`. `operatorListings` keeps its name although it holds `literal`'s listing too, since an editor draws `literal` as an operator node.

## Changes from the current code

For the implementation, against the code as of `aede57a`:

- **`Listing`** replaces `OperatorListing`, and gains `samples` and `metadata`. `FragmentMetadata` is deleted.
- **`colors: ColorPair`** replaces the flat `backgroundColor` / `textColor` fields, in `Listing` and wherever else the pair appears: `CategoryListing` (where it is required) and the catalog's output types.
- **`FragmentDefinition`** gains `listing`. Its `description` moves to `listing.description`, its `samples` to `listing.samples`, and its `metadata` becomes an opaque bag (`Record<string, unknown>`) that `getCatalog()` no longer reads as presentation.
- **`FragmentParameterDeclaration`** loses `description` (to the listing's `parameterDescriptions`) and `metadata`.
- **`OperatorDefinition`** is unchanged. **`ParameterDeclaration`** loses `metadata`, and with it `ValidatedParameter`, `ParameterInfo` and `CatalogParameter`.
- **Registration** no longer checks a fragment's `description` (it has none); it checks `listing` as it checks `metadata`. `DEFINITION_KEYS` becomes `expression`, `parameters`, `listing`, `metadata`, and `DECLARATION_KEYS` becomes `type`, `required`, `default`, `constraints`.
- **`FragmentInfo`** loses `description` and gains `listing`; its `metadata` loses the `FragmentMetadata` typing. **`FragmentParameter`** loses `description` and `metadata`.
- **`samples`**, withheld from `getFragments()` by "Fragments" in [v3-api.md](v3-api.md), is reported, inside `listing`.
- **`getCatalog()`** takes a `CatalogOptions` object in place of its rest parameter of maps. `OperatorListingMap` becomes `ListingMap`, and its maps reach fragments and `literal` as well as operators. Category overrides are new.
- **`Catalog`** reports only the categories in use, and gains `literal` and `issues`. `CatalogParameter` becomes `CatalogOperatorParameter`. Both parameter types gain `sample`, `CatalogFragmentParameter` gains `description`, and `CatalogFragment` gains `description` and always has `colors`. `metadata` is always present, the definition's and the listing's merged.
- **`./catalog`** gains `fragmentColors`. Today the editor picks its own fragment colours (`fragmentBackground` / `fragmentText` in fig-tree-editor-react's `editorTheme.ts`), and that pair reaches only 3.49:1, so the package's needs a new one.
- **The converter** writes `listing` (`description`, `colors`, `parameterDescriptions`) where it wrote `description` and the colour keys into `metadata`, and drops a declaration's other keys with the new `parameter-key-dropped` issue where it wrote them into the parameter's `metadata`.

## Elsewhere

What this spec changes outside the code:

- **Specs.** "`./catalog`" in [v3-packaging.md](v3-packaging.md), its root type list (which `test/exports.test.ts` holds `src/index.ts` to) and "Fragments" in [v3-api.md](v3-api.md) are revised to match, or point here. v3-api's open question, whether registration checks each sample against its declaration, closes: samples sit in the listing, which registration never looks inside. "Definitions" in [v3-converter.md](v3-converter.md) and its issue table gain the converter's rules.
- **[docs-dev/imports.md](../imports.md)**, for the renamed and new exports and `fragmentColors`' size.
- **CHANGELOG**, since this breaks a preview's fragment definitions and `getCatalog()` calls.
- **Docs site**: "Fragments in an editor" in guides/fragments.mdx, Tooling → `./catalog`, api/exports.mdx, then the paused custom-operators/presenting.mdx.
- **fig-tree-editor-react**: remove `readOperatorListing`, read a fragment's presentation from the catalog, write descriptions into the listing in the fragment definition editor, use `fragmentColors`, `colors` and `Catalog.literal`, and show `Catalog.issues`.

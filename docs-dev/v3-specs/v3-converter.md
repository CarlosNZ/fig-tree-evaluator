# FigTree v3 — the v2 converter

_Status: **Draft** (September 2026, Phase-15 planning). Written so far: the setting, the surface, what the converter reads and writes, the v2 reference table (agreed), the v2→v3 rules, with all 24 operators, and what v3 does with unconverted v2 syntax. What remains is listed at the end. Nothing here is built beyond the placeholder `./convert` entry._

## Purpose

The design for Phase 15's `./convert` subpath: how v2 expressions and fragments become v3. [v3-migration.md](v3-migration.md) stays the contract for what conversion promises (the best-effort ruling, the three issue tags, the migration guide), and this doc cites it rather than restating it. Where a decision here changes that contract, the change is listed under "Changes to other specs" and written back when this doc is agreed.

## The setting

Conversion is a one-time step over a host's stored expressions, as the opening of [v3-migration.md](v3-migration.md) frames it: "an author-time / build-time step over your config, not a runtime accommodation". It has three callers:

- **A migration script**, in the host's own code, run once over its stored expressions. It has the host's v2 options to hand.
- **A stand-alone conversion page**, where a person pastes their v2 options and expressions and copies out the result. It knows only what the person pastes.
- **The Phase-15.2 differential**, which runs the frozen v2 corpus through the converter with each test file's v2 options.

**The converter assumes its input is v2.** It never has to decide, because each of these callers knows. There is no detection function: telling v2 from v3 has no reliable general answer, since the two share most of their syntax and reuse five names for different operators (see the last section). The v3 editor stays v3-only and carries no v2 knowledge. An unconverted v2 expression loaded into it shows v3's validation errors, apart from the silent cases in the last section.

Assuming v2 has a cost, and the guide states it plainly: **the converter is not safe on v3 input, and it is not idempotent.** Its output can contain `get` and `convert`, which a second pass would read as v2's HTTP GET and PASSTHRU. Each expression is converted once. The page does that naturally; a script keeps the originals and records what it has converted.

## Surface

`fig-tree-evaluator/convert` exports two functions:

| Export               | Signature                                                        | Converts                                        |
| -------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| `convertV2ToV3`      | `(expression: unknown, options?: V2Options) => ConversionResult` | one v2 expression                               |
| `convertV2Fragments` | `(options: V2Options) => FragmentConversionResult`               | the fragment definitions in `options.fragments` |

Both are pure functions over their arguments and the converter's own embedded v2 table ("Ruling: `convertV2ToV3` is a pure function carrying its own v2 tables" in [v3-migration.md](v3-migration.md), which stands). They take no `FigTree` and import nothing from the engine at runtime. So `./convert` imports types only from the root, as `./editor-hints` does, and the same lint rule enforces it. Checking that the output validates is the caller's job: the page and the script both have an instance.

`V2Options` is the part of v2's options that changes how an expression is read ("What the converter reads", below). Any other key is ignored, so a script can pass its real v2 options object unchanged.

```ts
interface ConversionResult {
  expression: unknown // the converted v3 tree, best-effort wherever there are issues
  issues: ConversionIssue[] // empty only for a clean conversion
}

interface FragmentConversionResult {
  fragments: Record<string, FragmentDefinition> // v3 definitions, keyed as in the input
  issues: ConversionIssue[] // paths rooted at the fragments object: ['getFlag', …]
}
```

`ConversionIssue` is migration's shape (`tag`, `path` in the source, `message`). All the types (`V2Options`, `ConversionResult`, `FragmentConversionResult`, `ConversionIssue`) export from the root, per "Types" in [v3-packaging.md](v3-packaging.md).

Fragment definitions get their own function for two reasons. A fragment body is read differently from an expression: its `$name` strings are parameter placeholders, and its `metadata` key belongs to the definition. And converting them is a once-per-host job, where expressions are converted by the hundred.

### Changes to other specs

Written back when this doc is agreed:

- **[v3-migration.md](v3-migration.md), "`./convert` — the module surface":** `convertV2ToV3` takes the optional `V2Options`; add `convertV2Fragments` and the `V2Options` and `FragmentConversionResult` types. This amends the Phase-14 ruling that `./convert` holds `convertV2ToV3` and nothing else. Conversion is still all it is for.
- **v3-migration.md, "The custom-function wrapper recipe" and the CUSTOM_FUNCTIONS entry under "`non-convertible`":** the recipe becomes a suggestion rather than the shape the converter targets. A host's v3 operator can declare whatever parameters suit it, so the converter cannot know a call's v3 shape. It rewrites each call to the nearest v3 call on the function's name, since the arguments are v2 expressions that need converting regardless. It then puts a `non-convertible` issue on every call site, not one per function name, saying the call must be checked against the operator's definition.
- **v3-migration.md, the "Moved options" bullet:** the converter reads options, it does not rewrite them. Fragments are the exception, through `convertV2Fragments`; the rest stays the guide's table.
- **v3-migration.md, the "Null policy" bullet under `intentional-semantic-change`:** "the converter flags the corners the null-policy review catalogued" has nothing to point at, since the review catalogues no v2 corners, and null-policy differences depend on the data. The guide lists them, and the converter does not flag them ("Per operator").
- **[v3-operator-parameters.md](v3-operator-parameters.md), "v2 disposition" for `plus`:** `type` → `expect` holds for `'array'` and `'number'`. `type: 'string'` converts to `join` with `delimiter: ''` instead, since v2 coerced the operands to text and `expect: 'string'` would reject the numbers it was used to concatenate ("Batch 2").
- **[v3-operator-parameters-2.md](v3-operator-parameters-2.md), "v2 disposition" for `get`:** `additionalData` converts to `from: { operator: 'plus', values: ['$data', …] }`, which keeps v2's merge, so the "merge to replace" behaviour change concerns hand edits, not converted nodes ("Batch 3").
- **[v3-operator-parameters.md](v3-operator-parameters.md), "v2 disposition" for `buildString`:** of the behaviour it kills, rank compaction, the fallback to `data` and path drilling in a token are reproduced by the converter for literal templates (renumbering, and reference tokens), so they are behaviour changes for hand edits and computed templates only ("Batch 3").
- **[v3-operator-parameters-2.md](v3-operator-parameters-2.md), "v2 disposition" for `http` and `graphQL`:** the dropped collapse is a migration-doc line there. The converter also puts an issue on every converted `http` and `graphQL` node, since whether it fired depends on the response, and gives the `[*]` fix ("Batch 4").
- **v3-migration.md, open question 2** (options or trees only): answered. Options are read as context, fragments are converted, and the other options are migrated by hand.
- **v3-migration.md, open question 4** (the `literal`-wrap heuristic): answered by `evaluateFullObject`, which makes the wrap a rule ("What the converter reads").
- **[v3-packaging.md](v3-packaging.md), "`./convert`":** the contents (two functions, four types). The isolation line becomes "imports types only from the root", in place of "may import from the root (it is built on the compiler's normalizer)". The `instanceof FigTreeError` assertion goes: the entries share no runtime code, and the type-only rule replaces it.
- **[v3-implementation-plan.md](v3-implementation-plan.md), 15.1:** the same, including "built on the compiler's normalizer", which no longer holds.

## What the converter reads

### The v2 options

| `V2Options` key      | How it changes the reading                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fragments`          | The names, so `{ $name: … }` and `{ fragment: … }` calls are recognized, and each definition's declared parameters (`metadata.parameters`), so a call's `$country` arguments can be mapped and checked. `convertV2Fragments` converts the definitions themselves.                                                                                                                                      |
| `functions`          | The names of the host's custom functions, as a list or as v2's `functions` object (only its keys are read, since the functions are JS that cannot be pasted). They let `{ $name: … }` and `{ operator: name }` be recognized as custom-function calls.                                                                                                                                                 |
| `evaluateFullObject` | Whether v2 looked for nodes inside plain objects. Off, which is v2's default, a plain object was data however node-like its contents, so one holding anything v3 would evaluate is wrapped in `literal`. On, plain objects are walked and converted, and `$` keys on them are read as alias definitions ([evaluate.ts:281](../../v2-src/evaluate.ts#L281)).                                            |
| `noShorthand`        | On, `$name` keys were never shorthand, so an object carrying one is data.                                                                                                                                                                                                                                                                                                                              |
| `caseInsensitive`    | v2's instance-wide default for `equal` and `notEqual`. v3 spells it `operatorDefaults` in the host's options, which are migrated by hand, so the converter does not write it. When it is `true`, each converted `equal` or `notEqual` that does not set its own `caseInsensitive` gets a `lossy-default` issue saying the value must go into `operatorDefaults` or onto the node ("Batch 1: renames"). |
| `useCache`           | Read for POST alone. v2 left POST uncached unless the node or this option said otherwise, and v3's `http` caches by default, so a converted POST without its own `useCache` gets `useCache: false`, unless this is `true` ("Batch 4: I/O").                                                                                                                                                            |

With no options, the converter reads as v2 did with its defaults: no fragments, no functions, shorthand on, `evaluateFullObject` off. That last default matters to the page. A host that ran with `evaluateFullObject: true` gets its plain objects wrapped in `literal` unless the person says so, and the page should ask.

Not read: everything else. `data` and the clients are runtime concerns, and the cache, error and type-check options do not change what an expression means. `allowJSONStringInput` made v2 parse strings that held JSON nodes; a caller parses its own JSON before converting, as the page must anyway. `supportDeprecatedValueNodes` is v1's, and v1 support is dropped ("Ruling: v1 (`children`) support is dropped from v3" in [v3-migration.md](v3-migration.md)). `nullEqualsUndefined` dies with `undefined` ("v2 disposition" for `equal` in [v3-operator-parameters.md](v3-operator-parameters.md)), so there is nothing for it to become.

### The v2 grammar

What v2 recognized, which the conversion rules take one construct at a time:

- **Operator nodes**: objects with an `operator` key, whose value is a literal name matched loosely. v2 camel-cases it first ([helpers.ts:35](../../v2-src/helpers.ts#L35)), so `'Plus'`, `'NOT_EQUAL'` and `'get_data'` all resolve. The other keys are:
  - the operator's parameters, under their names or property aliases;
  - `children`, the positional form: a literal array, or a node that computes one;
  - the modifiers `fallback`, `useCache` and `outputType` (alias `type`), the last of whose values may be computed;
  - alias definitions: any other `$` key ([evaluate.ts:243](../../v2-src/evaluate.ts#L243)).

  Keys an operator did not declare were ignored, with two exceptions: MATCH read its branches from the node's own keys, and a custom-function call gathered them into its `input`.

- **Custom-function calls**: `operator: 'customFunctions'` (or an alias) with `functionName`, `args` and `input`, or `operator` naming a function directly ([helpers.ts:121](../../v2-src/helpers.ts#L121)). A `functionName` can be computed, and can be a dotted path into `functions`.
- **Fragment calls**: objects with a `fragment` key. The name can be computed, and so can the `parameters` object. `$` keys on the call node itself are arguments too. When v2 expanded a call, the call node's own keys went beneath the body's and the arguments over both ([evaluate.ts:115](../../v2-src/evaluate.ts#L115)), so a call's `fallback` applies unless the body sets one.
- **Shorthand**: `$name` keys on a plain object, resolved in the order operator, fragment, custom function ([shorthandSyntax.ts:47-67](../../v2-src/shorthandSyntax.ts#L47-L67)). An unresolved `$name` stays data. The payload is read as follows:
  - an array becomes `children`;
  - a plain object with no `$` keys becomes named parameters;
  - anything else becomes a single child.

  Other keys stay beside the `$name` key. An object with several resolved `$` keys is merged into one node.

- **Alias references**: whole `"$name"` strings, resolved from the definitions on enclosing nodes. An unresolved reference stays a literal string.
- **Plain objects** are data unless `evaluateFullObject` is on. **Arrays** are evaluated element by element, always.
- **Fragment definitions** (for `convertV2Fragments`): any value as the body. An operator-node body can carry `metadata` among its own keys, holding `description`, `textColor`, `backgroundColor` and a `parameters` array of `{ name: '$country', type, required, default, description }`. Inside the body, `"$country"` strings are the parameter placeholders.

## What the converter writes

Conversion runs in two stages:

1. **Normalize: v2 to canonical v2.** Shorthand is expanded, names are resolved to their v2 operator, property aliases become parameter names, `children` is mapped to named parameters, `type` is spelled `outputType`, and a fragment call's `$` arguments move into `parameters`. That is the order v2 itself normalized a node in, at every evaluation ([evaluate.ts](../../v2-src/evaluate.ts)); the converter does it once, statically. The result is still a v2 expression, so `/v2-src` evaluates it to the same value as the original, which gives this stage a test oracle of its own.
2. **Convert: canonical v2 to canonical v3.** Each node goes through its operator's rule and the rules that cut across operators. Each rule sees one shape, not every form a v2 author could have written.

What comes out:

1. **Canonical v3 throughout**, as the compiler's canonical form has it: `operator` nodes with v3's canonical names (no symbols, no shorthand) and named parameters, fragment calls as `{ fragment, parameters }`, and data read through references (`"$data.…"`, `"$vars.…"`). The author's form is not kept: `{ $plus: [1, 2] }`, `{ operator: '+', children: [1, 2] }` and `{ operator: 'add', values: [1, 2] }` all come out as `{ operator: 'plus', values: [1, 2] }`. Moving between v3's forms is parked until after 3.0 ("Parked: no shorthand round-trip utilities in 3.0" in [v3-migration.md](v3-migration.md)). One exception: a call on a converted v2 custom function is written in the shorthand positional form, since canonical form needs the operator's parameter names and only the host knows them ("Batch 5").
2. **A fixed key order**: the defining key (`operator` or `fragment`), then parameters in the order the rule writes them, then `fallback`, `useCache` and `vars`. The input's key order does not matter, so the same expression always converts to the same output.
3. **The input is never mutated.** The output is new structure, sharing by reference only the values it passes through unchanged: constants, opaque values, and the contents of `literal`.
4. **A clean conversion.** Empty `issues` means the output means in v3 what the input meant in v2. It also means the output validates with no errors on an instance holding the core operators, the host's fragments (as `convertV2Fragments` produced them) and custom operators that accept the calls as written. The converter cannot check this, since it carries no engine; its tests and the page do. The converter does not validate v2: a node that could never have evaluated in v2, such as a subtraction given one value, converts as far as it goes, and v3's `validate()` reports what it becomes.

Where a node cannot convert cleanly, it becomes the best-effort placeholder of migration's never-throws ruling: the closest v3 node, or the original subtree wrapped in `literal`, plus an issue. "The two stages in detail", still to write, says which applies where.

## The v2 reference table

Everything the converter knows about v2, mined from the frozen `/v2-src` (Phase 0's "mined, never ported" asset). It lives in `src/converter/v2/` as three modules, joined by operator: one generated from `/v2-src`, two written by hand. They serve the normalizer. What each v2 operator becomes in v3 is the other half of the converter's knowledge, and that is "Per-operator rules".

### `operators.generated.ts`: names and parameters

```ts
export type V2Operator = 'AND' | 'OR' | 'EQUAL' | … | 'PASSTHRU' // the 24

// v2's alias table verbatim (operatorAliases.ts, 95 entries)
export const V2_NAMES: Record<string, V2Operator> = { and: 'AND', '&': 'AND', … }

// Each operator's parameters in declaration order, with their property aliases
export const V2_PARAMETERS: Record<V2Operator, readonly V2Parameter[]> = {
  CONDITIONAL: [
    { name: 'condition', aliases: [] },
    { name: 'valueIfTrue', aliases: ['ifTrue'] },
    { name: 'valueIfFalse', aliases: ['ifFalse', 'ifNot'] },
  ],
  …
}

interface V2Parameter {
  name: string
  aliases: readonly string[]
}
```

`V2_NAMES` is looked up as v2 looked it up: the name is standardized first ([helpers.ts:35](../../v2-src/helpers.ts#L35)), then matched exactly. So some of its keys can never match (`GET` standardizes to `get`, `graphQL` to `graphQl`), and they are kept anyway, since the table is v2's own.

`V2_PARAMETERS` holds 68 parameters with 69 property aliases. It carries names and aliases only. Each `data.ts` also has a `description`, a `type`, `required` and a `default`, and none of them is needed. The `default` would mislead: it was the editor's placeholder value, not a runtime default (PLUS's `values` default is `[1, 2, 3]`). MATCH declares a pseudo-parameter literally named `[...branches]`, meaning "branches may sit on the node itself". The extractor drops it, and `V2_BEHAVIOUR` records the behaviour instead.

**Generated, not transcribed.** `codegen/extractV2Table.ts` imports `/v2-src`'s operator data and writes this module, which is checked in and listed with `src/version.ts` under "Generated files — do not hand-edit" in CLAUDE.md. CI runs the script with `--check`, which fails if the checked-in module differs from a fresh extraction. Copying 95 names and 69 aliases by hand is exactly where a typo would hide, and the source is already data. `/v2-src` is frozen, so the check can only ever catch an edit to the generated file. The lint ban on `src/` importing `/v2-src` stays, since only the codegen script reads it.

### `children.ts`: the positional mappings

The normalizer turns `children`, v2's positional form, into named parameters. v2 did it with a `parseChildren` function per operator, 13 distinct ones. The table restates them as data, with functions only for the five whose shape is irregular:

```ts
export const V2_CHILDREN: Record<V2Operator, ChildrenMapping> = {
  AND: { into: 'values' }, // likewise OR, EQUAL, NOT_EQUAL, PLUS, SUBTRACT, MULTIPLY, DIVIDE, GREATER_THAN, LESS_THAN, COUNT
  CONDITIONAL: { positions: ['condition', 'valueIfTrue', 'valueIfFalse'] },
  REGEX: { positions: ['testString', 'pattern'] },
  SPLIT: { positions: ['value', 'delimiter'], defaults: { delimiter: ' ' } },
  OBJECT_PROPERTIES: { positions: ['property', 'fallback'] }, // the second is the node's fallback
  STRING_SUBSTITUTION: { positions: ['string'], rest: 'substitutions' },
  SQL: { positions: ['query'], rest: 'values' },
  CUSTOM_FUNCTIONS: { positions: ['functionName'], rest: 'args' },
  MATCH: matchChildren, // matchExpression, then alternating branch keys and values
  BUILD_OBJECT: buildObjectChildren, // all objects: the properties as they are; otherwise alternating keys and values
  GET: fieldsChildren(['url'], 'parameters', 'returnProperty'),
  POST: fieldsChildren(['url'], 'parameters', 'returnProperty'),
  GRAPHQL: fieldsChildren(['query', 'url'], 'variables', 'returnNode'),
  PASSTHRU: passThruChildren, // one child is the value; several are an array
}

type ChildrenMapping =
  | { into: string } // every child into one parameter
  | { positions: string[]; rest?: string; defaults?: Record<string, unknown> }
  | ((children: readonly unknown[]) => Record<string, unknown>)
```

`fieldsChildren` is the shape GET, POST and GRAPHQL share: leading positions, then an array of field names, then that many values zipped into an object, then an optional last value for the return property.

**Why data, where it can be.** v2 accepted a _computed_ `children`: a node that evaluates to the array, such as `{ operator: '+', children: { operator: 'getData', property: 'numbers' } }`. An array that exists only at evaluation cannot be split statically. It can only be converted when every child goes into one parameter, when the node becomes `values: <that node>`. `{ into }` says exactly that, so the normalizer converts a computed `children` for the eleven operators that have it, and makes it `non-convertible` for the rest. Written as functions, the same fact would need a separate flag.

A test holds each mapping to its v2 function: the same `children` arrays go through both, and the named parameters must match.

### `behaviour.ts`: what v2 did that no data file says

```ts
export const V2_BEHAVIOUR: Partial<Record<V2Operator, V2OperatorBehaviour>> = {
  GET: { evaluatesContents: ['parameters', 'headers'] },
  POST: { evaluatesContents: ['parameters', 'headers'] },
  GRAPHQL: { evaluatesContents: ['variables'] },
  BUILD_OBJECT: { evaluatesContents: ['properties'] },
  MATCH: { evaluatesContents: ['branches'], extraKeys: 'branches' },
  CUSTOM_FUNCTIONS: { evaluatesContents: ['input'], extraKeys: 'input' },
}

interface V2OperatorBehaviour {
  evaluatesContents?: string[] // object parameters whose values the operator evaluated itself
  extraKeys?: string // the parameter that the node's undeclared keys went into
}
```

- **`evaluatesContents`** feeds the `literal`-wrap rule. With `evaluateFullObject` off, v2 treated a plain object as data. The exception was an object inside one of these parameters, whose values the operator evaluated itself. So such an object is walked and converted, not wrapped. Each entry is from the operator's own code:
  - GET and POST call `evaluateObject` on `parameters` and `headers`.
  - GRAPHQL calls it on `variables`; its `headers` are not evaluated.
  - CUSTOM_FUNCTIONS calls it on `input`.
  - BUILD_OBJECT evaluates the `key` and `value` of each element of `properties`.
  - MATCH evaluates the branch that matches.
- **`extraKeys`** tells the normalizer where a node's undeclared keys go. Most operators ignored such keys. MATCH read branches from the node itself, and a custom-function call gathered them into its `input` ([helpers.ts:121](../../v2-src/helpers.ts#L121)).

### The name rule

v2's standardization is behaviour, not data, and names are open-ended strings, so the converter implements it itself. It camel-cases the name, keeping stand-alone punctuation (`+`, `?`) as it is ([helpers.ts:194](../../v2-src/helpers.ts#L194)). A test holds it to v2's function over a list of awkward names: symbols, `SCREAMING_CASE`, spaces and hyphens, mixed case, digits, and the empty string.

## The v2→v3 rules

What each canonical v2 node becomes in v3: the other half of the converter's knowledge, beside the v2 table. They live in `src/converter/rules.ts`, one entry per v2 operator.

### Where rules sit

For each canonical v2 node, stage 2:

1. **converts each parameter value first**, recursively. It knows which operator and parameter it is inside, which is what the `literal`-wrap rule needs (`evaluatesContents`, above);
2. **applies the operator's rule** to the node, whose parameter values are now v3;
3. **attaches the modifiers** around the rule's result: `fallback` and `useCache` carry over, alias definitions become `vars`, and `outputType` wraps the result in `convert`.

So a rule never recurses and never sees a v2 subtree. It cannot forget to convert a child, and it deals with modifiers only when it chooses to.

### The rule shape

```ts
export const V3_RULES: Record<V2Operator, OperatorRule> = { … }

interface OperatorRule {
  to?: string // the v3 operator the draft starts as; omitted when `build` writes the whole result
  params: Record<string, ParamFate> // every v2 parameter, by canonical name
  add?: Record<string, unknown> // parameters the v3 node gains
  build?: (draft: V3Draft, context: RuleContext) => unknown // what data can't say
}

type ParamFate =
  | string // the v3 parameter it becomes (the same name if unchanged)
  | { to: string; value: (value: unknown, context: RuleContext) => unknown } // renamed and rewritten
  | 'consumed' // read by `build`, not carried over
  | 'omitted' // not carried over, and nothing is lost: v3 has nothing for it to mean
  | { dropped: ConversionIssueTag; message: string } // no v3 counterpart: removed, with an issue
```

The fates and `add` produce a **draft**: the node's v3 operator, its v3 parameters, the original v2 parameter values and its modifiers. Without a `build`, the draft is the result. A `build` returns the node's final v3 value, which can be anything:

- a different operator: GREATER_THAN with `strict: false` becomes `greaterThanOrEqual`;
- nested nodes: DIVIDE's `output: 'quotient'` becomes `floor` of `divide`;
- a reference string: OBJECT_PROPERTIES with a literal path becomes `"$data.…"`;
- a bare value: PASSTHRU becomes its `value`.

The modifiers attach to whatever it returns. Where that is not a node (a reference or a constant cannot carry `fallback`), "Rules that cut across operators" decides what happens. A `build` may also take over a modifier: OBJECT_PROPERTIES turns a `fallback` into `get`'s `missingPathDefault`.

The **context** gives a rule `issue(tag, message)`, the node's source path, and the `V2Options`.

Examples:

```ts
AND: { to: 'and', params: { values: 'values' } },

CONDITIONAL: {
  to: 'if',
  params: { condition: 'condition', valueIfTrue: 'then', valueIfFalse: 'else' },
},

GREATER_THAN: {
  to: 'greaterThan',
  params: { values: 'values', strict: 'consumed' },
  build: orEqualWhenNotStrict('greaterThanOrEqual'),
},

POST: {
  to: 'http',
  add: { method: 'post' },
  params: { url: 'url', parameters: 'body', headers: 'headers', returnProperty: 'returnPath' },
},

OBJECT_PROPERTIES: {
  to: 'get',
  params: { property: 'path', additionalData: 'from' },
  build: preferReference,
},

PASSTHRU: { params: { value: 'consumed' }, build: ({ v2 }) => v2.value },
```

**A computed or unrecognized deciding value.** When the parameter a `build` chooses by is a node rather than a literal (GREATER_THAN's `strict` computed at runtime), or a literal v2 did not accept (DIVIDE's `output: 'nope'`, a v2 type error), the rule takes its default target and emits a `non-convertible` issue. Writing an `if` that picks between the two nodes at runtime would be lossless, but nobody writes such an expression in practice, and the `if` would duplicate the node's parameters.

The `{ to, value }` fate is for a parameter whose values v3 spells differently. If the per-operator pass finds no use for it, it goes.

### Checks

The shape is chosen so that every rule, including the ones with a `build`, can be checked without examples:

- **Every v2 parameter has a fate.** A test holds each rule's `params` keys to that operator's parameters in the generated table, so a forgotten parameter fails. `useCache` is left out: v2 lists it as a parameter on five operators, but it is a modifier in both versions.
- **Every target exists in v3.** The converter cannot import the engine, but its tests can. A test checks every `to`, and every parameter a fate renames to, against `getOperators()` on the core and I/O operators. When a v3 operator renames a parameter, the rules fail this check rather than silently writing an invalid node.
- **Every `build`'s output validates.** Each rule's examples are converted and validated against a v3 instance, which checks every node a `build` writes, targets included.

### Paths

A path is renamed as it is (`property` → `path`, `returnProperty` → `returnPath`) and never rewritten or warned about. Measured against both engines (September 2026), v2's `object-property-extractor` and v3's `resolvePath` read every path a v2 author would write the same way, with one exception:

| Path                   | v2                                             | v3             |
| ---------------------- | ---------------------------------------------- | -------------- |
| `user.name`            | `'Ann'`                                        | `'Ann'`        |
| `user.friends[1].name` | `'Cy'`                                         | `'Cy'`         |
| `user.friends.name`    | `['Bo', 'Cy']`: a key across an array projects | not found      |
| `user.friends[*].name` | not found                                      | `['Bo', 'Cy']` |

v2 silently projected a key across an array, and v3 needs an explicit `[*]` ("Reference grammar" in [v3-api.md](v3-api.md)). Whether a path meets an array depends on the data, not on the path's text, so the converter cannot know. A warning on every path, since any segment could be an array, would bury the issues that matter. Instead:

- **The migration guide** lists implicit projection as an intentional semantic change, with the `[*]` fix.
- **v3's own sample-data check finds the cases.** `fig.validate(expression, { data })` warns with `missing-data-path` about a `$data` path the sample does not contain, and a path that relied on projection is exactly one v3 finds nothing at. That covers references and `get`'s literal paths. The page offers an optional sample-data box, and a script passes a representative data object.
- **`returnPath` on `http` and `graphQL` is the gap**, since a response's shape is not known until the request runs. The guide covers it.
- **The differential measures it.** If the frozen corpus shows projection is common, the converter could take sample data and insert `[*]` itself. Not before.

### Per operator

Each v2 operator's fate was ruled in its v3 parameter pass, under "v2 disposition" in [v3-operator-parameters.md](v3-operator-parameters.md) and [v3-operator-parameters-2.md](v3-operator-parameters-2.md). These entries turn those rulings into rules, and add what the rulings left to the converter: the issues, and the measured differences. Every example below was run through `/v2-src` and, converted, through v3 (September 2026). The examples are the rule's tests, and each converted node also validates against a v3 instance.

A difference that depends on the data, and that no v3 check can find later, gets an issue where the converter can see the node. One that v3's own checks can find, or that follows from a general v3 rule (no implicit coercion, the null policy), goes to the migration guide instead.

#### Batch 1: renames

```ts
AND: { to: 'and', params: { values: 'values' } },
OR: { to: 'or', params: { values: 'values' } },
MULTIPLY: { to: 'multiply', params: { values: 'values' } },
EQUAL: {
  to: 'equal',
  params: { values: 'values', caseInsensitive: 'caseInsensitive', nullEqualsUndefined: 'omitted' },
  build: instanceCaseInsensitiveIssue,
},
NOT_EQUAL: {
  to: 'notEqual',
  params: { values: 'values', caseInsensitive: 'caseInsensitive', nullEqualsUndefined: 'omitted' },
  build: instanceCaseInsensitiveIssue,
},
GREATER_THAN: { to: 'greaterThan', params: { values: 'values', strict: 'consumed' }, build: ordering('greaterThanOrEqual') },
LESS_THAN: { to: 'lessThan', params: { values: 'values', strict: 'consumed' }, build: ordering('lessThanOrEqual') },
CONDITIONAL: { to: 'if', params: { condition: 'condition', valueIfTrue: 'then', valueIfFalse: 'else' } },
REGEX: { to: 'regex', params: { testString: 'value', pattern: 'pattern' } },
COUNT: { to: 'length', params: { values: 'value' } },
SPLIT: {
  to: 'split',
  params: { value: 'value', delimiter: 'delimiter', trimWhiteSpace: 'trim', excludeTrailing: 'consumed' },
  build: trailingEmptyIssue,
},
```

**AND, OR, MULTIPLY, CONDITIONAL, REGEX, COUNT: renames and nothing else.** v3 truthiness is v2's in practice: its falsy set is `false`, `null`, `0` and `""`, and v3 has no `undefined` or `NaN` values. REGEX is exact parity, since v3's defaults (`mode: 'test'`, `flags: ''`) are what v2 always did. Where v3 differs, it is more lenient where v2 failed: `else` may be omitted (v2 required it), `length` counts strings (v2 took arrays only), a null operand propagates where v2 raised a type error, and `and` / `or` ignore a failure that does not decide the answer. The one result v2 produced that v3 does not is `{ operator: '*', values: [] }`, which is `0` in v2 and `1` (the empty product) in v3, and which `validate()` already warns about.

**EQUAL, NOT_EQUAL.** A node's own `caseInsensitive` carries over. v2's instance-wide `caseInsensitive` option applied to every node that did not set one, and v3's counterpart is `operatorDefaults` ("v2 disposition" for `equal`), which lives in the host's options rather than the expression. So when `V2Options.caseInsensitive` is `true`, `instanceCaseInsensitiveIssue` puts a `lossy-default` issue on each converted node that does not set its own: the node compares case-sensitively until the host adds `operatorDefaults: { equal: { caseInsensitive: true }, notEqual: { caseInsensitive: true } }` or the node sets `caseInsensitive: true` itself. `nullEqualsUndefined` is omitted: v3 has no `undefined` for it to equate. v2 folded case only when every value was a string, and v3 folds each string value. No input gives a different answer, since a string never equals a non-string either way. v2's NOT_EQUAL with `nullEqualsUndefined: true` returned `false` whenever the first value was null ([NOT_EQUAL/operator.ts:39](../../v2-src/operators/NOT_EQUAL/operator.ts#L39), `value === null && value === undefined`); v3 answers correctly, and the guide notes the fix.

**GREATER_THAN, LESS_THAN.** `ordering(orEqual)` picks the operator from `strict`, reading it as v2 did, with `!strict` ([GREATER_THAN/operator.ts:21](../../v2-src/operators/GREATER_THAN/operator.ts#L21)):

- a falsy literal (`false`, `0`, `""`, `null`) gives the `…OrEqual` operator;
- a truthy literal, or no `strict` at all, gives the strict operator, since v2's default was `true`;
- a computed `strict` gives the strict operator and a `non-convertible` issue.

v3 compares exactly two values, and v2 compared the first two and ignored any others. A literal `values` longer than two is cut to its first two, with a `lossy-default` issue naming what was removed. A computed one fails at runtime in v3 and is the guide's. Two differences depend on the data and go to the guide: mixed types (v2 coerced, so `5 > '3'` was `true`; v3 raises a type error), and null operands (v2 coerced null to `0`, so `null < 1` was `true`; v3 propagates null).

**SPLIT.** `trimWhiteSpace` becomes `trim`, with the same default (`true`). `excludeTrailing` dies with no successor, and the converter does not wrap ("v2 disposition" for `split`). v2 dropped one trailing empty piece by default, so `'a,b,'` split to `['a', 'b']` and `''` to `[]`; v3 keeps them, giving `['a', 'b', '']` and `['']`. Whether an input ends in the delimiter or is empty depends on the data, and no v3 check can find it later. So `trailingEmptyIssue` puts an `intentional-semantic-change` issue on every converted `split` except one whose `excludeTrailing` was a literal `false`, where v2 already kept the empties. The issue gives the recipe: `filter` the result where empty pieces must go.

**Measured differences on converted nodes**, beyond the renames:

| v2 node                                                                           | v2           | converted, in v3                         | Disposition                         |
| --------------------------------------------------------------------------------- | ------------ | ---------------------------------------- | ----------------------------------- |
| `{ operator: '*', values: [] }`                                                   | `0`          | `1`                                      | `validate()` warns; guide           |
| `{ operator: '>', values: [5, '3'] }`                                             | `true`       | type error                               | guide: no implicit coercion         |
| `{ operator: '<', values: [null, 1] }`                                            | `true`       | `null`                                   | guide: the null policy              |
| `{ operator: '>', values: [5, 3, 100] }`                                          | `true`       | `true`, cut to `[5, 3]`                  | `lossy-default` issue               |
| `{ operator: '=', values: ['A', 'a'] }`, with v2's `caseInsensitive: true` option | `true`       | `false`, until `operatorDefaults` is set | `lossy-default` issue               |
| `{ operator: '!=', values: [null, 5], nullEqualsUndefined: true }`                | `false`      | `true`                                   | guide: a v2 bug fixed               |
| `{ operator: 'split', value: 'a,b,', delimiter: ',' }`                            | `['a', 'b']` | `['a', 'b', '']`                         | `intentional-semantic-change` issue |
| `{ operator: 'split', value: '', delimiter: ',' }`                                | `[]`         | `['']`                                   | the same issue                      |

The other measured cases (the logic operators over mixed truthy values and empty input, deep and key-order-insensitive equality, case folding, `strict: false`, string ordering, `if` over `[]` and `'false'`, `regex`, `length`, and `split` with a middle empty, default delimiter or `excludeTrailing: false`) give the same answer in both.

#### Batch 2: arithmetic that restructures

```ts
PLUS: { to: 'plus', params: { values: 'values', type: 'consumed' }, build: plusType },
SUBTRACT: {
  to: 'subtract',
  params: { values: 'consumed', from: 'consumed', subtract: 'consumed' },
  build: binary({ first: 'from', second: 'subtract' }, 'minus'),
},
DIVIDE: {
  to: 'divide',
  params: { values: 'consumed', dividend: 'consumed', divisor: 'consumed', output: 'consumed' },
  build: divideOutput(binary({ first: 'dividend', second: 'divisor' }, 'by')),
},
```

**PLUS.** Without `type`, a rename. v2 dispatched on the operands as v3 does, summing numbers, concatenating strings and arrays and shallow-merging objects, and the results match. Everything else v2 did came from JavaScript's `+`, and v3 raises a type error or propagates null instead (the guide's "no implicit coercion" and null policy): `['a', 5]` was `'a5'`, `[true, true]` was `2`, `[1, null]` was `1`, and an empty `values` was `[]`.

v2's `type` did two jobs. It coerced the operands before adding them, and, because v2 read `outputType ?? type` ([evaluate.ts:210](../../v2-src/evaluate.ts#L210)), it also converted the result. `plusType` handles both:

| v2 `type`                    | Becomes                                                                        | Why                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `'string'`                   | `join` with `delimiter: ''`                                                    | v2 concatenated every operand as text (`[1, 2]` gave `'12'`). `plus` with `expect: 'string'` would reject exactly the numbers `type: 'string'` was there for |
| `'array'`                    | `plus` with `expect: 'array'`, each literal non-array operand wrapped in `[ ]` | v2 appended a non-array operand as one element (`[1, [2, 3], 'x']` gave `[1, 2, 3, 'x']`)                                                                    |
| `'number'`                   | `plus` with `expect: 'number'`                                                 | the same sum; v2's coercion of strings (`['1', '2']` gave `12`) is the number-mining v3 dropped                                                              |
| `'boolean'`, `'bool'`        | `plus`, with `outputType: 'boolean'` handed to the modifier rule               | v2 added as usual, then converted the result                                                                                                                 |
| computed, or another literal | `plus`, and a `non-convertible` issue                                          | the deciding-value rule                                                                                                                                      |

The result is already the requested type for `'string'`, `'array'` and `'number'`, so no `convert` is needed. When the node also has its own `outputType`, that wins, as it did in v2, and `type` keeps only its coercing job. Two renderings differ under `'string'` and go to the guide: v2 wrote a null operand as `'null'` where v3's `join` writes `''`, and v2 wrote arrays and objects as `'1,2'` and `'[object Object]'`, where v3 renders a placeholder (and `validate()` rejects a literal one).

**SUBTRACT, DIVIDE.** v2 took the two operands as `values: [a, b]` or as a named pair (SUBTRACT's `from` and `subtract`, DIVIDE's `dividend` and `divisor`), and `values` won when both were present ([SUBTRACT/operator.ts:15](../../v2-src/operators/SUBTRACT/operator.ts#L15)). v3 has one spelling, `value` plus the infix parameter (`minus`, `by`). `binary(named, second)` reads the operands as v2 did:

- a literal `values` array: its first element becomes `value` and its second the infix parameter. The named pair is ignored, as v2 ignored it. Elements past the second are cut with a `lossy-default` issue, as for GREATER_THAN;
- a computed `values`: bound with `vars` and indexed, so it is still evaluated once: `{ operator: 'subtract', vars: { values: <node> }, value: '$vars.values[0]', minus: '$vars.values[1]' }`. The var takes a name the node does not already use;
- no `values`: the named pair, renamed.

`divideOutput` then applies DIVIDE's `output`:

| v2 `output`                  | Becomes                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| absent                       | `divide`: v2's default was already true division                                     |
| `'quotient'`                 | `{ operator: 'floor', value: <the divide> }`: `Math.floor`, negative values included |
| `'remainder'`                | `modulo`, with `by` renamed `mod`, and an `intentional-semantic-change` issue        |
| computed, or another literal | `divide`, and a `non-convertible` issue                                              |

v2's remainder was JavaScript's `%`, which takes the sign of the dividend, and v3's `modulo` is floored, taking the sign of `mod` ("`subtract` / `divide` / `modulo`" in [v3-operator-parameters.md](v3-operator-parameters.md)). They differ whenever exactly one operand is negative: `-7 % 3` is `-1` in v2 and `modulo(-7, 3)` is `2`. That depends on the data, and nothing in v3 finds it later, so every converted remainder gets the issue. `modulo` is v3's only remainder, so the issue explains how to get the truncated answer where negative operands occur.

Division by zero fails in both versions, as a v2 error and as v3's non-finite-result failure.

**Measured differences on converted nodes**, beyond the renames:

| v2 node                                                   | v2         | converted, in v3      | Disposition                         |
| --------------------------------------------------------- | ---------- | --------------------- | ----------------------------------- |
| `{ operator: '+', values: ['a', 5] }`                     | `'a5'`     | type error            | guide: no implicit coercion         |
| `{ operator: '+', values: [1, null] }`                    | `1`        | `null`                | guide: the null policy              |
| `{ operator: '+', values: [] }`                           | `[]`       | `validate()` error    | guide                               |
| `{ operator: '+', values: ['1', '2'], type: 'number' }`   | `12`       | type error            | guide: no number-mining             |
| `{ operator: '+', values: ['a', null], type: 'string' }`  | `'anull'`  | `'a'`                 | guide                               |
| `{ operator: '-', values: [10, 3, 2] }`                   | `7`        | `7`, cut to `[10, 3]` | `lossy-default` issue               |
| `{ operator: '/', values: [-7, 3], output: 'remainder' }` | `-1`       | `2`                   | `intentional-semantic-change` issue |
| `{ operator: '/', values: [10, 4], output: 'nope' }`      | type error | `2.5`                 | `non-convertible` issue             |

The other measured cases give the same answer in both: the four `plus` modes, a single operand, `type: 'string'` over numbers, booleans and floats, `type: 'array'` over mixed and nested operands, `type: 'number'` and `'boolean'`, `type` beside `outputType`, both spellings of SUBTRACT and DIVIDE and the two together, `'quotient'` over negative values, and `'remainder'` where the signs agree.

#### Batch 3: data and strings

```ts
OBJECT_PROPERTIES: {
  to: 'get',
  params: { property: 'path', additionalData: { to: 'from', value: mergedWithData } },
  build: preferReference,
},
STRING_SUBSTITUTION: {
  to: 'buildString',
  params: {
    string: 'template',
    substitutions: 'substitutions',
    trimWhiteSpace: 'consumed',
    substitutionCharacter: 'consumed',
    numberMapping: 'consumed',
  },
  build: templateRewrite,
},
BUILD_OBJECT: { to: 'buildObject', params: { properties: { to: 'entries', value: literalEntries } } },
MATCH: {
  to: 'match',
  params: { matchExpression: 'value', branches: { to: 'branches', value: pairsToObject } },
  build: fallbackBranchToDefault,
},
PASSTHRU: { params: { value: 'consumed' }, build: ({ v2 }) => v2.value },
```

This batch is where the `{ to, value }` fate earns its place: `additionalData`, `properties` and `branches` are each renamed and rewritten.

**OBJECT_PROPERTIES.** "v2 disposition" for `get` in [v3-operator-parameters-2.md](v3-operator-parameters-2.md) rules the rename (`property` → `path`) and the pairing of a `fallback` with `missingPathDefault`. `preferReference` writes the everyday case as a reference, and the rest as `get`:

| v2 node                                                       | Becomes                                                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| a literal path, and nothing else                              | `"$data.<path>"`; an empty path is `"$data"`                                                  |
| with a `fallback`                                             | `get` with `missingPathDefault: <the fallback>`, which the rule takes over from the modifiers |
| with `additionalData`                                         | `get` with `from: { operator: 'plus', values: ['$data', <additionalData>] }`                  |
| with a computed path, or alias definitions to carry as `vars` | `get`                                                                                         |
| with a path v3's grammar cannot parse                         | `get`, and `validate()` reports the path                                                      |

v2 read from its data with `additionalData` merged over it ([OBJECT_PROPERTIES/operator.ts:15](../../v2-src/operators/OBJECT_PROPERTIES/operator.ts#L15)), and v3's `from` replaces the source instead. `mergedWithData` keeps v2's meaning with `plus`, whose object mode is the same shallow merge, later keys winning. The ruling's "behaviour change" line is therefore for hand edits, not converted nodes. The pairing with `missingPathDefault` is near-lossless, as the ruling says: v2's `fallback` also caught errors other than a missing path, which `missingPathDefault` does not. A missing path with no `fallback` was an error in v2 and is `null` in v3.

**STRING_SUBSTITUTION.** "v2 disposition" for `buildString` in [v3-operator-parameters.md](v3-operator-parameters.md) lists what v3 kills: rank compaction, the fallback from a `{{name}}` token to `data`, path drilling inside a token, and the escapes. For a literal template, the converter reproduces the first three in v3's own terms, so converted expressions keep v2's output. `templateRewrite`:

1. **`trim`.** v3's default is `false`, where v2's was on. So `trim: true` is written unless `trimWhiteSpace` was a literal `false` (the ruling); a computed `trimWhiteSpace` carries over as `trim`.
2. **The mode**, from `substitutions`: a literal array is positional, a literal object or none at all is named, and a computed one is read from the template's tokens.
3. **Positional tokens.** With `substitutionCharacter: '$'`, `$N` tokens become `%N` (the ruling). v2 paired the template's distinct tokens with the substitutions by rank, so `'My %1 is %3'` with two values used both, and v3 counts strictly. So a literal template's tokens are renumbered by rank: `'My %1 is %3'` becomes `'My %1 is %2'`. A computed template cannot be renumbered, and gets an `intentional-semantic-change` issue, since it differs only where a template's numbering has gaps.
4. **Named tokens.** A token whose first segment is a key of a literal `substitutions` object stays a substitution token. Any other token read `data` in v2, and becomes a reference token: `{{user.name}}` becomes `{{$data.user.name}}`, which drills as v2's token did. When `substitutions` or the template is computed, the converter cannot tell which tokens fell back to `data`, so the tokens stay as they are, with an `intentional-semantic-change` issue. A token that drills into a substitution (`{{user.name}}` beside `substitutions: { user: … }`) is `non-convertible`, since v3's bare tokens do not drill.
5. **`numberMapping`** dies (the ruling), and each mapped token gets a `non-convertible` issue giving the ruling's recipe, a `match` or `if` in the substitution. The token then renders the bare number.
6. **Escapes and token-shaped text.** v3 has no escape sequences, and delivers literal token text through a substitution instead (the ruling). A literal template holding `\%N`, `\$N` or `\{{`, or a `$`-mode template already holding `%N` text, gets a `non-convertible` issue. A computed template under `substitutionCharacter: '$'`, or a computed `substitutionCharacter`, is `non-convertible` too: v3 has no `$` tokens to leave in place.

Four renderings still differ, and go to the guide:

- a token with no substitution was `''` in v2 and renders its own text in v3, which `validate()` warns about on a literal template;
- a null substitution was `'null'` under v2's default trim and is `''` in v3;
- arrays and objects were `'1,2'` and `'[object Object]'`, and v3 renders a placeholder;
- a malformed token such as `{{ name }}` swallowed its whole fragment in v2 and renders literally in v3.

v2 also evaluated a value it read from `data` as an expression, and v3 never does. That is the injection path References rule 4 closed, and it goes to the guide too.

**BUILD_OBJECT.** `properties` → `entries`, and `literalEntries` rewrites a literal array. An alternating one (any element a literal non-object) is paired into `{ key, value }` objects, as v2 paired it. An element missing its `key` or `value`, which v2 dropped silently, is dropped with a `lossy-default` issue naming it. A computed `properties` carries over, and its alternating or malformed shapes fail loudly in v3 at runtime, which is the guide's. The rulings are "v2 disposition" for `buildObject` in [v3-operator-parameters-2.md](v3-operator-parameters-2.md).

**MATCH.** `matchExpression` → `value`, and `pairsToObject` turns a literal array of alternating keys and values into the object v3 takes. `fallbackBranchToDefault` moves a `fallback` key inside `branches` to the `default` parameter (the rulings, "v2 disposition" for `match`). Branches written on the node itself are moved into `branches` by the normalizer (`extraKeys`), with v2's precedence:

- a key already in `branches` wins over the node's own;
- when `branches` holds a `fallback`, v2 answered with it before looking at the node's keys at all, so those keys were unreachable and are dropped, with a `lossy-default` issue.

A computed `branches` carries over as v3's dynamic mode. v2 evaluated the matched value it extracted, and treated a `fallback` key in the computed object as the default; v3 does neither. Both are the guide's.

**PASSTHRU** becomes its value, never `literal`: v2 evaluated it ("v2 disposition" for `literal`). The modifiers it carried attach to that value, and where the value is a constant or a reference, "Rules that cut across operators" decides.

**Measured differences on converted nodes**, beyond the renames:

| v2 node                                                                       | v2                     | converted, in v3 | Disposition               |
| ----------------------------------------------------------------------------- | ---------------------- | ---------------- | ------------------------- |
| `{ operator: 'getData', property: 'user.nope' }`                              | error                  | `null`           | none: v3 is more lenient  |
| `{ operator: 'stringSubstitution', string: '%1 %2', substitutions: ['a'] }`   | `'a '`                 | `'a %2'`         | `validate()` warns; guide |
| `{ operator: 'stringSubstitution', string: '[%1]', substitutions: [null] }`   | `'[null]'`             | `'[]'`           | guide                     |
| `numberMapping: { count: { 1: 'one friend', other: '{} friends' } }`, count 2 | `'You have 2 friends'` | `'You have 2'`   | `non-convertible` issue   |

The other measured cases give the same answer in both: literal, missing-with-`fallback`, stored-null, empty and indexed paths, `additionalData` on both sides of the merge, and computed paths; positional templates with gapped, repeated and `$` tokens, v2's default trim and `trimWhiteSpace: false`, numbers and `%` text; named tokens from substitutions, from `data` (drilled, indexed and missing) and mixed; `children`; `buildObject` in both forms, with a malformed element and a boolean key; `match` on strings, numbers and booleans, with a `fallback` branch, root branches, the root-against-`branches` precedence and an array of branches; and PASSTHRU over a node, a constant and `children`.

#### Batch 4: I/O

```ts
GET: {
  to: 'http',
  params: { url: 'url', parameters: 'query', headers: 'headers', returnProperty: 'returnPath' },
  build: httpRequest,
},
POST: {
  to: 'http',
  add: { method: 'post' },
  params: { url: 'url', parameters: 'body', headers: 'headers', returnProperty: 'returnPath' },
  build: httpRequest,
},
GRAPHQL: {
  to: 'graphQL',
  params: { query: 'query', url: 'url', headers: 'headers', variables: 'variables', returnNode: 'returnPath' },
  build: graphQLRequest,
},
SQL: {
  to: 'sql',
  params: { query: 'query', values: 'values', single: 'consumed', flatten: 'consumed' },
  build: sqlShape,
},
```

The renames are the rulings: "v2 disposition" for `http`, `graphQL` and `sql` in [v3-operator-parameters-2.md](v3-operator-parameters-2.md). `useCache`, a parameter on all four in v2, is the node modifier in v3 and is handled with the other modifiers. These examples were measured against mock clients on both sides, comparing the request each version sent as well as the result.

**The collapse, on GET, POST and GRAPHQL.** v2 passed every response through `extractAndSimplify` ([operatorUtils.ts](../../v2-src/operators/operatorUtils.ts)): each element of an array result, and a `returnProperty` result that was an object, was reduced to its value when it had exactly one key. So a GraphQL query for `{ countries { name } }` with `returnNode: 'countries'` returned `['NZ', 'AU']`, and v3 returns `[{ name: 'NZ' }, { name: 'AU' }]`. v3 dropped the collapse ("v2 disposition" for `http`), and whether it fired depends on the response, which nothing in v3 can check. It is also the likeliest silent difference in this batch, since querying a single field is everyday GraphQL. So `httpRequest` and `graphQLRequest` put an `intentional-semantic-change` issue on every converted node, giving the fix: v3's projection segment says what v2 inferred, so `returnPath: 'countries[*].name'` returns the names.

**GET, POST.** `httpRequest` also does the following:

- **A literal `url` object.** v2 accepted `url: { url, headers }`. It is split into `url`, and `headers` merged beneath the node's own, which won in v2 ([GET/operator.ts](../../v2-src/operators/GET/operator.ts)). With computed `headers`, the two merge with `plus`. A computed `url` that yields an object fails at runtime in v3, which is the guide's.
- **POST with no `parameters`** gets `body: {}`, since v2 always sent a JSON body and v3 sends none when `body` is absent.
- **POST's cache default.** A converted POST without its own `useCache` gets `useCache: false`, unless `V2Options.useCache` is `true`. v2 left POST uncached by default, where v3's `http` caches.

**GRAPHQL.** `graphQLRequest` drops a `url` of `''` or v2's placeholder `'graphQLEndpoint'` (any case), which both meant "the configured endpoint" in v2, as an omitted `url` does in v3. It splits a `url` object as `httpRequest` does. v2 joined a relative `url` to the GraphQL endpoint option, and v3 joins it to `http.baseEndpoint`, so a literal relative `url` gets an `intentional-semantic-change` issue. v2 also returned `data` even when the response carried `errors`, and v3 fails the node instead, which is a ruled change (register row 30) and the guide's.

**SQL.** `sqlShape` maps `single` and `flatten` to `shape` as ruled: neither gives `'rows'` (the default, so omitted), `single` gives `'firstRow'`, `flatten` gives `'column'`, and both give `'firstValue'`. A computed `single` or `flatten` is a deciding value: `'rows'`, and a `non-convertible` issue. v2 also read the node's `type` as `flatten` when it was `'array'`, `'string'` or `'number'` ([SQL/operator.ts](../../v2-src/operators/SQL/operator.ts), a compatibility rider for v2.15 and earlier). The normalizer makes that explicit, setting `flatten: true` beside the `outputType` the same `type` becomes, which v2 evaluates identically. v2's `flatten` over a multi-column result gave arrays of values, which v3's `'column'` rejects at runtime. That is the ruling's loud migration line, and the guide's.

**Measured differences on converted nodes**, beyond the renames:

| v2 node, and response                                                 | v2                                            | converted, in v3                             | Disposition                         |
| --------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------- | ----------------------------------- |
| GET, response `[{ name: 'x' }, { name: 'y' }]`                        | `['x', 'y']`                                  | `[{ name: 'x' }, { name: 'y' }]`             | `intentional-semantic-change` issue |
| GET with `returnProperty: 'a'`, response `{ a: { only: 5 } }`         | `5`                                           | `{ only: 5 }`                                | the same issue                      |
| GRAPHQL with `returnNode: 'countries'`, response a list of `{ name }` | `['NZ', 'AU']`                                | the list of objects                          | the same issue                      |
| GRAPHQL with `url: 'v2/graphql'`                                      | posts to the GraphQL endpoint + `/v2/graphql` | posts to `http.baseEndpoint` + `/v2/graphql` | `intentional-semantic-change` issue |
| GRAPHQL, response with `errors`                                       | the `data`                                    | failure                                      | guide: ruled                        |
| GET with `returnProperty: 'zz'`, missing                              | error                                         | `null`                                       | none: v3 is more lenient            |
| SQL with `flatten: true`, two columns                                 | `[[1, 2]]`                                    | type error                                   | guide: ruled                        |

The other measured cases give the same answer and send the same request in both: GET plain, with query parameters, with a relative URL, with a `returnProperty`, over multi-key objects and with a `url` object; POST with and without a body; GRAPHQL with a full URL, the placeholder, or none; and SQL as rows, `single`, `flatten` over one column, both together, `single` with no rows, and the `type` rider.

#### Batch 5: custom functions

```ts
CUSTOM_FUNCTIONS: { params: { functionName: 'consumed', args: 'consumed', input: 'consumed' }, build: functionCall },
```

A v2 custom function becomes a host-registered custom operator of the same name. The recipe in "The custom-function wrapper recipe" in [v3-migration.md](v3-migration.md) is the suggested way to register one, and not a shape the converter can rely on ("Changes to other specs"). So every converted call gets a `non-convertible` issue at its own path, naming the function and saying the call must be checked against the operator the host registers. It also says that a name already taken by a core operator (a v2 function called `round` or `map`, say) must be registered under another name and the calls renamed.

**Recognition is the normalizer's**, and follows v2's precedence:

- an `operator` naming a function listed in `V2Options.functions` is a call on it, even when the name is also a v2 operator's, since v2 checked for functions first ([evaluate.ts:55](../../v2-src/evaluate.ts#L55));
- a `$name` key is a call only when the name is neither a v2 operator nor a fragment ([shorthandSyntax.ts:47-67](../../v2-src/shorthandSyntax.ts#L47-L67));
- the explicit form, `{ operator: 'customFunctions', functionName, … }`, needs no list.

Each form normalizes to the explicit one. The node's undeclared keys go into `input` (`extraKeys`, above), as `replaceCustomOperator` put them ([helpers.ts:121](../../v2-src/helpers.ts#L121)).

**What `functionCall` writes.** v2 called the function as `f(input, ...args)`, with `input` first when present ([CUSTOM_FUNCTIONS/operator.ts:34-37](../../v2-src/operators/CUSTOM_FUNCTIONS/operator.ts#L34-L37)).

| v2 call               | Becomes                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| `args` only, literal  | `{ $name: [...args] }`                                                        |
| `args` only, computed | `{ $name: <the args node> }`                                                  |
| neither               | `{ $name: [] }`                                                               |
| with `input`          | `{ operator: 'name', input: <input>, args: [...] }`, `args` only when present |

A call with positional arguments is the one place the converter writes shorthand (the exception under "What the converter writes"). The shorthand array binds by whatever positional parameters the host's operator declares. That covers the recipe's single `...args` parameter, and an operator declared with positional parameters of its own. A computed `args` becomes the whole-array payload, which fills a rest parameter (the rest-position rule, "Positional mapping: `positionalParams`" in [v3-operator-parameters.md](v3-operator-parameters.md)). A call with `input` has no positional reading, since v2 passed `input` as one object, so it names `input` (and `args`), and the host's operator declares them. The node's modifiers stay beside the call as sibling keys, which the shorthand form allows.

**Names.** A literal `functionName` becomes the operator's name. v2 also found functions by a dotted path into `functions` (`utils.format`); v3's name rule rejects a dot ("Name legality, not name style" in [v3-api.md](v3-api.md)), so such a name keeps its text and the call-site issue says it must be renamed. A computed `functionName` has no v3 spelling, since operator names are literal, and becomes a placeholder with a `non-convertible` issue ("The two stages in detail").

**Measured**, with the v2 functions registered as v3 operators the recipe's way (`args`) and, for `input`, with `input` and `args` declared: every form gives the same result in both. That covers the explicit node, `children`, an `operator` naming the function, shorthand arrays and single values, `$data` arguments, a computed `args`, `input` alone and with `args`, a shorthand object, and undeclared keys gathered into `input`. A call on a function the host has not registered fails `validate()` in v3 (`unknown-operator`), where v2 failed at runtime and a `fallback` caught it. The call-site issue covers it.

## What v3 does with unconverted v2 syntax

Measured against the Phase-14 build (September 2026), by validating and evaluating v2 syntax on an instance with the core and I/O operators, one custom operator and one fragment. It is why conversion is not optional, and it feeds the migration guide. Most v2 syntax fails loudly; two kinds fail silently.

**Loud: `validate()` reports an error at the node.**

| v2 syntax                                  | Example                                                                                                         | v3 reports                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| a v2-only operator name                    | `{ operator: 'getData', property: 'x' }`; likewise `objProps`, `customFunctions`, `pass`, `count`, `data`       | `unknown-operator`                       |
| v2's loose name matching                   | `'Plus'`, `'NOT_EQUAL'`, `'GET'`, `'get_data'`                                                                  | `unknown-operator`                       |
| `children`                                 | `{ operator: '+', children: [1, 2] }`                                                                           | `unknown-node-key` at `children`         |
| a v2 parameter name or property alias      | `valueIfTrue`, `testString`, `matchExpression`, `properties`, `returnNode`; `values` on `-`, `/`, `!`, `length` | `unknown-node-key` at the key            |
| a v2 modifier or v2-only parameter         | `outputType`, `type`, `strict`, `nullEqualsUndefined`                                                           | `unknown-node-key` at the key            |
| an alias definition                        | `{ operator: '+', $x: 5, values: ['$x', 1] }`                                                                   | `unknown-node-key` at `$x`               |
| a `$`-prefixed fragment argument           | `{ fragment: 'f', $country: 'NZ' }`, `{ $f: { $country: 'NZ' } }`                                               | `unknown-node-key` at the key            |
| a v2 positional payload of the wrong arity | `{ $get: [url, [], 'flag'] }`, `{ '$!': [a, b] }`, `{ '$-': [5, 2, 1] }`                                        | `positional-arity`                       |
| a reused name, in a form v3 rejects        | `{ operator: 'convert', value: 5 }`, `{ operator: 'get', url: … }`                                              | `missing-required` or `unknown-node-key` |
| a custom-function call with named `input`  | `{ $fn: { input: { … } } }`                                                                                     | `unknown-node-key` at `input`            |

**Silent, inert: v3 treats it as data, with only a warning.** A v2-only name in shorthand (`{ $getData: 'x' }`, `{ $add: [1, 2] }`, `{ $data: 'x' }`) gets an `unrecognized-identifier` warning and evaluates to itself, the object. `validate()` still says `valid: true`.

**Silent, different: v3 accepts it and returns something else.**

- **Reused names**, in forms both versions accept:

  | Expression                                 | v2                   | v3                |
  | ------------------------------------------ | -------------------- | ----------------- |
  | `{ $get: 'a.b' }`                          | an HTTP GET of `a.b` | the data at `a.b` |
  | `{ $join: ['a', 'b'] }`                    | `'ab'`               | `'a b'`           |
  | `{ $join: [1, 2] }`                        | `3`                  | `'1 2'`           |
  | `{ operator: 'join', values: ['x', 'y'] }` | `'xy'`               | `'x y'`           |

  `!` and `lower` are reused too, but their v3-valid forms (a single value) were errors or meaningless in v2, so no working v2 expression contains them.

- **Nodes inside plain objects**, which v2 returned as data (with `evaluateFullObject` off) and v3 evaluates.
- **Semantic changes inside shared syntax**, such as `{ operator: '+', values: ['a', 1] }`, which is `'a1'` in v2 and a type error in v3, which has no implicit coercion. These are the guide's "Intentional semantic changes", catalogued by the differential.

## Open questions

1. **`convertV2Fragments`' result.** Keyed as in the input, with issue paths rooted at the fragments object, as above. Or should a fragment that fails to convert be left out of `fragments` so that registering the result cannot throw, with its issue saying why?
2. **Where the conversion page lives.** Probably not this repo, since it is an app. It imports `fig-tree-evaluator/convert` and a `FigTree` to validate its output. Out of scope here beyond what the surface owes it.

## Still to write

- **The two stages in detail:** the normalizer's per-node steps, carrying each node's source path through normalization so issues point at the input, and which placeholder applies where.
- **Rules that cut across operators:** alias nodes → `vars` and `$vars.…`, `outputType` → `convert`, the `literal` wrap, v2 data that v3 would read as a reserved key or a reference, the keys v2 ignored, computed `children` and fragment names.
- **Fragments:** call sites, and converting fragment definitions (placeholders → `$params.…`, `metadata.parameters` → declared parameters, colours → `metadata`).
- **The issue catalogue.**
- **The differential runner:** the frozen corpus through a v2-shaped wrapper, and the divergence catalog.
- **Testing, packaging and build order.**

# FigTree v3 — the v2 converter

_Status: **Agreed** (September 2026, signed off by Carl at Phase-15 planning). The other specs were changed as "Changes to other specs" lists, as 15.1's first chunk. Built so far: the placeholder `./migrate` entry, the reference tables ("The v2 reference table", 15.1's second chunk), stage 1 ("Stage 1: normalize", 15.1's third chunk), stage 2's frame with batch 1 (15.1's fourth chunk), and batches 2 to 5 with the rest of the frame (15.1's fifth chunk)._

## Purpose

The design for Phase 15's `./migrate` subpath: how v2 expressions and fragments become v3. [v3-migration.md](v3-migration.md) stays the contract for what conversion promises (the best-effort ruling, the three issue tags, the migration guide), and this doc cites it rather than restating it. Where a decision here changes that contract, the change is listed under "Changes to other specs" and written back when this doc is agreed.

## The setting

Conversion is a one-time step over a host's stored expressions, as the opening of [v3-migration.md](v3-migration.md) frames it: "an author-time / build-time step over your config, not a runtime accommodation". It has three callers:

- **A migration script**, in the host's own code, run once over its stored expressions. It has the host's v2 options to hand.
- **A stand-alone conversion page**, where a person pastes their v2 options and expressions and copies out the result. It knows only what the person pastes. It lives in the fig-tree-editor-react repo, and imports `fig-tree-evaluator/migrate` and a `FigTree` to validate its output; this doc covers only what the surface owes it.
- **The Phase-15.2 differential**, which runs the v2 tests' expression cases through the converter, with the options each test used.

**The converter assumes its input is v2.** It never has to decide, because each of these callers knows. There is no detection function: telling v2 from v3 has no reliable general answer, since the two share most of their syntax and reuse five names for different operators (see the last section). The v3 editor stays v3-only and carries no v2 knowledge. An unconverted v2 expression loaded into it shows v3's validation errors, apart from the silent cases in the last section.

**The v2 it converts from is the latest v2 release**, since that is what hosts migrate from: 2.23.2 as this is written. v2 is maintained until v3's release and frozen then, with no API changes in the meantime. The converter's tooling reads the published package, never `/v2-src`, which stays unchanged until it is deleted ("The v2 package", below). `/v2-src` is exactly 2.23.0, and 2.23.1 and 2.23.2 fixed six things after the freeze. Two change what the converter writes: DIVIDE's `output: 'decimal'` and SPLIT's escaped delimiters. Two change only what a converted node is measured against: `notEqual` with `nullEqualsUndefined`, and STRING_SUBSTITUTION's null values. Each rule below says so. The last two fixed the un-escaping of repeated placeholders, which the converter flags anyway, and primitive `inputDefault` values in custom-function definitions, which it never sees. For a host on 2.23.0, each of the two changes follows 2.23.2: it writes what that version did, where 2.23.0 failed or did what nobody could have wanted. No name or alias changed, so the reference table is the same from either. The measurements in this doc ran against `/v2-src`, and where 2.23.2 gives a different answer, the entry says so. Its links into `/v2-src` are to 2.23.0's code, and move to that tag on GitHub when `/v2-src` is deleted.

Assuming v2 has a cost, and the guide states it plainly: **the converter is not safe on v3 input, and it is not idempotent.** Its output can contain `get`, `join` and `convert`, which a second pass would read as v2's HTTP GET, PLUS and PASSTHRU. Each expression is converted once. The page does that naturally; a script keeps the originals and records what it has converted.

## Surface

`fig-tree-evaluator/migrate` exports two functions:

| Export                | Signature                                                       | Converts                                        |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| `migrateV2Expression` | `(expression: unknown, options?: V2Options) => MigrationResult` | one v2 expression                               |
| `migrateV2Fragments`  | `(options: V2Options) => FragmentMigrationResult`               | the fragment definitions in `options.fragments` |

The subpath is `migrate` rather than `convert`, which is a v3 operator's name.

Both are pure functions over their arguments and the converter's own embedded v2 table ("Ruling: `migrateV2Expression` is a pure function carrying its own v2 tables" in [v3-migration.md](v3-migration.md), which stands). They take no `FigTree` and import nothing from the engine at runtime. So `./migrate` imports types only from the root, as `./editor-hints` does, and the same lint rule enforces it. Checking that the output validates is the caller's job: the page and the script both have an instance.

`V2Options` is the part of v2's options that changes how an expression is read ("What the converter reads", below). Any other key is ignored, so a script can pass its real v2 options object unchanged.

```ts
interface MigrationResult {
  expression: unknown // the converted v3 tree, best-effort wherever there are issues
  issues: MigrationIssue[] // empty only for a clean conversion
}

interface FragmentMigrationResult {
  fragments: Record<string, FragmentDefinition> // every definition, keyed as in the input unless renamed
  issues: MigrationIssue[] // paths rooted at the fragments object: ['getFlag', …]
}
```

`MigrationIssue` is migration's shape (`tag`, `path` in the source, `message`), with a `code` added ("The issue catalogue"). All the types (`V2Options`, `MigrationResult`, `FragmentMigrationResult`, `MigrationIssue`) export from the root, per "Types" in [v3-packaging.md](v3-packaging.md).

Fragment definitions get their own function for two reasons. A fragment body is read differently from an expression: its `$name` strings are parameter placeholders, and its `metadata` key belongs to the definition. And converting them is a once-per-host job, where expressions are converted by the hundred.

### Changes to other specs

Written back at 15.1's first chunk, once this doc was agreed:

- **[v3-migration.md](v3-migration.md), "`./migrate` — the module surface":** `migrateV2Expression` takes the optional `V2Options`; add `migrateV2Fragments` and the `V2Options` and `FragmentMigrationResult` types. This amends the Phase-14 ruling that `./migrate` holds `migrateV2Expression` and nothing else. Conversion is still all it is for.
- **v3-migration.md, "The custom-function wrapper recipe" and the CUSTOM_FUNCTIONS entry under "`non-convertible`":** the recipe becomes a suggestion rather than the shape the converter targets. A host's v3 operator can declare whatever parameters suit it, so the converter cannot know a call's v3 shape. It rewrites each call to the nearest v3 call on the function's name, since the arguments are v2 expressions that need converting regardless. It then puts a `non-convertible` issue on every call site, not one per function name, saying the call must be checked against the operator's definition.
- **v3-migration.md, the "Moved options" bullet:** the converter reads options, it does not rewrite them. Fragments are the exception, through `migrateV2Fragments`; the rest stays the guide's table.
- **v3-migration.md, the "Null policy" bullet under `intentional-semantic-change`:** "the converter flags the corners the null-policy review catalogued" has nothing to point at, since the review catalogues no v2 corners, and null-policy differences depend on the data. The guide lists them, and the converter does not flag them ("Per operator").
- **[v3-operator-parameters.md](v3-operator-parameters.md), "v2 disposition" for `plus`:** `type` → `expect` holds for `'array'` and `'number'`. `type: 'string'` converts to `join` with `delimiter: ''` instead, since v2 coerced the operands to text and `expect: 'string'` would reject the numbers it was used to concatenate ("Batch 2").
- **[v3-operator-parameters-2.md](v3-operator-parameters-2.md), "v2 disposition" for `get`:** `additionalData` converts to `from: { operator: 'plus', values: ['$data', …] }`, which keeps v2's merge, so the "merge to replace" behaviour change concerns hand edits, not converted nodes ("Batch 3").
- **[v3-operator-parameters.md](v3-operator-parameters.md), "v2 disposition" for `buildString`:** of the behaviour it kills, rank compaction, the fallback to `data` and path drilling in a token are reproduced by the converter for literal templates (renumbering, and reference tokens), so they are behaviour changes for hand edits and computed templates only ("Batch 3").
- **[v3-operator-parameters-2.md](v3-operator-parameters-2.md), "v2 disposition" for `http` and `graphQL`:** the dropped collapse is a migration-doc line there. The converter also puts an issue on every converted `http` and `graphQL` node, since whether it fired depends on the response, and gives the `[*]` fix ("Batch 4").
- **v3-migration.md, the "Deep-evaluation object wrapping" bullet under `lossy-default`:** with `evaluateFullObject` read, the wrap is a rule rather than "a flagged guess", and carries no issue ("The `literal` wrap").
- **v3-migration.md, the `MigrationIssue` shape and "What emits an issue":** the shape gains `code`, and the section becomes a pointer to "The issue catalogue", which lists every issue with its code, tag, path and message.
- **v3-migration.md, open question 2** (options or trees only): answered. Options are read as context, fragments are converted, and the other options are migrated by hand.
- **v3-migration.md, open question 4** (the `literal`-wrap heuristic): answered by `evaluateFullObject`, which makes the wrap a rule ("What the converter reads").
- **[v3-packaging.md](v3-packaging.md), "`./migrate`" and "Types":** the contents (two functions, four types), with the four types added to the "Types" list. The isolation line becomes "imports types only from the root", in place of "may import from the root (it is built on the compiler's normalizer)". The `instanceof FigTreeError` assertion goes: the entries share no runtime code, and the type-only rule replaces it.
- **[v3-testing-strategy.md](v3-testing-strategy.md), step 5, and [v3-implementation-plan.md](v3-implementation-plan.md), 15.2:** the differential compares live v2 (the published package, following v2's releases) with v3, rather than v3 with the recorded expected values. Its corpus is a data module extracted from the v2 tests, and not the frozen files run in place. An accepted baseline and its CI check are added ("The differential runner"). The plan's `/v2-src` runnability risk no longer covers Phase 15, only Phase 16.
- **[v3-implementation-plan.md](v3-implementation-plan.md), 15.1:** the same, including "built on the compiler's normalizer", which no longer holds.

## What the converter reads

### The v2 options

| `V2Options` key      | How it changes the reading                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fragments`          | The names, so `{ $name: … }` and `{ fragment: … }` calls are recognized, and each definition's declared parameters (`metadata.parameters`), so a call's `$country` arguments can be mapped and checked. `migrateV2Fragments` converts the definitions themselves.                                                                                                                                      |
| `functions`          | The names of the host's custom functions, as a list or as v2's `functions` object (only its keys are read, since the functions are JS that cannot be pasted). They let `{ $name: … }` and `{ operator: name }` be recognized as custom-function calls.                                                                                                                                                 |
| `evaluateFullObject` | Whether v2 looked for nodes inside plain objects. Off, which is v2's default, a plain object was data however node-like its contents, so one holding anything v3 would evaluate is wrapped in `literal`. On, plain objects are walked and converted, and `$` keys on them are read as alias definitions ([evaluate.ts:281](../../v2-src/evaluate.ts#L281)).                                            |
| `noShorthand`        | On, `$name` keys were never shorthand, so an object carrying one is data. v2 itself ignored the option in `evaluateObject`, which expanded shorthand in GET and POST `parameters` and `headers`, GRAPHQL `variables` and CUSTOM_FUNCTIONS `input` anyway. The converter applies it everywhere.                                                                                                         |
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

  Keys an operator did not declare were ignored, with two exceptions: MATCH read its branches from the node's own keys, and a call naming a function in `operator` gathered them into its `input`.

- **Custom-function calls**: `operator: 'customFunctions'` (or an alias) with `functionName`, `args` and `input`, or `operator` naming a function directly ([helpers.ts:121](../../v2-src/helpers.ts#L121)). A `functionName` can be computed, and can be a dotted path into `functions`.
- **Fragment calls**: objects with a `fragment` key. The name can be computed, and so can the `parameters` object. `$` keys on the call node itself are arguments too. When v2 expanded a call, the call node's own keys went beneath the body's and the arguments over both ([evaluate.ts:115](../../v2-src/evaluate.ts#L115)), so a call's `fallback` applies unless the body sets one.
- **Shorthand**: `$name` keys on a plain object, resolved in the order operator, fragment, custom function ([shorthandSyntax.ts:47-67](../../v2-src/shorthandSyntax.ts#L47-L67)). An unresolved `$name` stays data. The payload is read by what the name resolved to:
  - **an operator**: an array becomes `children`, a plain object with no `$` keys becomes named parameters, and anything else becomes a single child;
  - **a fragment**: it is spread into `parameters`, so an object's keys become arguments, and anything else supplies none;
  - **a function**: an array becomes `args`, an object holding `input` or `args` becomes the call's own keys, any other object becomes `input`, and anything else becomes a single argument.

  Other keys stay beside the `$name` key. An object with several resolved `$` keys is merged into one node.

- **Alias references**: whole `"$name"` strings, resolved from the definitions on enclosing nodes. An unresolved reference stays a literal string.
- **Plain objects** are data unless `evaluateFullObject` is on. **Arrays** are evaluated element by element, always.
- **Fragment definitions** (for `migrateV2Fragments`): any value as the body. An operator-node body can carry `metadata` among its own keys, holding `description`, `textColor`, `backgroundColor` and a `parameters` array of `{ name: '$country', type, required, default, description }`. Inside the body, `"$country"` strings are the parameter placeholders.

## What the converter writes

Conversion runs in two stages:

1. **Normalize: v2 to canonical v2.** Shorthand is expanded, names are resolved to their v2 operator, property aliases become parameter names, `children` is mapped to named parameters, `type` is spelled `outputType` (apart from PLUS's parameter and SQL's rider), and a fragment call's `$` arguments move into `parameters`. That is the order v2 itself normalized a node in, at every evaluation ([evaluate.ts](../../v2-src/evaluate.ts)); the converter does it once, statically. The result is still a v2 expression, so v2 evaluates it to the same value as the original, which gives this stage a test oracle of its own.
2. **Convert: canonical v2 to canonical v3.** Each node goes through its operator's rule and the rules that cut across operators. Each rule sees one shape, not every form a v2 author could have written.

What comes out:

1. **Canonical v3 throughout**, as the compiler's canonical form has it: `operator` nodes with v3's canonical names (no symbols, no shorthand) and named parameters, fragment calls as `{ fragment, parameters }`, and data read through references (`"$data.…"`, `"$vars.…"`). The author's form is not kept: `{ $plus: [1, 2] }`, `{ operator: '+', children: [1, 2] }` and `{ operator: 'add', values: [1, 2] }` all come out as `{ operator: 'plus', values: [1, 2] }`. Moving between v3's forms is parked until after 3.0 ("Parked: no shorthand round-trip utilities in 3.0" in [v3-migration.md](v3-migration.md)). One exception: a call on a converted v2 custom function is written in the shorthand positional form, since canonical form needs the operator's parameter names and only the host knows them ("Batch 5").
2. **A fixed key order**: `//` first, as v3's own example has it ("Comments: the `//` key" in [v3-api.md](v3-api.md)), then the defining key (`operator` or `fragment`), then parameters in the order the rule writes them, then `fallback`, `useCache` and `vars`. The input's key order does not matter, so the same expression always converts to the same output.
3. **The input is never mutated.** The output is new structure, sharing by reference only the values it passes through unchanged: constants, opaque values, and the contents of `literal`.
4. **A clean conversion.** The aim is that empty `issues` means the output means in v3 what the input meant in v2, and validates with no errors on an instance holding the core and I/O operators, the host's fragments (as `migrateV2Fragments` produced them) and custom operators that accept the calls as written. The known exceptions are the differences this doc sends to the guide, which follow from v3's general rules or which v3's own checks report. The converter cannot check the aim, since it carries no engine. The differential tests it: a case with no issues and a different result is ✗, and each ✗ is looked at closely and resolved by a converter fix, a new issue, or a reviewed guide difference ("The differential runner"). The converter does not validate v2: a node that could never have evaluated in v2, such as a subtraction given one value, converts as far as it goes, and v3's `validate()` reports what it becomes.

Where a node cannot convert cleanly, it becomes the best-effort placeholder of migration's never-throws ruling: the closest v3 node, or the original subtree wrapped in `literal`, plus an issue. "Placeholders", under "The two stages in detail", says which applies where.

## The v2 reference table

Everything the converter knows about v2, mined from v2 itself (Phase 0's "mined, never ported" asset): the published package's operator data, and v2's behaviour as its source records it. It lives in `src/migrate/v2/` as three modules, joined by operator: one generated from the package, two written by hand. They serve the normalizer. What each v2 operator becomes in v3 is the other half of the converter's knowledge, and that is "The v2→v3 rules".

### `operators.generated.ts`: names and parameters

```ts
export const V2_VERSION = '2.23.2' // the release it was extracted from

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

`V2_NAMES` is looked up as v2 looked it up: the name is standardized first ([helpers.ts:35](../../v2-src/helpers.ts#L35)), then matched exactly. So some of its keys can never match (`GET` standardizes to `get`, `graphQL` to `graphQl`), and they are kept anyway, since the table is v2's own. The lookup reads the table's own keys only, so `constructor` names no operator, where v2's plain lookup found `Object`'s.

`V2_PARAMETERS` holds 68 parameters with 69 property aliases. It carries names and aliases only. Each `data.ts` also has a `description`, a `type`, `required` and a `default`, and none of them is needed. The `default` would mislead: it was the editor's placeholder value, not a runtime default (PLUS's `values` default is `[1, 2, 3]`). MATCH declares a pseudo-parameter literally named `[...branches]`, meaning "branches may sit on the node itself". The extractor drops it, and `V2_BEHAVIOUR` records the behaviour instead.

**Generated, not transcribed.** `codegen/extractV2Table.ts` reads the published v2 package's `getOperators()`, which carries every operator's name, aliases and parameters with their aliases, and writes this module, which is checked in and listed with `src/version.ts` under "Generated files — do not hand-edit" in CLAUDE.md. A test extracts afresh and compares the result with the checked-in module's data, key order included, so `pnpm test` fails when they differ. It compares data rather than text because Prettier cannot run inside Jest, and `pnpm format:check` covers the text. Copying 95 names and 69 aliases by hand is exactly where a typo would hide, and the source is already data. The package's names are v2's alias table exactly, all 95 (measured against `operatorAliases.ts`). The check catches both an edit to the generated file and a v2 release that changes a name or alias. `src/` never imports the package, since only the codegen script, the tests and the differential read it.

### `children.ts`: the positional mappings

The normalizer turns `children`, v2's positional form, into named parameters. v2 did it with a `parseChildren` function per operator, 13 distinct ones. The table restates them as data, with functions only for the five whose shape is irregular:

```ts
export const V2_CHILDREN: Record<V2Operator, ChildrenMapping> = {
  AND: { into: 'values' }, // likewise OR, EQUAL, NOT_EQUAL, PLUS, SUBTRACT, MULTIPLY, DIVIDE, GREATER_THAN, LESS_THAN, COUNT
  CONDITIONAL: { positions: ['condition', 'valueIfTrue', 'valueIfFalse'] },
  REGEX: { positions: ['testString', 'pattern'] },
  SPLIT: { positions: ['value', 'delimiter'], defaults: { delimiter: ' ' } },
  OBJECT_PROPERTIES: { positions: ['property'], ifGiven: 'fallback' }, // the second is the node's fallback
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
  | { positions: string[]; rest?: string; defaults?: Record<string, unknown>; ifGiven?: string }
  | ((children: readonly unknown[], take: TakeChild) => Record<string, unknown>)

type TakeChild = (index: number) => unknown // reads a child into the result
```

`fieldsChildren` is the shape GET, POST and GRAPHQL share: leading positions, then an array of field names, then that many values zipped into an object, then an optional last value for the return property.

A mapping puts each child into its result through `take`, which returns the child by default. Stage 1 passes one that returns a marker, and so learns where each child went, which its source paths need ("Source paths").

**Exactly what v2 set.** A mapping gives the parameters v2's function set, `undefined` ones included. v2 spread them over the node, so a position with no child still overrode the node's own parameter of that name, and the normalizer needs to know it: `{ operator: '?', children: [c, a], valueIfFalse: b }` never read `b`. OBJECT_PROPERTIES is the exception v2 made, setting the fallback only when the child is given, and `ifGiven` records it: with `positions`, a one-child call would override the node's own `fallback`. Where v2's function threw, which MATCH and BUILD_OBJECT did on an odd count and MATCH on a key that is not a string, number or boolean, the mapping pairs what it can and never throws.

**Why data, where it can be.** v2 accepted a _computed_ `children`: a node that evaluates to the array, such as `{ operator: '+', children: { operator: 'getData', property: 'numbers' } }`. An array that exists only at evaluation cannot be split statically. It can only be converted when every child goes into one parameter, when the node becomes `values: <that node>`. `{ into }` says exactly that, so the normalizer converts a computed `children` for the eleven operators that have it, and makes it `non-convertible` for the rest. Written as functions, the same fact would need a separate flag.

A test holds each mapping to its v2 function, the package's `parseChildren` for that operator, which `getOperators()` returns: the same `children` arrays go through both, and the named parameters must match.

### `behaviour.ts`: what v2 did that no data file says

```ts
export const V2_BEHAVIOUR: Partial<Record<V2Operator, V2OperatorBehaviour>> = {
  GET: { evaluatesContents: ['parameters', 'headers'] },
  POST: { evaluatesContents: ['parameters', 'headers'] },
  GRAPHQL: { evaluatesContents: ['variables'] },
  BUILD_OBJECT: { evaluatesContents: ['properties'] },
  MATCH: { evaluatesContents: ['branches'], extraKeys: 'branches' },
  STRING_SUBSTITUTION: { evaluatesContents: ['substitutions'] },
  CUSTOM_FUNCTIONS: { evaluatesContents: ['input'] },
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
  - STRING_SUBSTITUTION evaluates the substitution each named token reads, drilled, in `getReplacement` ([STRING_SUBSTITUTION/operator.ts:111-114](../../v2-src/operators/STRING_SUBSTITUTION/operator.ts#L111-L114)), whatever `evaluateFullObject` says (measured: a node, a shorthand, an alias reference and a drilled value all evaluated). A `$` key in the object is never read, since v2's token pattern has no `$`, so it is data: stage 1 leaves its value as written, and stage 2 moves it into the object's `//`, as a key v2 ignored, since a `$plus` key would make v3 read the object as malformed shorthand. v2 evaluated only the values a token read, and v3 evaluates the whole object, so a failing value no token reads fails the node. That goes to the guide. Ruled at 15.1's fifth chunk.
- **`extraKeys`** tells the normalizer where a node's undeclared keys go. Most operators ignored such keys, and MATCH read branches from the node itself. A call that names a function in `operator` also had its undeclared keys gathered into `input` ([helpers.ts:121](../../v2-src/helpers.ts#L121)), but that is how v2 rewrote the call (stage 1, step 3), not how CUSTOM_FUNCTIONS behaved: its explicit form ignored undeclared keys.

### The name rule

v2's standardization is behaviour, not data, and names are open-ended strings, so the converter implements it itself, in `src/migrate/v2/names.ts`. It camel-cases the name ([helpers.ts:194](../../v2-src/helpers.ts#L194)), and keeps a name that camel-cases to nothing, such as `+` or `?`, as it is ([helpers.ts:35-37](../../v2-src/helpers.ts#L35-L37)). A test holds it to v2's function, the package's `standardiseOperatorName`, over a list of awkward names (symbols, `SCREAMING_CASE`, spaces and hyphens, mixed case, digits, and the empty string), every name in the table, and a seeded sample of generated strings.

## The v2→v3 rules

What each canonical v2 node becomes in v3: the other half of the converter's knowledge, beside the v2 table. They live in `src/migrate/rules.ts`, one entry per v2 operator.

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
  | { dropped: MigrationIssueTag; message: string } // no v3 counterpart: removed, with an issue
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
  build: ordering('greaterThanOrEqual'),
},

POST: {
  to: 'http',
  add: { method: 'post' },
  params: { url: 'url', parameters: 'body', headers: 'headers', returnProperty: 'returnPath' },
  build: httpRequest,
},

OBJECT_PROPERTIES: {
  to: 'get',
  params: { property: 'path', additionalData: { to: 'from', value: mergedWithData } },
  build: preferReference,
},

PASSTHRU: { params: { value: 'consumed' }, build: ({ v2 }) => v2.value },
```

**A computed or unrecognized deciding value.** When the parameter a `build` chooses by is a node rather than a literal (GREATER_THAN's `strict` computed at runtime), or a literal v2 did not accept (DIVIDE's `output: 'nope'`, a v2 type error), the rule takes its default target and emits a `non-convertible` issue. Writing an `if` that picks between the two nodes at runtime would be lossless, but nobody writes such an expression in practice, and the `if` would duplicate the node's parameters.

The `{ to, value }` fate is for a parameter whose values v3 spells differently, such as `additionalData`, `properties` and `branches` in batch 3.

### Checks

The shape is chosen so that every rule, including the ones with a `build`, can be checked without examples:

- **Every v2 parameter has a fate.** A test holds each rule's `params` keys to that operator's parameters in the generated table, so a forgotten parameter fails. `useCache` is left out: v2 lists it as a parameter on five operators, but it is a modifier in both versions.
- **Every target exists in v3.** The converter cannot import the engine, but its tests can. A test checks every `to`, and every parameter a fate renames to, against `getOperators()` on the core and I/O operators. When a v3 operator renames a parameter, the rules fail this check rather than silently writing an invalid node.
- **Every `build`'s output validates.** Each rule's examples are converted and validated against a v3 instance, which checks every node a `build` writes, targets included.

### v3's operator names

The converter needs v3's operator names in two places: a v2 function whose name a core operator already uses must be registered under another ("Batch 5"), and so must a fragment ("Fragments"). `src/migrate/v3Names.generated.ts` maps each name and alias of the core and I/O operators to its operator's name. It is generated from their definitions by the same script as the v2 table, and the same test holds it to a fresh extraction. Nothing at runtime imports the engine.

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
- **`returnPath` on `http` and `graphQL`** cannot be checked, since a response's shape is not known until the request runs. Every converted `http` and `graphQL` node already carries the `response-collapse` issue, and its message covers projection too ("Batch 4").
- **The differential measures it.** If the v2 tests show projection is common, the converter could take sample data and insert `[*]` itself. Not before.

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
  params: { value: 'value', delimiter: { to: 'delimiter', value: unescapedDelimiter }, trimWhiteSpace: 'trim', excludeTrailing: 'consumed' },
  build: trailingEmptyIssue,
},
```

**AND, OR, MULTIPLY, CONDITIONAL, REGEX, COUNT: renames and nothing else.** v3 truthiness is v2's in practice: its falsy set is `false`, `null`, `0` and `""`, and v3 has no `undefined` or `NaN` values. REGEX is exact parity, since v3's defaults (`mode: 'test'`, `flags: ''`) are what v2 always did. Where v3 differs, it is more lenient where v2 failed: `else` may be omitted (v2 required it), `length` counts strings (v2 took arrays only), a null operand propagates where v2 raised a type error, and `and` / `or` ignore a failure that does not decide the answer. The one result v2 produced that v3 does not is `{ operator: '*', values: [] }`, which is `0` in v2 and `1` (the empty product) in v3, and which `validate()` already warns about.

**EQUAL, NOT_EQUAL.** A node's own `caseInsensitive` carries over. v2's instance-wide `caseInsensitive` option applied to every node that did not set one, and v3's counterpart is `operatorDefaults` ("v2 disposition" for `equal`), which lives in the host's options rather than the expression. So when `V2Options.caseInsensitive` is `true`, `instanceCaseInsensitiveIssue` puts a `lossy-default` issue on each converted node that does not set its own: the node compares case-sensitively until the host adds `operatorDefaults: { equal: { caseInsensitive: true }, notEqual: { caseInsensitive: true } }` or the node sets `caseInsensitive: true` itself. `nullEqualsUndefined` is omitted: v3 has no `undefined` for it to equate. v2 folded case only when every value was a string, and v3 folds each string value. No input gives a different answer, since a string never equals a non-string either way. Up to 2.23.1, v2's NOT_EQUAL with `nullEqualsUndefined: true` returned `false` whenever the first value was null ([NOT_EQUAL/operator.ts:39](../../v2-src/operators/NOT_EQUAL/operator.ts#L39), `value === null && value === undefined`). 2.23.2 fixed it, and v3 answers as 2.23.2 does.

**GREATER_THAN, LESS_THAN.** `ordering(orEqual)` picks the operator from `strict`. v2 type-checked `strict` as a boolean, so only `true` and `false` ever evaluated (measured: `0`, `''`, `null`, `1` and `'yes'` all fail v2's type check):

- `false` gives the `…OrEqual` operator;
- `true`, or no `strict` at all, gives the strict operator, since v2's default was `true` ([GREATER_THAN/operator.ts:9](../../v2-src/operators/GREATER_THAN/operator.ts#L9));
- any other literal, or a computed `strict`, is the deciding-value case: the strict operator, and a `non-convertible` issue.

v3 compares exactly two values, and v2 compared the first two and ignored any others. A literal `values` longer than two is cut to its first two, with a `lossy-default` issue naming what was removed. A computed one fails at runtime in v3 and is the guide's. Two differences depend on the data and go to the guide: mixed types (v2 coerced, so `5 > '3'` was `true`; v3 raises a type error), and null operands (v2 coerced null to `0`, so `null < 1` was `true`; v3 propagates null).

**SPLIT.** `trimWhiteSpace` becomes `trim`, with the same default (`true`). `excludeTrailing` dies with no successor, and the converter does not wrap ("v2 disposition" for `split`). v2 dropped one trailing empty piece by default, so `'a,b,'` split to `['a', 'b']` and `''` to `[]`; v3 keeps them, giving `['a', 'b', '']` and `['']`. Whether an input ends in the delimiter or is empty depends on the data, and no v3 check can find it later. So `trailingEmptyIssue` puts an `intentional-semantic-change` issue on every converted `split` except one whose `excludeTrailing` was a literal `false`, where v2 already kept the empties. The issue gives the recipe: `filter` the result where empty pieces must go.

2.23.2 also turned `\n`, `\t` and `\r` typed as text in a delimiter into the characters they name, since an editor's single-line field cannot hold a real newline, and v3 splits on the text as written (measured). `unescapedDelimiter` makes the same change to a literal delimiter, so `'\\n'` is written as `'\n'`. A computed delimiter that yields such text depends on the data, and nothing in v3 finds it later, so a computed delimiter gets an `intentional-semantic-change` issue.

**Measured differences on converted nodes**, beyond the renames:

| v2 node                                                                           | v2                        | converted, in v3                         | Disposition                         |
| --------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------- | ----------------------------------- |
| `{ operator: '*', values: [] }`                                                   | `0`                       | `1`                                      | `validate()` warns; guide           |
| `{ operator: '>', values: [5, '3'] }`                                             | `true`                    | type error                               | guide: no implicit coercion         |
| `{ operator: '<', values: [null, 1] }`                                            | `true`                    | `null`                                   | guide: the null policy              |
| `{ operator: '>', values: [5, 3, 100] }`                                          | `true`                    | `true`, cut to `[5, 3]`                  | `lossy-default` issue               |
| `{ operator: '=', values: ['A', 'a'] }`, with v2's `caseInsensitive: true` option | `true`                    | `false`, until `operatorDefaults` is set | `lossy-default` issue               |
| `{ operator: '!=', values: [null, 5], nullEqualsUndefined: true }`                | `false`; `true` in 2.23.2 | `true`                                   | none: the bug is fixed in 2.23.2    |
| `{ operator: 'split', value: 'a,b,', delimiter: ',' }`                            | `['a', 'b']`              | `['a', 'b', '']`                         | `intentional-semantic-change` issue |
| `{ operator: 'split', value: '', delimiter: ',' }`                                | `[]`                      | `['']`                                   | the same issue                      |

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

- a literal `values` array: its first element becomes `value` and its second the infix parameter. Elements past the second are cut with a `lossy-default` issue, as for GREATER_THAN;
- a computed `values`: bound with `vars` and indexed, so it is still evaluated once: `{ operator: 'subtract', value: '$vars.values[0]', minus: '$vars.values[1]', vars: { values: <node> } }`. The var takes a name the node does not already use. A reference is indexed as it is, `'$vars.a[0]'`, with no var of its own (ruled at 15.1's fifth chunk);
- no `values`: the named pair, renamed.

Beside a `values`, the named pair is dropped with an `overridden-value` issue, since v2 never read it (ruled at 15.1's fifth chunk).

`divideOutput` then applies DIVIDE's `output`:

| v2 `output`                  | Becomes                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| absent, or `'decimal'`       | `divide`: v2's default was already true division, and 2.23.2 named it `'decimal'`    |
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
5. **`numberMapping`** dies (the ruling), and each mapped token gets a `non-convertible` issue giving the ruling's recipe, a `match` or `if` in the substitution. The token then renders the bare number. v2 read `numberMapping` in named mode only, so in positional mode it goes with no issue, and a computed one gets a single issue at `numberMapping`.
6. **Escapes and token-shaped text.** v3 has no escape sequences, and delivers literal token text through a substitution instead (the ruling). 2.23.2 un-escaped every `\%` (or `\$`) in positional mode and every `\{{` in named mode, whatever followed, so each is read in its own mode only. Where the text v2 rendered is text in v3 too (`'100\% off'`, or a `\{{` that forms no token), the backslash goes, with no issue. An escaped token, whose text v3 would read as a token, and a `$`-mode template already holding `%N` text get a `non-convertible` issue. A computed template under `substitutionCharacter: '$'`, or a computed `substitutionCharacter`, is `non-convertible` too: v3 has no `$` tokens to leave in place. `substitutionCharacter` meant nothing in named mode (measured), so it is read in positional mode only (ruled at 15.1's fifth chunk).

Three renderings still differ, and go to the guide:

- a token with no substitution was `''` in v2 and renders its own text in v3, which `validate()` warns about on a literal template;
- arrays and objects were `'1,2'` and `'[object Object]'`, and v3 renders a placeholder;
- a malformed token such as `{{ name }}` swallowed its whole fragment in v2 and renders literally in v3.

v2 also evaluated a value it read from `data` as an expression, and v3 never does. That is the injection path closed by rule 4 of "Reference grammar" in [v3-api.md](v3-api.md), and it goes to the guide too.

**BUILD_OBJECT.** `properties` → `entries`, and `literalEntries` rewrites a literal array. An alternating one (any element a literal non-object) is paired into `{ key, value }` objects, as v2 paired it. An element missing its `key` or `value`, which v2 dropped silently, is dropped with a `lossy-default` issue naming it. A computed `properties` carries over, and its alternating or malformed shapes fail loudly in v3 at runtime, which is the guide's. The rulings are "v2 disposition" for `buildObject` in [v3-operator-parameters-2.md](v3-operator-parameters-2.md).

**MATCH.** `matchExpression` → `value`, and `pairsToObject` turns a literal array of alternating keys and values into the object v3 takes. `fallbackBranchToDefault` moves a `fallback` key inside `branches` to the `default` parameter (the rulings, "v2 disposition" for `match`). Branches written on the node itself are moved into `branches` by the normalizer (`extraKeys`), with v2's precedence:

- a key already in `branches` wins over the node's own;
- when `branches` holds a `fallback`, v2 answered with it before looking at the node's keys at all, so those keys were unreachable and are dropped, with a `lossy-default` issue.

A computed `branches` carries over as v3's dynamic mode. v2 evaluated the matched value it extracted, and treated a `fallback` key in the computed object as the default; v3 does neither. Whether that matters depends on the object computed, and nothing in v3 finds it later, so a computed `branches` gets an `intentional-semantic-change` issue.

Branches on the node beside a computed `branches` were reached when the computed object held neither the key nor a `fallback`, and only the one that matched was evaluated (measured: a failing branch it did not pick never ran). So they become a second `match` in `default`, which keeps both the order and the laziness: `{ operator: 'match', value: V, branches: <computed>, default: { operator: 'match', value: V, branches: { …the node's branches } } }`. A `V` that is a node is bound once in `vars`, and a reference is read twice. The computed `fallback` key is the `computed-branches` issue's to explain (ruled at 15.1's fifth chunk). A MATCH with no branches at all, which could only fail in v2, gets `branches: {}`, which v3 requires, so it fails at evaluation in v3 too, where its `fallback` catches it.

**PASSTHRU** becomes its value, never `literal`: v2 evaluated it ("v2 disposition" for `literal`). The modifiers it carried attach to that value, and where the value is a constant or a reference, "Rules that cut across operators" decides. PASSTHRU's own `useCache` is dropped, since v2 ignored it, and carrying it onto an `http` value would change that request's caching (ruled at 15.1's fifth chunk).

**Measured differences on converted nodes**, beyond the renames:

| v2 node                                                                       | v2                           | converted, in v3 | Disposition                   |
| ----------------------------------------------------------------------------- | ---------------------------- | ---------------- | ----------------------------- |
| `{ operator: 'getData', property: 'user.nope' }`                              | error                        | `null`           | none: v3 is more lenient      |
| `{ operator: 'stringSubstitution', string: '%1 %2', substitutions: ['a'] }`   | `'a '`                       | `'a %2'`         | `validate()` warns; guide     |
| `{ operator: 'stringSubstitution', string: '[%1]', substitutions: [null] }`   | `'[null]'`; `'[]'` in 2.23.2 | `'[]'`           | none: 2.23.2 renders `''` too |
| `numberMapping: { count: { 1: 'one friend', other: '{} friends' } }`, count 2 | `'You have 2 friends'`       | `'You have 2'`   | `non-convertible` issue       |

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

**The collapse, on GET, POST and GRAPHQL.** v2 passed every response through `extractAndSimplify` ([operatorUtils.ts](../../v2-src/operators/operatorUtils.ts)): each element of an array result, and a `returnProperty` result that was an object, was reduced to its value when it had exactly one key. So a GraphQL query for `{ countries { name } }` with `returnNode: 'countries'` returned `['NZ', 'AU']`, and v3 returns `[{ name: 'NZ' }, { name: 'AU' }]`. v3 dropped the collapse ("v2 disposition" for `http`), and whether it fired depends on the response, which nothing in v3 can check. It is also the likeliest silent difference in this batch, since querying a single field is everyday GraphQL. So `httpRequest` and `graphQLRequest` put an `intentional-semantic-change` issue on every converted node, giving the fix: v3's projection segment says what v2 inferred, so `returnPath: 'countries[*].name'` returns the names. The same message covers a `returnPath` that crosses an array, which v2 projected silently ("Paths").

**GET, POST.** `httpRequest` also does the following:

- **A literal `url` object.** v2 accepted `url: { url, headers }`. It is split into `url`, and `headers` merged beneath the node's own, which won in v2 ([GET/operator.ts](../../v2-src/operators/GET/operator.ts)). With computed `headers`, the two merge with `plus`. A computed `url` that yields an object fails at runtime in v3, which is the guide's.
- **POST with no `parameters`** gets `body: {}`, since v2 always sent a JSON body and v3 sends none when `body` is absent.
- **POST's cache default.** A converted POST without its own `useCache` gets `useCache: false`, unless `V2Options.useCache` is `true`. v2 left POST uncached by default, where v3's `http` caches.

**GRAPHQL.** `graphQLRequest` drops a `url` of `''` or v2's placeholder `'graphQLEndpoint'` (any case), which both meant "the configured endpoint" in v2, as an omitted `url` does in v3. It splits a `url` object as `httpRequest` does. v2 joined a relative `url` to the GraphQL endpoint option, and v3 joins it to `http.baseEndpoint`, so a literal relative `url` gets an `intentional-semantic-change` issue. v2 also returned `data` even when the response carried `errors`, and v3 fails the node instead, which is a ruled change (row 30 of the gradient register, [v3-cases-for-review.md](v3-cases-for-review.md)) and the guide's.

**SQL.** `sqlShape` maps `single` and `flatten` to `shape` as ruled: neither gives `'rows'` (the default, so omitted), `single` gives `'firstRow'`, `flatten` gives `'column'`, and both give `'firstValue'`. A computed `single` or `flatten` is a deciding value: `'rows'`, and a `non-convertible` issue. v2 also read the node's `type` as `flatten` when it was `'array'`, `'string'` or `'number'` ([SQL/operator.ts](../../v2-src/operators/SQL/operator.ts), a compatibility rider for v2.15 and earlier). The normalizer makes that explicit, setting `flatten: true` beside the node's `outputType`, which is its own or else the one the same `type` becomes. v2 evaluates that identically. A computed `type` cannot be made explicit, since v2 read the value it computed both as the rider and as the output type, so the normalizer leaves it as written, and it is a deciding value like a computed `single` or `flatten` (ruled at 15.1's third chunk). The converter writes v2's default for a node with no `type`, which is neither the rider nor a conversion: `shape: 'rows'` and no `convert`, with one issue. A node's own `outputType` wraps it as usual, and beside `flatten: true` the rider decides nothing (ruled at 15.1's fifth chunk). v2's `flatten` over a multi-column result gave arrays of values, which v3's `'column'` rejects at runtime. That is the ruling's loud migration line, and the guide's.

**Measured differences on converted nodes**, beyond the renames:

| v2 node, and response                                                 | v2                                            | converted, in v3                             | Disposition                                                                |
| --------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| GET, response `[{ name: 'x' }, { name: 'y' }]`                        | `['x', 'y']`                                  | `[{ name: 'x' }, { name: 'y' }]`             | `intentional-semantic-change` issue                                        |
| GET with `returnProperty: 'a'`, response `{ a: { only: 5 } }`         | `5`                                           | `{ only: 5 }`                                | the same issue                                                             |
| GRAPHQL with `returnNode: 'countries'`, response a list of `{ name }` | `['NZ', 'AU']`                                | the list of objects                          | the same issue                                                             |
| GRAPHQL with `url: 'v2/graphql'`                                      | posts to the GraphQL endpoint + `/v2/graphql` | posts to `http.baseEndpoint` + `/v2/graphql` | `intentional-semantic-change` issue                                        |
| GRAPHQL, response with `errors`                                       | the `data`                                    | failure                                      | guide: ruled                                                               |
| GET with `returnProperty: 'zz'`, missing                              | error                                         | `null`                                       | none, unless a `fallback` caught it ("Fallbacks that caught missing data") |
| SQL with `flatten: true`, two columns                                 | `[[1, 2]]`                                    | type error                                   | guide: ruled                                                               |

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

Each form normalizes to the explicit one. A call that names the function in `operator` has its undeclared keys put into `input`, unless it has an `input` already, as `replaceCustomOperator` did ([helpers.ts:121](../../v2-src/helpers.ts#L121)). The explicit form's undeclared keys were ignored, and go to `//` ("Keys v2 ignored").

**What `functionCall` writes.** v2 called the function as `f(input, ...args)`, with `input` first when present ([CUSTOM_FUNCTIONS/operator.ts:34-37](../../v2-src/operators/CUSTOM_FUNCTIONS/operator.ts#L34-L37)).

| v2 call               | Becomes                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| `args` only, literal  | `{ $name: [...args] }`                                                        |
| `args` only, computed | `{ $name: <the args node> }`                                                  |
| neither               | `{ $name: [] }`                                                               |
| with `input`          | `{ operator: 'name', input: <input>, args: [...] }`, `args` only when present |

A call with positional arguments is the one place the converter writes shorthand (the exception under "What the converter writes"). The shorthand array binds by whatever positional parameters the host's operator declares. That covers the recipe's single `...args` parameter, and an operator declared with positional parameters of its own. A computed `args` becomes the whole-array payload, which fills a rest parameter (the rest-position rule, "Positional mapping: `positionalParams`" in [v3-operator-parameters.md](v3-operator-parameters.md)). A call with `input` has no positional reading, since v2 passed `input` as one object, so it names `input` (and `args`), and the host's operator declares them. The node's modifiers stay beside the call as sibling keys, which the shorthand form allows.

**Names.** A literal `functionName` becomes the operator's name. v2 also found functions by a dotted path into `functions` (`utils.format`); v3's name rule rejects a dot ("Name legality, not name style" in [v3-api.md](v3-api.md)), so such a name keeps its text and the call-site issue says it must be renamed. A computed `functionName` has no v3 spelling, since operator names are literal, and becomes a placeholder with a `non-convertible` issue ("Placeholders").

**Measured**, with the v2 functions registered as v3 operators the recipe's way (`args`) and, for `input`, with `input` and `args` declared: every form gives the same result in both. That covers the explicit node, `children`, an `operator` naming the function, shorthand arrays and single values, `$data` arguments, a computed `args`, `input` alone and with `args`, a shorthand object, and undeclared keys gathered into `input`. A call on a function the host has not registered fails `validate()` in v3 (`unknown-operator`), where v2 failed at runtime and a `fallback` caught it. The call-site issue covers it.

## Rules that cut across operators

What happens around every rule, whatever the operator. Measured like the batches: each v2 example through `/v2-src`, and converted through v3 (September 2026).

### The modifiers

Stage 2 attaches the canonical v2 node's modifiers to the rule's result:

- **`fallback`** is converted like any value and carried.
- **`useCache`** is carried when it is a literal boolean, v2's I/O parameter of the same name included. v3 takes nothing else ("Reserved-key values" in [v3-api.md](v3-api.md)). On the five operators v2 cached (GET, POST, GRAPHQL, SQL and CUSTOM_FUNCTIONS), any other value is a deciding value ("The rule shape"): the converter writes v2's default, which is `V2Options.useCache`, or else `true`, or `false` for POST and custom functions, with a `deciding-value` issue. Every other operator ignored `useCache` in v2, and one that is not a boolean is dropped with no issue (ruled at 15.1's fourth chunk).
- **`outputType`** (and `type`, where it is not a declared parameter) wraps the result: `{ operator: 'convert', value: <result>, to: <outputType> }`, with `'bool'` spelled `'boolean'`. A computed `outputType` becomes a computed `to`, which is legal, since `to` is an ordinary parameter ("v2 disposition" for `convert` in [v3-operator-parameters-2.md](v3-operator-parameters-2.md)).
- **Alias definitions** become `vars` (below).

**With a `convert` wrapper**, `fallback` and `vars` go on the wrapper and `useCache` stays on the node that does the work. v2 never converted a fallback's result, and a failure in either the node or the conversion reached it ([evaluate.ts:196-227](../../v2-src/evaluate.ts#L196-L227)), which a fallback on the wrapper reproduces. v2 also evaluated a fallback where the node's aliases were visible, and v3's fallback sees its own node's `vars` (measured), so `vars` go on the outermost node.

**Every converted `outputType` gets an `intentional-semantic-change` issue**, as "What emits an issue" in [v3-migration.md](v3-migration.md) has it: v3's `convert` is strict, where v2 guessed. The issue names what differs for its type:

| v2 `outputType`, value  | v2       | converted, in v3                                             |
| ----------------------- | -------- | ------------------------------------------------------------ |
| `'number'`, `'abc4.5x'` | `4.5`    | failure: `regex` `extract` then `convert` is the replacement |
| `'number'`, `'abc'`     | `0`      | failure                                                      |
| `'number'`, `null`      | `0`      | `null`                                                       |
| `'string'`, `null`      | `'null'` | `null`                                                       |
| `'array'`, `null`       | `[null]` | `null`                                                       |
| `'string'`, `[1, 2]`    | `'1,2'`  | failure: `join` or `buildString` render it                   |
| `'boolean'`, `'false'`  | `true`   | `false`                                                      |

Numbers, numeric strings, `'boolean'` over `0`, `'array'` over a scalar, a fallback over a failed node, and a computed `outputType` give the same answer in both.

One interaction with batch 3: OBJECT_PROPERTIES turns its `fallback` into `missingPathDefault`, which the `convert` then converts, where v2 returned it as it was. A literal fallback already of the target type converts to itself; any other gets a `lossy-default` issue (measured: `fallback: 'N/A'` with `outputType: 'number'` was `'N/A'` in v2 and fails in v3).

**A result that is not a node.** A rule can return a constant or a reference (PASSTHRU, an OBJECT_PROPERTIES read), and neither can carry modifiers:

- **a `$data` reference** with a `fallback` becomes the equivalent `get`, with the fallback as `missingPathDefault`: batch 3's pairing, since in v2 that fallback caught the missing path;
- **any other reference, or a constant**, drops `fallback` and `useCache`, since it cannot fail and there is nothing to cache. A reference to one of the node's own vars is replaced by that var's value, since the result is that value;
- **an object literal** holding nodes takes `vars`, which v3 allows on a plain object literal, and `outputType` through the wrapper. A `fallback` would be data as a key of a plain object, so an object with one becomes a `buildObject` with an entry per key, which carries it (measured).
- **an array literal** can carry neither `vars` nor `fallback`, so an array with either goes inside a `convert`. That is the `outputType` wrapper where there is one, and otherwise `{ operator: 'convert', value: <the array>, to: 'array' }`, which returns the array unchanged and carries both (measured).
- **a node with a `fallback` of its own**, such as a PASSTHRU over a node that sets one. v2's outer fallback answered only when the inner one failed too, since v2 evaluated a fallback outside the node's `try` (measured: `'inner'` over a failing node, `'outer'` when its fallback failed as well). So the outer `fallback` goes at the end of the inner one's chain, as the `fallback` of its last node, and where the chain ends in a constant, which cannot fail, it is dropped. Its `vars` join the node's, the outer first, since no var shadows another, and its `//` joins the node's, the inner first (ruled at 15.1's fifth chunk).

### Aliases → `vars`

- **Definitions.** `$name` keys on an operator node become `vars: { name: … }` on the node's result. With `evaluateFullObject` on, `$` keys on a plain object are definitions too ([evaluate.ts:281](../../v2-src/evaluate.ts#L281)), and v3 takes `vars` on a plain object literal. So are the `$` keys of an object an operator evaluated itself through `evaluateObject` (GET and POST `parameters` and `headers`, GRAPHQL `variables`, CUSTOM_FUNCTIONS `input`), whatever `evaluateFullObject` said (measured: `parameters: { $n: 5, a: '$n' }` sent `{ a: 5 }`), and they become `vars` on that object (ruled at 15.1's fourth chunk). MATCH's `branches` is not one of these: v2 never passed it to `evaluateObject`, and its `$` keys are branch keys. On a fragment call, `$` keys are arguments ("Fragments").
- **References.** A whole-string `"$name"` inside the defining node, its fallback included, becomes `"$vars.name"`. v2 resolved a reference from the definitions on enclosing nodes, and v3's `vars` are lexical in the same way. A `"$name"` with no enclosing definition stays as it is: v2 returned it as text, and v3 reads it as inert text, with a `validate()` warning.
- **Definitions read the enclosing scope.** v2 evaluated a node's definitions before any of them existed, each in the enclosing scope ([evaluate.ts:242-258](../../v2-src/evaluate.ts#L242-L258)), and v3's `vars` see their siblings. So a definition's value converts in the enclosing scope, and a sibling is read only by a whole `'$name'` the enclosing scope cannot resolve, which v2 looked up among the siblings afterwards: `$b: '$a'` becomes `b: '$vars.a'`. A sibling named deeper inside a definition was text to v2, or the enclosing definition of that name, and it converts to the same (measured: with `$a: 1`, `$b: { operator: '+', values: ['$a', 10] }` gave `'$a10'`, or `110` under an enclosing `$a: 100`). Ruled at 15.1's fourth chunk.
- **Names.** The `$` goes. `.`, `[` and `]`, which v3's name rule rejects ("Name legality, not name style" in [v3-api.md](v3-api.md)), become `_`, and a name that then clashes with another on the node, or with a var an enclosing node declares, gets a numeric suffix (`a_2`). v2 matched a reference to its definition by exact string, so the rename changes nothing. No var shadows another, so a definition can reach an enclosing var its own node redefines (`$a: { operator: '+', values: ['$a', 1] }` under an enclosing `$a`), and v3's shadowing warning never fires (ruled at 15.1's fourth chunk).
- **Leaks.** v2 resolved aliases into shared state, mutated in place, so a sibling evaluated later could see a definition that was not its ancestor's, depending on timing ([evaluate.ts:149-155](../../v2-src/evaluate.ts#L149-L155)). v3's `vars` are lexical, and such a reference has no enclosing definition, so it stays as text, which `validate()` warns about. That goes to the guide.
- **Failing definitions.** v2 evaluated a node's alias definitions outside its `try`, so the node's own `fallback` never caught one that failed, and the next one out did (measured: `{ operator: '+', $a: <failing>, values: ['$a', 1], fallback: 'own' }` fails). v3's `fallback` catches a failing var of its own node (measured). It shows only on a failure, and goes to the guide.

Measured the same in both: a definition used in the node and in a child, a chain, a definition whose value is a node, a dotted name, and an unresolved reference.

### The `literal` wrap

v2 did not look inside a plain object unless `evaluateFullObject` was on, and v3 evaluates everything. So a v2 value that v3 would read differently is quoted with `literal`. With the option known, this is a rule, not the heuristic migration's open question 4 feared:

- **With `evaluateFullObject` off**, a plain object that is not itself a v2 node is wrapped when anything inside it is something v3 evaluates or consumes. That means an `operator` or `fragment` key, a `$`-prefixed key, a `vars` or `//` key, or a string v3 reads as a reference. The outermost such object is wrapped, and nothing inside it is converted. An object with none of these is left alone, since it evaluates to itself in both. The rule applies wherever v2 evaluated a value only as a whole: everywhere except inside the parameters in `evaluatesContents`, whose objects' values v2 evaluated, and to which the rule then applies in turn.
- **With `evaluateFullObject` on**, plain objects are walked and converted like any node's parameters. One that holds a `vars` or `//` key as data cannot be both walked and quoted, so it becomes a `buildObject` with an entry per key, since an entry's key is data (measured: `vars` and `//` entries come out as keys of the result).
- **A string v3 reads as a reference** (`$data`, `$vars`, `$params`, `$element`, `$index` or a one-letter alias, alone or drilled) is wrapped wherever v2 read it as text: `{ operator: 'literal', value: '$data.x' }`. v2 had no references, so any such string was text there, and a converted alias reference is not one.

Measured the same in both: a node inside a PASSTHRU's object and at the root, with the option off and on, an object with nothing to quote, `'$data.x'` and `'$d'` as text, a `vars` key in data, and shorthand inside a plain object and as a parameter.

### Keys v2 ignored

An operator node's undeclared keys, meaning anything that is not a parameter, a property alias, a modifier or an alias definition of its v2 operator, go into a `//` comment object on the result: `{ operator: '+', values: [1, 2], comment: 'adds' }` becomes `{ '//': { comment: 'adds' }, operator: 'plus', values: [1, 2] }`. v2 ignored them, and v3 strips `//` everywhere, so nothing changes and no issue is raised. An author's own `//` key is the comment itself, not one of those keys: `{ operator: '+', values: [1, 2], '//': 'adds' }` becomes `{ '//': 'adds', operator: 'plus', values: [1, 2] }` (ruled at 15.1's fourth chunk). MATCH is the exception, since it read such keys as branches (`extraKeys`), and so is a call naming a function in `operator`, whose keys went into `input` (stage 1, step 3).

### Fallbacks that caught missing data

v2 failed on a missing path, since OBJECT_PROPERTIES threw ([OBJECT_PROPERTIES/operator.ts:16](../../v2-src/operators/OBJECT_PROPERTIES/operator.ts#L16)), and v3 reads `null`. So a v2 `fallback` placed above a read, to answer when the data was missing, no longer fires: the node computes on with `null`.

| v2 node                                                                                                           | v2           | converted, in v3 | v3 with `strictDataPaths: true` |
| ----------------------------------------------------------------------------------------------------------------- | ------------ | ---------------- | ------------------------------- |
| `{ operator: '+', values: [<getData 'missing'>, 1], fallback: 0 }`                                                | `0`          | `null`           | `0`                             |
| `{ operator: 'stringSubstitution', string: 'Hi %1', substitutions: [<getData 'missing'>], fallback: 'Hi there' }` | `'Hi there'` | `'Hi '`          | `'Hi there'`                    |

That depends on the data, and nothing in v3 finds it later. So each `fallback` with a converted read beneath it that has no default of its own gets an `intentional-semantic-change` issue: the innermost such fallback, since that is the one that caught the failure in v2. A read in a node's own `fallback` or alias definitions is beneath the next fallback out, since v2 evaluated both outside the node's `try`. The issue gives both fixes: the host's `strictDataPaths: true`, which restores v2's behaviour everywhere, or a default at the read (`missingPathDefault`, `firstOf`). The guide recommends `strictDataPaths` to hosts whose configs lean on the pattern.

A read here includes an `http` or `graphQL` node's `returnPath`: v2 failed when a response lacked it, and v3 returns `null` ("Batch 4"). `strictDataPaths` deliberately does not reach a response, which is operator output rather than a reference namespace ([ioHelpers.ts:175](../../src/operators/ioHelpers.ts#L175)). So for these, the issue gives `firstOf`, or reading the path with a `get` and its `missingPathDefault` around the request.

### Computed `children`

A computed `children` converts for the eleven operators whose mapping is `{ into }`, as `children.ts` says, and is `non-convertible` for the rest.

## Fragments

v2's fragments were bodies with `$name` placeholders, which a call's arguments filled by being spread over the body as alias definitions ([evaluate.ts:75-117](../../v2-src/evaluate.ts#L75-L117)). v3's are definitions with declared parameters, read through `$params.…` ("Fragments" in [v3-api.md](v3-api.md), whose v2 disposition table this section follows). `migrateV2Fragments` converts the definitions, and `migrateV2Expression` converts the calls, reading the definitions from `V2Options.fragments`. Measured like the batches, against definitions converted by these rules.

### Definitions

Each v2 fragment `name: body` becomes `{ expression, parameters?, description?, metadata? }`:

- **The wrapper.** `metadata` comes off an operator-node body. `metadata.description` becomes `description`, `metadata.parameters` becomes `parameters`, and `textColor`, `backgroundColor` and any other key go into the definition's `metadata` bag.
- **Declared parameters**, from `metadata.parameters`, keyed by name without the `$`, and renamed where v3 cannot register the name (below):
  - `type`, `description` and `default` carry over. v2's type names are v3's, apart from `'undefined'`, which is dropped from a union. An unknown type becomes `'any'`, with a `lossy-default` issue.
  - v3 rejects `required` beside a `default`, since the default could never apply (measured). v2 applied the default whenever the argument was missing ([evaluate.ts:81-92](../../v2-src/evaluate.ts#L81-L92)), so a parameter with a default is written optional.
  - A parameter declared required with no default stays required. v2 never enforced `required`: a call that omitted it got the placeholder's own text, `'$name'`. v3 reports `missing-required` instead, and that goes to the guide.
- **Inferred parameters.** v2 did not require declarations: any `"$name"` string in an operator body that no alias definition inside the body resolves was a placeholder a caller could fill (`adder: { operator: '+', values: '$values' }`, with no metadata). Each gets `{ type: 'any', required: false }`, the `required: false` being explicit because v3's default is `true`.
- **A top-level `$name` key on the body** was a default. v2 spread a call's arguments over the body ([evaluate.ts:115](../../v2-src/evaluate.ts#L115)), so a caller's `$name` replaced the body's. It becomes a parameter with that `default`.
- **The body** converts as an expression, with one difference: its placeholders become `$params.name`. Alias definitions below the top level become `vars` as usual.
- **A body that is not an operator node**, such as a constant, a string, a plain object or a fragment call, v2 returned as it was ([evaluate.ts:113-114](../../v2-src/evaluate.ts#L113-L114)). It applied no arguments and did not walk the body, whatever `evaluateFullObject` said. So the body becomes `expression` as data: no parameters are inferred, `$name` text stays text, and the `literal` wrap applies as it does with `evaluateFullObject` off. A shorthand body is an operator node, since v2 expanded it first ([evaluate.ts:100](../../v2-src/evaluate.ts#L100)).
- **A null definition**, which v2 allowed ([types.ts:117](../../v2-src/types.ts#L117)), becomes `{ expression: null }`.

**Names v3 cannot register.** v3's registration stops at the first name it rejects, so one bad name would block every fragment (measured). The converter renames the names it can foresee being rejected, rather than leave them to fail:

- a fragment name containing `.`, `[` or `]`, starting with `$`, or equal to a reserved node key;
- a fragment name equal to a core or I/O operator's name or alias (`round`, `+`, `http`), or to a function's in `V2Options.functions`, which becomes an operator of that name (batch 5);
- a parameter name containing `.`, `[` or `]`, or equal to a reserved node key (`fallback`, `vars`, `operator`).

The rename is the vars rule: `.`, `[` and `]` become `_` and a leading `$` goes. A name that still clashes, with a reserved key, an operator or another name, gets a numeric suffix (`round_2`), assigned in sorted order so the same fragments always get the same names. `migrateV2Expression` derives the same renames from `V2Options.fragments`, so calls and their arguments follow. The host sees the new names, in `getFragments()` and its editor, so each rename gets a `lossy-default` issue.

**The result holds every fragment**, keyed as in the input unless renamed, and none is left out. Two failures cannot be foreseen: a collision with one of the host's own v3 operators, and a cycle, since v2 had no recursion guard and v3 rejects one. Registering the result reports both.

### Calls

- **Recognition** follows v2. Any object with a `fragment` key is a call, and so is a `$name` key whose name is in `V2Options.fragments` and is not a v2 operator's.
- **The output** is canonical: `{ fragment: 'name', parameters: { … } }`.
- **Arguments.** An argument is a key of `parameters`, or a `$` key on the call node itself. v2 spread the call node beneath the body and `parameters` over it, so `parameters` wins where both name one argument, and a body's own top-level `$name` beats a call-node argument but not a `parameters` one (measured: `11` against `3`). Where `V2Options.fragments` holds the definition, a call-node argument the body's top level also defines is therefore dropped, with a `lossy-default` issue. Each argument is named without its `$`.
- **An unprefixed key in `parameters`** replaced the body's own parameter of that name in v2, through the same spread. It becomes the argument of that name when the definition has one. That covers the usual case, a placeholder named after the parameter it fills, which measures the same. Otherwise it is `non-convertible`.
- **An argument the definition does not have**, when `V2Options.fragments` holds the definition, is dropped with a `lossy-default` issue: v2 ignored it, and v3 rejects it as a grammar error.
- **Names the body read from its caller.** v2 evaluated a body with the caller's aliases in scope, so an alias defined above the call filled a placeholder the call left empty (measured: `{ operator: '+', $n: 5, values: [{ fragment: 'g' }, 100] }` is `106`, with `g` reading `$n`). That includes the parameters of an enclosing fragment body, since they were aliases too. v3's scopes are lexical, and a body sees only its own parameters. So where `V2Options.fragments` holds the definition, a parameter the call does not supply, which has no default and whose name the call's scope defines, gets that name as its argument: `parameters: { n: '$vars.n' }`, or `'$params.n'` inside a body. It reads the value v2 read (measured the same, for both).
- **A computed `parameters`** becomes v3's dynamic-arguments mode. The object it computes had `$`-prefixed keys in v2, and v3 matches keys to parameter names without the `$`, so the object no longer supplies anything (measured). It is `non-convertible`: the computing expression must produce plain names.
- **A computed name** has no v3 spelling, since v2 evaluated `fragment` ([evaluate.ts:96-99](../../v2-src/evaluate.ts#L96-L99)) and v3's names are literal. It becomes a placeholder, with a `non-convertible` issue.
- **Modifiers.**
  - `fallback` stays on the call.
  - `outputType` wraps the call in `convert`, unless the body has its own `outputType`. v2 preferred the body's, since the body spread over the call, and the converted definition already applies it.
  - `useCache` cannot sit on a v3 fragment call. v2 spread it onto the body's node, so it is dropped, with a `lossy-default` issue, and the body's own `useCache` stands.
  - Any other key on the call node supplied a body parameter through the spread, and is `non-convertible`.

**Measured the same in both:** arguments in `parameters` and on the call node, a declared default, the shorthand call, an inferred parameter, a node as an argument, a non-operator body, a body-level alias as a default and as overridden, a fragment called inside a body, a fallback on the call, an unprefixed argument, an argument the definition does not have, and `'$name'` inside a string body. The computed `parameters` is the one difference: `3` in v2, and a type error in v3, where the `$values` key fills nothing.

## The two stages in detail

### Stage 1: normalize

Stage 1 rewrites the input into canonical v2, the one shape the rules are written against. It evaluates nothing and needs no data.

**Canonical v2** is a v2 expression in which:

- every operator node names its v2 operator by the table's canonical name (`'PLUS'`, `'OBJECT_PROPERTIES'`), which v2 resolves to itself (measured, for all 24);
- parameters go by their names, with no property aliases and no `children`;
- a custom-function call is the explicit `{ operator: 'CUSTOM_FUNCTIONS', functionName, args?, input? }`;
- MATCH's branches are all inside `branches`;
- a fragment call is `{ fragment, parameters }`, with every argument in `parameters` under its `$` name;
- the modifiers are `fallback`, `useCache` and `outputType`, and `type` appears only as PLUS's parameter;
- there is no shorthand.

Alias definitions stay as `$` keys and alias references as `"$name"` strings, since stage 2 turns them into `vars`. Plain data is left as it is.

**Four exceptions** stay as written, since v2 read each in a way no canonical spelling says, and stage 2 rules on them (ruled at 15.1's third chunk):

- **A fragment call's `type`.** The spread made it the body's `type`: PLUS's parameter when the body is PLUS without one, and otherwise the output type, unless the body had its own (measured: `{ fragment: 'plusBody', type: 'string' }` over `{ operator: '+', values: [1, 2] }` is `'12'`, and with `outputType` instead, `3`). Stage 2's rule for it is open, for the fragments chunk ("Calls").
- **A computed `type` on SQL**, which v2 read both as the `flatten` rider and as the output type ("Batch 4").
- **MATCH branches on the node beside a computed `branches`.** v2 reached them when the computed object held neither the key nor a `fallback` (measured). Stage 2 makes them a second `match` in `default` ("Batch 3").
- **`$` arguments on the call node beside a computed `parameters`**, which v2 applied beneath what it computed (measured). The placeholder for a computed `parameters` drops them ("Placeholders").

**Where it looks.** Only where v2 evaluated:

- the root;
- every parameter, modifier and alias definition of a node, since v2 evaluated every parameter, with the exception of MATCH's `branches`, below;
- the elements of an array in one of those places;
- the values of an object in an `evaluatesContents` parameter, and the `key` and `value` of each object in BUILD_OBJECT's `properties`;
- with `evaluateFullObject` on, the values of any plain object.

Anything else is data. A node-shaped object inside data is not normalized, and stage 2 decides whether to quote it.

MATCH evaluated its `branches` as a whole only when it had an `operator` key, and otherwise evaluated only the branch that matched ([MATCH/operator.ts:24](../../v2-src/operators/MATCH/operator.ts#L24)). So a `branches` object is never read as shorthand, and only its values are normalized (measured: with `branches: { $getData: 'x', a: 'A' }`, a `matchExpression` of `'$getData'` gives `'x'`).

**Each node**, in the order v2 read it ([evaluate.ts:40-194](../../v2-src/evaluate.ts#L40-L194)):

1. **Shorthand**, unless `noShorthand` is on. It applies only to an object with no `operator` or `fragment` key ([shorthandSyntax.ts:21](../../v2-src/shorthandSyntax.ts#L21)). So on a node every `$` key is an alias definition, even `$x`, which in shorthand is `multiply` (`x` is one of its v2 names).
   - Each `$` key resolves, in key order, to a v2 operator (the name standardized, then looked up in `V2_NAMES`), a fragment in `V2Options.fragments` or a function in `V2Options.functions`. Fragment and function names match exactly, as v2 matched them.
   - Its payload is read as "The v2 grammar" says.
   - The object's other keys are laid over the result, and a later `$` key's result over an earlier one's.
   - An unresolved `$` key stays. It is an alias definition if the object has become a node, and data otherwise: `{ $plus: ['$n', 2], $n: 5 }` is `7`.
2. **What it is.** A `fragment` key makes a fragment call, even beside an `operator` key, since v2's expansion replaced the operator (measured). An `operator` key makes an operator node. Anything else is a plain value, and stage 1 is done with it, apart from walking it under `evaluateFullObject`. An operator node goes through steps 3 to 7, and a fragment call through step 8.
3. **A custom-function call** is an `operator` that names a listed function exactly, checked before any operator lookup, as v2 checked it ([helpers.ts:122](../../v2-src/helpers.ts#L122)). It becomes the explicit form, with its undeclared keys in `input` unless it has an `input` already. Undeclared here means everything but `fallback`, `outputType`, `type`, `useCache`, `args` and `input`, so `$` keys and `children` went into `input` too (measured: `{ operator: 'fn', children: [1, 2] }` called `fn({ children: [1, 2] })`). Beside an `input` of its own, v2 discarded them, `$` keys included (measured: `args: ['$n']` then received the text `'$n'`). They cannot stay on the explicit node, where a `$` key would become an alias definition and a key such as `name` or `children` would be read, so stage 1 keeps them in the node's source record, and stage 2 writes them into its `//` object with no issue, as keys v2 ignored (ruled at 15.1's third chunk).
4. **The operator name** is standardized and looked up. A name that is neither a v2 operator's nor a listed function's cannot be read any further, since its parameters are unknown, so the node is left as written (below).
5. **Parameter names.**
   - Property aliases become names.
   - `type` becomes `outputType`, except on PLUS, where it is a parameter, and on SQL.
   - On SQL, a `type` of `'array'`, `'string'` or `'number'` becomes `flatten: true`, since v2's SQL read `type` for its rider whatever `outputType` said ([SQL/operator.ts:51](../../v2-src/operators/SQL/operator.ts#L51)). `type` also becomes `outputType` when the node has none ("Batch 4"). Any other literal `type` is SQL's output type as on any operator, and a computed one stays as written (the exceptions, above).
6. **`children`** becomes named parameters through `V2_CHILDREN`. It overrides any named parameter it fills, as v2's `parseChildren` did ([CONDITIONAL/operator.ts:28](../../v2-src/operators/CONDITIONAL/operator.ts#L28)). A computed `children` whose mapping is not `{ into }` is left as written.
7. **Undeclared keys** move where `extraKeys` says. MATCH's go into `branches`, with the precedence in "Batch 3": added to an object, appended as pairs to an array, and left where they are beside a computed `branches` (the exceptions, above). A null `branches` is none, as v2's `branches ?? {}` read it. Any others stay where they are, for stage 2's `//` object.
8. **Fragment arguments.** The call node's `$` keys move into `parameters`, beneath its own keys ("Calls", under "Fragments").

Each value v2 evaluated is then normalized in turn.

**What it drops** is only what v2 itself discarded, so the canonical tree still evaluates as the input did. Each is removed with a `lossy-default` issue, as the other rules treat what v2 discarded:

- the part of a shorthand result that something overwrote: another key of the object (`{ $plus: { values: [1, 2] }, values: [3, 4] }` is `7`), or a later `$` key's result (`{ $plus: [1, 2], $multiply: [3, 4] }` is `12`);
- the name a shorthand key resolved to, when its payload has an `operator` or `fragment` key of its own, which replaced it (measured: `{ $count: { operator: 'getData', property: 'list' } }` is the list);
- a parameter spelled twice, by name and by alias, where v2 kept whichever came later in the object (measured both ways);
- a named parameter that `children` also fills;
- `type` beside `outputType`, since v2 read `outputType` first, except on PLUS, where `type` was a parameter, and on SQL when it is a rider value;
- on SQL, an explicit `flatten`, which the `type` rider overrode;
- MATCH's root branches that were unreachable: all of them when `branches` holds a `fallback` (`unreachable-branches`), and one whose key `branches` also holds ("Batch 3");
- a call-node fragment argument that the body shadows, or that `parameters` also gives, since `parameters` won ("Calls");
- the payload of a fragment shorthand that is not an object. v2 spread it into `parameters`, where it named nothing (measured: `{ $g: 5 }` left `$n` unfilled).

Four of these were ruled `overridden-value` at 15.1's third chunk, as the rest of their kind: the name a payload's own key replaced, a call-node argument that `parameters` also gives, the SQL `flatten` the rider overrode, and SQL's `type` beside `outputType`. A root branch whose key `branches` also holds is the same kind, and raises it too.

**What it leaves as written.** A node with an unknown operator name, a node with a computed `children` it cannot map, and a custom-function call with a computed `functionName`, are kept exactly as the input has them, which v2 trivially evaluates the same. Stage 1 records which of the three each is, and where the deciding key was, for stage 2's issue. That includes a shorthand object, which stays shorthand. Stage 2 does not enter them, and they become placeholders ("Placeholders", below). What stage 1 found on its way to such a node, such as an overridden value, is not reported, since the node is quoted whole. The four exceptions above stay as written too, inside a node that is normalized.

**What it does not do.** It does not expand fragments, insert declared defaults or resolve aliases. v2 did all three at every evaluation, but in v3 they belong to the converted definition and to `vars`.

**The oracle.** Given the same options and data, v2 evaluates the canonical tree to the input's value. The tests use the published package that the differential imports. Stage 1's tests run each example through both, and "The differential runner" runs the v2 tests' cases the same way. There is one exception, the quirk below: a call-node argument named after a v2 operator (`$count`) moves into `parameters`, where v2 reads the object as shorthand, so v2 loses the argument in the canonical call where the input kept it. The oracle tests expect that difference.

One v2 quirk is not kept. A `parameters` object whose argument name is also a v2 operator's (`$count`, `$data`) was itself read as shorthand when v2 evaluated it, so that argument never arrived, and the body saw the placeholder's text (measured). No one could have relied on that. The argument converts as written, and the guide lists the quirk.

### Stage 2: convert

Stage 2 walks the canonical tree as "Where rules sit" describes, and carries two things down:

- **The scope**: the alias definitions of the enclosing nodes and, in a fragment body, the body's parameters. The parameters sit outermost, since v2 spread the arguments over the body's root. A `"$name"` string resolves innermost first, as v2's resolved aliases merged downward ([evaluate.ts:161-163](../../v2-src/evaluate.ts#L161-L163)). An alias definition gives `"$vars.name"`, and a parameter gives `"$params.name"`. Any other `"$name"` is text, and stays as it is or is quoted ("The `literal` wrap").
- **The position**: the operator and parameter a value sits in. The `literal`-wrap rule reads it, with `evaluateFullObject`.

A subtree that stage 1 left as written, or that a rule cannot write, becomes a placeholder without being entered.

### Source paths

Every issue's `path` is in the input, where the person will look. Stage 1 moves values:

- a shorthand payload into parameters;
- `children` into named parameters;
- root keys into `branches` and `input`;
- call-node arguments into `parameters`.

So for each node it writes, stage 1 records the node's input path, and the input path of each key it moved there. Stage 2 reports an issue about a node at the node's path, and an issue about a parameter at the path its value came from. So `{ $plus: [1, 2] }`'s `values` reports at `['$plus']`, and a CONDITIONAL's `valueIfTrue` taken from `children` at `['children', 1]`. Below a moved value, paths are unchanged, since stage 1 moves subtrees whole. A value that stage 2 adds, such as POST's `body: {}`, reports at its node.

The record is kept beside the canonical tree, in a map keyed by the nodes stage 1 writes, which are always new objects. So the canonical tree stays plain v2 for the oracle, and an input that uses one object in two places gets a node and a path for each.

The map also holds a record for each container stage 1 builds, since an issue can be about one of its entries: a `rest` array, a BUILD_OBJECT entry paired from `children`, MATCH's `branches` gathered from the node, a function call's gathered `input`, and a `parameters` that call-node arguments moved into. A container's own path is where its entries came from (`children`, say), or the node's where it had none, and each entry's path is its own source. A position that `children` lacked reports at `children`. A node's record also holds the keys v2 discarded beside a function call's `input` (stage 1, step 3).

### Placeholders

Migration's never-throws ruling allows two kinds, and each comes with a `non-convertible` issue:

- **The closest v3 node**, wherever the converter knows what the node is. It is the rule's output as far as it converts, with the part it could not convert left at its default, kept as written or dropped, as the rule's entry says. The rest of the expression keeps working.
- **The input subtree, wrapped in `literal`**, wherever the converter cannot know what the node is, because what decides it is computed or unknown. Nothing inside runs, so no request is sent and no function is called. The person also has the v2 source in place to rewrite from.

| Case                                                                                                                     | Placeholder                                                         | Ruled in         |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------- |
| a computed or unrecognized deciding value                                                                                | the rule's default target                                           | "The rule shape" |
| a template part with no v3 counterpart: a `numberMapping`, an escape, a token that drills into a substitution            | the `buildString` as far as it converts                             | "Batch 3"        |
| a computed template or `substitutionCharacter` in `$` mode                                                               | the `buildString`, with the template as written                     | "Batch 3"        |
| a custom-function call                                                                                                   | the call on the function's name                                     | "Batch 5"        |
| a computed fragment `parameters`, an unprefixed argument the definition lacks, or another key on the call that v2 spread | the call, keeping the computed `parameters` and dropping the others | "Fragments"      |
| an operator name that is neither v2's nor a listed function's                                                            | `literal`                                                           | stage 1, step 4  |
| a computed `children` whose mapping is not `{ into }`                                                                    | `literal`                                                           | `children.ts`    |
| a computed `functionName`                                                                                                | `literal`                                                           | "Batch 5"        |
| a computed fragment name                                                                                                 | `literal`                                                           | "Fragments"      |

A person who forgot to list a custom function sees every call in the `operator: 'fn'` form quoted, each with an `unknown-operator` issue naming it, and gets calls by converting again with the function listed. A shorthand call, `{ $fn: … }`, was data to v2 when `fn` was not listed, so it converts as data, quoted in `literal` with no issue. That is why the page asks for function names first.

**The note in the output.** Each placeholder also carries its issue's message in a `//` key:

```json
{
  "//": "v2 conversion: The fragment name is computed, and v3 fragment names are literal. The call is quoted unconverted. Rewrite it by hand, for example as a `match` over the fragments it can name.",
  "operator": "literal",
  "value": { "fragment": { "operator": "getData", "property": "which" }, "parameters": { "$x": 1 } }
}
```

- **Why.** A script that writes converted expressions back to storage can easily lose the `issues` array. The note stays with the node, the v3 editor shows it beside the node, and evaluation strips it, so behaviour is unchanged.
- **Finding them.** Every note starts `v2 conversion: `, so a search of the stored expressions finds what is left to fix. Removing the note is part of fixing the node.
- **Where it sits.** On the placeholder node. For a `literal`, that is the `literal` node, beside `value`, since inside `value` the key would be data. Every placeholder is a node, so every note has a place.
- **`non-convertible` only.** The other tags mark nodes that work. Notes for them, such as the issue on every converted `outputType`, would bury the placeholders' notes.
- **Several on one node.** A node can have more than one `non-convertible` issue, and also the keys v2 ignored ("Keys v2 ignored"). Then `//` holds an array: the messages first, then an author's own `//`, and the ignored keys' object last. A single note is written bare. v3 takes any JSON value in `//` ("Comments: the `//` key" in [v3-api.md](v3-api.md)), and a `literal` with a note, a shorthand call with one, and an array of notes all validate (measured).

## The issue catalogue

Every issue the converter emits, as a reference table. The rules above say when an issue is raised, and each row points back to the one that rules it. Nothing emits an issue that is not listed here.

### The issue shape

```ts
interface MigrationIssue {
  code: 'split-trailing-empty' | 'remainder-sign' | … // one of the codes below
  tag: 'non-convertible' | 'intentional-semantic-change' | 'lossy-default'
  path: (string | number)[] // in the input
  message: string
}
```

`code` is added to migration's shape ("Changes to other specs"). Three tags are too coarse to act on, and a code lets the page group issues ("12 × `split-trailing-empty`"), a script accept the ones it has checked, tests assert without matching text, and the differential match a divergence to its issue. Codes are kebab-case, like `validate()`'s, and stable: a code keeps its meaning, and its message can be reworded. The union stays inline, as `tag` does, so the root's type exports are still the four in "Surface".

- **Messages** are templates, filled from the node where the tables show `{…}`. Each says what differs, when it matters, and the fix. A `non-convertible` message is also the placeholder's `//` note, with `v2 conversion: ` in front.
- **Paths.** The tables name a key by its canonical v2 name, and the issue reports it at the input path its value came from ("Source paths"). "The node" means the node's own path. `migrateV2Fragments`' paths are rooted at the fragments object.

### `intentional-semantic-change`

| Code                    | Emitted when                                                                                                                                         | Path         | Message                                                                                                                                                                                                                                                                                                                                                                                                        | Ruled in                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `split-trailing-empty`  | every converted `split`, unless `excludeTrailing` was a literal `false`                                                                              | the node     | v2 dropped one trailing empty piece, so `'a,b,'` split to `['a', 'b']` and `''` to `[]`. v3 keeps it, giving `['a', 'b', '']` and `['']`. Where empty pieces must go, `filter` the result.                                                                                                                                                                                                                     | "Batch 1"                            |
| `remainder-sign`        | every DIVIDE with `output: 'remainder'`                                                                                                              | `output`     | v2's remainder took the sign of the dividend (−7 remainder 3 was −1), and v3's `modulo` takes the sign of `mod` (2). They differ only when exactly one operand is negative. For v2's answer there, take the `modulo` of the `abs` values and give it the dividend's sign.                                                                                                                                      | "Batch 2"                            |
| `template-numbering`    | a computed template in positional mode                                                                                                               | `string`     | The template is computed, so its tokens cannot be renumbered. v2 matched tokens to substitutions by rank (`'%1 %3'` used the first two), and v3 matches by number. Check that the template's tokens have no gaps.                                                                                                                                                                                              | "Batch 3"                            |
| `named-token-source`    | a computed template or `substitutions` in named mode                                                                                                 | `string`     | The template or `substitutions` is computed, so the converter cannot tell which `{{…}}` tokens read `data` in v2, which any name missing from `substitutions` did. In v3 such a token is written `{{$data.name}}`. Rewrite those tokens.                                                                                                                                                                       | "Batch 3"                            |
| `response-collapse`     | every converted `http` and `graphQL`                                                                                                                 | the node     | v2 reduced each single-key object in the response to its value, so a list of `{ name }` objects came back as a list of names. v3 returns the response as sent. To keep v2's result, project the field in `returnPath`, as in `'countries[*].name'`. The same `[*]` is needed wherever `returnPath` crosses an array, since v2 projected a key across one silently.                                             | "Batch 4"                            |
| `computed-delimiter`    | a computed `split` delimiter                                                                                                                         | `delimiter`  | The delimiter is computed. v2 turned `\n`, `\t` and `\r` typed as text in a delimiter into the characters they name, and v3 splits on the text as written. If the delimiter can hold such text, make it the real character.                                                                                                                                                                                    | "Batch 1"                            |
| `computed-branches`     | a computed MATCH `branches`                                                                                                                          | `branches`   | `branches` is computed. v2 evaluated the branch it picked when that was an expression, and answered with a `fallback` key when nothing matched. v3 returns the branch as it is, and reads `fallback` as an ordinary key. Check that the object holds plain values, and give the no-match answer with `default`.                                                                                                | "Batch 3"                            |
| `graphql-relative-url`  | a literal relative `url` on GRAPHQL                                                                                                                  | `url`        | v2 joined a relative `url` to its GraphQL endpoint option, and v3 joins it to `http.baseEndpoint`. Check the host's `http.baseEndpoint`, or write the full URL.                                                                                                                                                                                                                                                | "Batch 4"                            |
| `output-type`           | every converted `outputType`                                                                                                                         | `outputType` | v3's `convert` is strict where v2 guessed: {the differences for this type, from the table in "The modifiers"}. Check that this node's result can never be one of them.                                                                                                                                                                                                                                         | "The modifiers"                      |
| `missing-data-fallback` | the innermost `fallback` above a converted read that has no default of its own: a `$data` reference, a `get`, or an `http` or `graphQL` `returnPath` | `fallback`   | In v2 a missing path failed, and this `fallback` answered. In v3 the read gives `null` and the node carries on. For data, set the host option `strictDataPaths: true` to fail as v2 did, or give the read its own default (`missingPathDefault`, `firstOf`). For a response's `returnPath`, which `strictDataPaths` does not reach, use `firstOf`, or read the path with a `get` and its `missingPathDefault`. | "Fallbacks that caught missing data" |

### `lossy-default`

| Code                         | Emitted when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Path                                                          | Message                                                                                                                                                                                                                             | Ruled in             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `instance-case-insensitive`  | `equal` or `notEqual` without its own `caseInsensitive`, when `V2Options.caseInsensitive` is `true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | the node                                                      | v2's `caseInsensitive` option applied to this node. v3 compares case-sensitively until the host adds `operatorDefaults: { {operator}: { caseInsensitive: true } }`, or this node sets `caseInsensitive: true`.                      | "Batch 1"            |
| `values-cut`                 | a literal `values` longer than two, on GREATER_THAN, LESS_THAN, SUBTRACT or DIVIDE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `values`                                                      | v2 used the first two values and ignored the rest. Removed: {the values}.                                                                                                                                                           | "Batch 1", "Batch 2" |
| `fallback-converted`         | an OBJECT_PROPERTIES `fallback` beside `outputType`, unless it is a literal already of the target type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `fallback`                                                    | This `fallback` becomes `missingPathDefault`, which v3's `convert` then converts to {type}, where v2 returned it as it was. Unless the default is already of that type, it fails or changes. Give a default of that type.           | "The modifiers"      |
| `malformed-entry`            | a BUILD_OBJECT element with no `key` or no `value`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | the element                                                   | v2 skipped an entry with no `key` or no `value`. Removed.                                                                                                                                                                           | "Batch 3"            |
| `unreachable-branches`       | a MATCH root branch, when `branches` holds a `fallback`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | the root key                                                  | `branches` has a `fallback`, which v2 answered with before it read the node's own keys, so this branch was never reached. Removed.                                                                                                  | "Batch 3"            |
| `overridden-value`           | a value v2 never read because another spelling won: a shorthand payload's key under another key of the object, an earlier `$` key's result under a later one's, the name a shorthand key resolved to under its payload's own `operator` or `fragment`, a parameter given by name and by alias, a named parameter that `children` fills, `type` beside `outputType` (not on PLUS, nor a rider value on SQL), an explicit SQL `flatten` under the `type` rider, a call-node fragment argument under the same one in `parameters`, a MATCH root branch under the same key in `branches`, or SUBTRACT's or DIVIDE's named pair beside `values` | the losing key                                                | v2 never read {key}: {winner} gave the same parameter and won. Removed.                                                                                                                                                             | "Stage 1"            |
| `fragment-shorthand-payload` | a fragment shorthand whose payload is not an object                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | the `$name` key                                               | A fragment shorthand takes an object of arguments. v2 spread this one into `parameters`, where it named nothing, so the call had no arguments. Removed.                                                                             | "Stage 1"            |
| `shadowed-argument`          | a call-node argument that the body's top level also defines, when the definition is known                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | the argument's key                                            | The body of `{fragment}` sets its own `${name}`, which beat this argument in v2, so the argument never applied. Removed.                                                                                                            | "Calls"              |
| `unknown-argument`           | an argument the definition does not have, when the definition is known                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | the argument's key                                            | `{fragment}` has no parameter `{name}`. v2 ignored the argument, and v3 rejects it. Removed.                                                                                                                                        | "Calls"              |
| `fragment-use-cache`         | a `useCache` on a fragment call                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `useCache`                                                    | A v3 fragment call takes no `useCache`, since caching is set on the operators inside the body. v2 applied this one to the body's node, unless the body set its own. Removed. Set `useCache` in the definition if the body needs it. | "Calls"              |
| `name-renamed`               | a fragment or parameter name v3 cannot register, renamed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | the fragment's key, or the parameter in `metadata.parameters` | `{name}` cannot be registered in v3 ({the reason}), so it is renamed `{new name}`, and calls follow. Update anything outside expressions that uses the old name.                                                                    | "Definitions"        |
| `unknown-parameter-type`     | a declared fragment parameter whose type v3 does not have                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | the parameter's `type`                                        | `{type}` is not a v3 type, so the parameter takes `'any'`.                                                                                                                                                                          | "Definitions"        |

### `non-convertible`

Each is a placeholder ("Placeholders").

| Code                         | Emitted when                                                                                                                                                | Path                                                                       | Message                                                                                                                                                                                                                                                                                                                                | Ruled in              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `deciding-value`             | a computed or unrecognized `strict`, DIVIDE `output`, PLUS `type`, SQL `single`, `flatten` or `type`, or `useCache` on an operator v2 cached                | that key                                                                   | {`strict` is computed / `'nope'` is not a value v2 accepted}, so the converter cannot tell what v2 did. It wrote {the default target}, v2's default. Where {the key} can be otherwise, rewrite the node by hand.                                                                                                                       | "The rule shape"      |
| `drilled-substitution-token` | a named token that drills into a key of a literal `substitutions`                                                                                           | `string`                                                                   | `{{{token}}}` drills into the substitution `{name}`, and v3's substitution tokens do not drill. Pass the drilled value as a substitution of its own.                                                                                                                                                                                   | "Batch 3"             |
| `number-mapping`             | each token a `numberMapping` maps, in named mode                                                                                                            | the token's key in `numberMapping`, or `numberMapping` when it is computed | v3 has no `numberMapping`, so `{token}` renders the bare number. Choose the text in the substitution instead, with `match` or `if`.                                                                                                                                                                                                    | "Batch 3"             |
| `template-escape`            | a literal template holding an escaped token, `\%N` or `\$N` in positional mode and `\{{…}}` in named mode, or a `$`-mode template already holding `%N` text | `string`                                                                   | v3 has no escapes, and reads `%N` and `{{…}}` in a template as tokens. To show such text literally, pass it in as a substitution.                                                                                                                                                                                                      | "Batch 3"             |
| `computed-dollar-template`   | in positional mode, a computed template under `substitutionCharacter: '$'`, or a computed `substitutionCharacter`                                           | `string` or `substitutionCharacter`                                        | The template's `$N` tokens must become `%N` for v3, and a computed {template / `substitutionCharacter`} cannot be rewritten. Rewrite the template with v3's tokens.                                                                                                                                                                    | "Batch 3"             |
| `custom-function-call`       | every call on a v2 custom function                                                                                                                          | the node                                                                   | A call on the v2 custom function `{name}`. Register a v3 operator of that name, as "Custom functions" in the migration guide suggests, and check this call against its parameters. {Where v3 cannot register the name: `{name}` holds a `.` / is already a v3 operator's name, so register it under another name and rename the call.} | "Batch 5"             |
| `computed-function-name`     | a computed `functionName`                                                                                                                                   | `functionName`                                                             | The function name is computed, and v3 operator names are literal. The call is quoted unconverted. Rewrite it by hand, for example as a `match` over the functions it can name.                                                                                                                                                         | "Batch 5"             |
| `computed-arguments`         | a computed fragment `parameters`                                                                                                                            | `parameters`                                                               | The arguments are computed. v2's had `$` names and v3's do not, so as written they fill nothing. Make the computing expression produce names without the `$`.                                                                                                                                                                          | "Calls"               |
| `body-override`              | an unprefixed key in `parameters` that the known definition has no parameter for, or another key on the call node that v2 spread over the body              | that key                                                                   | In v2, `{key}` replaced the body's own `{key}`, through the call's spread over the body. A v3 call passes only arguments. Removed. Make it a parameter of the fragment, or change the body.                                                                                                                                            | "Calls"               |
| `computed-fragment-name`     | a computed `fragment`                                                                                                                                       | `fragment`                                                                 | The fragment name is computed, and v3 fragment names are literal. The call is quoted unconverted. Rewrite it by hand, for example as a `match` over the fragments it can name.                                                                                                                                                         | "Calls"               |
| `computed-children`          | a computed `children` whose mapping is not `{ into }`                                                                                                       | `children`                                                                 | `children` is computed, and `{operator}` sends its children to different parameters, which cannot be split before evaluation. The node is quoted unconverted. Rewrite it with named parameters.                                                                                                                                        | "Computed `children`" |
| `unknown-operator`           | an operator name that is neither v2's nor a listed function's                                                                                               | `operator`                                                                 | `{name}` is not a v2 operator. If it is a custom function, add it to `functions` and convert again. The node is quoted unconverted.                                                                                                                                                                                                    | "Stage 1"             |

### Holding the converter to it

A test holds the codes the converter can emit to these tables, as `test/exports.test.ts` holds the root to its list. Each row also has a test that triggers it and checks its code, tag and path. The first two tables feed the guide's "semantic changes" prose, and the third its list of what must be done by hand ("Divergence catalog — the shared output" in [v3-migration.md](v3-migration.md)).

## The differential runner

Phase 15.2's check on the whole converter. Every expression case in the v2 tests is evaluated by v2, converted and evaluated by v3, and the two results are compared. It is a script, `pnpm differential`, not a Jest suite, and it lives in `differential/` with its data.

### The v2 package

- **v2 is the published package**, a devDependency under an alias (`"fig-tree-evaluator-v2": "npm:fig-tree-evaluator@2.23.2"`). It imports as ESM as it is under plain Node (measured), which `/v2-src` does not. Under tsx it does not: the package's ESM build has no `"type": "module"` to declare it, so tsx loads it as CommonJS and the named exports arrive under `default`. A tsx script `require`s the CommonJS build instead, as `codegen/extractV2Table.ts` does, which is also the build Jest loads. v3 is `src/`. Both run in one process.
- **It follows v2's releases** until v3's release freezes v2. A bump is taken like a v3 change: run, review, accept ("The baseline").
- **Nothing in the converter's tooling reads `/v2-src`.** The generated table, the `children` and name tests, the stage-1 oracle and the differential all read the package. So deleting `/v2-src` touches none of them.

**Conversion happens in the run.** Each case is `figV3.evaluate(migrateV2Expression(expression, options).expression)`, so no converted expression is stored, the corpus stays v2, and every run tests the converter as it is.

### The corpus

`differential/corpus.ts` is extracted once from the tests of the v2 release the package follows, a superset of `test/V2`. It holds, in the order the tests ran, every case that evaluates an expression and checks what it returns or that it fails, whichever file it is in. That includes the HTTP, SQL, custom-function, fallback and `evaluateFullObject` files, which `test/V2`'s first-pass table marks as infrastructure. Its README asks for that table to be validated in Phase 15, and I/O now runs against mocks, functions are wrapped as operators and fallbacks compare as values, so their cases flow through. Left out:

- cases that check something other than an expression's result: a helper, metadata, cache statistics, options read back;
- cases under an option v3 has no counterpart for: `skipRuntimeTypeCheck`, `excludeOperators`, `supportDeprecatedValueNodes`, the instance-wide `nullEqualsUndefined`.

It is one array with two kinds of entry:

```ts
import type { FigTreeOptions as FigTreeOptionsV2 } from 'fig-tree-evaluator-v2'

export const OPTION_UPDATE = Symbol('option update')

type Entry =
  | { id: number; from: string; expression: unknown; options?: FigTreeOptionsV2 }
  | { type: typeof OPTION_UPDATE; options: FigTreeOptionsV2 }
```

- **`id`** names the case in the output, the review map and the baseline. It is unique, which the runner checks at startup, and never reused. A new case takes the next number wherever it goes in the array.
- **`from`** is the v2 test the case came from, such as `'4_plus.test.ts › adds strings'`.
- **`options`** are the case's own, as the v2 test passed them to `evaluate(expression, options)`. They apply to that case only.
- **An option update** changes the options for every case after it, as `updateOptions()` did. Its `Symbol` cannot occur in a v2 expression, so the two kinds of entry never mix.

### Options

The runner keeps the running v2 options itself:

- **At an option update** it calls `figV2.updateOptions()`, merges the update into its own copy as v2 merges, shallowly, and builds a new `figV3` from `toV3Options(running)`. Rebuilding from scratch means v3's merge rules never come into it.
- **A case's own options** go to v2 with the call. The runner merges them over its copy as v2's `evaluate` merged them, deeply for `data`, `functions`, `fragments` and `headers`. v3 gets the result as call `data` when that is all the case's options hold, and through an instance built for the case otherwise.
- **The converter gets the same merged options**, so it sees the fragments, the function names and the `evaluateFullObject` that v2 evaluated with.

`toV3Options` is the migration a host does by hand ("Moved options" in [v3-migration.md](v3-migration.md)), written once:

- `data` as it is;
- `fragments` through `migrateV2Fragments`, whose issues print once per update;
- each function as a v3 operator of its name, the recipe's way: an optional `input` and `...args` as its positional rest, called as v2 called it, `f(input, ...args)`;
- `caseInsensitive` as `operatorDefaults` for `equal` and `notEqual`;
- the I/O settings (endpoints and headers) as v3's, with the clients below.

Three options are read by the converter and have no v3 counterpart: `evaluateFullObject`, `noShorthand` and `useCache`. The converter has already applied them, so `toV3Options` drops them.

Two options are handled rather than mapped:

- **`returnErrorAsString`**, which 15 of the files use, is dropped on both sides. v2 then throws where it returned the error's text, and the two failures compare as failures.
- **`allowJSONStringInput`**: the runner parses a string case before converting it, as any caller must, since the converter ignores the option.

Any other option it cannot map stops the run at startup, so no case silently runs under different options.

### I/O

Every I/O case runs, offline, the same way on every machine. Both engines get clients over one shared source, so they see the same responses:

- **HTTP and GraphQL**: the v2 tests' two mocks, `test/__mocks__/node-fetch.ts` and `axios.ts`, which answer every URL the tests request. Their routes are not the same (only the axios mock answers `api.github.com/graphql`), so each case keeps the client its test used, and both engines get that client over the same mock: v2's `FetchClient` or `AxiosClient`, and v3's. The routing moves into plain modules that the Jest mocks wrap and the runner imports, since the runner has no `jest.fn`.
- **SQLite**: the bundled `test/database/northwind.sqlite`, opened once and shared by v2's `SQLite` and v3's `SQLiteConnection`.
- **Postgres** has no mock in the v2 tests, which need a live Northwind, so it runs from recordings:
  - **What is replaced.** Only the `pg` client, beneath each engine's own Postgres wrapper (v2's `SQLNodePostgres`, v3's `PostgresConnection`), which run unchanged. Both call `client.query({ text, values })` and read `rows`.
  - **What the stand-in does.** Its `query` is async, as the real client's is. It resolves with the recorded result, as the real client returned it, or rejects with an `Error` carrying the recorded `message`, `code`, `table`, `column` and `constraint`, the fields v3's failure reads. It accepts only the `query({ text, values })` form, and throws on any other, such as a `rowMode` or the callback form, so a wrapper that changes how it calls the client fails loudly rather than being answered wrongly.
  - **The key** is the query's text and values, with a missing `values` counting as `[]`: v2 always sends one, and v3 only when there are binds.
  - **Recording.** `pnpm differential --record-sql` runs the Postgres cases once against a live Northwind, through a real `pg` `Client` wrapped to save each result or error. It writes them as a TypeScript module, `differential/sqlRecordings.ts`, which is committed and never hand-edited. Each value keeps the type the real client gave it: a `Date` is written as `new Date('…')`, a `Buffer` (from a `bytea` column) as `Buffer.from('…', 'base64')`, and plain data as literals. A value of any other class stops the recording, so nothing is written as something it was not.

A request the mock or the recordings cannot answer is a runner error, and stops the run. It is never a case outcome, since both engines failing in the same way would otherwise count as a match.

### Comparing

- **An outcome** is `{ value }` or `{ error }`. Two errors match, since the versions' messages differ by design.
- **Values** compare with `isDeepStrictEqual` from `node:util`, which ignores key order, as it must since v3's evaluation reorders keys (the Phase-17 note in [v3-implementation-plan.md](v3-implementation-plan.md)). v2's `undefined` is compared as `null`, anywhere in the value, since v3 has no `undefined`.

Each case gets one of three statuses:

| Status | Meaning                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| ✓      | the same outcome                                                                                              |
| ⚠      | a different outcome, explained: the conversion raised an issue, or the case is in the review map              |
| ✗      | a different outcome, unexplained: a converter bug, a gap in this spec, or a guide difference not yet reviewed |

**The review map**, `differential/reviewed.ts`, records a person's verdict on a ✗, such as `{ 42: 'guide: no implicit coercion' }`, and the case then shows as ⚠ with that note. Together, the issues and the notes are the divergence catalogue: the issues are the converter's half, and the notes are the guide's. Any issue explains a difference, since a result cannot say which node produced it, so a ⚠ is still worth reading when its codes change. A ✓ whose conversion raised issues is fine: an issue says the result may differ, not that it does.

### Output

By default, each ✗ prints as a block, each ⚠ as one line, and each ✓ not at all. Every line is cut to about 100 characters. A summary follows:

```
✗ #42  4_plus.test.ts › adds strings and numbers
    expression  {"operator":"+","values":["a",5]}
    v2          "a5"
    v3          error: plus expects numbers, strings, arrays or objects…
    issues      —
⚠ #57  11_split.test.ts › trailing delimiter          split-trailing-empty
⚠ #88  4_plus.test.ts › mixed types                   guide: no implicit coercion

382 cases: 331 ✓ · 38 ⚠ · 13 ✗
Issues raised: output-type ×31, response-collapse ×9, split-trailing-empty ×6, …
Unexplained: #42 #203 #611
```

- **`pnpm differential 42 57`** prints those cases in full, untruncated: the v2 expression, the converted expression, every issue with its path and message, and both outcomes. The option updates before each case are replayed first. That is how a case is looked at closely, without opening the corpus.
- **`--all`** adds a ✓ line for every case.

### The baseline

`differential/baseline.json` is the accepted result, recorded once the review has done what it can. It holds the v2 version and the totals, then one line per case, with its status and issue codes: `"42": "⚠ output-type split-trailing-empty"`. Each case gets its own line, not just a place in the totals, because totals can stay level while cases trade places, and the line says which case moved.

- **`pnpm differential --accept`** writes it. Accepting is a decision, reviewed like any other change, and the file's diff shows exactly which cases moved.
- **`pnpm differential --check`** is the CI step. It runs the corpus and fails on any difference from the baseline, in either direction, naming each case that moved and from what to what. A case that gets better fails too, until it is accepted, so the baseline stays true.
- **Drift means something changed**: v3 or the converter on any commit, and v2 when its package is bumped. That is the point. A v3 change that alters what a converted v2 expression does is flagged the moment it lands, and a v2 bump shows exactly which cases it moved.

The plan's M7 milestone, "converter + differential green", means `--check` passes against an accepted baseline.

## Testing, packaging and build order

### The tests

The unit suites run in `pnpm test` beside the rest of the v3 suite, one file per part of the converter. Each holds the converter to promises this spec makes:

| Suite               | Holds                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrate-table`     | The two generated tables equal fresh extractions, the v2 one from the package and the v3 one from the operator definitions. Each `children` mapping gives what the package's `parseChildren` gives. The name rule agrees with `standardiseOperatorName`.                                                               |
| `migrate-normalize` | Each stage-1 example comes out canonical, which a checker confirms (canonical names, no property aliases, no `children`, no shorthand), and v2 evaluates it as it evaluated the input.                                                                                                                                 |
| `migrate-rules`     | Every v2 parameter has a fate, and every target and renamed parameter exists in v3's `getOperators()`. Each operator's examples convert to the output this spec gives, validate in v3, and evaluate the same in v2 and v3, or differ as their row says.                                                                |
| `migrate-frame`     | What surrounds the rules: the modifiers, aliases → `vars`, the `literal` wrap, keys v2 ignored, fallbacks that caught missing data, computed `children`, and source paths.                                                                                                                                             |
| `migrate-fragments` | Definitions through `migrateV2Fragments`, and calls through `migrateV2Expression`.                                                                                                                                                                                                                                     |
| `migrate-issues`    | The catalogue. Only its codes are emitted, each row is triggered with its tag at its path, and every placeholder carries its `//` note, while nothing else does.                                                                                                                                                       |
| `migrate-contract`  | What holds for every conversion. It never throws, over malformed input: a non-string `operator`, `values: 5`, `children: 'x'`, `null` where a node goes. It never mutates, since every example converts from a deep-frozen input. It is deterministic, since reordering an input's keys changes nothing in the output. |
| `migrate`           | The subpath exports exactly `migrateV2Expression` and `migrateV2Fragments`. It exists, for the placeholder, and gains the second function.                                                                                                                                                                             |

The examples in this spec are the tests' first cases. Each was measured through both engines when it was written, and the tests keep it measured. The suites import the v2 package, whose CommonJS build ts-jest loads as it is. A type test also imports the four conversion types from the root, so `pnpm typecheck` fails if one goes missing: `test/exports.test.ts` lists values only.

### Packaging

The `./migrate` entry is in place, with the placeholder, and it changes when the converter is complete:

- **The budget.** Its row in `codegen/entries.mjs` is sized for the placeholder, at 130 bytes brotli. It is set from measurement plus about 5% once the converter is complete, as the other entries' were. The embedded v2 table and the catalogue's messages will be most of it.
- **The marker.** The placeholder's message is its marker now. It becomes a string only the converter holds, such as the `unknown-operator` message's `'is not a v2 operator'`.
- **The types.** `code` joins `MigrationIssue` in `src/migrationTypes.ts`, and `V2Options` and `FragmentMigrationResult` join the root's type exports.
- **Isolation.** The lint rule for `src/migrate/` allows value imports from inside the folder only, and type imports from anywhere. That is editor-hints' rule widened to a folder of several modules. The `instanceof FigTreeError` assertion planned for 15.1 goes, since the converter shares no runtime code with the root.
- **The v2 package** is a devDependency only, and nothing under `src/` imports it. The lint rule that bans `/v2-src` from `src/` gains its name, `fig-tree-evaluator-v2`.

`pnpm check:package` already imports, requires and typechecks every entry of the packed package, and its tree-shake fixture scans for every subpath's marker, so neither needs changing.

### Repo tooling

- **`differential/`** is linted, formatted and typechecked like `test/`, and is added to `tsconfig.test.json`'s `include`.
- **Generated files.** `src/migrate/v2/operators.generated.ts`, `src/migrate/v3Names.generated.ts` and `differential/sqlRecordings.ts` join `src/version.ts` under "Generated files — do not hand-edit" in CLAUDE.md. Both generators write Prettier's format, so `pnpm format:check` covers them as they are.
- **The HTTP mocks' routing** moves into plain modules under `differential/mocks/`. `test/__mocks__/node-fetch.ts` and `axios.ts` become `jest.fn` wrappers over them, so `pnpm test:v2` runs as before.
- **CLAUDE.md's commands** gain `pnpm differential`.
- **CI** gains a `differential` job in `ci.yml`, beside `test`, running `pnpm differential --check`. It is offline and deterministic like the rest. As its own job, a drift shows as its own check rather than behind a unit-test failure, and it runs in parallel.

### Build order

15.1 is the converter and 15.2 the differential, each its own PR. The chunks run in order, and each writes its tests first (working rule 1 in [v3-implementation-plan.md](v3-implementation-plan.md)).

**15.1 · The converter**

1. **The write-backs.** The "Changes to other specs" list, so the other specs agree with this one before any code does. The plan's 15.1 and 15.2 are rewritten to this sequence.
2. **The reference tables.** The v2 package as a devDependency, `extractV2Table` and the two generated tables, `children.ts`, `behaviour.ts` and the name rule. Tests: `migrate-table`.
3. **Stage 1.** The normalizer with its source paths, and the canonical-v2 checker. Tests: `migrate-normalize`.
4. **Stage 2's frame, with batch 1.** The walk and its scope, the modifiers, aliases → `vars`, the `literal` wrap, keys v2 ignored, placeholders with their notes, and the issue machinery, `code` included. Batch 1's renames need nothing else, so the frame is tested through them. Two parts of the frame wait for chunk 5, whose rules are the first to reach them: a result that is not a node, and the objects an operator evaluated itself (`evaluatesContents`). Tests: `migrate-frame`, and `migrate-rules` begun.
5. **Batches 2 to 5**, in order, then the rules that need them: fallbacks that caught missing data, and OBJECT_PROPERTIES' `fallback` beside `outputType`. Tests: `migrate-rules` and `migrate-frame` completed.
6. **Fragments.** `migrateV2Fragments`, and calls. Tests: `migrate-fragments`.
7. **The contract and the surface.** `migrate-issues`, `migrate-contract` and the surface test, then the types, the lint rule, the marker and the budget. The placeholder is gone.

**15.2 · The differential**

1. **The I/O doubles.** The mock routing moved into plain modules, with `pnpm test:v2` unchanged. The Postgres stand-in and `--record-sql`, and the first recording.
2. **The corpus.** Extracted from the v2 release's tests, with ids and sources. It is checked once, at extraction, by running every case through v2 alone and comparing with the value its test expected.
3. **The runner.** The options and `toV3Options`, the comparison and statuses, the output and single-case mode, and `--accept` and `--check`.
4. **The review.** Each ✗ becomes a converter fix, a spec ruling or a review-map entry, per working rule 2, since this is the phase expected to surface gaps in the spec. The review ends with the first `--accept`.
5. **CI.** The `differential` job.

**Close-out**: the phase's bundle-size row and `src/dev/phase15_showcase.ts`, a range of v2 expressions with their conversions, issues and v3 results (working rules 6 and 7). M7 is `--check` passing against the accepted baseline.

After Phase 15, only Phase 16's benchmarks, `pnpm test:v2` and this doc's links still read `/v2-src`.

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

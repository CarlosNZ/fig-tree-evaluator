# FigTree v3 — an honest assessment and redesign proposal

*Codebase review of fig-tree-evaluator v2.23.0, July 2026.*

## Verdict

The core idea is excellent and worth a v3: a sandboxed, JSON-serializable expression language with async evaluation, pluggable I/O, and editor-grade introspection is a genuinely useful niche that JSONLogic (no async, no metadata) and JSONata/expr-eval (string languages, no structural editing) don't fill. The operator module pattern, the tiny dependency footprint, and the inject-your-own-client design are all right.

What has accumulated over 2.x is **syntax sprawl and permissiveness debt**. The same expression can be written roughly six ways; `$` means four different things; every operator carries 3–7 aliases per name *and* per property; per-call options mutate instance state; metadata defaults disagree with runtime defaults systemically; and the whole engine re-runs shorthand preprocessing on every node visit of every evaluation because there is no parse/compile phase. The converter layer's bug history (nearly every release from v2.21.4 to v2.22.1 was a `convertToShorthand` fix) is the tell: the input grammar is too irregular to round-trip mechanically, which means it's also too irregular for humans to hold in their heads.

V3's theme should be: **one way to say each thing, a real parsing phase, and lexical scoping** — while keeping the operator metadata system, which is the project's crown jewel.

---

## Part 1 — What v2 gets right (keep these)

- **The metadata-driven operator pattern.** `data.ts` driving both runtime type-checking and `getOperators()` introspection is the right architecture, and it's what makes [fig-tree-editor-react](https://github.com/CarlosNZ/fig-tree-editor-react) possible. V3 should double down on it (see §3.6 on making it the *single* source of truth).
- **Dependency discipline.** Two tiny runtime deps; HTTP/SQL clients injected, never bundled. Keep exactly this.
- **Lazy branch evaluation** in `CONDITIONAL` and `MATCH` — only the winning branch is evaluated. This should become the model for more of the engine, not the exception.
- **`fallback` + `FigTreeError` with `prettyPrint` and `errorData`.** The per-node fallback that bubbles up is genuinely ergonomic for config authors.
- **Parallel child evaluation** (`Promise.all` throughout) — right call for network-heavy trees.
- **Fragments** — the "reusable parameterized sub-expression registered by the host app" concept is a keeper; only its parameter syntax needs work.

---

## Part 2 — The honest problems

### 2.1 Six ways to write one expression

Today a single conditional can be written as: named properties; positional `children`; shorthand-object; shorthand-array; shorthand-single-value; and (for functions) the custom-operator form — plus root-level hoisting variants for `MATCH` branches and fragment parameters. Every operator must ship an imperative `parseChildren` to support the positional form, eight operators import theirs from `../AND/operator` (with a `parseChildrenGET` rename hack in [GET/operator.ts:98](../../v2-src/operators/GET/operator.ts#L98) to dodge the name clash), and several `parseChildren` implementations can't even reach all named parameters (SPLIT loses `trimWhiteSpace`/`excludeTrailing`; GET's positional encoding is `[url, [fieldNames], ...values, returnProperty?]`). The `convert/` layer exists almost entirely to paper over this irregularity, and [toShorthand.ts](../../v2-src/convert/toShorthand.ts) resorts to regex-scanning stringified JSON to guess fragment parameters.

### 2.2 `$` is overloaded four ways

`$thing` currently means: an alias definition (key), an alias reference (string value), a shorthand operator/fragment/function invocation (key), or a fragment parameter — disambiguated by silent precedence (operator beats fragment beats function beats alias). Consequences:

- A fragment named like any of the ~100 operator aliases is silently shadowed.
- A typo'd alias reference doesn't error — it returns the literal string `"$getCountry"` into your output.
- Issue [#126](https://github.com/CarlosNZ/fig-tree-evaluator/issues/126) already flags this.

### 2.3 The flat node namespace collides with itself

Operator parameters, node modifiers (`fallback`, `outputType`, `useCache`), alias definitions, and hoisted branch/fragment keys all share one flat object. Concrete casualties:

- **`type` means three things**: alias for `outputType` ([evaluate.ts:210](../../v2-src/evaluate.ts#L210)), PLUS's own reduction mode ([PLUS/operator.ts:22-24](../../v2-src/operators/PLUS/operator.ts#L22-L24)), and SQL's legacy `queryType` — so a PLUS or SQL result can be double-processed by two different meanings of the same key.
- **MATCH scans the whole node for branch keys** ([MATCH/operator.ts:39](../../v2-src/operators/MATCH/operator.ts#L39)): a match value of `"operator"` or `"fallback"` would resolve to the node's own reserved property.
- **Property aliases collide with operator aliases**: `data` is simultaneously an operator alias (→ OBJECT_PROPERTIES) and a property alias in three different operators; likewise `_`, `divide`, `function`, `object`, `replace`.

### 2.4 Semantics that surprise

- **Alias scoping is timing-dependent.** Resolved aliases are deliberately mutated into a shared config object ([evaluate.ts:149-155](../../v2-src/evaluate.ts#L149-L155)) — the comment admits it's a workaround for parallel evaluation. Whether a sibling branch can see your alias depends on which branch's `Promise` resolves first. Fragments get a copied scope; ordinary nodes don't.
- **Eager evaluation everywhere.** All parameters are evaluated (including firing GET/SQL requests) *before* type-checking runs. Issue [#132](https://github.com/CarlosNZ/fig-tree-evaluator/issues/132) ("don't query until variables are populated") is a direct symptom.
- **JS coercion leaks through.** `{"+": [1, "2"]}` → `"12"`; `outputType: "number"` on `"abc4.5xyz"` extracts `4.5` via regex ([helpers.ts:181-191](../../v2-src/helpers.ts#L181-L191)); `String(undefined)` → `"undefined"`.
- **A confirmed logic bug in NOT_EQUAL** ([NOT_EQUAL/operator.ts:39](../../v2-src/operators/NOT_EQUAL/operator.ts#L39)): `value === null && value === undefined` is always false, so with `nullEqualsUndefined` enabled, `notEqual(null, 5)` returns `false`. The EQUAL version uses `||` correctly; this is a copy-paste negation error.
- **Metadata defaults ≠ runtime defaults, systemically.** Verified worst case: GREATER_THAN/LESS_THAN default `strict = true` at runtime ([GREATER_THAN/operator.ts:10](../../v2-src/operators/GREATER_THAN/operator.ts#L10)) while [data.ts](../../v2-src/operators/GREATER_THAN/data.ts#L17-L21) and its description promise `false`. Also mismatched: DIVIDE's `output` (docs say quotient, runtime gives decimal — and the documented `'decimal'` literal is actually rejected by the type-check), POST's `useCache`, SPLIT's delimiter, STRING_SUBSTITUTION's `substitutionCharacter`. Since the playground and docs render from `data.ts`, the docs actively lie.
- **No recursion guard**: a fragment that references itself loops forever. No timeout, no AbortSignal, no node budget — notable for a library whose pitch is *sandboxed* logic.

### 2.5 API surface leaks

- **Per-call options mutate the instance.** `fig.evaluate(expr, { httpClient })` permanently replaces `this.httpClient` ([FigTreeEvaluator.ts:61-69](../../v2-src/FigTreeEvaluator.ts#L61-L69)); same for the GraphQL client and cache sizes. A "this evaluation only" override that silently reconfigures the instance is a real bug class.
- **`getOptions()`/`getConfig()` return live internal references**; merge semantics differ between `evaluate` (deep for data/functions/fragments/headers) and `updateOptions` (shallow) — subtle and undocumented.
- **Two `isFigTreeExpression`s** (structural export vs registry-aware method) — documented at length precisely because the duality is confusing.
- **Editor entanglement**: the single package entry exports `dequal`, `truncateString`, `standardiseOperatorName`, and the whole `convert/` suite, all editor-only. No subpath exports, so every consumer's bundle carries the converter layer.
- **The alias economy is bankrupt**: case-insensitive names + camelCase normalization + ~5 aliases per operator + ~4 per property = a generated alias map, ordering hacks in `getOperators()`, and a memorization burden with no single "house style" for expression files.
- **Leftover noise**: `console.log(err.errorData)` ships in FetchClient ([httpClients.ts:87](../../v2-src/httpClients.ts#L87), [:112](../../v2-src/httpClients.ts#L112)); `FetchClient` calls `response.json()` unconditionally (issue [#120](https://github.com/CarlosNZ/fig-tree-evaluator/issues/120)); the cache key is a `_`-joined stringify that can collide; `setCache()` never rebuilds the LRU queue.

### 2.6 Operator set gaps

There is no `NOT`. No iteration (`map`/`filter`/`find` — issue [#92](https://github.com/CarlosNZ/fig-tree-evaluator/issues/92) is six years old). No modulo, power, rounding, min/max. No first-non-null/coalesce. No date handling at all — a glaring absence for a config-logic language. Meanwhile `COUNT` is just `.length`, `PASSTHRU` is an identity function whose advertised coercion actually lives in the engine, and `REGEX` only does boolean `.test()` with no flags and no match extraction. Empty-input conventions differ per operator (PLUS returns `[]`, MULTIPLY returns `0`).

---

## Part 3 — The v3 design

### 3.1 One canonical grammar, one sugar

Keep the verbose `{ operator: ... }` node as the **canonical AST**, and keep shorthand — but redefine the relationship:

- **Shorthand is specified sugar, normalized exactly once** at parse time (not per node visit, per evaluation, as [shorthandSyntax.ts](../../v2-src/shorthandSyntax.ts) does today). The editor and all tooling operate on canonical form; the normalization is total and lossless by construction.
- **Kill the public `children` form.** Positional parameters survive *only* as the shorthand array form (`{ $if: [cond, a, b] }`), and the mapping becomes **declarative metadata** — `positionalParams: ['condition', 'then', 'else']` in each operator's data — instead of 24 imperative `parseChildren` functions. This single change deletes the AND-imports-everywhere coupling, the `parseChildrenGET` hack, most of `convert/`'s special cases, and the class of "shorthand can't reach parameter X" bugs.
- **Kill root-level hoisting** in MATCH and fragment nodes. Branches live in `branches`, parameters in `parameters`. One way.
- **Fragment calls share the operator shorthand face** — `{ $getCapital: { country: 'NZ' } }` — but take **named parameters only**: no positional-array or single-value forms for fragments (continuing v2's stance). The reason is that fragment parameter lists are user-defined and evolve — a positional call silently re-maps when a parameter is added or reordered, and a single-value form becomes ambiguous the moment the value is an object (params map, or the value of the one param?). Operators don't have this problem because their positional order is fixed library metadata. Canonically, fragment shorthand still normalizes to a distinct `{ fragment: ... }` node, so tooling can tell registry sources apart. Registration-time checks keep the shared `$key` invocation namespace safe: a fragment or custom operator whose name collides with an operator is rejected (issue [#136](https://github.com/CarlosNZ/fig-tree-evaluator/issues/136)), as is a fragment parameter named after a reserved key (`fallback`, `vars`, `outputType`).
- **Reserved node keys get a fixed, small set** (`operator`, `fallback`, `outputType`, `useCache`, `vars`) and operator parameters live where they do now — but validation rejects unknown keys instead of silently carrying them, which surfaces typos and prevents the `type`-means-three-things overload (PLUS's mode becomes `mode`; SQL's `queryType` dies).
- **Aliases go on a diet**: canonical name + at most one symbolic alias (`?` for `if`, `+` for `plus`, `=` for `equal`), case-sensitive. The camelCase-normalization machinery and the generated alias table go away. If backward-compat matters, ship the old alias table as an opt-in compat map used by the v2→v3 converter, not by the runtime.

### 3.2 References and scoping — the big redesign

Replace the four-way `$` overload with one rule: **`$` in *key* position means "invoke" (an operator, fragment, or custom operator — the v2 shorthand, kept); `$` in *string-value* position means "read from a named scope"** — and only five namespaces exist, each declaring the value's provenance:

| Reference | Reads from |
|---|---|
| `$data.…` | the data object the host app passed in |
| `$vars.…` | a `vars` block declared on this node or an ancestor |
| `$param.…` | the parameters supplied by the caller of this fragment |
| `$item`, `$index` | the enclosing iterator operator |

**`$data` — the everyday case.** Data access collapses to a string, usable anywhere a value can appear:

```js
// v2
{ operator: 'getData', property: 'user.firstName' }

// v3
"$data.user.firstName"
{ $plus: ["$data.cart.subtotal", "$data.cart.shipping"] }
```

**`$vars` — replaces alias nodes.** Declarations move out of the operator's property namespace into an explicit `vars` block, lexically scoped to that subtree; references are unmistakably references:

```js
// v2: the definition is a `$` key camouflaged among the operator's own properties
{
  $getCountry: { operator: 'GET', url: 'https://restcountries.com/...', returnProperty: 'name.common' },
  operator: '?',
  condition: { operator: '!=', values: ['$getCountry', null] },
  valueIfTrue: '$getCountry',
  valueIfFalse: 'Not New Zealand',
}

// v3
{
  vars: {
    country: { $http: { url: 'https://restcountries.com/...', returnProperty: 'name.common' } },
  },
  operator: 'if',
  condition: { $notEqual: ['$vars.country', null] },
  then: '$vars.country',
  else: 'Not New Zealand',
}
```

Same evaluate-once-and-reuse semantics as v2 alias nodes — plus path drilling into the result, which alias nodes can't do. One var can hold a whole API response, picked apart at several sites:

```js
{
  vars: { country: { $http: 'https://restcountries.com/v3.1/name/zealand' } },
  operator: 'buildObject',
  properties: { name: '$vars.country[0].name.common', capital: '$vars.country[0].capital[0]' },
}
```

**`$param` — fragment parameters stop being bare `$` strings.** Fragments declare their parameters and reference them explicitly (today a fragment's `$country` placeholder is syntactically indistinguishable from an alias reference — it's why `toShorthand` resorts to regex-scanning stringified JSON):

```js
fragments: {
  getCapital: {
    parameters: { country: { type: 'string', required: true } },
    expression: {
      $http: {
        url: { $stringSubstitution: ['https://restcountries.com/v3.1/name/%1', '$param.country'] },
        returnProperty: '[0].capital',
      },
    },
  },
}

// call site — parameters can of course be references themselves:
{ $getCapital: { country: '$data.user.country' } }
```

Referencing an undeclared `$param.x` fails at fragment registration; a call omitting a required parameter fails validation before anything runs.

**`$item`/`$index` — what makes the iterator operators (§3.4) work:**

```js
{
  operator: 'map',
  input: '$data.cart.items',
  each: { $multiply: ['$item.price', '$item.quantity'] },
}
```

(Nested iterators disambiguate with an optional `as` on the iterator — `as: 'row'` → `$row.price`.)

This one change fixes: the sibling-visibility race (lexical scope, no shared mutation), the silent typo-becomes-literal-string failure (unresolved `$vars.*`/`$param.*` is an error, catchable by `fallback` — and statically checkable, since declarations are lexical), the fragment-name-shadows-operator problem (shorthand `$key` in key position resolves against a registry with *defined* precedence and a collision error at registration time — issue [#136](https://github.com/CarlosNZ/fig-tree-evaluator/issues/136)), and the "user data string happens to start with `$`" hazard (only recognized namespaces are treated as references; provide `$literal`/escaping for edge cases). It also makes provenance readable: anyone scanning an expression knows where every value comes from — host data, a local computation, the fragment caller, the enclosing loop — without looking anything up, and the engine knows it statically too, which is what makes the typo-catching, the scoping guarantees, and `getDependencies` all fall out of one mechanism.

The everyday win is huge, too: data access — overwhelmingly the most common operation — collapses from a 3-line operator node to a string. `getData` remains as an operator for dynamic paths, and `$data.a.b` is defined as sugar for it. This also cleanly subsumes `{{name}}` substitution in `stringSubstitution`, which today has its own private lookup path into `data`.

#### The required companion decision: absence resolves to `null`

The terse form above only pays off if paired with a change to missing-path semantics. In v2, `getData` on a non-existent path **throws** (`object-property-extractor` errors on missing paths unless handed a fallback), and since absent paths are routine in dynamic data, real-world expressions almost always wrap data access in `fallback` — which would drag the one-string reference straight back to a full operator node. The deeper issue is that v2 bundles two different things into `fallback`: *failure* (a network request errored) and *absence* (a field isn't populated yet). The first is exceptional; the second is the common case — and conflating them also means you can't tell "the GET failed" from "the data isn't there yet" (part of why issue [#132](https://github.com/CarlosNZ/fig-tree-evaluator/issues/132) exists).

V3 should unbundle them: a `$data.*` reference on a missing path resolves to `null`, full stop — the norm in JS optional chaining, GraphQL, jq, and JSONata, for exactly this reason. The layered story becomes:

- **Terse ref, no default**: `"$data.user.firstName"` → value or `null`. Never throws.
- **Terse ref with default**: `{ $coalesce: ["$data.user.nickname", "Anonymous"] }` — still one line, and unlike `fallback` it composes across multiple candidates.
- **Explicit `getData`** with a `default` parameter (or strict mode) when you want a specific value or an actual error.
- **`fallback` returns to meaning "an operation failed"** — network errors, type errors — not "data absent". Populated-ness becomes an ordinary null check, which is also the clean basis for #132-style "don't fire the query until inputs are ready" semantics on I/O operators.

The honest trade-off: null-on-missing can mask path typos (`$data.user.frstName` silently yields `null` forever). Three mitigations: `getDependencies()` (§3.3) lists every data path an expression references, letting tooling — the editor especially — validate them against a data schema or sample data at authoring time, which is *better* typo protection than a runtime throw in production; trace mode shows exactly which references resolved to null; and a `strictDataPaths` option restores throw-on-missing for those who prefer v2's discipline.

One downstream cost to budget for: with nulls flowing as ordinary values, every operator needs a defined null policy (does `+` skip nulls or error? what does `stringSubstitution` render for null?). Issue [#138](https://github.com/CarlosNZ/fig-tree-evaluator/issues/138) is already this question in miniature. V2 pays this cost too — just implicitly, through JS coercion.

### 3.3 Evaluation model: an internal parse → validate → evaluate pipeline

The pipeline is engine architecture, not consumer ceremony — there is no consumer-facing "compile" step. Runtime consumers keep exactly the API they have today:

```ts
const fig = new FigTree(options)
await fig.evaluate(expression, data)   // parse (cached) → validate → evaluate
fig.evaluateSync(expression, data)     // same, synchronous; throws if the tree contains async operators
fig.validate(expression)               // tooling: editor diagnostics, build-time config linting
fig.getDependencies(expression)        // tooling: { dataPaths, fragments, functions, operators }
```

Compile-once performance comes for free via internal memoization: the engine caches the parsed/normalized form in a `WeakMap` keyed on the expression object. Config expressions are typically parsed from JSON once and held by the consumer, so object identity is stable — repeated evaluation (including hot loops over rows) hits the cached form with zero API overhead. `validate` and `getDependencies` exist for the editor and for CI-style config linting; production code never needs to call them, but the validate phase still runs (cached) inside every `evaluate`, because it changes *when* errors surface: a malformed expression fails fast with a good message before any network request fires.

- **Validation is structural, and layered with the runtime type-check.** It cannot know what dynamic children will return, and doesn't try. What it catches without evaluating anything: unknown operators, misspelled or unknown parameter keys, missing required parameters, positional-arity errors, unresolved `$vars`/`$param` references, unknown fragments, fragment cycles — plus type errors on parameters that are *literals*, which in practice is most of them (paths, URLs, flags, delimiters, branch keys). V2's evaluate-then-type-check remains as the second layer, scoped to what genuinely can't be known earlier: values arriving from `getData`, HTTP/SQL, or custom functions. The v2 gap isn't that runtime checking exists — it's that it's the *only* layer, so a misspelled operator name is undiscoverable until the expression runs against real data. Combined with "don't evaluate until required params are non-null" semantics on I/O operators, this resolves issue [#132](https://github.com/CarlosNZ/fig-tree-evaluator/issues/132) properly.
- **Return-type inference is an optional later refinement**: operator metadata can declare result types (`equal` → boolean, `split` → array), letting validation flag *provable* mismatches in dynamic parameters too (a `count` whose child is an `equal` node can never receive an array). `unknown` (from `getData`, HTTP, custom functions) propagates silently, so this only ever reports certain errors — gradual typing, not a type system.
- **`getDependencies` is an editor gold mine**: prefetch data, show "this expression uses `user.firstName`", invalidate caches precisely.
- **Trace/explain mode**: `fig.evaluate(expr, data, { trace: true })` returns the result plus a node-annotated tree of intermediate values. For a language whose selling point is debuggable config logic, this is the single most valuable new feature you can ship, and the editor can render it directly.
- **Resource limits**: `maxDepth`, `maxNodes`, `timeout`, and an `AbortSignal` threaded through to HTTP/SQL clients.
- **Deterministic scoping** falls out of the parse phase: `vars` resolve lexically, memoized per evaluation, no shared-object mutation.

### 3.4 Operator set — drop / merge / fix / add

**Drop** (with converter support): `PASSTHRU` (any value already evaluates; `outputType` can sit on a `literal` wrapper if ever needed), `COUNT` (becomes `length`, working on strings *and* arrays), positional `children`, SQL `queryType`, the GraphQL `graphqlendpoint` sentinel, the `{url, headers}` object-as-url legacy shape, and the five-deep custom-function lookup chain in [CUSTOM_FUNCTIONS/operator.ts:18-28](../../v2-src/operators/CUSTOM_FUNCTIONS/operator.ts#L18-L28) (functions resolve from `options.functions`, full stop — today a function can be invoked out of the `data` object, which is a sandbox-integrity problem).

**Merge GET/POST into a single `http` operator.** The v2 implementations are near-duplicates (POST literally imports GET's `parseChildren`), and the real difference was never the method — it's that `parameters` means query-string params on GET but JSON body on POST: the same property name with different semantics, naming drift in one more costume. The merged operator adds `method` (default `'get'`) and splits the overloaded property into explicit `query` (query string, valid on any method) and `body` (request body; a validation error on body-less methods):

```js
{
  operator: "http",
  url: "https://api.example.com/users",
  method: "post",          // default: "get"
  query: { active: true }, // → query string
  body: { name: "..." },   // → request body
  returnProperty: "id"
}
```

Bonuses that fall out for free: PUT/PATCH/DELETE become a literal-type extension of `method` rather than three new operators; cache defaults get a principled rule (idempotent methods cache by default, non-idempotent don't) instead of v2's undocumented per-operator table; "no network" is a single exclusion; and the terse shorthand survives, since `{ $http: "https://..." }` defaults to GET. **GraphQL stays a separate operator, implemented *on* the http core.** Mechanically it's just a POST, so the duplication dies at the implementation level — but the semantic surface earns the name three ways: dedicated `query`/`variables`/`returnNode` parameters the editor can render meaningfully (query textarea, variables form) rather than hand-assembled body shapes; the default-endpoint connection convention; and, decisively, error semantics — GraphQL returns 200-with-`errors`, so something has to inspect the envelope, and a generic `http` operator would report success on a failed query. Deliberately *not* carried over: `get`/`post` as preset aliases that pin `method` — one-way-to-say-things wins, and `method: 'post'` is one short line. (The `{url, headers}` object-as-url shape and the `graphqlendpoint` sentinel from the drop list above die naturally in this redesign.)

**Merge/regularize**: EQUAL/NOT_EQUAL share one implementation (fixing the NOT_EQUAL bug and the "only the first element gets null-coalescing" asymmetry); GREATER_THAN/LESS_THAN gain `>=`/`<=` (closing the ancient issue #22 TODO comment) with one honest `strict` default; `returnProperty` becomes the same parameter name across `http`/`graphQL`/`sql`; binary operands standardize (`values: [a, b]` everywhere, dropping `from`/`subtract` vs `dividend`/`divisor` drift); empty-input behavior standardized (empty `values` on arithmetic = validation error, not `[]` vs `0` roulette).

**Fix**: PLUS's polymorphism is a feature users like — keep add/concat/merge, but make mixed incompatible types an error rather than silent JS coercion, and rename its mode selector so it stops colliding with `outputType`. REGEX gains flags and an output mode (`test` | `match` | `extract`). `outputType: "number"` stops regex-mining strings.

**Add** (roughly in priority order):

1. `NOT` — embarrassing gap, one-liner.
2. **Iteration**: `map`, `filter`, `find`, `some`/`every`, with `$item`/`$index` references (issue [#92](https://github.com/CarlosNZ/fig-tree-evaluator/issues/92)). This is the most-requested capability class in every expression language; without it users bail out to custom functions for anything list-shaped.
3. `coalesce` (first non-null) — today people abuse `fallback` for this, and it's the essential companion to absence-as-null `$data` references (§3.2).
4. Math batch: `%`, `pow`, `round`/`floor`/`ceil`, `min`/`max`, `abs`.
5. String batch: `lower`/`upper`, `trim`, `substring`, `join` (explicit, rather than `+`-with-vibes).
6. **Date/duration operators as an optional plugin module** (`fig-tree-evaluator/dates` or similar) — huge demand in form/workflow config, but keep it out of core to avoid the Intl/timezone bundle tax.

### 3.5 Extensibility: one operator concept, pluggable

Today "custom functions" and "custom operators" are two syntaxes over one limping mechanism with no metadata parity with built-ins. V3: **`defineOperator()` is the only extension API**, taking the same metadata shape as built-ins (so custom operators are first-class in the editor, type-checked, cacheable, and introspectable). `options.functions` remains as sugar that wraps a plain function into a minimal operator definition.

Make the operator registry explicit and tree-shakable:

```ts
new FigTree({ operators: [...coreOperators, httpOperators(fetchClient), sqlOperators(pgClient)] })
```

I/O operators become **opt-in by construction** — better security default than today's opt-out `excludeOperators` (keep `excludeOperators` for dynamic restriction — *superseded: `excludeOperators` removed from v3 entirely, Options ruling, July 2026*), and bundlers drop what you don't register. Per §3.4, `httpOperators(client)` exports exactly two operators — `http` and `graphQL` — sharing one client and one request core, down from three near-duplicate implementations.

### 3.6 API surface and packaging

- **Immutable options.** Per-call overrides are merged into a frozen per-evaluation context and never touch the instance — fixing the httpClient/cache leak outright. `updateOptions` remains the one sanctioned mutation path, with the same (documented) merge semantics as per-call overrides.
- **Metadata is the single source of truth.** Runtime defaults are *read from* operator metadata (one `default` field, plus a separate `example` field for playground values — the current conflation is exactly why five operators' documented defaults are wrong). The README operator reference should be **generated** from the same metadata; the doc drift (`PG_SQL`/`GRAPH_QL` naming in the caching section, the stale `demo/` references, the fragment-metadata shape mismatch between README and `types.ts`) never happens again.
- **Error handling**: keep throw-by-default + `fallback`. Drop `returnErrorAsString` (error text indistinguishable from legitimate output) in favor of an envelope option: `evaluate(expr, { mode: 'report' })` → `{ result, errors: FigTreeError[] }`.
- **Caching**: pluggable store interface (`get`/`set`, so consumers can drop in an LRU lib or localStorage adapter), structured keys (`JSON.stringify({ op, params })`, not `_`-joined collision bait), `setCache` rebuilds recency, per-operator cache defaults declared in metadata.
- **Packaging**: subpath exports — `.` (engine + core operators), `./convert` (v1/v2/shorthand converters), `./clients` (Axios/Fetch/SQL wrappers), `./dates` etc. Remove `dequal`, `truncateString`, `standardiseOperatorName` from the public API (the editor can depend on internals via a `./internal` subpath if it must). One `isFigTreeExpression` (the registry-aware one; the structural check becomes `isOperatorNode`, which already exists).
- **Options to delete**: `objects`, `supportDeprecatedValueNodes`, `allowJSONStringInput` (caller can `JSON.parse`), `noShorthand` (moot once normalization is a one-time parse step), global `caseInsensitive`/`nullEqualsUndefined` (per-node parameters only — global flags that secretly retune two operators are spooky action at a distance). `evaluateFullObject` becomes an explicit `fig.evaluateDeep(obj, data)` method rather than a mode that changes what `evaluate` means.

### 3.7 Migration story

- Ship `convertV2ToV3` in `./convert`, built on the parse-phase normalizer (which, unlike today's converters, works on a regular grammar — most of the current converter fragility evaporates).
- Since most real-world v2 expressions are "named properties + a handful of common aliases," the converter plus a published alias-mapping table covers the bulk mechanically. Publish a migration doc generated from the alias table.
- Optionally ship a `v2Compat` flag for one major cycle that accepts the old alias table and `children`, warning on use — then delete it.

---

## Part 4 — Worth fixing in v2 regardless

These stand on their own even if v3 takes a while:

1. **NOT_EQUAL `nullEqualsUndefined` bug** — [NOT_EQUAL/operator.ts:39](../../v2-src/operators/NOT_EQUAL/operator.ts#L39) (`&&` should be a negated `||`).
2. **`strict` default mismatch** in GREATER_THAN/LESS_THAN (runtime `true`, docs/metadata say `false`) — decide which is intended and align.
3. **DIVIDE**: documented `'decimal'` output literal is rejected by its own type-check; default output disagrees with metadata.
4. **`console.log` in FetchClient** ([httpClients.ts:87](../../v2-src/httpClients.ts#L87), [:112](../../v2-src/httpClients.ts#L112)).
5. **Per-call `httpClient`/cache options permanently mutating the instance** ([FigTreeEvaluator.ts:61-69](../../v2-src/FigTreeEvaluator.ts#L61-L69)).
6. The metadata-default corrections for POST `useCache`, SPLIT delimiter, STRING_SUBSTITUTION `substitutionCharacter`.
7. STRING_SUBSTITUTION un-escape only replacing the first occurrence (missing `/g` at [operator.ts:64](../../v2-src/operators/STRING_SUBSTITUTION/operator.ts#L64) and [:75](../../v2-src/operators/STRING_SUBSTITUTION/operator.ts#L75)).

## Priority summary

| | Item |
|---|---|
| **Drop** | `children` (public), root hoisting, PASSTHRU, COUNT, `type` alias, `objects`, deprecated value nodes, `allowJSONStringInput`, `returnErrorAsString`, mega-alias tables, case-insensitive names, custom-function lookup chain, editor utils from main entry |
| **Redesign** | `$` → namespaced references (`$data`/`$vars`/`$param`/`$item`); alias nodes → lexical `vars`; internal parse/validate/evaluate pipeline; immutable options; operator registry as opt-in plugins; one `defineOperator` extension API; GET/POST → single `http` operator (GraphQL kept, built on it) |
| **Improve** | metadata as single source of truth + generated docs; structured cache keys + pluggable store; error envelope mode; strict coercion rules; consistent parameter naming; REGEX modes; resource limits + AbortSignal |
| **Add** | iteration operators, `NOT`, `coalesce`, math/string batches, trace/explain mode, `getDependencies` introspection, `evaluateSync`, subpath exports, optional date plugin |

The two features to call *make-or-break* for v3, if only two things are taken from this report: the **reference/`vars` scoping redesign** (§3.2) — it fixes the most confusing syntax, the most subtle semantics, and the biggest editor pain in one move — and the **internal parse/validate pipeline with trace mode** (§3.3), which converts FigTree from "an evaluator" into "a language with tooling," which is where its editor-centric ecosystem is already trying to go.

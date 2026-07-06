# FigTree v3 — API specification

*Working document. Each section is discussed and agreed before being written here; sections marked **Draft** are under discussion, **Agreed** sections are settled (revisit deliberately, not casually).*

*Companion to [v3-assessment.md](v3-assessment.md), which holds the rationale. This doc records the decisions.*

## Status overview

| Area | Status |
|---|---|
| Node grammar & reserved keys | **Agreed** — includes `fallback`/kill-switch semantics, `outputType`→`convert`, `//` comments, name legality & opaque-value rules |
| References & scoping (`$data` / `$vars` / `$params` / `$element`) | **Agreed** — lazy-var mechanism & exotic-key path grammar noted as implementation follow-ups |
| Alias policy | **Partial** — operator naming & aliases settled under Operators; parameter-name aliases proposed (none at all) in [v3-operator-parameters.md](v3-operator-parameters.md) |
| Type, coercion & null policy | **Agreed** — JSON-only value domain, no implicit coercion, FigTree truthiness (JS-parity, marked for revisit), null-policy vocabulary + null-means-unset optionals, `convert` table, shared stringification |
| Operators | **Agreed** — canonical list, aliases & shorthand faces; per-operator parameters in progress |
| Per-operator parameters | **In progress** — own working doc: [v3-operator-parameters.md](v3-operator-parameters.md) (conventions + batch 1 drafted); also hosts the contract-requirements ledger. Ambiguous rulings queued for an end-of-passes group review in [v3-cases-for-review.md](v3-cases-for-review.md) |
| Fragments | **Agreed** — wrapper definition shape, object-keyed parameter declarations (default-implies-optional, null-means-unset), lazy memoized arguments with an eager dynamic-arguments escape, recursion ban, registration-time validation, opaque tooling `metadata` |
| Extensibility (`defineOperator`) | **Partial** — single mechanism (the v2 `functions` tier is dropped), first-class principle, naming & aliases, plugin story; the full operator contract is deferred until after the per-operator parameter passes |
| **Options** (shape, merge semantics, registration) | **Agreed** |
| Evaluator methods & return shapes | — (partially sketched under Options; `report`/`trace` shapes deferred) |
| Packaging & exports | — |
| Migration & conversion (`./convert`, v2→v3) | — |

---

## Options — **Agreed**

### One shape, three places

There is a single `FigTreeOptions` interface, accepted in all three places: the constructor, `updateOptions()`, and per-call as the second argument to `evaluate()`. Instance-level values act as defaults; per-call values override them for that evaluation only.

**One exception class — the invocable registry:** `operators` and `fragments` are accepted at construction and via `updateOptions()`, but not per-call. The parsed/normalized form of an expression depends on what's registered (shorthand `$key`s resolve against operator and fragment names alike), and the parse cache assumes a stable registry. Operators and fragments are system-level definitions by design — there is no impromptu per-evaluation invocable; per-request state belongs in `data`, read by an operator as ordinary parameters. Passing either per-call is a validation error.

Per-call options are merged into a frozen per-evaluation context and **never mutate the instance** (fixing the v2 bug class where `evaluate(expr, { httpClient })` permanently reconfigured the evaluator). `updateOptions()` is the one sanctioned mutation path. `getOptions()` returns a snapshot, never live internal references.

### The shape

```ts
new FigTree(options?: FigTreeOptions)

interface FigTreeOptions {
  // ── Evaluation environment ─────────────────────────────
  data?: Record<string, unknown>
  fragments?: Record<string, FragmentDefinition> // definition shape: see Fragments; not per-call (see below)

  // ── Operator registry ──────────────────────────────────
  operators?: (OperatorDefinition | OperatorDefinition[])[] // flattened one level; default: coreOperators only
  excludeOperators?: OperatorName[]                         // canonical names, case-sensitive; per-call legal
  operatorDefaults?: { [operator: OperatorName]: { [param: string]: unknown } }

  // ── I/O configuration ──────────────────────────────────
  http?: { baseEndpoint?: string; headers?: Record<string, string> }
  graphQL?: { endpoint?: string; headers?: Record<string, string> }

  // ── Reference semantics ────────────────────────────────
  strictDataPaths?: boolean // default false: missing $data path resolves to null; true: throws

  // ── Resource limits ────────────────────────────────────
  maxDepth?: number  // structural, enforced at parse/validate
  maxNodes?: number  // structural, enforced at parse/validate
  timeout?: number   // ms, whole evaluation — strict: deadline includes fallback evaluation; only timeout shielding (static root-level fallbacks) can shape a timed-out result (see Node grammar)
  signal?: AbortSignal // threaded through to HTTP/SQL clients; instance-level = default for all evaluations

  // ── Caching ────────────────────────────────────────────
  useCache?: boolean // blanket default; full precedence: node key > operatorDefaults > this > operator metadata default
  cache?: { store?: CacheStore; maxSize?: number; maxTime?: number } // CacheStore = { get, set } — pluggable

  // ── Type checking ──────────────────────────────────────
  runtimeTypeCheck?: boolean // default true. Structural validation is NOT skippable (cached, cheap, source of good errors)

  // ── Output & error handling ─────────────────────────────
  mode?: 'throw' | 'report' // default 'throw'; see below
  trace?: boolean           // default false; annotated intermediate values (shape deferred)
}
```

### Operator registration

The `operators` array is the **only** registration mechanism. Factory functions (`httpOperators(client)`, `sqlOperators(connection)`) are plain functions returning operator definitions with their client closed over — the client is wiring, not configuration, and does not appear anywhere in options. Custom operators built with `defineOperator()` enter through the same array.

```ts
const fig = new FigTree({
  operators: [
    coreOperators,                          // built-in set, exported as an array (nested arrays are flattened)
    httpOperators(new FetchClient(fetch)),  // → [http, graphQL] definitions, client baked in
    sqlOperators(pgConnection),             // → [sql]
    myCustomOperator,                       // single definition from defineOperator()
  ],
})
```

- Omitting `operators` defaults to `coreOperators` only — no HTTP, no SQL. Supplying it states the registry exhaustively (include `coreOperators` yourself if wanted). Opt-in by construction: an instance can only reach the network because someone visibly handed it a client.
- `excludeOperators` remains for *dynamic* restriction on top of the fixed registry (cheap filter, per-call legal).
- Clients are not swappable per-call or via `updateOptions` — build a new instance.

### `operatorDefaults`

Overrides any declared parameter default, per operator, at instance level. Replaces v2's global `caseInsensitive` flag (and answers every future ask of the same shape in advance — "I always want `strict` comparisons", etc.).

```ts
operatorDefaults: {
  equal: { caseInsensitive: true },
  notEqual: { caseInsensitive: true }, // stated per operator — no implicit sharing between related operators
}
```

- Per-node parameters always override.
- Validated at construction against operator metadata: unknown operator, unknown parameter, or type mismatch is an error.
- **Reserved-modifier defaults** (extension agreed during the parameter passes): an entry may also default the node modifiers **`fallback`** (any constant value) and **`useCache`** (boolean) — unambiguous alongside parameter names because the flat reservation (Node grammar) bars those words as parameter names. `operatorDefaults: { plus: { fallback: 0 } }` makes every `plus` node without its own `fallback` behave as if it carried `fallback: 0`, including counting as "carrying" one for the nearest-enclosing-catch rule and for timeout shielding (constants are static by construction). Constants only, like everything else in this map — an expression-valued default fallback would have no evaluation scope of its own, and would silently un-shield expressions. Per-node keys override wholesale. Motivating case: a host that wants `plus` failures (e.g. the empty-aggregate error) to degrade to `0` opts in per instance, visibly. Boundary, recorded: this catches *failures* only — a `null` operand propagating to a `null` result is success, and no fallback fires (provisional — [v3-cases-for-review.md](v3-cases-for-review.md) #3).
- `useCache` precedence, full chain: node key → `operatorDefaults` → blanket `useCache` option → operator metadata default.
- Visible to tooling: `getOperators()` reports the *effective* defaults — parameter and modifier alike — so the editor and generated docs stay honest — the crucial difference from v2's invisible global flag.
- Portability caveat (accepted): an expression can mean something different on a differently-configured instance — but expressions already depend on instance-supplied `fragments`, custom operators, and clients; what matters is that the dependency is declared and machine-readable.

### Merge semantics

One rule, uniform across `updateOptions()` and per-call options:

> Merge by key at the top level, and again by key one level down inside object-valued options; anything deeper is replaced wholesale. Arrays always replace. Keys set to `undefined` are ignored (to *remove* something, supply the parent block in full).

Consequences, checked against every nested option:

| Update | Result |
|---|---|
| `http: { headers: {…} }` | merges into `http` — `baseEndpoint` survives; the `headers` object itself is replaced as a unit |
| `graphQL: { endpoint }` | keeps existing `graphQL.headers` |
| `cache: { maxSize }` | keeps `store` / `maxTime` |
| `fragments: { newFrag }` (`updateOptions` only) | adds without clobbering others; re-supplying an existing name replaces that definition wholesale (no stale sub-keys) |
| `data: { user: {…} }` | merges at top-level data keys; a supplied key replaces its whole value |

### `evaluate` signature

```ts
await fig.evaluate(expression, options?)

fig.evaluate(expr)                                  // constructor data only
fig.evaluate(expr, { data: formValues })            // everyday case
fig.evaluate(expr, { trace: true })                 // per-call options without per-call data
```

`data` is an ordinary option — there is no positional `data` argument (considered, rejected: it would be a second way to say something the options object already says, and forces an `undefined` placeholder when passing options without data). Per-call values merge over instance options with the standard two-level rule. This also matches the v2 signature, so migration continuity comes free.

### Deep evaluation

**Deep evaluation is the only semantics — there is no shallow mode and no separate method.** An expression is any JSON value: plain object literals are traversed exactly as arrays always have been, recognized nodes anywhere within evaluate in place, and `literal` opts a subtree out. The everyday whole-config call is simply `fig.evaluate(configObject, { data })`.

This is not a new feature so much as the only reading consistent with what's already agreed: "a recognized key invokes" (Operators) is unconditional, references are recognized inside plain object/array literals (References §5), and arrays evaluate element-wise unconditionally. A shallow mode would require `{ title: "$data.name" }` to substitute while `{ title: { $upper: "$data.name" } }` passes through verbatim — two recognition grammars selected by mode, which is v2's `evaluateFullObject` spookiness respelled. Both that option and the `evaluateDeep()` method previously sketched in the assessment are therefore deleted.

- **No runtime traversal cost**: recognition happens once at parse — a large config object compiles to a constant skeleton plus a list of evaluable holes, and each evaluation touches only the holes; a subtree with no evaluable content short-circuits to identity. Suggested mechanism recorded in [v3-implementation-notes.md](v3-implementation-notes.md). (v2's `evaluateFullObject` re-walks the entire object on every evaluation.)
- Unrecognized `$` keys/strings remain inert-with-warning (per Operators), so expression-*looking* data mostly passes through untouched; `literal` covers data whose keys collide with *registered* names.
- Migration: v2 `evaluateFullObject: true` users get this behaviour natively. v2 default-shallow expressions that relied on plain objects passing through verbatim are the rare case; the converter wraps such objects in `literal`.

**`operator:` keys in plain data — resolved, no rule change.** The "an `operator` key is unambiguous intent → hard error" rule stands unchanged under deep evaluation. The apparent hazard — innocent runtime data like `{ operator: 'Alice' }` becoming a parse error — dissolves against the static-recognition rule (References §4): values flowing through `$data`, HTTP/SQL results or function returns are never parsed, so runtime data can contain anything. The rule only reaches data physically embedded in an *authored expression*, where the author is by definition FigTree-aware, the failure is loud at parse/`validate()` time rather than silent, and `literal` is the documented wrap.

Deferred to other areas:

- Whether `vars` is reserved (and functional) on plain object literals → **resolved in Node grammar**: it is — functional and consumed, with `literal` / `buildObject` as the escape for data genuinely needing a `vars` key.
- `buildObject`'s remaining role narrows to dynamic *keys*, since dynamic values now come free → its parameter pass.
- Result-immutability policy (the identity short-circuit returns shared references; see implementation notes) → Evaluator methods & return shapes.

### Error handling: `mode`

- **`mode: 'throw'`** (default) — first uncaught error aborts the evaluation and throws a `FigTreeError`; `fallback`s still catch where present.
- **`mode: 'report'`** — never throws. An erroring node resolves to its `fallback` if present, otherwise `null`, and evaluation of everything else continues (the v2 `returnErrorAsString` partial-evaluation use case, minus its in-band-signaling flaw). Every error is collected as a `FigTreeError` **tagged with the failing node's path**, returned alongside the result.

`FigTreeError` carrying a node path is part of the contract (also needed for editor diagnostics and trace mode).

### v2 → v3 option disposition

| v2 option | Verdict | Notes |
|---|---|---|
| `data` | **Kept** | Unchanged — per-call via `options.data`, merging over constructor `data` |
| `objects` | **Deleted** | Deprecated alias of `data` |
| `functions` | **Deleted** | No custom-function tier in v3 — each function re-registers as a first-class custom operator via `defineOperator()`, through the `operators` array (see Extensibility; mechanical wrapper recipe in the migration doc) |
| `fragments` | **Modified** | No longer per-call — constructor/`updateOptions` only (registry stability); definition shape revisited in Fragments (declared params) |
| `httpClient` | **Deleted → factory** | `httpOperators(client)` |
| `graphQLConnection` | **Split** | `httpClient` sub-key deleted (shares the http client); `endpoint`/`headers` → `graphQL` block |
| `sqlConnection` | **Deleted → factory** | `sqlOperators(connection)` |
| `baseEndpoint` | **Moved** | → `http.baseEndpoint` |
| `headers` | **Moved** | → `http.headers` |
| `returnErrorAsString` | **Deleted** | → `mode: 'report'` |
| `nullEqualsUndefined` | **Deleted** | Global flag dies; per-node survival is an operator-area question — with missing-paths-resolve-to-null, `undefined` mostly exits the model |
| `caseInsensitive` | **Deleted** | → `operatorDefaults: { equal: { caseInsensitive: true }, … }`; per-node param remains |
| `allowJSONStringInput` | **Deleted** | Caller can `JSON.parse` |
| `noShorthand` | **Deleted** | Moot — shorthand normalizes once at parse |
| `skipRuntimeTypeCheck` | **Renamed** | → `runtimeTypeCheck?: boolean`, default `true` (positive name, no double negative) |
| `evaluateFullObject` | **Deleted** | Deep evaluation is the only semantics — see [Deep evaluation](#deep-evaluation); no `evaluateDeep` method either |
| `excludeOperators` | **Modified** | Canonical names only, case-sensitive |
| `useCache` | **Kept** | Same meaning |
| `maxCacheSize` | **Moved** | → `cache.maxSize` |
| `maxCacheTime` | **Moved** | → `cache.maxTime` |
| `supportDeprecatedValueNodes` | **Deleted** | v1 compat lives in `./convert` only |

**New in v3:** `operators`, `operatorDefaults`, `http` / `graphQL` blocks, `strictDataPaths`, `maxDepth` / `maxNodes` / `timeout` / `signal`, `cache.store`, `mode`, `trace`.

### Deferred (to Evaluator methods & return shapes)

- Exact return shapes for `mode: 'report'` and `trace: true`.
- The return shape when the evaluation-level `timeout` aborts under `mode: 'report'` (presumably `{ result: <shielded assembly> ?? null, errors: [timeoutError] }` — see Node grammar, `fallback` rule 3).
- The TypeScript story for instance-level `mode`/`trace` (return-type inference via class generic vs. a single stable return shape — to be settled together with the shapes themselves; note `updateOptions({ mode })` cannot re-type an existing instance).

---

## Operators — **Agreed**

*Canonical list, aliases and shorthand faces only. Per-operator parameters (names, types, defaults, positional order) are **not** covered here — each operator gets its own pass, agreed individually in [v3-operator-parameters.md](v3-operator-parameters.md).*

### Naming rules

0. **Plain English over programmer jargon.** FigTree's audience is tech-savvy config authors, not necessarily developers: when a plain-English name is as precise as the established programming term, plain English wins — hence `firstOf`, not SQL's `coalesce` (obscure to non-programmers, and misleading as ordinary English, where it suggests merging). Established math/JS names survive where they're the precise, searchable term with no equally-precise plain alternative (`modulo`, `pow`, `regex`, `map`, `some`, `every`). This is a judgment call, not an algorithm — borderline cases are decided here and the outcome recorded in the table notes.
1. **Canonical names are camelCase, case-sensitive, exact-match.** No case folding, no camelCase normalization — `$If`, `PLUS` and `not_equal` are unknown-operator errors. v2's `standardiseOperatorName` machinery and the generated alias table die.
2. **At most one alias per operator, always symbolic.** The full set: `+` `-` `*` `/` `=` `!=` `>` `>=` `<` `<=` `?` `!`. Word aliases die entirely (v2 shipped ~95 operator-name aliases across 24 operators, before counting the unbounded case/camelCase variants).
3. **An alias is valid anywhere the canonical name is** — as a shorthand `$key` or as an `operator:` value — and parse normalizes it away: the canonical AST contains only canonical names.
4. **One invocation namespace, collision-checked at registration.** A fragment or custom operator whose name matches any operator name or alias is a registration error ([#136](https://github.com/CarlosNZ/fig-tree-evaluator/issues/136)). No silent precedence.
5. **Reserved names**, unusable for fragments and custom operators: the reference namespaces `data`, `vars`, `params`, `element`, `index` and their single-character alias forms (`d`, `v`, `p`, `e`, `i`), plus `literal`. (Reserved *node keys* are settled in the Node-grammar area.)

### The canonical list

42 core + 3 I/O operators, 12 symbolic aliases. Which export array each operator ships in (`coreOperators` vs optional grouped arrays) is a Packaging-area decision — this section locks names and semantics only.

The rule that shaped the math batch, and pre-answers every future "why not one operator with a mode?": **a mode parameter is acceptable only when the signature is invariant across modes** — as with `plus`'s add/concat/merge, always `values: [...]`. When modes would change the arity or types of the other parameters (`round(value, decimals)` vs `pow(base, exponent)` vs `min(values[])`), they are separate operators; a mode-switched mega-operator hides per-mode signatures from validation, positional mapping and the editor.

#### Logic & control

| v3 | Alias | vs v2 | Notes |
|---|---|---|---|
| `and` | — | **Kept** (AND) | drops `&`, `&&` |
| `or` | — | **Kept** (OR) | drops `\|`, `\|\|` |
| `not` | `!` | **New** | `!` is reassigned — it meant NOT_EQUAL in v2 |
| `if` | `?` | **Modified** (CONDITIONAL) | new canonical name (v2 had only `?` / `conditional` / `ifThen`) |
| `match` | — | **Kept** (MATCH) | drops `switch` |
| `firstOf` | — | **New** | first non-null (SQL's `COALESCE`, renamed per rule 0 — README + `description` metadata keep the SQL name for searchability); the essential companion to null-on-missing `$data` references |

#### Comparison

| v3 | Alias | vs v2 | Notes |
|---|---|---|---|
| `equal` | `=` | **Kept** (EQUAL) | drops `eq`, `equals`; single shared implementation with `notEqual` |
| `notEqual` | `!=` | **Kept** (NOT_EQUAL) | drops `!`, `ne` |
| `greaterThan` | `>` | **Modified** (GREATER_THAN) | strictly-greater only — no `strict` param; drops `higher`, `larger` |
| `greaterThanOrEqual` | `>=` | **New** | replaces `strict: false` |
| `lessThan` | `<` | **Modified** (LESS_THAN) | strictly-less only; drops `lower`, `smaller` |
| `lessThanOrEqual` | `<=` | **New** | |

#### Arithmetic & math

| v3 | Alias | vs v2 | Notes |
|---|---|---|---|
| `plus` | `+` | **Kept** (PLUS) | keeps the add/concat/merge polymorphism (mode selector renamed `type` → `expect`, settled in its parameter pass); drops `add`, `concat`, `join`, `merge`; `add` reconsidered for verb-consistency with `subtract` / `multiply` / `divide` and rejected (batch-3 pass): `plus` names the polymorphic `+` it mirrors and pairs with its own alias, while `add` promises arithmetic-only and misreads as append on arrays — and the batch was never verb-consistent anyway (`modulo`, `pow`, `floor`, `min`) |
| `subtract` | `-` | **Kept** (SUBTRACT) | drops `minus`, `takeaway` |
| `multiply` | `*` | **Kept** (MULTIPLY) | drops `x`, `times` |
| `divide` | `/` | **Kept** (DIVIDE) | drops `÷` |
| `modulo` | — | **New** | |
| `pow` | — | **New** | |
| `round` | — | **New** | |
| `floor` | — | **New** | |
| `ceil` | — | **New** | |
| `min` | — | **New** | |
| `max` | — | **New** | |
| `abs` | — | **New** | |

#### String

| v3 | Alias | vs v2 | Notes |
|---|---|---|---|
| `buildString` | — | **Modified** (STRING_SUBSTITUTION) | renamed — name held provisionally (`template` rejected: first-class concept in Conforma; `format` / `interpolate` runners-up); drops `substitute`, `stringSub`, `replace` |
| `split` | — | **Kept** (SPLIT) | drops `arraySplit` |
| `join` | — | **New** | explicit array → string |
| `lower` | — | **New** | |
| `upper` | — | **New** | |
| `trim` | — | **New** | |
| `regex` | — | **Modified** (REGEX) | gains `flags` and a result `mode` (test / extract / match); drops `patternMatch`, `regexp`, `matchPattern`; constraint for its parameter pass: v2's numeric-mining use case must stay cleanly expressible (`"15 grams"` → `15` via extract, then `convert`) — discharged there |

#### Arrays & iteration

| v3 | Alias | vs v2 | Notes |
|---|---|---|---|
| `length` | — | **Modified** (COUNT) | canonical name is v2's own alias; works on strings *and* arrays |
| `map` | — | **New** | the `$element` / `$index` operators ([#92](https://github.com/CarlosNZ/fig-tree-evaluator/issues/92)) |
| `filter` | — | **New** | |
| `find` | — | **New** | |
| `some` | — | **New** | JS naming chosen over `any`/`all` |
| `every` | — | **New** | |

#### Data & objects

| v3 | Alias | vs v2 | Notes |
|---|---|---|---|
| `get` | — | **Modified** (OBJECT_PROPERTIES) | for *dynamic* paths — literal `"$data.a.b"` strings are defined as sugar for it; drops `getData`, `dataProperties`, `data` (now reserved), `objectProperties`, `objProps`, `getProperty`, `getObjProp` |
| `buildObject` | — | **Kept** (BUILD_OBJECT) | drops `build`, `object` |

#### Special

| v3 | Alias | vs v2 | Notes |
|---|---|---|---|
| `literal` | — | **New** | quote semantics: contents are not parsed, validated or evaluated — see [Unrecognized `$` and `literal`](#unrecognized--and-literal) |
| `convert` | — | **New** (replaces the v2 `outputType` / `type` node modifier) | `value` / `to`, with `to` ∈ `number` / `string` / `boolean` / `array`; single operator sanctioned by the mode rule (signature invariant across modes); literal `to` validates at parse, dynamic `to` is legal and lands on the runtime type-check like any parameter; conversion strictness & null handling settled in Type, coercion & null policy; v2's implicit number-mining is *not* carried over — that use case moves to `regex` extract + `convert` |

#### I/O — registered via `httpOperators(client)` / `sqlOperators(connection)`, never in core

| v3 | Alias | vs v2 | Notes |
|---|---|---|---|
| `http` | — | **New** (merges GET + POST) | `method` param, default `'get'`; deliberately no method-pinning aliases; drops `GET`, `get`, `api`, `POST`, `post`; parameter-pass constraint (likewise `sql`): a per-request `timeout` must be expressible — its expiry is an ordinary runtime failure per Node grammar's `fallback` rules |
| `graphQL` | — | **Modified** (GRAPHQL) | casing deliberately matches the agreed `graphQL` options block (exception to mechanical camelCase); implemented on the `http` core; drops `graphql`, `graphQl`, `gql` |
| `sql` | — | **Kept** (SQL) | drops `pgSql`, `postgres`, `pg`, `sqLite`, `sqlite`, `mySql` — the injected connection determines the dialect, the name never did |

### Custom operators

The CUSTOM_FUNCTIONS operator is deleted — and so is v2's `functions` option: **there is no custom-function tier in v3** (rationale in Extensibility). `defineOperator()` is the single extension mechanism; definitions register through the `operators` array into the one operator namespace and are invoked by their own name — canonical `{ operator: 'myFn', ... }`, shorthand `{ $myFn: ... }` — first-class and indistinguishable from native operators (Extensibility). With the `functionName` indirection gone, dynamically-computed function names are structurally impossible — v2's five-deep lookup chain (a sandbox-integrity hole) dies by construction. The definition shape is settled in Extensibility.

### Shorthand grammar

Every registered invocable — operator, fragment or custom operator — has exactly one shorthand face: a `$name` key, where `name` is the canonical name or its symbolic alias (`{ "$+": [1, 2] }`, `{ "$?": [...] }`).

Payload forms are disambiguated by JSON type — no heuristics:

| Payload | Meaning | Example |
|---|---|---|
| object | named parameters, always (v2's "spread unless a key starts with `$`" guess dies) | `{ $if: { condition: c, then: a, else: b } }` |
| array | positional parameters, mapped by declarative `positionalParams` metadata | `{ $if: [c, a, b] }` |
| anything else | a single positional argument | `{ $not: x }`, `{ $http: "https://…" }` |

- **Fragments take the named-object payload only** — no positional or single-value calls (user-defined parameter lists evolve; positional calls silently re-map — see [v3-assessment.md](v3-assessment.md) §3.1).
- Shorthand normalizes **once, at parse**: operator faces → `{ operator: … }` nodes, fragment faces → `{ fragment: …, parameters: … }` nodes. Tooling only ever sees canonical form.
- The public `children` form is deleted. Positional input survives only as the shorthand array form, and its mapping is metadata (`positionalParams`), replacing v2's 24 imperative `parseChildren` functions.
- How array payloads map for variadic operators (`{ $min: [1, 2, 3] }`) is fixed per operator by its `positionalParams` metadata — settled in the per-operator parameter passes.

### Unrecognized `$` and `literal`

> A `$` sigil resolves against what's known: a recognized key invokes; a recognized string prefix references. Anything unrecognized is **inert data at runtime**, and `validate()` flags every unresolved `$`-shaped key or string as a warning.

- `{ operator: 'typo' }` remains a hard error — an `operator` key is unambiguous intent.
- `{ $typo: […] }` or `"$dat.user.name"` pass through as plain data at runtime (v2-compatible behaviour), and surface at authoring time via editor/CI `validate()` warnings, and in trace output.
- `literal` covers the narrow remaining case: data whose keys or strings collide with **registered** names or reserved prefixes — e.g. MongoDB-style `{ $match: … }` stored as config data, or an expression whose intended *output* is itself a FigTree expression. `literal` contents are not parsed, validated or evaluated.

### v2 → v3 operator disposition

| v2 operator (aliases) | v3 | Notes |
|---|---|---|
| **AND** (`and`, `&`, `&&`) | `and` | |
| **OR** (`or`, `\|`, `\|\|`) | `or` | |
| **EQUAL** (`=`, `eq`, `equal`, `equals`) | `equal` (`=`) | |
| **NOT_EQUAL** (`!=`, `notEqual`, `!`, `ne`) | `notEqual` (`!=`) | `!` now means `not` |
| **PLUS** (`+`, `plus`, `add`, `concat`, `join`, `merge`) | `plus` (`+`) | `join` is now a separate operator |
| **SUBTRACT** (`-`, `subtract`, `minus`, `takeaway`) | `subtract` (`-`) | |
| **MULTIPLY** (`*`, `x`, `multiply`, `times`) | `multiply` (`*`) | |
| **DIVIDE** (`/`, `divide`, `÷`) | `divide` (`/`) | |
| **GREATER_THAN** (`>`, `greaterThan`, `higher`, `larger`) | `greaterThan` (`>`) | `strict: false` usage converts to `greaterThanOrEqual` |
| **LESS_THAN** (`<`, `lessThan`, `lower`, `smaller`) | `lessThan` (`<`) | `strict: false` → `lessThanOrEqual`; `lower` is now a string operator |
| **CONDITIONAL** (`?`, `conditional`, `ifThen`) | `if` (`?`) | |
| **REGEX** (`regex`, `patternMatch`, `regexp`, `matchPattern`) | `regex` | |
| **OBJECT_PROPERTIES** (`getData`, `dataProperties`, `data`, `objectProperties`, `objProps`, `getProperty`, `getObjProp`) | `get` | everyday form becomes a `"$data.…"` string |
| **STRING_SUBSTITUTION** (`stringSubstitution`, `substitute`, `stringSub`, `replace`) | `buildString` | |
| **SPLIT** (`split`, `arraySplit`) | `split` | |
| **COUNT** (`count`, `length`) | `length` | gains string support |
| **GET** (`GET`, `get`, `api`) | `http` | `method: 'get'` is the default |
| **POST** (`POST`, `post`) | `http` | converts with `method: 'post'` |
| **SQL** (`sql`, `pgSql`, `postgres`, `pg`, `sqLite`, `sqlite`, `mySql`) | `sql` | |
| **GRAPHQL** (`graphQL`, `graphQl`, `graphql`, `gql`) | `graphQL` | |
| **BUILD_OBJECT** (`buildObject`, `build`, `object`) | `buildObject` | |
| **MATCH** (`match`, `switch`) | `match` | |
| **CUSTOM_FUNCTIONS** (`customFunctions`, `customFunction`, `objectFunctions`, `function`, `functions`, `runFunction`) | *(deleted)* | each v2 function re-registers as a first-class custom operator, invoked by its own name (wrapper recipe in the migration doc) |
| **PASSTHRU** (`pass`, `_`, `passThru`, `passthru`, `ignore`, `coerce`, `convert`) | *(deleted)* | any value already evaluates; `literal` covers the escape case; its advertised coercion role → the real `convert` operator |

### Migration hazards — recycled names

The converter maps all of these mechanically, but human muscle memory won't — each needs a loud callout in the migration doc:

| Name | v2 meaning | v3 meaning |
|---|---|---|
| `!` | NOT_EQUAL alias | `not` |
| `get` | HTTP GET | data access (v2 OBJECT_PROPERTIES) |
| `lower` | LESS_THAN alias | lowercase string |
| `join` | PLUS alias (concatenation) | array → string |
| `data` | OBJECT_PROPERTIES alias | reserved namespace word |
| `convert` | PASSTHRU alias (identity) | type conversion (replaces `outputType`) |

### Deferred

- **Maybe-later operators**, added on demand: `includes`, `reduce`, `sort`, `reverse`, `flatten`, `unique`, `keys` / `values`.
- **Possible custom operators** — part-designed, deliberately not core; to build as first-class custom operators once the main package is done: `substring` (cut at the batch-4 review, July 2026 — position-based extraction is rare in config, and `regex` covers string innards; drafted design: `(value, start?, end?)`, zero-indexed, end-exclusive, code-point offsets, negatives counting from the end — the negatives question is [v3-cases-for-review.md](v3-cases-for-review.md) #20, mooted with the cut; full rationale in the batch-4 cut record, [v3-operator-parameters.md](v3-operator-parameters.md)).
- **Date/duration operators**: separate plugin package — own area, later.
- **Export grouping** (fat `coreOperators` vs lean core + `mathOperators` / `stringOperators` arrays): Packaging area. Candidate constraint floated for that discussion: the default core should cover everything v2 had post-conversion, so converted v2 expressions run without extra registration.

---

## References & scoping — **Agreed**

*The `$` sigil has exactly two jobs: in **key** position it invokes (an operator or fragment — see Operators); in **string-value** position it references a named scope. Five namespaces exist, each declaring the value's provenance. Any other `$`-string is inert data with a `validate()` warning (per Operators).*

### Namespaces

| Reference | Alias | Reads from | Absent / unresolved |
|---|---|---|---|
| `$data.…` | `$d` | the merged evaluation data (instance `data` + per-call `data`, per Options merge rules) | **`null`** (never `undefined`), null-propagating drill-through; `strictDataPaths: true` restores throw-on-missing |
| `$vars.…` | `$v` | the nearest enclosing `vars` block (lexical) | name not declared in lexical scope = **validation error** |
| `$params.…` | `$p` | the parameters supplied by this fragment's caller | use outside a fragment body, or naming an undeclared parameter = **registration/validation error** |
| `$element` | `$e` | the innermost enclosing iterator (current element; supports path drilling) | use outside an iterator = **validation error** |
| `$index` | `$i` | the innermost enclosing iterator (current index; bare only) | use outside an iterator = **validation error** |

Naming notes: `$params` is plural for consistency with `$vars`; `$element`/`$index` were chosen over v2-assessment's `$item` (which would have collided with `$index` over the `$i` alias). Every namespace has exactly one single-character alias; like operator symbols, aliases normalize to the canonical form at parse — the canonical AST only ever contains `$data.…` etc. The distinction between recognized-but-unresolvable (error) and unrecognized (inert) is deliberate: `$vars`/`$params`/`$element`/`$index` resolution is statically known, so failures there are authoring errors; `$typo.x` might just be data.

### Reference grammar

1. **Token rule**: a string is a reference iff it starts with `$<namespace>` (canonical or alias) followed by end-of-string, `.`, or `[`. `"$database"` is inert data — the namespace token is `database`, not `data` or `d`. Case-sensitive.
2. **Whole-string only**: `"Hello $data.name"` is inert — no interpolation inside strings; embedding is `buildString`'s job. One sanctioned embedding, recorded from the batch-4 pass: inside a **literal** `buildString` template, `{{$data.name}}`-style *reference tokens* are recognized at parse ([v3-operator-parameters.md](v3-operator-parameters.md), batch 4) — a template arriving as runtime data is never scanned for references (rule 4 unaffected).
3. **Path grammar**: dot-separated keys plus numeric bracket indices — `$data.users[0].name` — the same grammar as the `get` operator (v2's `object-property-extractor` syntax). Keys containing dots or brackets aren't expressible as a reference: use `get`, which takes the path as data.
4. **Static recognition only**: references are recognized in the expression tree at parse time and **never** in values flowing through at runtime — a string arriving from `$data`, HTTP or a custom operator's result is never re-interpreted as a reference. (v2 violates this: `{{name}}` substitution evaluates content extracted from `data` as an expression — [STRING_SUBSTITUTION/operator.ts:111-114](../src/operators/STRING_SUBSTITUTION/operator.ts#L111-L114) — an injection path this rule kills.)
5. **Recognized everywhere** in the expression — including strings nested inside plain object/array literals within parameters — except inside `literal`.
6. **References are values, not nodes**: they can't carry node modifiers like `fallback`. For defaults use `get` or `firstOf`; for type coercion wrap in `convert`.
7. **Bare namespace**: `"$data"` (or `"$d"`) alone = the whole merged data object; `$element` is bare-or-drilled, `$index` bare only; bare `"$vars"` / `"$params"` = validation error.

### Absence semantics: `null`, and the layered defaults

A missing `$data` path resolves to `null` — absence is not failure. Genuine `null` values and missing paths are indistinguishable at the reference level (deliberately); the layers below preserve the distinction when it matters:

| Tool | Triggers on | Use for |
|---|---|---|
| bare reference `"$data.x"` | — (yields `null`) | everyday reads |
| `firstOf` | `null` **or** missing | defaults across multiple candidates |
| `get` + `missingDefault` param (named in its pass, batch 6) | missing path **only** — a genuine stored `null` passes through unchanged | preserving the null/missing distinction; near-lossless converter target for v2 `getData` + `fallback` (v2's `extractProperty` likewise only threw on *missing*) |
| `fallback` | node **failure** (including missing paths under `strictDataPaths: true`) | operations that actually errored |

**Per-operator null policy**: the reference layer is uniform, and how each operator *treats* null is that operator's declared metadata policy (the cost of nulls-as-ordinary-values, paid explicitly). Recorded now: **`buildString` renders `null` as `""`** — a null from any source (missing data, null API field, `find` with no match) produces `"Phone: "`, never `"Phone: null"`. Other operators' null policies are settled in their parameter passes.

### `$vars` — lexical, lazy, memoized

Replaces v2 alias nodes. Declared in a `vars` block (reserved node key; names are plain identifiers with no `$` prefix — namespacing means they can't collide with operators, fragments or data keys), legal on any operator or fragment-call node, visible to that node and all descendants.

```js
{
  vars: {
    country: { $http: { url: 'https://restcountries.com/v3.1/name/zealand' } },
  },
  operator: 'if',
  condition: { $notEqual: ['$vars.country', null] },
  then: '$vars.country[0].name.common',   // drilling into the result — impossible with v2 aliases
  else: 'Not New Zealand',
}
```

- **Lazy + memoized**: a var evaluates at most once per scope instance per evaluation, on first reference; unreferenced vars never evaluate at all (a var used only in an `if` branch that never runs never fires its GET — extending the lazy-branch principle; deliberate change from v2's eager evaluate-at-node-entry, [evaluate.ts:148](../src/evaluate.ts#L148)). Parallel branches referencing the same var share the one in-flight evaluation.
- A var definition may reference vars from the same block or outer scopes; cycles are a validation error (statically detectable).
- **Shadowing** an outer name in an inner `vars` block is allowed (standard lexical behaviour); `validate()` warns.
- **Fragments are sealed**: a fragment body sees its own `vars` and its `$params`, never the caller's vars — keeping fragments portable and statically checkable.

### `$element` / `$index` and `as`

Bound by the iterator operators (`map`, `filter`, `find`, `some`, `every`), always to the **innermost** enclosing iterator. Nested iterators reach an outer binding by naming it: `as: 'order'` renames that iterator's bindings to `$order` (element) and `$orderIndex` (index), and disables `$element`/`$index` for that iterator (one way to refer to each thing). `as` names are validated against the reserved namespaces (long and short forms) and enclosing `as` names. The parameter pass ([v3-operator-parameters-2.md](v3-operator-parameters-2.md), batch 5) fixes the binding scope precisely — the iterator's `each` subtree: the iterator's own `input`, and `vars` / `fallback` on the iterator node itself, are outside it.

```js
{
  operator: 'map',
  input: '$data.orders',
  as: 'order',                        // this iterator now binds $order / $orderIndex
  each: {
    operator: 'map',
    input: '$order.items',            // the outer element, by name
    each: {
      $buildString: ['%1 × %2 (order %3)', '$element.name', '$element.qty', '$order.id'],
    },
  },
}
```

### v2 → v3 disposition

| v2 mechanism | Fate |
|---|---|
| Alias definition `$name:` camouflaged among operator properties | **Deleted** → `vars` block |
| Alias reference `"$name"` | **Deleted** → `$vars.name` |
| Eager, shared-mutation, timing-dependent alias resolution ([evaluate.ts:149-155](../src/evaluate.ts#L149-L155)) | **Redesigned** → lazy, memoized, lexical |
| Unresolved alias → literal string in output ([#126](https://github.com/CarlosNZ/fig-tree-evaluator/issues/126); [helpers.ts:103](../src/helpers.ts#L103)) | **Deleted** → recognized-but-unresolvable = validation error; unrecognized `$` = inert + warning |
| Fragment parameter placeholders (bare `$name` strings, spread into the merged node at [evaluate.ts:115](../src/evaluate.ts#L115)) | **Deleted** → declared parameters + `$params.name` |
| `getData` with a literal path (throws on missing — [OBJECT_PROPERTIES/operator.ts:16](../src/operators/OBJECT_PROPERTIES/operator.ts#L16)) | **Moved** → `$data.…` reference (null on missing); operator survives as `get` for dynamic paths |
| `{{name}}` private data lookup in STRING_SUBSTITUTION (`''` on missing; evaluates extracted data as expressions) | **Deleted** → substitutions are ordinary values/references; the injection path dies |
| Three different absence behaviours (throw / literal passthrough / `''`) | **Unified** → `null` everywhere, rendered per operator policy |

### Implementation follow-ups (noted, not specified here)

- **Lazy-var mechanism**: expected shape is promise memoization — the first reference stores the *in-flight Promise* on the scope instance, so concurrent references from parallel branches await the same Promise rather than re-evaluating. Exact scope-chain representation and interaction with the operator result cache to be worked out at implementation.
- **Exotic-key path grammar** (quoted bracket segments for keys containing `.` or `[`): revisit with `get`'s parameter pass.
- `$params` declaration shape → Fragments area; iterator parameter names (`input` / `each` / `as`) → the iterator operators' parameter passes; `getDependencies` enumerating `$data` paths → Evaluator methods; the `vars` reserved node key → Node grammar.

---

## Node grammar & reserved keys — **Agreed**

*What makes an object a node (recognition grammar), the reserved node keys with their placement and value rules, `fallback` and kill-switch semantics, `//` comments, name legality, and the treatment of non-JSON values. Cross-area deferrals are marked inline (`convert` strictness → Type, coercion & null policy; per-operator parameter names → their parameter passes; report-mode return shapes → Evaluator methods).*

### Node kinds

An expression is any JSON value. Recognition runs **once, at parse** — never against values flowing through at runtime (References §4). Every object in an authored expression classifies as exactly one of:

1. **Operator node** — contains the key `operator`. Its value must be a **literal string** naming a canonical operator or its symbolic alias (normalized away at parse); an unknown name is a hard error (per Operators). Remaining keys: the operator's declared parameters plus the reserved node modifiers (`fallback` / `useCache` / `vars` / `//` — see the reserved-key set, below). Anything else is a hard error.
2. **Fragment-call node** — contains the key `fragment`. Its value must be a **literal string** naming a registered fragment; an unknown name is a hard error (statically checkable, now that fragments are constructor/`updateOptions`-only — see Options). Arguments live **only** in `parameters` — a named-object map, or a single node computing the whole arguments object (the dynamic-arguments mode, settled in Fragments); fragments have no positional form (per Operators). Legal modifiers per the reserved-key set, below.
3. **Shorthand node** — contains exactly one **recognized** `$name` key (canonical operator name, symbolic alias, fragment, or custom operator name), optionally accompanied by reserved modifier keys (sibling rule, below), and nothing else. Payload disambiguated by JSON type (per Operators). Normalizes at parse into kind 1 or 2.
4. **Reference string** — a string value matching the token rule. Fully settled in References; listed for completeness. References are values, not nodes — they carry no modifiers.
5. **`literal` node** — grammatically an operator node / shorthand face, but a **parse boundary**: contents are never walked, validated or evaluated (per Operators and the implementation notes).
6. **Plain literal** — every other object, array or primitive. Objects and arrays are traversed per deep evaluation (Options); unrecognized `$` keys/strings are inert with a `validate()` warning. **Reserved modifier keys do not make an object a node**: `{ fallback: 1 }` with no `operator` / `fragment` / recognized `$name` key is plain data. Two deliberate exceptions operate on plain object literals without making them nodes: `vars` (functional & consumed — see [`vars` on plain object literals](#vars-on-plain-object-literals)) and `//` (comments, stripped everywhere — see Comments).

Non-plain objects in JS-authored expressions (class instances, `Date`s, functions) are **opaque constants**, never traversed — settled in [Non-plain-object values](#non-plain-object-values-opaque-constants), below.

### Static invocation names

`operator` and `fragment` values are literal strings, resolved at parse. Dynamically-computed operator or fragment names are structurally impossible — the parallel of the `functionName`-indirection death (Operators). This deletes live v2 behaviour: the fragment name is currently itself evaluated ([evaluate.ts:96-99](../src/evaluate.ts#L96-L99)).

### The sibling-key rule

A shorthand node may carry reserved modifier keys beside its `$name` key:

```js
{ $http: 'https://example.com/api', fallback: null, useCache: false }
```

Three candidate rules were weighed for "recognized `$name` key with other keys present":

| Rule | Verdict |
|---|---|
| Any sibling → the object is inert data | **Rejected outright** — adding one key would silently *de-invoke* a working node; the worst available failure mode |
| Any sibling → hard error (modifiers require canonical form) | **Rejected** — identical grammar complexity (the sibling case must be detected and classified either way) while taxing the most common modifiers: `fallback` / `useCache` cluster on I/O calls, exactly where shorthand terseness matters; `vars` would be legal "on any node" *except* shorthand ones; and canonical nodes carrying modifiers would have no shorthand rendering, breaking `toShorthand` totality for the editor |
| Reserved siblings legal; anything else → hard error | **Adopted** |

Accepted cost, recorded honestly: data like `{ $match: {…}, fallback: … }` — a MongoDB stage beside a field genuinely named `fallback` — *evaluates* rather than erroring loudly. This is the same hazard class as bare `{ $match: {…} }` (which exists under any rule) with the same escape (`literal`), and `validate()` cannot warn because the node is well-formed. v2 precedent: the v2 shorthand normalizer already spreads sibling keys onto the node ([shorthandSyntax.ts:32-35](../src/shorthandSyntax.ts#L32-L35)), so existing shorthand-with-`fallback` expressions carry over unchanged.

### Malformed-node hard errors

All raised at parse/`validate()` time, all new guarantees vs v2:

- `operator` and `fragment` in the same object.
- An `operator` / `fragment` value that isn't a literal string.
- A canonical key (`operator` / `fragment`) alongside a recognized `$name` key.
- Two or more recognized `$name` keys in one object (v2 merrily merges them all — [shorthandSyntax.ts:27-30](../src/shorthandSyntax.ts#L27-L30)).
- An unknown `operator:` / `fragment:` name (the operator half already agreed under Operators).
- An unknown key on any node — see No hoisting, below.
- A recognized `$name` key with a non-reserved sibling key.

The `$typo` contrast stands (per Operators): recognition is driven by *recognized* keys only, so `{ $typo: 1, fallback: 2 }` contains no recognized key and is inert data with a warning — not an error.

### No hoisting

**Operator parameters and fragment arguments exist only at their declared keys; no operator may source input from undeclared node-level keys.** With unknown keys on a node now hard errors, both v2 hoisting forms die automatically:

- **MATCH branch hoisting** — branch values as arbitrary flat keys on the node, which is why v2 MATCH scans its own node for branch keys ([MATCH/operator.ts:39](../src/operators/MATCH/operator.ts#L39)) and a match value of `"operator"` or `"fallback"` resolves to the node's own reserved property. v3: branches live inside a dedicated parameter (name settled in `match`'s parameter pass).
- **Fragment-parameter hoisting** — call-site arguments spread flat onto the call node ([evaluate.ts:115](../src/evaluate.ts#L115); defaults are even checked in both places, [evaluate.ts:88-94](../src/evaluate.ts#L88-L94)). v3: arguments only in `parameters`.

Two consequences worth naming: branch keys inside the branches parameter are parameter *data*, outside the node namespace — a branch legitimately named `"operator"` or `"fallback"` is safe for the first time (amended by `match`'s parameter pass: safe from silent misreading, but as a *literal* map key it now fails loud under mode classification — edges and escape recorded in [v3-operator-parameters.md](v3-operator-parameters.md)); and a misspelled parameter (`thn:` for `then:`) fails loudly at parse instead of being silently carried, which also buries the `type`-means-three-things overload for good (PLUS's mode selector is renamed, per Operators; `outputType` and its `type` alias are deleted outright — see the reserved-key set).

### The reserved-key set

Seven reserved node keys — `operator`, `fragment`, `parameters`, `fallback`, `useCache`, `vars`, `//` — case-sensitive, zero aliases. Placement:

| Key | Operator node (incl. `literal`) | Fragment call | Plain object literal |
|---|---|---|---|
| `operator` | defining key | error | *(its presence makes the object an operator node)* |
| `fragment` | error | defining key | *(its presence makes the object a fragment call)* |
| `parameters` | error (reserved, unused) | the arguments object | inert data |
| `fallback` | ✓ | ✓ — a failing fragment body can be caught at the call site without editing the definition | inert data |
| `useCache` | ✓ | **✗** — caching stays operator-level: the I/O operators inside a fragment body already cache individually, and a fragment-*result* cache needs its own key-derivation story (parameters plus everything the body reads); adding it later is non-breaking, shipping it wrong isn't | inert data |
| `vars` | ✓ (References) | ✓ (References) | **functional & consumed — see below** |
| `//` | ✓ — stripped at parse | ✓ — stripped | **stripped** — comments are consumed everywhere in an authored expression (see Comments, below) |

- **Flat reservation**: a reserved name is reserved everywhere, even where non-functional — no operator parameter and no fragment parameter may use one. Validated at registration (`defineOperator()`, fragment definitions) and binding on every per-operator parameter pass.
- **Deliberate boundary**: the reference-namespace words (`data`, `element`, `index`, `params`, …) are **not** banned as parameter names — references live in string-value position, parameters in key position; nothing mechanically collides.
- **`literal` is not special-cased**: grammatically an operator node, it takes the standard modifiers. Useless combinations (`vars` on `literal` — contents are never parsed, so nothing could reference them) get `validate()` warnings, not grammar exceptions.
- **`outputType` is deliberately absent** — v2's node modifier (and its `type` alias) is deleted in favour of the `convert` operator (see Operators): a cast is a computation, not node behaviour. The flatness the modifier bought came with an ordering semantics nobody chose — v2 never applied `outputType` to a `fallback` result ([evaluate.ts:196-227](../src/evaluate.ts#L196-L227)), with no way to express the other intent; under `convert` the ordering is explicit tree structure (`fallback` inside or outside the wrap, author's choice).

### `vars` on plain object literals

**`vars` is functional — and consumed — on plain object literals**, resolving the question deferred from Options § Deep evaluation. `{ vars: {…}, title: …, sections: […] }` scopes those vars over the whole subtree (same lexical / lazy / memoized semantics as node vars, per References) and the `vars` key is removed from the evaluated output. This is the only placement that serves the everyday whole-config case: with PASSTHRU deleted there is no identity operator to hang a `vars` block on, and a wrapper operator (`$let`-style, considered, rejected) would nest the most common usage under an extra ceremony level. Defended by the same argument as `operator:` keys in plain data: runtime data is never parsed, so the rule only reaches authored expressions.

Rules, uniform across every `vars` placement (operator node, fragment call, plain literal):

- **A vars block is structural, never a node**: its value is read as a map of **static names → expressions**. Names are part of the grammar (this is what makes `$vars` resolution statically checkable and cycles detectable); values are ordinary expressions. Consequently `vars: { operator: 'x' }` declares a var named `operator` — it is not an operator node.
- **Shape rule (loud)**: a `vars` value that isn't an object of identifier-shaped keys is a hard parse error — `{ vars: [1, 2] }` and `{ vars: "high" }` fail loudly rather than being silently swallowed.
- **Unreferenced-vars warning**: `validate()` warns when a `vars` block declares names never referenced in its scope — dead-definition lint in general, and exactly the signature of innocent data being misread as a vars block.
- Degenerate cases: `{ vars: {…} }` with no other keys evaluates to `{}`; arrays cannot carry vars (no keys).

**Escape hatch** — for authored data that genuinely needs a plain `vars` key. Wrapping the *value* does not work, because the key is what's functional: `vars: { $literal: … }` fails the shape rule, and `vars: { literal: {…} }` just declares a var named `literal`. The real hatches:

- `literal` around the containing object, when the subtree is constant: `{ $literal: { vars: {…}, … } }`.
- `buildObject`, when other parts of the object still need evaluation: keys in its *output* are runtime data, never re-parsed, so a built object can carry `vars`, `operator`, or any other reserved key as data.

Accepted residual, recorded honestly: well-shaped innocent data (`{ vars: { promotional: true } }` embedded in an authored expression) is consumed silently at runtime and caught only by the authoring-time warning — the same trade-off shape as the sibling-key rule.

### Reserved-key values: expression vs literal

The generating rule: **a modifier that changes how the engine treats a node must be knowable before evaluation** — a dynamic modifier can't be statically validated, and inverts evaluation order (it would need evaluating to know how to evaluate the node). `fallback` is the deliberate exception, because it isn't consulted until evaluation has already failed.

| Key | Value status |
|---|---|
| `operator`, `fragment` | literal strings (per Static invocation names) |
| `parameters` | structural map — argument *names* static, values expressions — **or** a single node computing the whole arguments object (the dynamic-arguments mode — see Fragments; statically detectable, call-signature checks move to runtime) |
| `vars` | structural map — var *names* static, values expressions (per the `vars` sections) |
| `fallback` | **full expression** — evaluated lazily, only on failure; "fall back to `$data.default`" or a backup `http` call are intended uses; statically-constant fallbacks on root-level nodes additionally shield the evaluation timeout (see `fallback` semantics) |
| `useCache` | **literal boolean only** — the cache lookup happens *before* evaluation; a dynamic value is incoherent |
| `//` | anything — never parsed or evaluated; stripped at parse (see Comments) |

v2's dynamically-evaluated `outputType` ([evaluate.ts:213](../src/evaluate.ts#L213)) was the one violation of this rule; it dies with the key. Contrast `convert`'s `to`, which as an ordinary *parameter* may be dynamic (per Operators).

### `fallback` semantics

*What `fallback` means — failure, not absence — was fixed in References. This settles the machinery.*

**The error-partition invariant.** Every error the engine can raise belongs to exactly one class:

| Class | Examples | Raised | `fallback` | Configuration-time detection |
|---|---|---|---|---|
| **Static** | unknown operator/fragment name, malformed node, unknown key, unresolved `$vars`/`$params`, fragment cycles, `maxDepth`/`maxNodes` | at parse/validation, before any evaluation begins | never caught | **guaranteed** — `validate()` reports every one |
| **Runtime** | I/O failure (including a *per-request* timeout), runtime type-check failure, custom-operator throw, `strictDataPaths` miss | during evaluation | always follows the fallback process | not possible (data-dependent) |
| **Kill switch** | whole-evaluation `timeout`, `signal` | any time | cuts through fallbacks — rule 3's static-root exception only | n/a — caller-level, not expression errors |

The contract: **if validation blesses an expression, no error it later produces can bypass the fallback process.** An error that escapes both `validate()` and `fallback` is by definition an engine bug. (v2 had no such partition — an invalid operator name was a runtime error that `fallback` could catch: [evaluate.ts:121-137](../src/evaluate.ts#L121-L137).)

The rules:

1. **Nearest-enclosing catch.** A runtime failure propagates to the innermost *enclosing node* that carries a `fallback` — try/catch semantics, passing through array elements and plain literals on the way. (Already implied by References: a `strictDataPaths` miss is caught by `fallback` even though references can't carry one.)
2. **Runtime failures only.** Static errors fail at parse/validation, before any fallback exists. Deliberate change from v2, where `fallback` caught invalid-operator errors.
3. **The kill switch cuts through — with one static exception: timeout shielding.** The whole-evaluation `timeout` is a **strict** bound on the entire call: the deadline includes any time fallback evaluation would take, so when it (or `signal`) fires, all in-flight work aborts unconditionally — no expression work of any kind runs past it, dynamic fallbacks included, and in-flight HTTP/SQL requests are cancelled via the threaded signal. The exception: an expression is **timeout-shielded** iff every maximal evaluable node at its root carries a **statically constant** `fallback` — for a node root that's the root itself; for a plain-literal root (a keyMap-style object/array parameter, or a whole config) it's every hole of the compiled skeleton. On timeout, a shielded expression returns instead of throwing: holes that completed contribute their real values, unfinished holes contribute their static fallbacks, and the constant skeleton is assembled around them — pure constant-splicing, zero post-deadline evaluation, so the bound holds exactly. An unshielded expression's timeout throws regardless of how many holes happened to finish: shielding is all-or-nothing precisely so that timeout behaviour is statically knowable — `validate()` and the editor can badge an expression as shielded (the parse phase already classifies constancy). A *dynamic* fallback never counts toward shielding (it could start new work past the deadline) but still catches ordinary runtime failures as usual. `signal` is never shaped by any fallback — the caller cancelled; nobody is waiting. The mechanism lives in the expression rather than in options because only each expression's author knows an appropriate placeholder — and its *type* (`options` should degrade to `[]`, a label to a string) — while the evaluating host (Conforma's pattern) is generic. Author guidance in one sentence: **give network-heavy or complex expressions static `fallback`s at the root — on the root node, or on each embedded expression when the root is a plain literal.** (A separate static-only key — `fallbackValue` — was considered and rejected: a near-duplicate name, and an author who already supplied a static `fallback` would reasonably expect it to shield the timeout.)
   - Per-request timeouts are not this: an individual `http`/`sql` call exceeding its own limit is an ordinary runtime failure, which a `fallback` on that node can catch — the network-flakiness guard, applied per node rather than as a blanket. Constraint recorded for the I/O parameter passes: a per-request timeout must be expressible.
   - A plain-literal root still carries no `fallback` *key* of its own — reserved keys stay inert on plain literals: there's no shape rule that could catch innocent `fallback:` data (any value is a plausible fallback), and stripping-vs-keeping the key would corrupt structures that legitimately contain a `fallback` property (e.g. a keyMap). Shielding a literal root is **per-hole** instead: each embedded expression declares its own static fallback, so each degraded value is the one *its* author chose. Timing note, recorded honestly: *which* holes contribute real values vs fallbacks depends on what finished before the deadline — inherent to timeouts; `trace` shows which applied.
4. **A failing fallback fails the node.** The node fails with the *fallback's* error, the original failure attached as `cause` on the `FigTreeError`; that failure bubbles per rule 1 to the next enclosing fallback, else throw/report per `mode`.
5. **Scope.** A fallback evaluates in its node's own scope — the node's `vars` are visible. Corner recorded: if the failure *was* a var's evaluation, a fallback referencing that var re-receives the memoized rejection and fails too (rule 4 takes over); a fallback that must be independent of the failing var shouldn't reference it.
6. **Lazy, at most once.** Never evaluated unless the node fails, evaluated once when it does. On `literal` it's a useless-combination `validate()` warning (nothing to fail), per the reserved-key set.

Discoverability caveat, recorded honestly: shielding depends on *constancy*, which isn't visually explicit — editing one static root-level fallback into a dynamic expression silently un-shields the whole expression. Shielded status is statically computable, so `validate()` and the editor should surface it; `trace` output shows what applied on an actual timeout.

### Comments: the `//` key

The `//` key is a comment, legal anywhere in an authored expression — on nodes (where strict unknown-key validation would otherwise leave annotations nowhere to live), inside `vars` blocks and `parameters` maps, and on plain object literals. Its value may be any JSON value (a string typically; an array of strings for multi-line notes) and is **never parsed, validated or evaluated**. Comments are **stripped everywhere at parse** — a comment on a plain data object does not appear in the evaluated output (the same consumed-key model as plain-literal `vars`). The one place `//` means nothing special: inside `literal`, whose contents pass through untouched by fiat. Tooling (editor, converters) must preserve comments through round-trips. JSON's unique-keys rule means one `//` per object.

```js
{
  '//': 'Rate falls back to 1.0 if the currency API is down — agreed w/ finance, Mar 2026',
  operator: 'http',
  url: 'https://api.example.com/rates',
  fallback: { base: 'USD', rate: 1.0 },
}
```

### Name legality, not name style

Author-chosen names — vars, fragment parameters, `as` bindings, and fragment / custom-operator registration names — have **no imposed style**: spaces, kebab-case and unicode are all legal; FigTree's audience shouldn't need to know what a programmer means by "identifier" (a camelCase *convention* may be recommended in docs; the engine doesn't care). One legality rule, shared by all of them and forced by the grammar rather than taste:

> A name is any non-empty string that does not contain `.`, `[` or `]` and does not start with `$`.

The `.` / `[` / `]` exclusion is disambiguation, not tidiness: drilling into var values is agreed in References (`$vars.country[0].name`), so a var named `a.b` would make `$vars.a.b` ambiguous between *var `a.b`* and *var `a` drilled with `.b`*. The `$` exclusion keeps the sigil's two jobs clean. Checked at declaration/registration time, on top of the existing collision rules (Operators §4–5) and the flat reservation for parameter names; reserved node keys are also barred as *registration* names (a fragment invoked as `$fallback` is confusion nobody needs).

### No v2 tombstone keys

Considered and rejected: reserving `children` / `type` solely to emit pointed "removed in v3" errors. v3 is a clean break — v1/v2 compatibility lives entirely in `./convert`, and `children` was itself a v1 hangover that freshly-authored v2 expressions should never have used. On a node these keys fail as ordinary unknown keys; history is the migration doc's job, not the runtime's. (Informed by v2's own experience carrying v1 relics — `supportDeprecatedValueNodes` — longer than they earned.)

### Non-plain-object values: opaque constants

A JS-authored expression may contain values with no JSON representation — `Date`s, `Map`s, class instances, functions. Anything that is not a plain object or array is an **opaque constant**: never traversed, never validated, passed through by identity (and classified constant by the compile phase, so opaque-only subtrees take the identity short-circuit). This is an authoring-side rule only; at runtime the question doesn't arise — values *flowing through* an evaluation are never parsed (References §4), so a custom operator or `http` client may return a `Date` and it flows through operators untouched, subject only to each operator's runtime type-check policy.

---

## Type, coercion & null policy — **Agreed**

*The value domain, the no-implicit-coercion rule, truthiness, the null-policy vocabulary and its defaults, `convert`'s semantics (deferred here from Operators), and the shared stringification table. Per-parameter null-policy assignments are deferred to the per-operator parameter passes; the vocabulary and defaults they draw from are fixed here.*

### The value domain

FigTree values are exactly JSON's six types: `string`, `number`, `boolean`, `null`, `array`, `object`. Three consequences, each closing a v2 leak:

- **`undefined` is not a value.** It is normalized away at every boundary where JS could produce one, following JSON-serialization semantics: an operator body (native or custom) returning `undefined` yields `null`; in a JS-authored expression `{ a: undefined }` is treated as the key being absent, and `[1, undefined, 3]` as `[1, null, 3]` — exactly what `JSON.stringify` would do. v2's `String(undefined)` → `"undefined"` rendering dies with it, and the `nullEqualsUndefined` machinery (already deleted under Options) loses its subject entirely: with `undefined` gone there is nothing left to equate.
- **`NaN` and `±Infinity` are not values.** An operation whose result would be one **fails** instead — an ordinary runtime failure, fallback-catchable: division by zero stays an error (as v2 — [DIVIDE/operator.ts:21](../src/operators/DIVIDE/operator.ts#L21)), and numeric overflow (`pow(10, 400)`) or a failed conversion errors rather than emitting a value JSON can't represent. Nothing unrepresentable in JSON ever flows out of an operator.
- **Opaque constants sit outside the domain** (per Node grammar): they satisfy only the `any` metadata type, so a typed parameter receiving one fails the runtime type-check. Honest cost, recorded: v2's accidental `Date > Date` comparison (working via JS `valueOf` coercion) dies — date comparison is the date plugin's job. `equal`'s treatment of opaque values is settled in its parameter pass.

### Metadata type vocabulary

v2's `ExpectedType` shape survives ([typeCheck.ts:10-22](../src/typeCheck.ts#L10-L22)) minus `undefined`: the basic types (`string` / `number` / `boolean` / `array` / `object` / `null` / `any`), unions, and literal unions — plus one addition, **`integer`**, a refinement of `number` for parameters like `round`'s `decimals`. One table, two moments: `validate()` checks literal parameters against it at parse (most parameters in practice), and the runtime type-check applies the same table to dynamic values as they arrive. `any` admits every domain value (including `null`) plus opaque constants.

### No implicit coercion

**A value of the wrong type is a runtime type-check failure — never a guess.** The only cast is the explicit `convert` operator; number-mining belongs to `regex` extract. Where v2 coerced, v3 errors:

| Site | v2 | v3 |
|---|---|---|
| `{ $plus: [1, "2"] }` | `"12"` — JS `+` fallthrough ([PLUS/operator.ts:35](../src/operators/PLUS/operator.ts#L35)) | runtime type error: mixed types |
| arithmetic operands | JS coercion | numbers only |
| `>` `>=` `<` `<=` | JS relational on anything | operands must be homogeneous — both numbers or both strings (plain codepoint order: deterministic, locale-independent — config files travel); anything else errors |
| `outputType: 'number'` on `"abc4.5xyz"` | regex-mines `4.5` ([helpers.ts:181-191](../src/helpers.ts#L181-L191)) | deleted with `outputType`; `convert` parses strictly, `regex` extracts |
| rendering `undefined` / objects into strings | `"undefined"`, `"[object Object]"` | see the stringification table |

**Equality is deliberately total** — the one place "wrong type" is an answer, not an error: `equal` compares any two domain values, deep structural (v2's dequal semantics, key-order-insensitive), and a cross-type comparison returns `false` (`1` ≠ `"1"` — asking is legitimate; the answer is no). No coercion; `caseInsensitive` remains a string-only parameter (details in its pass).

**`and` / `or` / `not` return actual booleans, never operands.** JS-style value-selecting `or` is not carried over — value selection is `firstOf`'s job.

### Truthiness

Condition positions — `if.condition`, `and`/`or`/`not` operands, the `filter`/`find`/`some`/`every` predicates — apply a single named rule, **FigTree truthiness**:

> Falsy: `false`, `null`, `0`, `""`. Everything else — including `[]` and `{}` — is truthy.

That is JS parity restricted to the v3 domain (`undefined` and `NaN` don't exist to be falsy), adopted deliberately and *held loosely*: whether empty containers (`[]`, `{}`) should also read as falsy is **explicitly marked for revisiting** once real v3 usage accumulates. The enabler is an implementation requirement (recorded in the implementation notes): one shared `isTruthy()` consumed by every truthiness site, so a future refinement is a one-function change applied globally.

The design driver, recorded: bare presence conditions must work — `condition: "$data.user.name"`, not `{ operator: 'notEqual', values: [<getData>, null] }` ceremony. This is the payoff of missing-→-null (References) landing in condition position. v2 already used raw JS truthiness ([CONDITIONAL/operator.ts:21](../src/operators/CONDITIONAL/operator.ts#L21), [AND/operator.ts:11](../src/operators/AND/operator.ts#L11)), so this is continuity — the change is that it's now a *defined* rule rather than an accident of the host language.

Known JS-parity gotcha, recorded honestly: `0` is falsy, so a bare numeric condition (`condition: "$data.count"`) reads a genuine zero as false — numeric tests should be written explicitly (`{ $greaterThan: ["$data.count", 0] }`). Part of what the revisit marker is for.

**`firstOf` is deliberately not truthiness-based**: it skips `null` only. Two tools, two questions — `firstOf` asks "is anything there?" (absence), truthiness asks "is it meaningful?" — so `{ $firstOf: ["", "backup"] }` yields `""` while `""` in condition position is falsy.

### Null policy

The reference layer is uniform (References: missing → `null`); how nulls behave *inside* operators is declared per-parameter metadata, drawn from a fixed vocabulary of three policies:

| Policy | Meaning | Typical holders |
|---|---|---|
| `propagate` | null input → the node resolves to `null`; the operator body never runs (SQL-style) | value inputs: arithmetic, string operators, `length`, ordering comparisons, `convert` (except `to: 'boolean'`) |
| `value` | null is an ordinary value, handled by the operator's own declared semantics | `equal`/`notEqual` (comparable), `firstOf` (its whole job), `buildString` (renders `""`), condition positions (falsy), `sql` bind values (SQL `NULL`) |
| `reject` | null is a runtime type error | inputs with no meaningful degradation: `http.url`, `sql.query` |

**The default for value inputs is `propagate`** — agreed as the starting assumption, with each parameter pass re-confirming or overriding it explicitly. What sells it is the composition gradient: `{ $greaterThan: ["$data.age", 18] }` with `age` missing → `null` → condition falsy → `else` branch; a sum with a missing operand → `null` → `buildString` renders `""`. Absence degrades along one gradient with zero fallback boilerplate; the masking risk is the one already accepted and mitigated in References (`strictDataPaths`, `validate()` against sample data, `trace`).

**`equal`/`notEqual` treat null as a comparable value** — the loud, deliberate asymmetry (SQL propagates on `=` too, which is why it needs `IS NULL`): `null` = `null` → `true`, null vs anything else → `false`. Required by the blessed is-set idiom `{ $notEqual: ["$data.x", null] }`, already used in this spec's own examples.

#### Optional parameters: null means unset

**A null arriving at an optional parameter whose declared type does not include `null` behaves exactly as if the parameter were omitted** — the layered defaults chain applies (per-node value → instance `operatorDefaults` → metadata default). The motivating case: `{ operator: 'round', value: '$data.price', decimals: '$data.settings.precision' }` with the setting unset. Under this rule the declared default applies — the only sensible outcome; under `propagate` a missing *setting* would nullify a present *value*; under `reject` every dynamically-sourced setting needs `{ $firstOf: [..., <restated default>] }` armour, forcing authors to restate library defaults inline — restatements that go stale when metadata defaults or `operatorDefaults` change. Null-means-unset gives dynamic settings the same defaults story as static ones.

**The opt-out is the type declaration**: a parameter whose declared type includes `null` receives it as a value — the deciding question for each parameter pass is simply "is null a valid input *for this parameter*?", and the answer is machine-readable metadata, visible to the editor. Known case needing the opt-out: `get`'s `missingDefault` parameter (named in its pass, batch 6), where `missingDefault: null` legitimately means "give me null instead of throwing" under `strictDataPaths: true`.

**Boundary**: this rule governs operator *parameters* only. Reserved node keys are not parameters — `fallback: null` keeps its agreed meaning ("resolve to null on failure"), which timeout shielding already leans on (Node grammar).

### `convert` semantics

The strictness and null handling deferred from Operators. No single generating principle — "lossless conversions only" was considered and rejected as an unnecessary constraint; each target is decided on its merits, and every conversion failure is an ordinary runtime failure (fallback-catchable). Literal `to` validates at parse; dynamic `to` lands on the runtime check (per Operators).

| `to` | Rule | Fails on | Null |
|---|---|---|---|
| `number` | number: identity; string: strict full-string numeric parse, surrounding whitespace allowed (`"5.5"` ✓, `" 42 "` ✓, `"5 grams"` ✗ — that's `regex` extract's job); boolean: `true` → `1`, `false` → `0` | non-numeric strings, arrays, objects | propagates |
| `string` | string: identity; number, boolean: the stringification table | arrays, objects (JSON-stringifying is a different intent — a possible later `to` value) | propagates |
| `boolean` | **carve-out first**: the strings `"true"` / `"false"` (case-insensitive, trimmed) parse to their named boolean — `"false"` → `false`; everything else: `isTruthy()` | never — total | **consumed**: `null` → `false` |
| `array` | array: identity; anything else: wrap as `[value]` | never — total | propagates |

The boolean row is the deliberate exception on both axes. It consumes null rather than propagating because truthiness is *defined* on null — there is no null reading of "convert to number" that isn't invention, but null-is-falsy is already the rule everywhere else. And the carve-out exists because stringly-typed booleans are endemic in config-adjacent data (checkbox serializations, query params): pure truthiness would make `convert("false", 'boolean')` return `true` — Python's `bool("False")` footgun, a standing bug-report generator. Cost: one special case, documented as such.

### Stringification: one rendering table

Wherever a value must be rendered as text — `buildString` substitutions, `join` elements, `match` branch-key comparison, and the scalar rows of `convert` `to: 'string'` — one shared rule applies:

| Value | Renders as |
|---|---|
| string | itself |
| number | decimal form (JS `String(n)`) |
| boolean | `"true"` / `"false"` |
| null | `""` — generalizing the `buildString` rule already agreed in References |
| array, object | rendering positions (`buildString`; `join` — confirmed in its pass) render a **placeholder** — `<array>` / `<object>` — self-signaling, never silent nor blocking (the disruption gradient, [v3-operator-parameters.md](v3-operator-parameters.md) § conventions); v2's `"[object Object]"` ([STRING_SUBSTITUTION/operator.ts:55](../src/operators/STRING_SUBSTITUTION/operator.ts#L55)) dies; `convert` `to: 'string'` still **fails** on them — a cast is not a render; drill in or `join` explicitly for real output |

One deliberate distinction: `convert` `to: 'string'` **propagates** null instead of rendering it — `convert` is a value pipe, and keeping the null intact preserves downstream absence tooling (`firstOf` after a `convert` still works). The `""` rendering applies where text *must* be produced: `buildString` has to put something at the substitution site.

`match` compares its match value against branch keys via this canonical string form (branch keys are JSON object keys, hence always strings): numbers and booleans match their rendering (`1` matches the key `"1"`), and a null match value matches no branch — what happens then (error vs a default branch) is `match`'s parameter pass. v2 precedent: MATCH already matched via implicit JS key-stringification ([MATCH/operator.ts:32](../src/operators/MATCH/operator.ts#L32)); v3 makes the rule explicit.

### Aggregates and empty input

Restating the assessment's rule as policy: **an empty aggregate input is an error, not an identity value** — v2's roulette (empty PLUS returns `[]`, empty MULTIPLY returns `0`) dies. A literal empty array fails at validation; a dynamically-empty input is a runtime failure. Per-operator specifics (whether any aggregate earns an exception) belong to the parameter passes.

### `runtimeTypeCheck: false` — scope

With strictness now being semantics, the option (Options, default `true`) can only skip the **pre-execution parameter checks** — the validation layer that produces good errors. Semantic type dispatch is not skippable: `plus` still inspects types to choose add/concat/merge, truthiness still applies, equality is still strict. Off means out-of-contract inputs produce undefined behaviour (raw JS results or uglier errors thrown from operator bodies) — it is **not** a v2-compatibility coercion mode; v3 has no coercion mode.

### Deferred

- Per-parameter null-policy assignments (vocabulary and defaults fixed here). Debatable cases flagged for their passes: `http.body` (null = no body, or a literal JSON `null` payload?), null values in `http.query` (omit the param vs `?x=null`), null values in `buildObject` (keep the key vs drop it), `join`'s null elements (render `""` vs skip element and delimiter).
- `match` behaviour when no branch matches (including the null match value) → `match`'s parameter pass.
- Opaque values in `equal` (dequal precedent gives sane `Date`/`RegExp` behaviour) → its parameter pass.
- The empty-container truthiness question (`[]` / `{}` falsy?) — deliberately left open for revisiting once v3 usage accumulates; the shared-function abstraction is the enabler.

---

## Fragments — **Agreed**

*The definition shape, parameter declarations, the two call-site argument modes, evaluation order, recursion policy, registration-time validation, and tooling metadata. Much of the fragment story was settled in other areas and is only cross-referenced here: invocation faces and the named-object-only rule (Operators), the `$params` namespace and sealed scoping (References), call-node modifiers / no-hoisting / static invocation names (Node grammar), registration-only supply and merge semantics (Options).*

### The definition shape

```ts
fragments: {
  getCountryData: {
    expression: {                                           // required — any expression
      $http: {
        url: {
          $buildString: [
            'https://restcountries.com/v3.1/name/%1?fields=%2',
            '$params.country',
            '$params.fields',
          ],
        },
      },
      fallback: null,
    },
    parameters: {                                           // optional — declarations, keyed by name
      country: { type: 'string' },                          // required parameter (the short spelling)
      fields: { type: 'string', default: 'name,capital' },  // optional via default
    },
    description: 'Fetch a country record from restcountries.com', // optional
    metadata: { backgroundColor: '#B2E0FF', team: 'config-admins' }, // optional, opaque — see Tooling metadata
  },
}
```

- **The wrapper is mandatory**, even for a zero-parameter fragment (`{ expression: {…} }`). A bare-expression form was considered and rejected: it becomes ambiguous the moment the expression itself contains an `expression` key — the same camouflage trap as v2's `metadata` key living *inside* the fragment expression ([types.ts:113-117](../src/types.ts#L113-L117)). A definition that isn't a wrapper object, or that lacks `expression`, is a registration error — the shape rule is loud.
- `expression` is any expression — an operator node, fragment call, reference string, or constant.
- The object-keyed `parameters` form retires the v2 metadata drift (README documented an object keyed by `$`-prefixed names; [types.ts:156-162](../src/types.ts#L156-L162) declared an array of `{ name, … }`). Object-keyed wins: fragments are named-only (per Operators), so an array's ordering was dead weight.

### Parameter declarations

`parameters` is an object keyed by parameter name. Names follow the shared legality rule and the flat reservation of node keys (Node grammar), checked at registration. Each declaration:

| Field | Type | Default | Notes |
|---|---|---|---|
| `type` | metadata type vocabulary (Type area — incl. `integer`, unions, literal unions) | `any` | drives parse-time checks on literal arguments and runtime checks on dynamic ones, exactly as for operator parameters |
| `required` | boolean | `true` | see the optionality rule |
| `default` | constant value | — | must satisfy the declared type (registration error otherwise); presence implies optional |
| `description` | string | — | tooling/docs |
| `metadata` | `Record<string, unknown>` | — | opaque per-parameter tooling bag, mirroring the definition-level `metadata` (§ Tooling metadata) — engine never reads it, `getFragments()` returns it verbatim; added by the parameter passes ([v3-operator-parameters.md](v3-operator-parameters.md) § conventions) |

**Optionality rule: a parameter is required unless it declares a `default` or `required: false`.** The two are not synonyms — optional-without-default is legal and coherent: an omitted (or unset, below) parameter with no default makes `$params.x` yield `null`, exactly like a missing `$data` path, and the body composes with the standard null gradient (`propagate` through value operators, `""` in `buildString`, falsy in conditions, `firstOf` for local defaulting). Declaring `required: true` *and* a `default` is a contradiction (the default could never apply) → registration error, matching the `operatorDefaults` validation posture.

**Null-means-unset applies, same rule as operator parameters** (Type area): a `null` arriving at an *optional* parameter whose declared type does not include `null` behaves as if the parameter were omitted — the default applies, or `null` if there is none. The opt-out is the type declaration (`type: ['string', 'null']` receives null as a value). A null at a *required* parameter whose type excludes it is a runtime type error, as for operators.

The declaration is what licenses the null reading: `$params.x` naming an **undeclared** parameter remains a static registration error (References) — absence semantics apply only to declared-optional parameters.

**`default` is a constant value, not an expression** — visible to tooling verbatim, type-checked at registration, never evaluated. A *computed* default is written in the body: declare the parameter optional with no default and use `{ $firstOf: ['$params.region', <computed>] }`. (The escape has to go through an optional-*without*-default declaration — with a declared default, null-means-unset would substitute it before the body ever saw the null.)

### Call-site semantics: two argument modes

Every call is in exactly one of two modes, decided statically at parse by the standard node-recognition grammar — `validate()` and the editor always know which they're looking at. A `parameters` value that is neither a plain object nor a node (an array, a number) is a hard parse error.

**Static arguments — the default face.** `parameters` is a plain object: argument names static, values expressions (the Node-grammar rule, unchanged for this mode).

- Full static validation of the call signature: a missing required parameter or an unknown argument name is a parse/`validate()` error — typo-catching, matching the no-hoisting posture; literal argument values type-check at parse.
- Dynamic argument values land on the runtime type check as they arrive, governed by `runtimeTypeCheck` exactly as operator parameters are.
- **Arguments evaluate lazily, memoized per call instance**: an argument evaluates at most once, on the body's first `$params` reference to it; parallel branches share the one in-flight evaluation; an argument referenced only in an `if` branch that never runs never evaluates at all. The lazy-branch principle extended — same semantics and suggested mechanism as `$vars` (References; implementation notes). Deliberate change from v2's evaluate-all-parameters-up-front ([evaluate.ts:96](../src/evaluate.ts#L96)). Runtime checks on a lazy argument fire at first reference, when its value first exists.
- **Argument expressions evaluate in the caller's scope** — they are part of the calling expression, so `parameters: { country: '$vars.c' }` reads the *caller's* vars. The sealed boundary (References) is the body: it sees argument *results* via `$params`, never the caller's scope. Laziness doesn't change this — the deferred evaluation closes over the caller's scope.
- A failing argument surfaces at the body's first reference to it and propagates per `fallback` rule 1 — catchable by a fallback inside the body or on the call node. Rejections memoize like vars (the rule-5 corner applies unchanged).

**Dynamic arguments — the deliberate escape.** `parameters` is itself a node — an operator node, fragment call, shorthand face, or reference string — and the whole arguments object arrives from evaluation: `parameters: '$data.formResponses'`, a `buildObject`, a row from `sql`. This deliberately amends the Node-grammar reserved-key rule (previously structural-map only; the amendment is recorded there) and follows the pattern `convert.to` established: literal validates at parse, dynamic lands on the runtime check. v2 precedent: the whole `parameters` value is already evaluated today ([evaluate.ts:96-99](../src/evaluate.ts#L96-L99)), and the use case is real — a form response or DB row already shaped as the arguments object.

- **Statically detectable.** Disambiguation is sound because declared parameter names cannot start with `$` (name legality) and `operator` / `fragment` are barred as parameter names (flat reservation) — an object in `parameters` position that classifies as a node can only *be* a node; a reference string likewise. The editor can badge dynamic-argument calls.
- **Call-signature checks move to runtime**: the evaluated result must be an object (else runtime type error); a missing required parameter is a runtime error; type mismatches are runtime type errors; null-at-optional means unset, as always. All ordinary runtime failures, fallback-catchable.
- **Extra keys are ignored** — a recorded asymmetry vs the static-map hard error, and a principled one: declared parameters define everything a body can read (`$params` must name a declaration), so unread keys are inert; runtime data contains no author typo to catch, and erroring would kill the pass-the-whole-form-response use case.
- **Evaluation is eager and whole-object** — there is no per-argument expression to lazily address. The one exception to lazy arguments, inherent to the mode.

**Shorthand faces** (extending the payload table in Operators):

| Payload | Meaning |
|---|---|
| plain object | static named arguments — `{ $getCountryData: { country: 'NZ' } }` |
| node object | dynamic arguments — `{ $getCountryData: { $buildObject: […] } }` |
| anything else — including a reference string | **error** — fragments have no single-value or positional form |

A reference-string payload (`{ $frag: '$data.formValues' }`) stays an error even though it *could* be read as dynamic arguments — it visually resurrects the banned single-value form ("is this the arguments object, or the value of one argument?" is exactly the ambiguity that killed that form). The reference case writes canonical form: `{ fragment: 'getCountryData', parameters: '$data.formValues' }`.

Zero-parameter calls: `{ fragment: 'myFrag' }` (no `parameters` key), or shorthand `{ $myFrag: {} }`.

### Composition & recursion

- Fragments freely reference other fragments (and custom operators — one invocation namespace, per Operators).
- **Recursion is banned** — recorded as a deliberate decision, not a side effect of the error-partition table: a cycle in the fragment reference graph (any fragment transitively reaching itself) is a **registration error**, which necessarily excludes *guarded* recursion too — a fragment calling itself behind a terminating `if` (a tree-walker, say) cannot be written. Rationale: FigTree is a config-logic sandbox; admitting recursion means runtime depth budgets and a halting story — fragments become a programming language. Marked for revisit only if a concrete use case materializes.
- The reference graph is fully static regardless of argument mode: fragment *names* are always literal strings (Node grammar), so dynamic arguments don't blunt cycle detection.

### Registration-time validation

Fragments are statically checkable at registration (the registry is stable by construction — Options), so **`new FigTree()` and `updateOptions()` throw on a bad fragment, not the first evaluation that calls it**: unknown operator/fragment names in the body, undeclared `$params` references, malformed nodes, name legality/reservation violations, type-invalid defaults, required+default contradictions, cycles. If registration succeeds, a fragment call can only fail at runtime for data-dependent reasons — the error-partition contract (Node grammar) extended to the registry.

- **Batch semantics**: all fragments supplied in one constructor / `updateOptions()` call validate together — a fragment may reference any fragment in the same batch or already registered, regardless of key order.
- **Cross-call ordering**: referencing a fragment that will only be registered in a *later* `updateOptions()` call is an error — register dependencies first, or in one batch.
- **Replacement re-validates the registry**: re-supplying a name (replace-wholesale, per Options) can break dependents or close a cycle through existing fragments, so the whole registry is re-checked. Likewise an `updateOptions()` that changes the `operators` array re-validates all fragment bodies — a body using a now-absent operator fails there, loudly, not at the next `evaluate()`.
- **Per-call `excludeOperators` edge**, recorded: exclusion is dynamic, so a body using an operator excluded for one call is necessarily a *runtime* failure of that call (fallback-catchable) — registration cannot see it.

### Tooling metadata

- `description` is the one universal top-level field — consumed by generated docs, editor labels and `validate()` messaging.
- **`metadata?: Record<string, unknown>` is an opaque bag**: the engine never reads it; `getFragments()` returns it verbatim. v2's editor display hints (`textColor` / `backgroundColor` — [types.ts:100-101](../src/types.ts#L100-L101)) move here, becoming keys that [fig-tree-editor-react](https://github.com/CarlosNZ/fig-tree-editor-react) defines for itself; hosts can carry anything else the same way (organisational ownership, versioning, category tags). Constraint recorded for Extensibility: custom-operator definitions adopt the same `description` + opaque-`metadata` convention.
- `getFragments()` content requirement (exact method shape → Evaluator methods): name, `description`, the parameter declarations with their *effective* optionality and defaults, and the `metadata` bag.

### v2 → v3 disposition

| v2 mechanism | Fate |
|---|---|
| Bare `$name` placeholder strings, spread into the merged node ([evaluate.ts:115](../src/evaluate.ts#L115)) | **Deleted** → declared parameters + `$params.name` (References) |
| `metadata` key camouflaged inside the fragment expression ([types.ts:113-117](../src/types.ts#L113-L117)) | **Deleted** → sibling keys in the wrapper: `{ expression, parameters, description, metadata }` |
| Parameter metadata: array in types.ts, `$`-keyed object in README (drifted) | **Unified** → object keyed by (unprefixed) name |
| Root-level parameter hoisting on call nodes | **Deleted** (Node grammar) |
| Dynamic fragment *names* — the name is itself evaluated ([evaluate.ts:96-99](../src/evaluate.ts#L96-L99)) | **Deleted** → literal strings only (Node grammar) |
| Whole-`parameters`-object evaluation (same lines) | **Kept, made explicit** → the dynamic-arguments mode: statically detectable, runtime-checked, extras ignored |
| All parameters evaluated eagerly before substitution | **Redesigned** → lazy + memoized per call instance (static mode) |
| No recursion guard — self-reference loops forever (assessment §"no recursion guard") | **Fixed** → cycles are registration errors; recursion deliberately banned |
| Per-call `fragments` option | **Deleted** (Options — registry stability) |
| `Fragment` definition may be `null` ([types.ts:117](../src/types.ts#L117)) | **Deleted** → definitions are wrapper objects; the shape rule is loud |
| `textColor` / `backgroundColor` top-level fields | **Moved** → opaque `metadata` bag |

### Deferred

- `getFragments()` exact return shape → Evaluator methods (content fixed here).
- Fragment-*result* caching (`useCache` on call nodes) → already deferred in Node grammar; adding later is non-breaking.
- A declared return type (`returns`) for editor/validation use → maybe-later, on demand.
- Recursion ban → revisit only if a concrete use case appears.

---

## Extensibility — **Partial**

*Agreed here: the single mechanism (the v2 `functions` tier is dropped), the first-class principle, naming & aliases, the plugin story, and the sequencing of what remains. The full operator contract — the `defineOperator()` definition shape and the runtime interface operator bodies are written against — is deliberately deferred until after the per-operator parameter passes (see Sequencing, below).*

### One mechanism: `defineOperator()`

**The v2 `functions` option is deleted with no v3 replacement — there is no custom-function tier.** `defineOperator()` is the only extension API; its output registers through the `operators` array (Options) into the single invocation namespace, under the shared collision, legality and reservation rules.

Rationale, recorded. Custom functions and custom operators were never different in kind — both are host-authored JS baked into the embedding codebase, deliberate holes in the sandbox wall — they differed only in declared contract. The two-tier system bought registration brevity for the host developer, once; it cost a permanent second grammar (positional-only call faces and args-spreading rules), a permanently weak validation tier, and a generic "mystery function" editor face for exactly the audience v3 most serves. With the tier gone, `getOperators()` is total: everything invocable carries full metadata. Strictness cannot be *forced* — a host can still declare a single `any`-typed variadic parameter and spread it into a plain function, rebuilding the sugar in host code — but the paved path is now full declaration; laxity is something a host constructs deliberately, never a sanctioned tier. And regret is asymmetric (the same argument as fragment-result caching): a convenience wrapper could be added later as a pure addition; a shipped weak tier couldn't be removed until v4.

### The first-class principle

A `defineOperator()` operator is **indistinguishable from a native operator** — the core operators are themselves definitions of the same shape, entering through the same array. Consequences:

- Same runtime treatment: the same evaluation context and machinery, the same engine-enforced boundary guarantees (runtime type checks, null-policy enforcement, `undefined` → `null`, the finite-number guard), the same laziness capabilities where the contract declares them.
- Participation in everything keyed on operator identity, no carve-outs: `operatorDefaults`, `excludeOperators`, `getOperators()`, `useCache` metadata defaults, parse-time `validate()` checking of literal parameters.
- `defineOperator()` validates at registration that a definition satisfies the full operator contract — malformed definitions fail loudly there, matching the fragment registration posture.
- Definitions adopt the same `description` + opaque-`metadata` convention as fragments (constraint recorded there).

### Naming & aliases

Registration names follow the shared legality rule and reservation set (Node grammar) and the collision check across the one namespace (Operators §4–5). A custom operator may declare **one alias**, like natives; the single-character-symbolic restriction on the core set is a *convention* for custom operators — encouraged in docs, not enforced. Aliases are collision-checked exactly like names and normalize away at parse: the canonical AST contains only canonical names.

### Plugins need no machinery

A "plugin" is a published array of `defineOperator()` definitions — or a factory function closing over configuration or clients, the `httpOperators(client)` pattern — consumed through the `operators` array. No plugin API, no lifecycle hooks, no registration ceremony beyond the array; the future date/duration package (Operators, deferred) ships this way.

### Taxonomy, recorded

Fragments are **config-level** shortcuts — authored in FigTree itself, by expression authors, registered as expressions. Custom operators are **host-level** capability extensions — authored in JS by the embedding developer. They share the invocation namespace and shorthand grammar but are different kinds of thing. v2's "custom functions" were simply custom operators with an undeclared contract; that tier is gone.

### Migration

The migration doc carries a **prescriptive** wrapper recipe for v2 `functions` users — a defined shape (e.g. a single variadic `args` parameter spread into the wrapped JS function), not a loose suggestion — so the expression converter can mechanically rewrite v2 CUSTOM_FUNCTIONS call sites against it. Per-host improvised naming would make call-site conversion non-mechanical.

### Sequencing: the contract is settled last, by induction

The `defineOperator()` definition shape *is* the engine's core operator specification — every native operator is an instance of it. Rather than being fixed up front, it is settled **after the per-operator parameter passes**, which serve as requirements-gathering: each pass either fits the declaration vocabulary already agreed (metadata types, null policies, positional mapping, layered defaults) or exposes a missing capability. **Contract-ledger discipline**: a capability a pass needs — lazy parameters for `if`'s branches, evaluate-with-bindings for the iterators, evaluation-context access for `get`, abort-signal support and caching for I/O — is recorded as a *contract requirement*, never as that operator's private quirk. The ledger lives in [v3-operator-parameters.md](v3-operator-parameters.md). The Extensibility contract is then written as the codification of the ledger, and the first-class principle is provably honest: the contract is exactly what core needed.

### Deferred

- The full `OperatorDefinition` shape (declarative half) and the operator runtime interface (what an operator body receives: parameters post-checks, context, the lazy-parameter interface) → after the parameter passes, per Sequencing.
- Whether a declared result type (`returns`) ships in v3.0 or stays maybe-later (gradual return-type inference) → with the contract.
- `defineOperator()` TypeScript ergonomics (parameter-type inference for the body) → with the contract.

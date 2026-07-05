# FigTree v3 — API specification

*Working document. Each section is discussed and agreed before being written here; sections marked **Draft** are under discussion, **Agreed** sections are settled (revisit deliberately, not casually).*

*Companion to [v3-assessment.md](v3-assessment.md), which holds the rationale. This doc records the decisions.*

## Status overview

| Area | Status |
|---|---|
| Node grammar & reserved keys | **Agreed** — includes `fallback`/kill-switch semantics, `outputType`→`convert`, `//` comments, name legality & opaque-value rules |
| References & scoping (`$data` / `$vars` / `$params` / `$element`) | **Agreed** — lazy-var mechanism & exotic-key path grammar noted as implementation follow-ups |
| Alias policy | **Partial** — operator naming & aliases settled under Operators; parameter-name aliases pending the per-operator parameter passes |
| Type, coercion & null policy | — |
| Operators | **Agreed** — canonical list, aliases & shorthand faces; per-operator parameters pending |
| Fragments | — |
| Extensibility (`defineOperator`, functions) | — |
| **Options** (shape, merge semantics, registration) | **Agreed** |
| Evaluator methods & return shapes | — (partially sketched under Options; `report`/`trace` shapes deferred) |
| Packaging & exports | — |

---

## Options — **Agreed**

### One shape, three places

There is a single `FigTreeOptions` interface, accepted in all three places: the constructor, `updateOptions()`, and per-call as the second argument to `evaluate()`. Instance-level values act as defaults; per-call values override them for that evaluation only.

**One exception class — the invocable registry:** `operators`, `fragments` and `functions` are accepted at construction and via `updateOptions()`, but not per-call. The parsed/normalized form of an expression depends on what's registered (shorthand `$key`s resolve against operator, fragment and function names alike), and the parse cache assumes a stable registry. Fragments and functions are system-level definitions by design — there is no impromptu per-evaluation invocable; per-request state belongs in `data`, read by a function as ordinary arguments. Passing any of the three per-call is a validation error.

Per-call options are merged into a frozen per-evaluation context and **never mutate the instance** (fixing the v2 bug class where `evaluate(expr, { httpClient })` permanently reconfigured the evaluator). `updateOptions()` is the one sanctioned mutation path. `getOptions()` returns a snapshot, never live internal references.

### The shape

```ts
new FigTree(options?: FigTreeOptions)

interface FigTreeOptions {
  // ── Evaluation environment ─────────────────────────────
  data?: Record<string, unknown>
  functions?: Record<string, CustomFunction | FunctionDefinition> // definition shape: see Extensibility; not per-call (see below)
  fragments?: Record<string, FragmentDefinition>                  // definition shape: see Fragments; not per-call (see below)

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
  useCache?: boolean // blanket default overriding per-operator metadata defaults (a reserved node key, so outside the reach of operatorDefaults)
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
- Visible to tooling: `getOperators()` reports the *effective* defaults, so the editor and generated docs stay honest — the crucial difference from v2's invisible global flag.
- Portability caveat (accepted): an expression can mean something different on a differently-configured instance — but expressions already depend on instance-supplied `fragments`, `functions`, and clients; what matters is that the dependency is declared and machine-readable.

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
| `functions: { myFn }` (`updateOptions` only) | same |
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
| `functions` | **Modified** | No longer per-call — constructor/`updateOptions` only (registry stability); definition shape revisited in Extensibility |
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

*Canonical list, aliases and shorthand faces only. Per-operator parameters (names, types, defaults, positional order) are **not** covered here — each operator gets its own pass, agreed individually.*

### Naming rules

0. **Plain English over programmer jargon.** FigTree's audience is tech-savvy config authors, not necessarily developers: when a plain-English name is as precise as the established programming term, plain English wins — hence `firstOf`, not SQL's `coalesce` (obscure to non-programmers, and misleading as ordinary English, where it suggests merging). Established math/JS names survive where they're the precise, searchable term with no equally-precise plain alternative (`modulo`, `pow`, `regex`, `map`, `some`, `every`). This is a judgment call, not an algorithm — borderline cases are decided here and the outcome recorded in the table notes.
1. **Canonical names are camelCase, case-sensitive, exact-match.** No case folding, no camelCase normalization — `$If`, `PLUS` and `not_equal` are unknown-operator errors. v2's `standardiseOperatorName` machinery and the generated alias table die.
2. **At most one alias per operator, always symbolic.** The full set: `+` `-` `*` `/` `=` `!=` `>` `>=` `<` `<=` `?` `!`. Word aliases die entirely (v2 shipped ~95 operator-name aliases across 24 operators, before counting the unbounded case/camelCase variants).
3. **An alias is valid anywhere the canonical name is** — as a shorthand `$key` or as an `operator:` value — and parse normalizes it away: the canonical AST contains only canonical names.
4. **One invocation namespace, collision-checked at registration.** A fragment or custom operator/function whose name matches any operator name or alias is a registration error ([#136](https://github.com/CarlosNZ/fig-tree-evaluator/issues/136)). No silent precedence.
5. **Reserved names**, unusable for fragments/functions/custom operators: the reference namespaces `data`, `vars`, `params`, `element`, `index` and their single-character alias forms (`d`, `v`, `p`, `e`, `i`), plus `literal`. (Reserved *node keys* are settled in the Node-grammar area.)

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
| `plus` | `+` | **Kept** (PLUS) | keeps the add/concat/merge polymorphism (mode selector renamed away from `type` — settled with parameters); drops `add`, `concat`, `join`, `merge` |
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
| `substring` | — | **New** | |
| `regex` | — | **Modified** (REGEX) | gains flags and an output mode (test / match / extract); drops `patternMatch`, `regexp`, `matchPattern`; constraint for its parameter pass: v2's numeric-mining use case must stay cleanly expressible (`"15 grams"` → `15` via extract, then `convert`) |

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

### Custom functions & operators

The CUSTOM_FUNCTIONS operator is deleted. `defineOperator()` definitions and `functions:` entries register into the same operator namespace and are invoked by their own name — canonical `{ operator: 'myFn', ... }`, shorthand `{ $myFn: ... }`. They are one mechanism at two ceremony levels: `defineOperator()` supplies the full metadata contract (typed parameters, positional mapping, cache behaviour — full validation and first-class editor rendering); `functions: { myFn }` wraps a bare JS function into a minimal definition (variadic args, untyped — weakest validation, generic editor face). With the `functionName` indirection gone, dynamically-computed function names are structurally impossible — v2's five-deep lookup chain (a sandbox-integrity hole) dies by construction. Definition shapes are settled in Extensibility.

### Shorthand grammar

Every registered invocable — operator, fragment, custom function/operator — has exactly one shorthand face: a `$name` key, where `name` is the canonical name or its symbolic alias (`{ "$+": [1, 2] }`, `{ "$?": [...] }`).

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
| **CUSTOM_FUNCTIONS** (`customFunctions`, `customFunction`, `objectFunctions`, `function`, `functions`, `runFunction`) | *(deleted)* | functions invoked by their registered name |
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
- **Date/duration operators**: separate plugin package — own area, later.
- **Export grouping** (fat `coreOperators` vs lean core + `mathOperators` / `stringOperators` arrays): Packaging area. Candidate constraint floated for that discussion: the default core should cover everything v2 had post-conversion, so converted v2 expressions run without extra registration.

---

## References & scoping — **Agreed**

*The `$` sigil has exactly two jobs: in **key** position it invokes (an operator, fragment or function — see Operators); in **string-value** position it references a named scope. Five namespaces exist, each declaring the value's provenance. Any other `$`-string is inert data with a `validate()` warning (per Operators).*

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
2. **Whole-string only**: `"Hello $data.name"` is inert — no interpolation inside strings; embedding is `buildString`'s job.
3. **Path grammar**: dot-separated keys plus numeric bracket indices — `$data.users[0].name` — the same grammar as the `get` operator (v2's `object-property-extractor` syntax). Keys containing dots or brackets aren't expressible as a reference: use `get`, which takes the path as data.
4. **Static recognition only**: references are recognized in the expression tree at parse time and **never** in values flowing through at runtime — a string arriving from `$data`, HTTP or a function result is never re-interpreted as a reference. (v2 violates this: `{{name}}` substitution evaluates content extracted from `data` as an expression — [STRING_SUBSTITUTION/operator.ts:111-114](../src/operators/STRING_SUBSTITUTION/operator.ts#L111-L114) — an injection path this rule kills.)
5. **Recognized everywhere** in the expression — including strings nested inside plain object/array literals within parameters — except inside `literal`.
6. **References are values, not nodes**: they can't carry node modifiers like `fallback`. For defaults use `get` or `firstOf`; for type coercion wrap in `convert`.
7. **Bare namespace**: `"$data"` (or `"$d"`) alone = the whole merged data object; `$element` is bare-or-drilled, `$index` bare only; bare `"$vars"` / `"$params"` = validation error.

### Absence semantics: `null`, and the layered defaults

A missing `$data` path resolves to `null` — absence is not failure. Genuine `null` values and missing paths are indistinguishable at the reference level (deliberately); the layers below preserve the distinction when it matters:

| Tool | Triggers on | Use for |
|---|---|---|
| bare reference `"$data.x"` | — (yields `null`) | everyday reads |
| `firstOf` | `null` **or** missing | defaults across multiple candidates |
| `get` + `default` param | missing path **only** — a genuine stored `null` passes through unchanged | preserving the null/missing distinction; near-lossless converter target for v2 `getData` + `fallback` (v2's `extractProperty` likewise only threw on *missing*) |
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

Bound by the iterator operators (`map`, `filter`, `find`, `some`, `every`), always to the **innermost** enclosing iterator. Nested iterators reach an outer binding by naming it: `as: 'order'` renames that iterator's bindings to `$order` (element) and `$orderIndex` (index), and disables `$element`/`$index` for that iterator (one way to refer to each thing). `as` names are validated against the reserved namespaces (long and short forms) and enclosing `as` names.

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
2. **Fragment-call node** — contains the key `fragment`. Its value must be a **literal string** naming a registered fragment; an unknown name is a hard error (statically checkable, now that fragments are constructor/`updateOptions`-only — see Options). Arguments live **only** in `parameters` (named-object; fragments have no positional form, per Operators). Legal modifiers per the reserved-key set, below.
3. **Shorthand node** — contains exactly one **recognized** `$name` key (canonical operator name, symbolic alias, fragment, or custom function/operator name), optionally accompanied by reserved modifier keys (sibling rule, below), and nothing else. Payload disambiguated by JSON type (per Operators). Normalizes at parse into kind 1 or 2.
4. **Reference string** — a string value matching the token rule. Fully settled in References; listed for completeness. References are values, not nodes — they carry no modifiers.
5. **`literal` node** — grammatically an operator node / shorthand face, but a **parse boundary**: contents are never walked, validated or evaluated (per Operators and the implementation notes).
6. **Plain literal** — every other object, array or primitive. Objects and arrays are traversed per deep evaluation (Options); unrecognized `$` keys/strings are inert with a `validate()` warning. **Reserved modifier keys do not make an object a node**: `{ fallback: 1 }` with no `operator` / `fragment` / recognized `$name` key is plain data. Two deliberate exceptions operate on plain object literals without making them nodes: `vars` (functional & consumed — see [`vars` on plain object literals](#vars-on-plain-object-literals)) and `//` (comments, stripped everywhere — see Comments).

Non-plain objects in JS-authored expressions (class instances, `Date`s, functions) are pending — proposed treatment: opaque constants, never traversed.

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

Two consequences worth naming: branch keys inside the branches parameter are parameter *data*, outside the node namespace — a branch legitimately named `"operator"` or `"fallback"` is safe for the first time; and a misspelled parameter (`thn:` for `then:`) fails loudly at parse instead of being silently carried, which also buries the `type`-means-three-things overload for good (PLUS's mode selector is renamed, per Operators; `outputType` and its `type` alias are deleted outright — see the reserved-key set).

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
| `parameters` | structural map — argument *names* static, values expressions |
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
| **Runtime** | I/O failure (including a *per-request* timeout), runtime type-check failure, custom-function throw, `strictDataPaths` miss | during evaluation | always follows the fallback process | not possible (data-dependent) |
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

Author-chosen names — vars, fragment parameters, `as` bindings, and fragment/function/custom-operator registration names — have **no imposed style**: spaces, kebab-case and unicode are all legal; FigTree's audience shouldn't need to know what a programmer means by "identifier" (a camelCase *convention* may be recommended in docs; the engine doesn't care). One legality rule, shared by all of them and forced by the grammar rather than taste:

> A name is any non-empty string that does not contain `.`, `[` or `]` and does not start with `$`.

The `.` / `[` / `]` exclusion is disambiguation, not tidiness: drilling into var values is agreed in References (`$vars.country[0].name`), so a var named `a.b` would make `$vars.a.b` ambiguous between *var `a.b`* and *var `a` drilled with `.b`*. The `$` exclusion keeps the sigil's two jobs clean. Checked at declaration/registration time, on top of the existing collision rules (Operators §4–5) and the flat reservation for parameter names; reserved node keys are also barred as *registration* names (a fragment invoked as `$fallback` is confusion nobody needs).

### No v2 tombstone keys

Considered and rejected: reserving `children` / `type` solely to emit pointed "removed in v3" errors. v3 is a clean break — v1/v2 compatibility lives entirely in `./convert`, and `children` was itself a v1 hangover that freshly-authored v2 expressions should never have used. On a node these keys fail as ordinary unknown keys; history is the migration doc's job, not the runtime's. (Informed by v2's own experience carrying v1 relics — `supportDeprecatedValueNodes` — longer than they earned.)

### Non-plain-object values: opaque constants

A JS-authored expression may contain values with no JSON representation — `Date`s, `Map`s, class instances, functions. Anything that is not a plain object or array is an **opaque constant**: never traversed, never validated, passed through by identity (and classified constant by the compile phase, so opaque-only subtrees take the identity short-circuit). This is an authoring-side rule only; at runtime the question doesn't arise — values *flowing through* an evaluation are never parsed (References §4), so a custom function or `http` client may return a `Date` and it flows through operators untouched, subject only to each operator's runtime type-check policy.

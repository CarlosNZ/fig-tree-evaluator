# FigTree v3 — API specification

*Working document. Each section is discussed and agreed before being written here; sections marked **Draft** are under discussion, **Agreed** sections are settled (revisit deliberately, not casually).*

*Companion to [v3-assessment.md](v3-assessment.md), which holds the rationale. This doc records the decisions.*

## Status overview

| Area | Status |
|---|---|
| Node grammar & reserved keys | — |
| References & scoping (`$data` / `$vars` / `$param` / `$item`) | — |
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

**One exception:** `operators` is accepted at construction and via `updateOptions()`, but not per-call — the parsed/normalized form of an expression depends on the registry (shorthand `$key`s resolve against it), and the parse cache assumes a stable registry. Passing `operators` per-call is a validation error.

Per-call options are merged into a frozen per-evaluation context and **never mutate the instance** (fixing the v2 bug class where `evaluate(expr, { httpClient })` permanently reconfigured the evaluator). `updateOptions()` is the one sanctioned mutation path. `getOptions()` returns a snapshot, never live internal references.

### The shape

```ts
new FigTree(options?: FigTreeOptions)

interface FigTreeOptions {
  // ── Evaluation environment ─────────────────────────────
  data?: Record<string, unknown>
  functions?: Record<string, CustomFunction | FunctionDefinition> // definition shape: see Extensibility
  fragments?: Record<string, FragmentDefinition>                  // definition shape: see Fragments

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
  timeout?: number   // ms, whole evaluation
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
| `fragments: { newFrag }` | adds without clobbering others; re-supplying an existing name replaces that definition wholesale (no stale sub-keys) |
| `functions: { myFn }` | same |
| `data: { user: {…} }` | merges at top-level data keys; a supplied key replaces its whole value |

### `evaluate` signature

```ts
await fig.evaluate(expression, options?)

fig.evaluate(expr)                                  // constructor data only
fig.evaluate(expr, { data: formValues })            // everyday case
fig.evaluate(expr, { trace: true })                 // per-call options without per-call data
```

`data` is an ordinary option — there is no positional `data` argument (considered, rejected: it would be a second way to say something the options object already says, and forces an `undefined` placeholder when passing options without data). Per-call values merge over instance options with the standard two-level rule. This also matches the v2 signature, so migration continuity comes free.

### Error handling: `mode`

- **`mode: 'throw'`** (default) — first uncaught error aborts the evaluation and throws a `FigTreeError`; `fallback`s still catch where present.
- **`mode: 'report'`** — never throws. An erroring node resolves to its `fallback` if present, otherwise `null`, and evaluation of everything else continues (the v2 `returnErrorAsString` partial-evaluation use case, minus its in-band-signaling flaw). Every error is collected as a `FigTreeError` **tagged with the failing node's path**, returned alongside the result.

`FigTreeError` carrying a node path is part of the contract (also needed for editor diagnostics and trace mode).

### v2 → v3 option disposition

| v2 option | Verdict | Notes |
|---|---|---|
| `data` | **Kept** | Unchanged — per-call via `options.data`, merging over constructor `data` |
| `objects` | **Deleted** | Deprecated alias of `data` |
| `functions` | **Kept** | Definition shape revisited in Extensibility |
| `fragments` | **Kept** | Definition shape revisited in Fragments (declared params) |
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
| `evaluateFullObject` | **Deleted** | → explicit `fig.evaluateDeep(obj, data)` method |
| `excludeOperators` | **Modified** | Canonical names only, case-sensitive |
| `useCache` | **Kept** | Same meaning |
| `maxCacheSize` | **Moved** | → `cache.maxSize` |
| `maxCacheTime` | **Moved** | → `cache.maxTime` |
| `supportDeprecatedValueNodes` | **Deleted** | v1 compat lives in `./convert` only |

**New in v3:** `operators`, `operatorDefaults`, `http` / `graphQL` blocks, `strictDataPaths`, `maxDepth` / `maxNodes` / `timeout` / `signal`, `cache.store`, `mode`, `trace`.

### Deferred (to Evaluator methods & return shapes)

- Exact return shapes for `mode: 'report'` and `trace: true`.
- The TypeScript story for instance-level `mode`/`trace` (return-type inference via class generic vs. a single stable return shape — to be settled together with the shapes themselves; note `updateOptions({ mode })` cannot re-type an existing instance).

---

## Operators — **Agreed**

*Canonical list, aliases and shorthand faces only. Per-operator parameters (names, types, defaults, positional order) are **not** covered here — each operator gets its own pass, agreed individually.*

### Naming rules

1. **Canonical names are camelCase, case-sensitive, exact-match.** No case folding, no camelCase normalization — `$If`, `PLUS` and `not_equal` are unknown-operator errors. v2's `standardiseOperatorName` machinery and the generated alias table die.
2. **At most one alias per operator, always symbolic.** The full set: `+` `-` `*` `/` `=` `!=` `>` `>=` `<` `<=` `?` `!`. Word aliases die entirely (v2 shipped ~95 operator-name aliases across 24 operators, before counting the unbounded case/camelCase variants).
3. **An alias is valid anywhere the canonical name is** — as a shorthand `$key` or as an `operator:` value — and parse normalizes it away: the canonical AST contains only canonical names.
4. **One invocation namespace, collision-checked at registration.** A fragment or custom operator/function whose name matches any operator name or alias is a registration error ([#136](https://github.com/CarlosNZ/fig-tree-evaluator/issues/136)). No silent precedence.
5. **Reserved names**, unusable for fragments/functions/custom operators: the reference namespaces `data`, `vars`, `param`, `item`, `index`, plus `literal`. (Reserved *node keys* are settled in the Node-grammar area.)

### The canonical list

41 core + 3 I/O operators, 12 symbolic aliases. Which export array each operator ships in (`coreOperators` vs optional grouped arrays) is a Packaging-area decision — this section locks names and semantics only.

The rule that shaped the math batch, and pre-answers every future "why not one operator with a mode?": **a mode parameter is acceptable only when the signature is invariant across modes** — as with `plus`'s add/concat/merge, always `values: [...]`. When modes would change the arity or types of the other parameters (`round(value, decimals)` vs `pow(base, exponent)` vs `min(values[])`), they are separate operators; a mode-switched mega-operator hides per-mode signatures from validation, positional mapping and the editor.

#### Logic & control

| v3 | Alias | vs v2 | Notes |
|---|---|---|---|
| `and` | — | **Kept** (AND) | drops `&`, `&&` |
| `or` | — | **Kept** (OR) | drops `\|`, `\|\|` |
| `not` | `!` | **New** | `!` is reassigned — it meant NOT_EQUAL in v2 |
| `if` | `?` | **Modified** (CONDITIONAL) | new canonical name (v2 had only `?` / `conditional` / `ifThen`) |
| `match` | — | **Kept** (MATCH) | drops `switch` |
| `coalesce` | — | **New** | first non-null; the essential companion to null-on-missing `$data` references |

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
| `regex` | — | **Modified** (REGEX) | gains flags and an output mode (test / match / extract); drops `patternMatch`, `regexp`, `matchPattern` |

#### Arrays & iteration

| v3 | Alias | vs v2 | Notes |
|---|---|---|---|
| `length` | — | **Modified** (COUNT) | canonical name is v2's own alias; works on strings *and* arrays |
| `map` | — | **New** | the `$item` / `$index` operators ([#92](https://github.com/CarlosNZ/fig-tree-evaluator/issues/92)) |
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

#### I/O — registered via `httpOperators(client)` / `sqlOperators(connection)`, never in core

| v3 | Alias | vs v2 | Notes |
|---|---|---|---|
| `http` | — | **New** (merges GET + POST) | `method` param, default `'get'`; deliberately no method-pinning aliases; drops `GET`, `get`, `api`, `POST`, `post` |
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
| **PASSTHRU** (`pass`, `_`, `passThru`, `passthru`, `ignore`, `coerce`, `convert`) | *(deleted)* | any value already evaluates; `literal` covers the escape case |

### Migration hazards — recycled names

The converter maps all of these mechanically, but human muscle memory won't — each needs a loud callout in the migration doc:

| Name | v2 meaning | v3 meaning |
|---|---|---|
| `!` | NOT_EQUAL alias | `not` |
| `get` | HTTP GET | data access (v2 OBJECT_PROPERTIES) |
| `lower` | LESS_THAN alias | lowercase string |
| `join` | PLUS alias (concatenation) | array → string |
| `data` | OBJECT_PROPERTIES alias | reserved namespace word |

### Deferred

- **Maybe-later operators**, added on demand: `includes`, `reduce`, `sort`, `reverse`, `flatten`, `unique`, `keys` / `values`.
- **Date/duration operators**: separate plugin package — own area, later.
- **Export grouping** (fat `coreOperators` vs lean core + `mathOperators` / `stringOperators` arrays): Packaging area. Candidate constraint floated for that discussion: the default core should cover everything v2 had post-conversion, so converted v2 expressions run without extra registration.

# FigTree v3 — the operator contract: `defineOperator()`

*Working document, companion to [v3-api.md](v3-api.md) (Extensibility § Sequencing — this doc is the codification of the [contract-requirements ledger](v3-operator-parameters.md#contract-requirements-ledger) that section promised). Same protocol as the other docs, with one difference stated up front: **everything here is Draft, and deliberately provisional beyond the usual sense** — unlike the parameter passes, which specify author-facing semantics the implementation must simply honour, this doc specifies the machinery's own API before that machinery exists. Expect implementation to reshape details (the runtime-interface and caching sections above all); divergences come back here for a ruling before anything flips to Agreed. What must survive implementation unchanged is the *capability list* — the eighteen ledger entries are requirements, not suggestions.*

## Scope, and what is not relitigated

This doc settles the two halves Extensibility deferred: the **`OperatorDefinition` shape** (the declarative half — what an author writes) and the **runtime interface** (what an operator body receives and may do). Everything already settled elsewhere is consumed, not reopened:

- The single mechanism, first-class principle, naming & aliases, plugin story, taxonomy and migration recipe — Extensibility (v3-api.md).
- Registration through the `operators` array only; clients closed into definitions via factories — Options.
- Name legality, the flat reservation set, collision rules — Node grammar, Operators §4–5.
- The metadata type vocabulary, null-policy vocabulary, type-driven admission, null-means-unset, truthiness, stringification — Type area.
- `positionalParams`, runtime-`default` vs editor-seed, per-parameter `metadata`, the `…Default` naming family, `useCache` metadata defaults — the parameter-pass conventions ([Part 1](v3-operator-parameters.md)).
- Every per-operator assignment — the passes themselves. The core operators are the contract's proof corpus: each must be expressible as a `defineOperator()` definition with no private machinery.

## The ledger → contract map

The honesty check, maintained as the contract evolves: every ledger entry names the construct that codifies it. A ledger row with no home here is a spec bug.

| # | Capability | Codified as |
|---|---|---|
| 1 | Lazy parameter | `evaluation: 'lazy'` → body receives a `LazyValue` (§ Evaluation modes, § Runtime interface) |
| 2 | Sequential array parameter | `evaluation: 'lazyElements'` → `LazyValue[]`; ordering/early-stop is the body demanding elements in order |
| 3 | Structural map with lazy values | `evaluation: 'lazyEntries'` → `Record<string, LazyValue>` |
| 4 | Shared `isTruthy()` positions | `truthiness: true` on the declaration → body receives booleans |
| 5 | Rest-binding positional mapping | `positionalParams` (settled in the conventions; restated here as a definition field) |
| 6 | Opaque `metadata`, both levels | `metadata` field on the definition and on each parameter declaration |
| 7 | Early resolution + cancellation | `evaluation: 'race'` → settlement stream; body resolution aborts the node's child scope (§ Runtime interface) |
| 8 | Element-wise null policy | `elementNullPolicy` on container parameters |
| 9 | Array constraints | `constraints` on the declaration |
| 10 | Finite-number result guard | engine guarantee — no declaration, applies to every body's result (§ Engine guarantees) |
| 11 | Static validation hook | definition-level `validate` |
| 12 | Per-element bindings evaluation | `evaluation: 'perElement'` + `over: '<sibling>'` → `PerElement` handle |
| 13 | Evaluation-data access | the `EvaluationData` sentinel as a parameter `default` |
| 14 | Mode-conditional null policy | a `nullPolicy` function of the definition's single literal-union parameter, compiled to a policy table at registration |
| 15 | Per-request abort composition | `requestTimeout: true` on the timeout parameter; composition lands in `context.signal` |
| 16 | I/O result caching, effective-request keys | `cache: 'manual'` + `context.cache.memo()` (§ Caching) |
| 17 | Declared options access | definition-level `readsOptions` → `context.options` |
| 18 | Null-replacement default | `replacesNullAt: ['<target>', …]` on the replacement parameter |

## The definition shape

A definition is one flat object literal, passed through `defineOperator()`, which validates it in isolation (loudly, at build time — the fragment registration posture) and returns it branded for the `operators` array. Registration into an instance then re-runs the *cross-registry* checks (name/alias collisions across the one namespace).

```ts
import { defineOperator } from 'fig-tree-evaluator'

const clamp = defineOperator({
  name: 'clamp',
  description: 'Constrain a number to a range',
  parameters: {
    value: { type: ['number', 'null'] },          // nullPolicy 'propagate' (the default) — body never sees null
    min:   { type: 'number', default: 0 },        // default ⇒ optional; layered chain applies
    max:   { type: 'number', default: 1 },
  },
  positionalParams: ['value', 'min', 'max'],
  useCache: false,
  evaluate: ({ value, min, max }) => Math.min(max, Math.max(min, value)),
})
```

Everything v2 made the operator author do is absent, deliberately: no type checks (declared, engine-enforced), no null checks (`propagate` short-circuits before the body runs), no `parseChildren` (`positionalParams` is declarative), no `NaN` policing (the finite guard catches `clamp` fed garbage under `runtimeTypeCheck: false`). `{ $clamp: ['$data.score', 0, 100] }` works the moment the definition enters the array.

The laziness capabilities, on the operator that forced them into the ledger:

```ts
const ifOperator = defineOperator({
  name: 'if',
  alias: '?',
  description: 'Conditional branching',
  parameters: {
    condition: { type: 'any', truthiness: true },              // body receives a boolean (ledger #4)
    then:      { type: 'any', evaluation: 'lazy' },            // LazyValue — evaluated on demand, at most once (#1)
    else:      { type: 'any', evaluation: 'lazy', default: null },
  },
  positionalParams: ['condition', 'then', 'else'],
  useCache: false,
  evaluate: ({ condition, then, else: otherwise }) =>
    condition ? then.evaluate() : otherwise.evaluate(),
})
```

## Definition-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✓ | shared legality rule + reservation set (Node grammar); collision-checked at registration |
| `alias` | string | — | exactly one, like natives; same legality/collision rules; normalizes away at parse (Extensibility) |
| `description` | string | ✓ | required — `getOperators()` totality is the point of killing the functions tier; a definition with nothing to say about itself is malformed |
| `metadata` | `Record<string, unknown>` | — | opaque; engine never reads it; returned verbatim by `getOperators()` (ledger #6; conventions § Metadata) |
| `parameters` | object keyed by name | ✓ (may be `{}`) | declarations, § below; object-keyed as for fragments — ordering lives in `positionalParams`, so an array's ordering would be double-encoding |
| `positionalParams` | `string[]` | — | the conventions' rule, verbatim: ordered names, last entry may be `'...rest'`; every entry names a declared parameter; omitted ⇒ the operator is named-face only |
| `useCache` | boolean | — (default `false`) | the metadata default at the bottom of the settled chain (node key → `operatorDefaults` → blanket option → this) |
| `cache` | `'auto'` \| `'manual'` | — (default `'auto'`) | how caching is keyed when effective `useCache` is true — § Caching |
| `readsOptions` | `string[]` | — | option blocks the body reads (ledger #17); the named blocks arrive frozen on `context.options`; anything unnamed is invisible to the body |
| `validate` | function | — | the static hook (ledger #11), § Registration & validation |
| `evaluate` | function | ✓ | the body, § Runtime interface |
| `returns` | metadata type | — (reads as `any`) | declared result type — drives the static feeding-position check, § `returns` |

## Parameter declarations

The fragment declaration table (Fragments § Parameter declarations) is the base — `type` (default `any`), `required` (default `true`), `default` (constant, presence implies optional, contradiction with `required: true` is a registration error), `description`, `metadata` — and stays byte-compatible: a fragment declaration is a valid operator parameter declaration. Operators extend it:

| Field | Type | Default | Ledger | Notes |
|---|---|---|---|---|
| `evaluation` | mode union, § below | `'eager'` | 1, 2, 3, 7, 12 | how the engine delivers the value to the body |
| `over` | string | — | 12 | `'perElement'` only: names the sibling array parameter iterated over |
| `truthiness` | boolean | `false` | 4 | the position is judged by the one shared `isTruthy()`; body receives actual booleans (per element for containers/`race`/`perElement`); implies null policy `value` (null is falsy) — declaring both is redundant, declaring a conflict is a registration error |
| `nullPolicy` | `'propagate'` \| `'value'` \| conditional form | `'propagate'` | 14 | legal **only where the declared type names `null`** — type-driven admission (Type area): a type without `null` *is* the reject declaration, and declaring a policy on it is a registration error. Conditional form — a function of the definition's single literal-union parameter, compiled to a table at registration: § The conditional null-policy form, below |
| `elementNullPolicy` | same vocabulary | — | 8 | container parameters only: the policy applied per element (arrays) / per value (objects); the parameter *itself* going null is governed by `nullPolicy`/type as usual |
| `constraints` | object, § below | — | 9 | array-shape constraints beyond the type table |
| `replacesNullAt` | `string[]` | — | 18 | marks a `…Default` parameter as the engine-side null replacement for the named sibling target(s); requires `evaluation: 'lazy'`, optional, **no `default`** (presence-sensitive by construction — unset leaves the target's declared policy untouched); granularity follows the target: per element/value where the target declares `elementNullPolicy`, whole-value otherwise; replacement runs in the engine's null-policy layer, before the target's own type check (the batch-5 `nullInputDefault` ordering) and before mode dispatch/comparison/rendering — the body never sees any of it; where several slots go null at once (two null operands in one `values`), the memoized-lazy guarantee means the authored replacement evaluates **once** and splices into each — the concrete multi-consumer behind `lazy`'s at-most-once rule |
| `requestTimeout` | boolean | `false` | 15 | one `integer` parameter per definition may declare it: its resolved value joins the abort composition on `context.signal`, and its expiry surfaces as an **ordinary runtime failure** (fallback-catchable), distinct from the kill switch |

**Optionality and unset delivery.** The fragments rule transfers: required unless `default` or `required: false`; null-means-unset applies engine-side to optionals whose type excludes `null` (Type area) — no declaration needed. An optional parameter that is unset *and has no default* is delivered to the body as an **absent key** on `params` — not `null` — so a body can distinguish "unset" from "explicitly null" where its type admits both (`get.missingPathDefault` is the case that forces this: `missingPathDefault: null` under `strictDataPaths` legitimately means "give me null instead of throwing", which an unset parameter must not mean).

### Evaluation modes

One field, one mode per parameter. Names provisional — this table is the section most likely to be reshaped at implementation.

| Mode | Body receives | Semantics | Holders (from the passes) |
|---|---|---|---|
| `'eager'` (default) | the resolved value | evaluated with the node's other eager parameters, concurrently; type/null layers already applied | most parameters |
| `'race'` | a settlement stream (§ Runtime interface) | all elements start concurrently; settlements delivered in completion order; body resolution cancels the in-flight remainder (ledger #7) | `and.values` / `or.values`; the decider iterators reuse the machinery via `perElement` |
| `'lazy'` | `LazyValue` | evaluated on demand, at most once, memoized (rejection included), in the node's own scope (ledger #1) | `if.then`/`else`, `match.default`, `find.noMatchDefault`, `get.missingPathDefault`, `regex.noMatchDefault`, `sql.noRowDefault`, every `replacesNullAt` holder |
| `'lazyElements'` | `LazyValue[]` | each element individually lazy; sequencing and early stop are the body demanding elements in declared order and simply not demanding more (ledger #2) | `firstOf.values` |
| `'lazyEntries'` | `Record<string, LazyValue>` | static data keys, individually-lazy values — the `vars` machinery family (ledger #3) | `match.branches` (literal-map mode) |
| `'perElement'` | `PerElement` handle | evaluated once per element of the `over` sibling, on demand, memoized per index, each in a fresh child scope binding `$element`/`$index` (or the node's `as` renaming) (ledger #12) | the iterators' `each` |
| `'structural'` | the literal value, verbatim | parse-time data, never evaluated; a dynamic value is a parse error | `as` |

**The degeneration rule rides the delivery layer** (recorded once in the ledger, discharged here): laziness applies to authored expressions. A lazily-declared parameter whose value arrives dynamically (`values: '$data.checks'`) is already data — the engine delivers pre-resolved handles (`LazyValue.evaluate()` returns immediately), so sequencing degenerates to iteration and lazy branches to selection with no body-side special-casing. Same pattern as fragments' dynamic-arguments mode.

### Constraints (ledger #9)

Beside the type table, not in it — `array` alone remains a valid declaration:

```ts
constraints: {
  length: 2,                            // exact arity — arity-style messages
  homogeneous: ['number', 'string'],    // all elements one type, drawn from this list (ordering comparisons, min/max)
  elementShape: {                       // each element an object of this shape (buildObject.entries)
    key: { type: 'string' },            // fragment-style declarations; required by default
    value: { type: 'any' },
  },
}
```

Checked at `validate()` for literal values and at runtime for dynamic ones, as the ledger records.

### The conditional null-policy form (ledger #14)

The problem it solves: an operator whose null behaviour at one parameter is keyed to a sibling mode selector. `convert` is the holder — the Type-area table **propagates** a null `value` for `to: 'number'` / `'string'` / `'array'` (there is no honest number reading of null, so absence stays absence) but **consumes** it for `to: 'boolean'` (null-is-falsy is already the rule at every truthiness site, so `false` is the defined answer, not invention). Neither fixed policy can declare that: `propagate` short-circuits before the body runs, so the boolean carve-out becomes unreachable; `value` delivers every null and leaves the body to hand-roll the propagation — the behaviour comes out right, but the policy has left the engine (the implementation-notes rule this contract hardens: bodies see null only at declared-`value` positions), and the metadata now lies to the editor about three of four modes. The conditional form keeps the declaration true — **spelled as a function** (revised at review — Carl, July 2026: the first draft's `{ by, cases }` table was rejected as opaque — the vocabulary said nothing and the direction of information flow was unreadable, where a function plainly returns a definite policy based on a condition):

```ts
// convert's own two parameters — { $convert: ['5', 'number'] } binds value: '5', to: 'number'
parameters: {
  value: {
    type: 'any',
    nullPolicy: (to) => (to === 'boolean' ? 'value' : 'propagate'),
  },
  to: { type: { literal: ['number', 'string', 'boolean', 'array'] } },  // the mode selector the policy is keyed on
},
```

**Compiled at registration, never called at evaluation.** The function's one argument is the resolved value of the definition's **single literal-union parameter**, and TypeScript types it as exactly that union — the signature here is `(to: 'number' | 'string' | 'boolean' | 'array') => 'propagate' | 'value'`; the argument name is the author's own choice, and naming it after the selector parameter is just the readable convention. At registration the engine calls it once per union member and records the resulting policy table; evaluation resolves the selector and consults the compiled table through the ordinary policy layer — `{ $convert: [null, 'string'] }` resolves `null` with the body never running; `{ $convert: [null, 'boolean'] }` delivers the null as a value — and `getOperators()` returns the compiled table verbatim, so the ledger's introspection requirement survives the friendlier syntax untouched (a function called at runtime would be opaque to tooling and uncheckable). A conditional policy in a definition with **no** literal-union parameter — or **more than one**, where "the selector" would be a guess — is a registration error; if a genuine two-selector case ever appears, widening the signature is a non-breaking extension. What compilation buys, recorded: **exhaustiveness comes free** (a return that isn't `'propagate'` / `'value'` for any member is a registration error), **purity by construction** (whatever the function returns at registration *is* the policy, forever), and the literal-union restriction is not incidental — a finite domain is exactly what makes the enumeration, the check and the display possible; a policy keyed on an unbounded parameter would be none of those. `convert` is the sole current holder — the form earns its place by keeping the no-body-side-null-checks discipline unbroken, not by breadth.

## The runtime interface

```ts
type EvaluateBody = (params: ResolvedParams, context: OperatorContext) => Value | Promise<Value>

interface LazyValue<T = Value> {
  evaluate(): Promise<T>                // at most once; memoized, rejections included
}

interface PerElement<T = Value> {
  evaluate(index: number): Promise<T>   // fresh binding scope per index; memoized per index
}

interface Settlement {
  index: number
  ok: boolean
  value?: Value                         // booleans already, where the declaration says truthiness: true
  error?: unknown                       // parked, never thrown — the body decides whether the result depends on it
}
// a 'race' parameter arrives as AsyncIterable<Settlement> & { length: number }

interface OperatorContext {
  signal: AbortSignal                   // caller signal + evaluation timeout + enclosing early-resolution scopes + declared requestTimeout (ledger #15)
  options: Readonly<Record<string, unknown>>  // only the blocks named in readsOptions; frozen per evaluation (ledger #17)
  cache: { memo<T>(key: unknown, fn: () => Promise<T>): Promise<T> }  // § Caching; identity passthrough when caching is off
}
```

- **`params` is post-everything**: positional mapping applied, aliases normalized away, layered defaults resolved, type checks passed, null policies enforced, `#18` replacements done. A body reads canonical names only and never sees a spelling.
- **Resolution is cancellation.** When the body's returned promise settles, the engine aborts the node's child scope — everything still in flight (undemanded race elements, unevaluated lazy branches mid-flight) is cancelled via the derived abort scope, and a cancelled child raises nothing. This is ledger #7 as a *general rule of the interface*, not an `and`/`or` quirk: any body that returns early gets cancellation free.
- **Parked failures are the body's Kleene material.** A `race` settlement with `ok: false` is delivered, not thrown; the body fails the node only if the result depends on it (by rethrowing — see below) — the implementation-notes "race with error parking" shape, with the deterministic lowest-index rule as the body's obligation when no decider arrives. `trace` records per-element status engine-side.
- **Raising failures**: the body throws. Any thrown error becomes an ordinary runtime failure (fallback-catchable), wrapped into `FigTreeError` with the node path and operator name engine-side. For structured payloads (the I/O contract's `errorData`) the body throws `new OperatorFailure(message, { errorData })` — an exported class; plain `Error` remains legal for the simple cases.
- **The evaluation-data sentinel** (ledger #13): a parameter may declare `default: EvaluationData` (an exported sentinel) — when unsupplied, the body receives the frozen, read-only merged per-evaluation data context in its place. `get.from` is the holder; the sentinel is legal only in the `default` position.

### Engine guarantees — what a body never does

The flip side of the first-class principle: these live in the engine's layers, and a body doing them by hand is a review smell (the implementation-notes posture, now contract):

- Parse-time and runtime **type checking** against the declared types, constraints included (#9); `runtimeTypeCheck: false` degrades exactly the pre-execution layer, per its agreed scope.
- **Null-policy enforcement** — propagate short-circuits, admission rejects, null-means-unset substitutes, `replacesNullAt` replaces (#18): a body sees null only at positions declared `value`.
- **Truthiness** at declared positions (#4) — one shared `isTruthy()`, booleans delivered.
- **Boundary normalization**: body result `undefined` → `null`; the **finite-number guard** (#10) converts would-be `NaN`/`±Infinity` results into named runtime failures — no more hand-rolled divide-by-zero checks.
- **Escaped-handle guard**, the same boundary's laziness sibling: a `LazyValue`, `PerElement` handle or settlement stream returned *as* a body's result is always a bug — a lazy branch handed back instead of demanded — and fails loudly there rather than flowing out as an opaque value. (TypeScript flags it statically — § TypeScript ergonomics; the runtime guard covers plain-JS authors.)
- **Node machinery**: `fallback`, `vars` scoping, `useCache` gating, `trace` bookkeeping, abort threading and cancellation, `FigTreeError` wrapping and path tagging.

**Shared primitives are importable.** The one-function requirements (implementation notes: `isTruthy`, the ordering comparator, the stringification renderer, the whitespace set, code-point segmentation, the path resolver) are exported for definition authors — a custom operator that renders text calls the same renderer `buildString` does, so the composite-value policy can't fork. Core bodies consume them through the same imports; nothing is privileged.

**Body discipline, recorded as doc lines rather than enforcement**: bodies must tolerate cancellation, duplication and skipping (the read contract — expressions denote values); a custom operator with side effects owns that interaction, which is exactly why the mutating HTTP verbs stayed out of core.

## Caching

Two layers, selected by the definition's `cache` field; effective `useCache` (the settled four-step chain) gates both.

- **`'auto'`** (default): the engine memoizes the whole body run, keyed on the operator name plus a canonical serialization of the resolved eager parameters. Right for pure operators (where it is rarely on — metadata default `false`) and for any operator a host flips on via the blanket option; zero definition work.
- **`'manual'`**: the engine applies no outer memoization; the body keys its own units via `context.cache.memo(key, fn)`. This is ledger #16's home: the I/O operators compute the **effective request** (method, fully-resolved URL, serialized query/body/variables/binds, merged headers) and memo exactly that, so two spellings of one request share an entry and `returnPath` — applied *after* the memo call — sits outside the key by construction. `memo` is an identity passthrough when effective `useCache` is false.

Engine-owned regardless of layer: the `cache` option's store/TTL, **failures are never cached**, `trace` records hits and misses. Keys are namespaced by operator name engine-side; a body cannot collide with another operator's entries.

*Open, recorded honestly: this section is the contract's most implementation-sensitive spot. The alternatives considered — a definition-level `cacheKey(params, context)` derivation function (rejected: `returnPath`-outside-the-key then needs a second post-cache shaping hook), and engine-generic caching always-on with I/O opting out (rejected: the outer layer would re-introduce raw-spelling keys for exactly the operators the ledger fixed) — return here if `memo` proves awkward in the build.*

## The client contracts

The TS shapes batch 8 deferred here. Deliberately minimal — one entry point, fully-resolved request in, parsed value out — so `FetchClient` / `AxiosClient` / a host's own wrapper are thin and equivalent:

```ts
interface HttpClient {
  request(req: {
    url: string                         // fully resolved: base joined, query string rendered and appended (null pairs already omitted) — the operator body owns URL assembly
    method: 'get' | 'post'
    headers: Record<string, string>     // merged chain, rendered
    body?: unknown                      // JSON payload; the client serializes; absent = no body
    signal: AbortSignal                 // the composed signal (ledger #15) — the client must honour it
  }): Promise<unknown>                  // parsed JSON body; null on empty success (204); throws OperatorFailure with errorData (status, url, response payload) on non-2xx / non-JSON
}

interface SqlConnection {
  query(req: {
    text: string                        // dialect-owned placeholders, verbatim
    values?: unknown[] | Record<string, unknown>
    signal?: AbortSignal                // best-effort where the driver can't abort (SQLite) — recorded, not hidden
  }): Promise<Record<string, unknown>[]>  // rows as objects, always — shape reshaping is the operator's, not the client's
}
```

Header values never echo (the batch-8 rule): `errorData` and `trace` render header *names only* — enforced in the operator bodies, stated here because a custom client's error payloads must follow suit.

## Registration & validation

`defineOperator()` validates the definition in isolation, at build time, loudly (malformed = throw, matching fragments): name/alias legality and the reservation set; parameter-name legality and the flat reservation; declared types drawn from the metadata vocabulary; `default` values satisfying their declared types; `required: true` + `default` contradiction; `positionalParams` entries naming declared parameters, rest-entry last only; `nullPolicy` only where the type names `null`; conditional `nullPolicy` functions require exactly one literal-union parameter in the definition (zero, or several, is a registration error), and are enumerated over its members into a total compiled table (any non-policy return is a registration error); `over` naming a sibling array parameter; `replacesNullAt` holders lazy, optional, carrying no `default`, and naming real siblings; at most one `requestTimeout` parameter, `integer`-typed; the sentinel only in `default` position. Instance registration re-runs the cross-registry half: name/alias collisions across the one namespace, `excludeOperators`/`operatorDefaults` references resolving.

The definition-level **`validate` hook** (ledger #11) is the operator-semantics extension of the same posture, run at parse/`validate()` over **literal** parameter values only, never at evaluation:

```ts
validate?: (literalParams: Partial<Record<string, unknown>>, helpers) => Issue[]
// Issue: { severity: 'error' | 'warning' | 'hint', message: string, parameter?: string }
```

Holders from the passes: `buildString`'s token cross-checks, `regex`'s pattern compile, `get`/`http`'s literal path parse, the I/O mutation and injection lints, `buildObject`'s duplicate-key warning. Dynamic values pass untouched (runtime never lints); the generic layer (types, arity, unions, constraints, dead-expression warnings) runs regardless and the hook never re-implements it. `helpers` is a small toolbox (at minimum the shared primitives above) — shape settled at implementation.

`regex`'s hook, as the worked shape — note that `literalParams` carries only statically-literal values (a dynamic `pattern` simply isn't present, so the `typeof` guards double as mode checks):

```ts
validate: ({ pattern, flags }) => {
  const issues = []
  if (typeof pattern === 'string') {
    try {
      new RegExp(pattern, typeof flags === 'string' ? flags : '')
    } catch (e) {
      issues.push({ severity: 'error', parameter: 'pattern', message: `Pattern does not compile: ${e.message}` })
    }
  }
  if (typeof flags === 'string') {
    const bad = [...flags].filter((f) => !'gimsuy'.includes(f))
    if (bad.length)
      issues.push({ severity: 'error', parameter: 'flags', message: `Unsupported flags: ${bad.join('')}` })
  }
  return issues
}
```

The warning-severity flavour is batch 8's mutation lint: a literal `sql.query` opening with a write verb draws `severity: 'warning'`, unconditionally.

## Introspection: `getOperators()`

Returns the declarative half, verbatim and total: `name`, `alias`, `description`, `metadata`, `parameters` (every field of every declaration, compiled conditional null-policy tables and constraints included — the editor renders from this), `positionalParams`, `useCache` metadata default, `readsOptions`, `returns` — with instance-effective `operatorDefaults` (parameter and modifier alike) merged visibly, per Options. Function-valued fields are reported as capability flags (`hasValidate: true`, `cache: 'manual'`), never as functions. Nothing invocable lacks an entry — the totality the functions-tier deletion bought.

## TypeScript ergonomics

`defineOperator()` is generic over the literal definition, and the body's `params` type is **derived from the declarations** — the declared `type` maps to its TS type (`'string'` → `string`, `['number', 'null']` → `number | null`, literal unions → literal unions, `integer` → `number`, `any` → `unknown`), then the delivery layers adjust it: `propagate` **removes `null`** from the body-visible type (the engine short-circuits before the body), `truthiness: true` makes it `boolean`, `lazy` wraps in `LazyValue<T>`, `perElement` in `PerElement<T>`, optionals without defaults become optional keys. The worked examples above typecheck with no annotations and no `as const`. Cost recorded honestly: this is a non-trivial conditional-type stack; if inference proves brittle at implementation, the fallback is an explicit generic parameter (`defineOperator<MyParams>({ … })`) — the declarations stay the single source either way.

## `returns` — declared result types and the static feeding check

**Ruled (Carl, July 2026): `returns` ships in v3.0.** A declared result type on the definition, same metadata vocabulary; optional — undeclared reads as `any`, so a definition that omits it loses nothing but the check below; core definitions all declare theirs (their return types are known).

What earned it a place beyond display metadata — the deciding argument at the ruling: the generic `validate()` layer gains the **feeding-position check**. A node sitting in a parameter position is checked structurally: where the feeding operator's declared `returns` and the receiving parameter's declared type have an **empty intersection**, that is a static error — `{ $round: { value: { $and: […] } } }` (a boolean feeding a number position) fails at authoring time, no evaluation, no sample data. Honest limits, recorded: wide returns (`get`, `http` → `any`) never fire; polymorphic returns (`plus`'s mode-dependent union) fire only when fully disjoint from the receiver; references are untyped, so the check covers authored structure only — which is the disruption gradient's preferred failure surface anyway (loud at authoring, silent at runtime). The engine never enforces `returns` at evaluation — a body's result is not checked against it; the finite guard, `undefined` normalization and the escaped-handle guard remain the only result-boundary interventions. Deeper inference (an `if`'s return as the union of its branch types) stays maybe-later — a pure, non-breaking addition riding data that now exists from day one.

## v2 disposition

| v2 | v3 |
|---|---|
| `OperatorObject` — `{ propertyAliases, operatorData, evaluate, parseChildren }` across three files per operator ([types.ts:130-135](../../v2-src/types.ts#L130-L135)) | one flat `defineOperator()` literal; the folder convention becomes a free choice |
| `parseChildren`, imperative, per operator | `positionalParams`, declarative (conventions) |
| `propertyAliases` maps | dead — one name per parameter (conventions § No parameter-name aliases) |
| `aliases: string[]`, unbounded | `alias`, exactly one (Extensibility) |
| `parameters` as an array of `{ name, … }` | object keyed by name |
| `default` as editor seed | runtime `default` only; seeds → the editor-hints module |
| `type: ExpectedType` incl. `undefined` | metadata vocabulary: no `undefined`, adds `integer`, unions/literal unions kept |
| body receives raw `expression` + whole `FigTreeConfig` ([types.ts:137-140](../../v2-src/types.ts#L137-L140)) | post-everything `params` + scoped `context` (declared options only, composed signal) |
| body-side type checks, null handling, `NaN` policing, cache-key assembly | engine layers (§ Engine guarantees, § Caching) |
| `options.functions` / CUSTOM_FUNCTIONS | deleted — the migration doc's prescriptive wrapper recipe (Extensibility § Migration) re-registers each as a definition with a single variadic `args` parameter spread into the wrapped function |

## Open questions

1. **Evaluation-mode vocabulary** — are seven modes right, and are the names (`race`, `lazyElements`, `lazyEntries`, `perElement`, `structural`) the ones to live with? The alternative shape — fewer modes with qualifier fields — trades enum length for field interactions.
2. **The caching split** (`'auto'`/`'manual'` + `memo`) — flagged in its section; most likely to move at implementation.
3. **`returns` in v3.0** — **resolved (Carl, July 2026)**: ships, with the static feeding-position check (§ `returns`).
4. **Unset delivery as absent key** — proposed above for the `missingPathDefault` distinction; the alternative (a `Symbol` sentinel) is uglier but destructuring-safe (`const { decimals = …}` picks up JS defaults on absent keys, which could shadow the layered chain — doc line or lint?).
5. **`requestTimeout` spelling** — parameter-level flag (proposed) vs a definition-level `timeoutParam: 'timeout'` pointer.
6. **`OperatorFailure`** — name and shape of the exported error class (and whether `FigTreeError` itself is simply exposed for throwing).
7. **The `validate`-hook `helpers` toolbox** — minimum viable set; settled at implementation.
8. **Client contract finality** — the shapes above are deliberately minimal; confirm `FetchClient`/`AxiosClient` and the SQLite wrapper can all satisfy them before flipping to Agreed.
9. **`context.trace.note(event)`** — added from the Evaluator-methods close-off (its Q5, July 2026): trace needs a contract-level channel for body-level events (cache hits/misses, effective requests with header names only, placeholder renders); stubbed as a no-op from the first evaluator chunk, lights up with trace. Alternative considered and rejected there: engine-supplied (rather than imported) shared renderers that record implicitly — contradicts "shared primitives are importable", but worth a second look at implementation.

## Appendix — the evaluation modes on core operators

Body sketches, illustrative not normative (the passes own the semantics; edge handling abbreviated). The thing to notice: no mode needs machinery beyond its delivery shape — sequencing, short-circuit and dispatch are all just body control flow over handles.

**`race` — `or`** (batch 1's parallel early resolution, with Kleene parking):

```ts
evaluate: async ({ values }) => {
  const parked = []
  for await (const s of values) {
    if (s.ok && s.value) return true    // truthiness declared → s.value is already boolean; the early return cancels the in-flight rest (#7)
    if (!s.ok) parked.push(s)           // parked, never thrown — the Kleene rule
  }
  if (parked.length) throw parked.sort((a, b) => a.index - b.index)[0].error   // lowest index — deterministic
  return false                          // the vacuous identity
}
```

**`lazyElements` — `firstOf`** (sequencing is the body demanding elements in order; a backup candidate never starts):

```ts
evaluate: async ({ values }) => {
  for (const candidate of values) {
    const v = await candidate.evaluate()   // a failure fails the node — firstOf skips nulls, not errors
    if (v !== null) return v
  }
  return null                              // all-null and empty alike: absence in, absence out
}
```

**`lazyEntries` — `match`**, literal-map mode (only the matched branch ever evaluates; dynamic-mode `branches` arrives through the degeneration rule as pre-resolved handles, so the body is uniform):

```ts
evaluate: async ({ value, branches, default: defaultBranch }) => {
  const key = value === null ? null : renderText(value)   // the shared stringification table; a null match value matches no branch
  if (key !== null && key in branches) return branches[key].evaluate()
  if (defaultBranch) return defaultBranch.evaluate()      // absent-key delivery: an unset default is distinguishable from an explicit null
  throw new OperatorFailure(`No branch matches ${key === null ? 'null' : `'${key}'`} and no default was supplied`)
}
```

**`perElement` — `map`** (the engine owns scope creation, binding names and per-index memoization; `as` is structural and the body never reads it — the engine consumed it at parse to name the bindings):

```ts
parameters: {
  input: { type: 'array' },
  each:  { type: 'any', evaluation: 'perElement', over: 'input' },
  as:    { type: 'string', evaluation: 'structural', required: false },
},
evaluate: ({ input, each }) => Promise.all(input.map((_, i) => each.evaluate(i)))
```

**`eager` and `lazy`** are the worked examples in § The definition shape (`clamp`, `if`); **`structural`** is `as`, just above.

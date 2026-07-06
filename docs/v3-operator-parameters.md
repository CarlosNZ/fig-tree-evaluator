# FigTree v3 — operator parameter specification

*Working document, companion to [v3-api.md](v3-api.md) (same protocol: **Draft** sections are under discussion, **Agreed** sections are settled). This file holds the per-operator parameter passes deferred from the Operators area, the cross-cutting parameter conventions, and the contract-requirements ledger that feeds the `defineOperator()` contract (per Extensibility § Sequencing). Canonical names, aliases and shorthand faces are fixed in v3-api.md and not relitigated here. Ambiguous or controversial rulings — above all the absence/failure/default gradient — are additionally logged in [v3-cases-for-review.md](v3-cases-for-review.md) and stay provisional until the end-of-passes group review there, whatever their host section's status marker says.*

## Status overview

| Batch                         | Operators                                                                                                | Status    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| 0 — Cross-cutting conventions | *(applies to every pass)*                                                                                | **Draft** |
| 1 — Logic & control           | `and`, `or`, `not`, `if`, `match`, `firstOf`                                                             | **Draft** |
| 2 — Comparison                | `equal`, `notEqual`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`                  | —         |
| 3 — Arithmetic & math         | `plus`, `subtract`, `multiply`, `divide`, `modulo`, `pow`, `round`, `floor`, `ceil`, `min`, `max`, `abs` | —         |
| 4 — String                    | `buildString`, `split`, `join`, `lower`, `upper`, `trim`, `substring`, `regex`                           | —         |
| 5 — Arrays & iteration        | `length`, `map`, `filter`, `find`, `some`, `every`                                                       | —         |
| 6 — Data & objects            | `get`, `buildObject`                                                                                     | —         |
| 7 — Special                   | `literal`, `convert`                                                                                     | —         |
| 8 — I/O                       | `http`, `graphQL`, `sql`                                                                                 | —         |

Batch order, briefly defended: batch 1 first because it forces the laziness vocabulary — the largest cluster of contract-ledger entries — and establishes the pass template on operators everyone knows. Then roughly in order of increasing contract novelty: comparison and math are mostly mechanical consolidation, strings bring one real design job (`regex`), iterators bring the binding mechanism, `get` brings path grammar and context access, and I/O lands last so clients, signals and caching arrive once everything else is stable.

---

## Cross-cutting conventions — **Draft**

### What a pass settles

For each operator, one section recording:

1. **Parameter table** — name, metadata type, required/optional + default, null policy (explicitly re-confirmed per parameter, per the Type area), and evaluation mode (eager / lazy / sequential / structural).
2. **Positional mapping** — the `positionalParams` declaration (see conventions below).
3. **Semantics & error cases** — including the empty-aggregate stance where relevant.
4. **`useCache` metadata default.**
5. **Contract-ledger entries** — any capability the operator needs that the declaration vocabulary doesn't yet cover.
6. **v2 disposition** — parameter renames, dropped property aliases, behaviour changes; feeds the converter and migration doc.

The flat reservation (Node grammar: no parameter may be named `operator`, `fragment`, `parameters`, `fallback`, `useCache`, `vars`, `//`) is checked mechanically on every pass and only mentioned where it actually bit.

### No parameter-name aliases

**A parameter has exactly one name.** This resolves the remainder of the Alias policy area: operator names get one symbolic alias each (Operators), parameter names get none at all. v2 shipped property aliases on most operators (`valueIfTrue` / `ifTrue`, `branches` / `arms` / `cases`, …); they die for the same reasons the word-alias operator names died — one vocabulary for docs, editor and error messages, no drifting synonym sets — plus a new one: with unknown node keys now hard errors (No hoisting), every alias would be a second legal spelling the grammar must carry forever. The compensation is the same as for operators: the *one* name is chosen well, favouring short plain words.

### Naming conventions

- The plain-English rule (Operators rule 0) applies to parameter names.
- **The single main input of an operator is named `value`; the operand array of a variadic operator is named `values`.** Uniform across the whole set (`convert.value` was already agreed; `not.value`, `and.values`, `plus.values`, `min.values` follow). Parameters with a distinct semantic role get the role's name (`condition`, `then`, `branches`, `url`).
- v2's descriptive compounds are renamed to the short word (`valueIfTrue` → `then`).

### Positional mapping: `positionalParams`

The declarative replacement for v2's imperative `parseChildren` functions (Operators § Shorthand grammar). **One form: an ordered list of parameter names, whose last entry may be a rest-binding (`'...name'`).** An array payload fills the leading positions in order (greedy, left-to-right — optional leading positions fill before the rest collects); the remainder binds to the rest parameter as an array. An earlier draft had a separate "whole-payload" form for variadic operators — it's the degenerate rest-only list.

- `if: ['condition', 'then', 'else']` — no rest. Trailing entries may be omitted iff the corresponding parameters are optional; surplus elements are a parse error. Positional spellings that skip a *middle* optional parameter don't exist — write the named form.
- `and: ['...values']` — every payload element is an operand.
- `length: ['...value']` — rest-only is also how array-*input* operators bind: `{ $length: [1, 2, 3] }` → `value: [1, 2, 3]`, where a plain `['value']` would misread it as three surplus arguments.
- `buildString` (batch 4): `['template', '...substitutions']` — first element, then everything else; this shape is why the rest form exists, and the References-area examples already use it.
- **A single non-array payload binds to the first listed position, verbatim**: `{ $not: x }` → `value: x`. When the first position *is* the rest parameter, verbatim means the payload is the whole array value, supplied dynamically: `{ $and: '$data.checks' }` → `values: '$data.checks'` (runtime-checked as an array). Decided by fiat, loud when tripped: `{ $and: '$data.isAdmin' }` is *not* a one-condition `and` — it fails the runtime array check unless `isAdmin` is an array; a single condition is written `{ $and: ['$data.isAdmin'] }`. The dynamic-supply reading wins because it matches every other dynamic-whole-value position (`match.branches`, fragment `parameters`).

```js
{ $if: ['$data.isMember', 'Welcome back', 'Please sign up'] }
                              // → condition / then / else, by position
{ $if: ['$data.isMember', 'Welcome back'] }
                              // trailing omission — legal, `else` is optional → null when falsy
{ $if: ['$data.isMember'] }   // parse error: `then` is required
{ $not: '$data.disabled' }    // single non-array payload → binds to the first position, `value`

{ $and: ['$data.a', '$data.b', '$data.c'] }   // rest-only → values
{ $and: '$data.checks' }                      // dynamic → values (runtime-checked array)
{ $length: [1, 2, 3] }                        // rest-only → value: [1, 2, 3] — not three surplus args
{ $buildString: ['%1 of %2', '$data.count', '$data.total'] }  // leading position + rest
```

One trap, loud by design: for a positional-*list* operator an array payload is always the argument list, never a single array-valued argument — `{ $not: [1, 2] }` is a surplus-argument parse error ("`not` takes 1 positional argument, got 2"), not "truthiness of `[1, 2]`"; an array-valued argument is written named (`{ $not: { value: [1, 2] } }`). It cannot silently misfire: the failure is at parse, with the mapping named, and the editor renders the mapping anyway.

### Runtime `default` vs editor seed — two different things

**The `default` field in a parameter declaration is the runtime default, exclusively**: presence implies optional (the agreed optionality rule), it participates in the layered chain (per-node → `operatorDefaults` → metadata default), and null-means-unset resolves to it. v2's `data.ts` metadata used the same field name for something else entirely — the value the [fig-tree-editor-react](https://github.com/CarlosNZ/fig-tree-editor-react) editor seeds a freshly-created node with, which is why v2 AND declares `values` as `required: true` *with* a `default` of `[true, true]` ([AND/data.ts:13](../src/operators/AND/data.ts#L13)) — not a contradiction, an editor seed in a runtime-looking field. v3 separates them:

- **Runtime default** → the `default` field. With editor seeds evicted, the `required` + `default` contradiction rule (Fragments) is unambiguous — a required parameter with an editor seed is now expressible without tripping it.
- **Editor seeds** (and any other UI concern) → the opaque **`metadata`** bag, alongside the display colours already settled for fragments (Fragments § Tooling metadata). The engine never reads it; `getOperators()` returns it verbatim; the editor defines its own keys within it.

**Per-parameter `metadata`**: parameter declarations gain an optional opaque `metadata` field, mirroring the definition-level bag — the rule becomes *`description` and `metadata` travel together at every declaration level*. (A definition-level map keyed by parameter name was considered and rejected: it splits a parameter's tooling data away from its declaration and invites key drift on renames.) Agreed — the matching row is added to the fragment parameter-declaration table (Fragments § Parameter declarations). Custom operators and plugin packages carry their own bags in-definition — the editor can't know them; the *core* operators carry none at all (§ Metadata on definitions the host didn't author, below).

**v2 disposition, global**: every `default` in v2's operator `data.ts` files is an editor seed, not a runtime default — **none migrates to the v3 `default` field automatically**. Each pass decides runtime defaults from scratch; the seed values leave the runtime entirely, moving to the editor-hints sub-path module (§ The editor-hints module, below).

### Metadata on definitions the host didn't author — settled tool-side

The gap the bags don't cover: display metadata for definitions the host doesn't own — the core operators above all ("in this system, `http` nodes are blue and seed with our API template").

**Considered and rejected: any engine-side attachment mechanism** — whether a `withMetadata()` decorator (a pure function merging bags into existing definitions before they enter the `operators` array) or, worse, an `operatorMetadata` option. The defeating argument is the round trip: the engine never reads metadata, so decorating a foreign definition injects values into the registry *solely for tooling to read back out* via `getOperators()` — the tool may as well accept the same map directly. Two supporting arguments: tool-side, the map is properly **typed** in the package that defines its keys (`backgroundColor: string`), where the opaque bag is untyped by construction; and the `operatorDefaults` visibility precedent does not transfer — runtime defaults change evaluation behaviour, so tooling that read only raw definitions would *lie* about behaviour without engine-side merging, while display metadata changes nothing and nothing lies.

**The rule: the engine's involvement with metadata is carry-and-return, on definitions only — and the line is authorship.** Display data for definitions you *author* (plugin operators, custom operators, fragments) goes in the in-definition bag, because it must travel with dynamically-registered definitions — a DB-stored fragment or a published plugin array has no tool-side channel of its own. Display data for definitions you *don't* author is the consuming tool's API (an editor component prop, a docs-generator option), merged tool-side. Expected tool-side layering, recorded as a pattern the editor package owns, not spec: tool built-ins ← definition bags via `getOperators()` ← host overrides passed to the tool. Consequently **core operator definitions ship with no display keys at all** — the engine carries zero UI knowledge, in spirit as well as mechanism.

### The editor-hints module

The v2 seed-and-colour data is genuinely useful and shouldn't die with the fields it was hiding in — but it doesn't belong in the runtime either. It moves to a **sub-path export**, working name `fig-tree-evaluator/editor-hints` (final name and packaging mechanics → Packaging area): a plain typed data module mapping canonical operator names to suggested display values — colours, per-parameter editor seeds — consumable by [fig-tree-editor-react](https://github.com/CarlosNZ/fig-tree-editor-react) or any other tooling as its fallback layer.

- **Zero runtime coupling**: never imported by the core entry point, never in the evaluation bundle; purely data.
- **Co-versioning is why it lives in this repo** rather than the editor's: the hints describe *this package's* operator set — per-parameter seeds name parameters this spec defines — so an operator or parameter change and its hint update land in the same PR, and drift is caught where it starts.
- The module's exported type doubles as the **documented key convention** for definition authors who want their plugin/custom operators to display well in the same tools.
- **v2 disposition**: the `data.ts` parameter seeds and the fragment/custom-function `textColor` / `backgroundColor` fields typed into the v2 runtime ([types.ts:100-110](../src/types.ts#L100-L110)) are the content this module absorbs.

### `useCache` metadata defaults

Pure operators default `false` (memoizing cheap computations is bookkeeping without benefit); I/O operators default `true` (v2 precedent — the whole point of the result cache). Each pass states its value; the blanket `useCache` option overrides per Options.

---

## Contract-requirements ledger

*Running list, per Extensibility § Sequencing: every capability a pass needs is recorded here as a requirement on the `defineOperator()` contract, never as a private quirk. The contract is written after the passes as the codification of this table.*

| #   | Capability                                                                                                                                                                                                        | Needed by                                                                                                                                        | Notes                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Lazy parameter** — a declared parameter received as an unevaluated expression, evaluated on demand (at most once) in the node's own scope                                                                       | `if.then` / `if.else`, `match.default`                                                                                                           | v2 precedent: CONDITIONAL already evaluates branches lazily ([CONDITIONAL/operator.ts:21-23](../src/operators/CONDITIONAL/operator.ts#L21-L23)) — v3 makes it declarable metadata instead of hand-rolled              |
| 2   | **Sequential array parameter** — array elements evaluated in declared order, one at a time, with early stop                                                                                                       | `firstOf` (stop at first non-null)                                                                                                               | Overrides the default concurrent element evaluation *within that parameter only*; `and`/`or` stay parallel and use #7 instead                                                                                         |
| 3   | **Structural-map parameter with lazy values** — static data keys, expression values, each evaluated on demand                                                                                                     | `match.branches` (literal-map mode)                                                                                                              | Same machinery family as `vars` blocks; keys are *data*; a node-valued `branches` degenerates to the eager dynamic mode (degeneration rule, below)                                                                    |
| 4   | **Shared `isTruthy()`** applied engine-side at declared truthiness positions                                                                                                                                      | `and` / `or` / `not` operands, `if.condition`; later the iterator predicates                                                                     | Already an implementation-notes requirement; recorded here as a contract capability (a custom operator can declare a truthiness position)                                                                             |
| 5   | **Rest-binding positional mapping** (`'...name'` as the last `positionalParams` entry; rest-only lists bind array-input operators)                                                                                | `and` / `or`, `firstOf`; later `plus`, `min`, `max`, `length`, `buildString`                                                                     | See the `positionalParams` convention, above                                                                                                                                                                          |
| 6   | **Opaque `metadata` at definition *and* parameter level** — engine never reads it; introspection returns it verbatim                                                                                              | plugin/custom operator authors (display data must travel with dynamically-registered definitions); definition level already agreed for fragments | Extends the Fragments § Tooling metadata convention to parameter declarations; core definitions carry no display keys — suggested values live in the editor-hints sub-path module (conventions §)                     |
| 7   | **Early resolution with subtree cancellation** — a node may resolve as soon as its result is decided, cancelling remaining in-flight child evaluations via a derived abort scope chained to the evaluation signal | `and` / `or`                                                                                                                                     | Reuses the kill-switch abort threading (Node grammar, fallback rule 3) at node scope; cancellation is not failure, and a discarded operand failure is not an evaluation error (Kleene rule — see the `and`/`or` pass) |

**Degeneration rule, recorded once for all lazy declarations**: laziness applies to *authored expressions*. A lazily-declared parameter whose value arrives dynamically (`values: '$data.checks'`) receives already-resolved data — there is no expression left to defer, so sequencing degenerates to plain iteration and lazy branches to plain selection. Same pattern as fragments' dynamic-arguments mode; no special cases.

*Anticipated from v3-api.md, not yet ledger entries (their passes will confirm): evaluate-with-bindings for the iterators (batch 5), evaluation-context access for `get` (batch 6), abort-signal support, per-request timeout and caching for I/O (batch 8).*

---

## Batch 1 — Logic & control — **Draft**

### `and` / `or`

| Parameter | Type                   | Required | Default | Null policy                                                  | Evaluation                                    |
| --------- | ---------------------- | -------- | ------- | ------------------------------------------------------------ | --------------------------------------------- |
| `values`  | array (elements `any`) | ✓        | —       | `value` — elements are truthiness positions; `null` is falsy | **parallel, early resolution + cancellation** |

- Each element is judged by shared FigTree truthiness; the result is an **actual boolean**, never an operand (Type area).
- **Parallel, with early resolution and cancellation.** All operands start concurrently (v2 continuity — [AND/operator.ts:7](../src/operators/AND/operator.ts#L7)); the first falsy (`and`) / truthy (`or`) value **resolves the node immediately and cancels the remaining in-flight operands** via a derived abort scope. Sequential short-circuit was considered and rejected: it buys laziness by serializing the everyday case — an `and` of independent checks needs *all* of them on the expected all-truthy path, so parallelism is the right default (deliberate contrast with `firstOf`, whose expected path needs only the first candidate). Cancellation is not new machinery: the whole-evaluation kill switch already requires abort threading through every node and into the HTTP/SQL clients (Node grammar, fallback rule 3); this applies the same mechanism at node scope (ledger #7). Pure subtrees stop at the next node boundary; in-flight requests abort via the threaded signal.
- **Deterministic error semantics — Kleene's strong logic.** An operand failure fails the node only if the result actually depends on that operand: a deciding value resolves the node even when another operand has already failed, the failure discarded along with the cancelled work — `and(error, false)` → `false`, `and(error, true)` → error, mirrored for `or`. Completion timing changes only speed and how much work gets cancelled, never the outcome. Cancellation is not failure (an aborted operand raises nothing — the node has already resolved), and a discarded failure is not an error of the evaluation: it does not surface under `mode: 'report'`; `trace` shows failed and cancelled operands.
- Side-effect note, recorded honestly: every operand *starts* — an `http` POST operand is always initiated, though it may be aborted mid-flight. Operands shouldn't rely on order or on being skipped; a mutation that must fire conditionally belongs behind `if`.
- **Empty input: vacuous identity — a recorded exception to the empty-aggregate policy.** `and: []` → `true` ("all of these are true" holds vacuously), `or: []` → `false` ("at least one is true" fails). A dynamically-supplied condition list legitimately has unknown cardinality — zero elements is an answer, not an anomaly — and the quantifier cousins must agree: *constraint recorded for batch 5*: `every: []` → `true`, `some: []` → `false` (JS parity). A literal `[]` gets a `validate()` warning (dead expression), not an error. The generating rule that keeps this from reopening the arithmetic question (recorded for batch 3): **vacuous identity is granted only where the identity element is unique and type-stable** — boolean conjunction/disjunction qualify; `plus`'s identity is mode-ambiguous (`0` / `""` / `{}` — v2's roulette) and `min`/`max` have none in the domain (`±Infinity` aren't values), so the arithmetic aggregates stay errors.
- Positional: `['...values']`. `useCache`: `false`.
- **v2 disposition**: `values` kept; parallel evaluation kept, early resolution + cancellation added; the v2 metadata defaults (`[true, true]` / `[true, false]`) were editor seeds, not runtime defaults — they move to the editor-hints module per the conventions (§ Runtime `default` vs editor seed); `values` stays required with no runtime default.

### `not`

| Parameter | Type  | Required | Default | Null policy                                                             | Evaluation |
| --------- | ----- | -------- | ------- | ----------------------------------------------------------------------- | ---------- |
| `value`   | `any` | ✓        | —       | `value` — truthiness position; `null` is falsy, so `not: null` → `true` | eager      |

- Boolean negation of FigTree truthiness. Everyday face is the single-value payload: `{ $not: '$data.user.disabled' }`; the null-is-falsy reading makes `{ $not: '$data.x' }` the idiomatic "is unset/empty" test. *The `not(null)` → `true` reading is under review — negating a propagated null turns absence into affirmation ([v3-cases-for-review.md](v3-cases-for-review.md) #9); a flip to `propagate` would break this idiom.*
- `condition` was considered as the name and rejected: `not` negates the truthiness of any *value*, and `value` matches the single-input convention.
- Positional: `['value']`. `useCache`: `false`. New in v3 (`!` meant NOT_EQUAL in v2).

### `if`

| Parameter   | Type  | Required | Default | Null policy                                                                             | Evaluation |
| ----------- | ----- | -------- | ------- | --------------------------------------------------------------------------------------- | ---------- |
| `condition` | `any` | ✓        | —       | `value` — truthiness position                                                           | eager      |
| `then`      | `any` | ✓        | —       | `value` (type `any` includes `null`, so an explicit `null` branch is an ordinary value) | **lazy**   |
| `else`      | `any` | optional | `null`  | `value`                                                                                 | **lazy**   |

- **Exactly one branch evaluates** — v2 continuity ([CONDITIONAL/operator.ts:21-23](../src/operators/CONDITIONAL/operator.ts#L21-L23)), now declared metadata (ledger #1) rather than hand-rolled.
- `else` is optional: omitted + falsy condition → `null`, via the ordinary optional-default machinery — no special case, and it composes with the standard null gradient downstream. `then` stays required: an if with no consequent has no honest meaning (`{ condition, else }` intent is written `not` + `then`).
- **`fallback` does not stand in for a missing `else`.** An unmet condition with no `else` is *success with `null`*, not failure — `fallback` catches failures only (the absence/failure boundary, References). A `fallback` on the `if` node still catches genuine failures in the condition or the taken branch. "Value when the condition isn't met" is precisely what `else` is for. Recorded explicitly because it will be a recurring user question. *Provisional — [v3-cases-for-review.md](v3-cases-for-review.md) #1.*
- Because both branches are `any`-typed, null-means-unset never triggers on them — `any` includes `null` (Type area), so `else: null` is a value, not an unset. Same observable result either way; recorded for precision.
- No `elseIf` parameter — chains are nested `if`s or a `match`; a chained face would change arity by mode, exactly what the mode rule (Operators) forbids.
- Positional: `['condition', 'then', 'else']` — `{ $if: [c, a, b] }` and `{ $if: [c, a] }` (else omitted) are both legal, matching the payload-table example already in the spec.
- `useCache`: `false`.
- **v2 disposition**: `condition` kept; `valueIfTrue` / `valueIfFalse` → `then` / `else` ([CONDITIONAL/data.ts:16](../src/operators/CONDITIONAL/data.ts#L16), [:24](../src/operators/CONDITIONAL/data.ts#L24)); property aliases `ifTrue` / `ifFalse` / `ifNot` die; v2 required both branches — `else` becomes optional.

### `match`

| Parameter  | Type                                                                                    | Required | Default | Null policy                                                                                                       | Evaluation                                                                                     |
| ---------- | --------------------------------------------------------------------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `value`    | `string` \| `number` \| `boolean` \| `null`                                             | ✓        | —       | `value` — `null` is a legal match value that matches no branch (Type area)                                        | eager                                                                                          |
| `branches` | object — a literal map (static keys, expression values) **or** a node computing the map | ✓        | —       | map mode: *(structural — not a value position)*; dynamic mode: a `null` result is a runtime type error (`reject`) | **map: lazy per branch** — only the matched branch evaluates; **dynamic: eager**, whole object |
| `default`  | `any`                                                                                   | optional | —       | `value`                                                                                                           | **lazy**                                                                                       |

- **Matching** is by the canonical string form (Type area, agreed): branch keys are JSON object keys, hence always strings; `value: 1` matches the key `"1"`, `true` matches `"true"`. A `null` match value matches no branch and falls to `default`.
- **No match and no `default` → runtime failure** (fallback-catchable), the same posture as v2's final throw ([MATCH/operator.ts:42](../src/operators/MATCH/operator.ts#L42)) — but the default branch is now a declared parameter. v2's magic `fallback` key *inside* the branches object ([MATCH/operator.ts:37](../src/operators/MATCH/operator.ts#L37)) dies: it collided with the reserved node key while meaning something different, and it made one branch name unusable as data.
- **Two modes — the fragments-`parameters` pattern exactly**, on the principle that every parameter is evaluable (a structural-only `branches` was considered and rejected as the arbitrary exception: fragments' `parameters` already established the two-mode grammar, and authors shouldn't carry a mental list of which object parameters evaluate). Mode is decided statically at parse by the standard node-classification grammar. A **plain-object** `branches` is the branch map: keys are static data, values are expressions, and only the matched branch evaluates (v2 continuity, now declared metadata — ledger #3). A **node or reference** `branches` (`'$data.statusLabels'`, a `$buildObject`, a fragment call) evaluates **eagerly, whole-object** ([MATCH/operator.ts:23-25](../src/operators/MATCH/operator.ts#L23-L25) made explicit); its result must be an object, its values are runtime data, and the matched value returns **verbatim** — never re-parsed or re-evaluated (References §4; v2 re-evaluated the extracted branch value, [MATCH/operator.ts:32-33](../src/operators/MATCH/operator.ts#L32-L33) — for data-sourced branches an injection path, dead). The everyday lookup-table case reads as it should: `{ $match: { value: '$data.status', branches: '$data.statusLabels', default: 'Unknown' } }`. The editor badges dynamic-branches calls, as it badges dynamic-arguments fragment calls.
- **Branch keys in the literal map are data — with two classification edges, recorded honestly.** Because the mode-deciding grammar must run against the `branches` value, a literal map can collide with it: (a) a map containing a branch key named `operator` / `fragment` classifies as a malformed or unknown node → **loud parse error**; (b) a map whose keys are *exactly one* recognized `$name` (plus at most reserved-key names) classifies as a shorthand node and silently becomes dynamic mode — possible only for single-branch matches, the same accepted hazard class as the sibling-key rule (multi-branch maps with a `$name` key fail loud as malformed nodes). The escape for colliding keys is to supply the map dynamically (`buildObject`, `vars`, or from data) — a *built* object's keys are runtime data, never classified. This amends Node grammar's "a branch legitimately named `operator` is safe" note: safe from v2's silently reading the node's own reserved properties, but loud-error rather than working as a literal map key (pointer added there).
- Positional: `['value', 'branches', 'default']`. `useCache`: `false`.
- **v2 disposition**: `matchExpression` → `value` (alias `matchValue` dies); `branches` kept as the one home for branches (aliases `arms` / `cases` die); root-hoisted branch keys die (Node grammar); the pairs-array branches form (`[key, val, key, val, …]` via [operatorUtils.ts:57-59](../src/operators/operatorUtils.ts#L57-L59)) dies — object form only; dynamic branch objects **kept, made explicit** as the second mode (with extracted values no longer re-evaluated); in-branches `fallback` key → the `default` parameter.

### `firstOf`

| Parameter | Type                   | Required | Default | Null policy                                            | Evaluation                         |
| --------- | ---------------------- | -------- | ------- | ------------------------------------------------------ | ---------------------------------- |
| `values`  | array (elements `any`) | ✓        | —       | `value` — skipping nulls *is* the operator's semantics | sequential, stop at first non-null |

- Evaluates candidates **in order**, returning the first non-`null` result; later candidates never evaluate. The sequencing is semantics, not optimization — a backup `http` candidate must not fire when the primary resolved. This is the deliberate mirror of `and`/`or`'s parallelism: their expected path needs every operand, so they parallelize and cancel; `firstOf`'s expects the first candidate to answer, so it never starts work it may not need. Note also the contrast with truthiness (Type area, agreed): `firstOf` skips *only* `null` — `""`, `0` and `false` are answers, not absences.
- **All candidates null → `null`.** Absence in, absence out — erroring here would defeat the layered-defaults gradient the operator exists to serve.
- **Empty input → `null`**, the degenerate all-null case, with a `validate()` warning on a literal `[]` (dead expression). This is a recorded exception to the empty-aggregate error policy, and a principled one: `and`/`or` must invent a boolean for empty input, while `firstOf`'s contract — "null when nothing is found" — is already total. Dynamic empty input behaves identically (`null`), which is exactly what a caller of an absence tool wants.
- **Failures propagate — `firstOf` skips nulls, not errors.** The absence/failure boundary (References) holds: a candidate that *fails* fails the node per the fallback rules. The composition recipe, recorded because it's the intended idiom: demote a risky candidate's failure to absence with its own fallback — `{ $firstOf: [{ $http: …, fallback: null }, '$data.cached', 'default'] }`.
- Positional: `['...values']` — `{ $firstOf: ['$data.nickname', '$data.name', 'Anonymous'] }`. `useCache`: `false`. New in v3.

### Batch 1 signature summary

```
and(values…)   or(values…)   not(value)
if(condition, then, else?)
match(value, branches, default?)
firstOf(values…)
```

---

## Constraints carried into later batches

Collected from v3-api.md and the passes above, so nothing silently drops:

- **Batch 2**: `equal`/`notEqual` — `caseInsensitive` details (string-only), opaque-value comparison (dequal precedent), null-as-comparable already agreed; single shared implementation. Ordering comparisons — homogeneous operands only (both numbers or both strings, codepoint order).
- **Batch 3**: `plus` — rename the add/concat/merge mode selector away from `type`; per-operator empty-aggregate stances, governed by the vacuous-identity generating rule from the `and`/`or` pass (unique, type-stable identity or error — `plus`/`min`/`max` expected to stay errors, with the `operatorDefaults` reserved-modifier extension (Options) giving hosts the sanctioned one-liner `plus: { fallback: 0 }` for identity-style degradation); `round.decimals` is the first `integer` parameter; the engine finite-number guard replaces per-operator NaN/Infinity policing.
- **Batch 4**: `buildString` — substitution-token syntax and the null-renders-`""` rule (agreed); `join` — null elements: render `""` vs skip element-and-delimiter (flagged in Type area); `substring` — integer indices, negative-index question; `regex` — flags + output mode (test / match / extract), and the numeric-mining constraint (`"15 grams"` → `15` via extract + `convert`). Positional faces: `buildString` is the rest-tail motivator (`['template', '...substitutions']`); `join`'s is genuinely contested (rest-only `values` with named-only delimiter, vs `['values', 'delimiter']`) — decided in its pass.
- **Batch 5**: iterator parameter names `input` / `each` / `as` (locked in References); `every: []` → `true`, `some: []` → `false` (recorded in the `and`/`or` pass); `find` no-match → `null` (composes with `firstOf`/`get` defaults — to confirm); `length` on strings *and* arrays; evaluate-with-bindings ledger entry.
- **Batch 6**: `get` — exotic-key path grammar (quoted bracket segments, deferred from References), `default` parameter with the null opt-out (`type: […, 'null']` — the known case from the Type area), evaluation-context access ledger entry; `buildObject` — role narrowed to dynamic keys, null-valued entries: keep vs drop key (flagged in Type area).
- **Batch 7**: `convert` — semantics fully agreed in the Type area; the pass only records the parameter table (`value`, `to`) and positional form. `literal` — no parameters; confirm the node-grammar treatment covers it.
- **Batch 8**: `http` — per-request `timeout` (constraint from Node grammar fallback rule 3), null `body` (no body vs JSON `null` payload) and null `query` values (omit vs `?x=null`), both flagged in the Type area; `sql` — bind values null → SQL `NULL` (agreed), per-request timeout likewise; abort-signal threading and `useCache: true` defaults; `graphQL` on the `http` core.

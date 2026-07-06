# FigTree v3 — implementation notes

*Non-binding. This doc captures **suggested mechanisms** raised during the design discussions so they aren't lost by implementation time. The contract lives in [v3-api.md](v3-api.md); if an idea here turns out to conflict with the spec, the spec wins. Nothing in this file is agreed API.*

## Deep evaluation without a runtime traversal cost

The spec makes deep evaluation the only semantics ([v3-api.md → Deep evaluation](v3-api.md#deep-evaluation)). The naive reading — walk the whole input on every `evaluate()` call looking for nodes — is exactly what v2's `evaluateFullObject` does ([evaluate.ts:59](../src/evaluate.ts#L59)), and it re-pays the full traversal on every evaluation. The suggested v3 mechanism moves all recognition to a one-time parse so the per-evaluation cost is proportional to the number of *evaluable* nodes, not the size of the input.

### Parse → compile → evaluate

1. **Parse/normalize once.** A single walk over the raw input normalizes shorthand faces and symbolic/namespace aliases to canonical form, recognizes reference strings, runs structural validation (`maxDepth` / `maxNodes`, unknown-`operator` hard errors, unresolved-`$` warnings), and classifies every subtree. This is the same pass the spec already requires for "shorthand normalizes once, at parse" — deep recognition adds no extra traversal, just one more question asked per node.

2. **Classify subtrees bottom-up.** During that walk, mark each subtree **constant** iff it contains no operator/fragment/function node and no reference string (and everything inside `literal` is constant by fiat, unwalked). The flag is free to compute: a node is constant iff all its children are constant and the node itself isn't evaluable.

3. **Compile plain literals to constants-with-holes.** A plain object/array literal containing evaluable descendants compiles to a *template*: the constant skeleton plus a list of `(path, compiledNode)` holes. Evaluating the literal = evaluate all holes (concurrently, the way `evaluateArray` already works in v2) and splice the results into a copy of the skeleton. A literal with zero holes — the fully-constant case — evaluates as **identity**: return it as-is without touching it.

4. **Cache the compiled form.** Key the parse cache on input identity (`WeakMap` keyed on the object reference) with a fallback path for fresh/serialized inputs. The dominant real-world pattern (Conforma) is the same config object evaluated many times against different `data` — after the first call, every subsequent evaluation skips recognition entirely. This is also why the spec forbids per-call `operators` and `fragments`: the compiled form bakes in registry resolution (which `$key`s invoke, which are inert), so the parse cache is only sound against a stable registry — and why an `updateOptions()` call that changes the invocable registry must invalidate the parse cache.

### Cost model

| Work | When | Proportional to |
|---|---|---|
| Recognition, normalization, validation, hole extraction | once per distinct input | input size |
| Per-evaluation work | every call | number of holes (evaluable nodes) |
| Fully-constant subtree | every call | O(1) — identity |

### Subtleties to resolve at implementation

- **Result sharing / immutability.** The identity short-circuit and skeleton splicing both return objects that share structure with the cached compiled form (and therefore with other results, and with the caller's original input). A caller mutating a result would corrupt future evaluations. Options: deep-freeze the cached skeleton and document results as immutable; copy-on-write only along hole paths (shares constant subtrees — fast, but mutation still leaks); or `structuredClone` the skeleton per evaluation (safe, still much cheaper than re-walking with recognition logic, but no longer O(holes)). Not decided here — deferred to the Evaluator-methods area in the spec.
- **Error paths and trace come free.** The hole list carries each evaluable node's path in the input, which is exactly the path `FigTreeError` must be tagged with for `mode: 'report'` and editor diagnostics. One compile artifact serves both features.
- **Per-evaluation context.** Hole evaluation threads the same frozen per-evaluation context (merged options/data, `vars` scope chain, abort signal) as any other node evaluation; a literal's holes are siblings for concurrency purposes, like array elements.
- **`literal` boundaries.** `literal` contents must be excluded at *parse* (never walked, never validated), not merely skipped at evaluation — otherwise `maxNodes`/unknown-operator checks would fire inside quoted data.
- **Cache keying for non-identical inputs.** `WeakMap`-on-identity misses when callers rebuild the config object each call (e.g. fresh `JSON.parse` per request). A bounded content-keyed cache layer (hash of the serialized input) could sit behind the identity cache if this proves common; measure before adding.

## Truthiness is one function

The spec defines FigTree truthiness once and marks the empty-container question for revisiting ([v3-api.md → Truthiness](v3-api.md#truthiness)). The implementation requirement that enables the revisit: a single shared `isTruthy(value)` consumed by *every* truthiness site — `if.condition`, `and`/`or`/`not`, the `filter`/`find`/`some`/`every` predicates, and `convert`'s `to: 'boolean'` target (applied after the `"true"`/`"false"` string carve-out). No operator body re-implements the falsy check inline; refining the falsy set later must be a one-function change that applies globally.

## Null policies and boundary normalization live in the engine, not operator bodies

Two enforcement points suggested by the Type/coercion area, both engine-level so metadata stays honest (the same argument as `positionalParams` replacing 24 `parseChildren` functions):

- **Null-policy enforcement from metadata.** Each parameter's declared policy (`propagate` / `value` / `reject`, plus null-means-unset on optionals) can be applied generically by the engine *before* the operator body runs: propagate short-circuits the node to `null`, reject raises the runtime type error, unset substitutes the layered default (per-node → `operatorDefaults` → metadata). Operator bodies then only ever see nulls on parameters declared `value` — hand-coded null checks inside operators should be a smell in review.
- **Boundary normalization.** `undefined` → `null` normalization happens at the engine's operator-result boundary (JSON-serialization semantics for JS-authored object values and array elements are handled once, at parse). A shared finite-number guard at the same boundary converts would-be `NaN`/`±Infinity` results into proper runtime failures with good messages, instead of each math operator policing its own output.

## Fragment machinery rides existing mechanisms

Two suggestions from the Fragments area ([v3-api.md → Fragments](v3-api.md#fragments--agreed)), both reusing machinery already described above:

- **Lazy arguments are the vars mechanism.** A fragment call instance is a scope object; static-mode arguments enter it as unevaluated thunks alongside the body's own `vars`, with the same promise memoization (the first `$params` reference stores the in-flight Promise; parallel references share it; rejections memoize too, per fallback rule 5's corner). Dynamic-arguments mode degenerates gracefully: the arguments node evaluates eagerly to an object and its keys enter the same scope as already-resolved values, so the body-side `$params` lookup is identical in both modes.
- **Bodies compile once, at registration.** The parse → compile pass (above) runs over each fragment body when it is registered — registration-time validation *is* that pass, plus the signature checks (declared parameters, defaults vs types, required+default contradictions) and cycle detection over the static fragment-reference graph. A call site then splices a precompiled body; nothing re-parses per call. Replacing a fragment definition or the `operators` array re-runs registry validation and invalidates the parse cache (already required — step 4 above).

## `and` / `or` early resolution: a race with error parking

The parallel-with-cancellation semantics ([v3-operator-parameters.md](v3-operator-parameters.md), batch 1) suggests this shape: evaluate all operands concurrently under a per-node abort scope (an `AbortController` derived from the evaluation signal — the same chain the kill switch already threads). As each operand settles: a **decisive** value (falsy for `and`, truthy for `or`) resolves the node, aborts the scope, and everything still in flight is ignored; a **failure** is *parked*, not raised; a non-decisive value just counts down. If all operands settle without a decider: any parked failure fails the node — deterministically the lowest-*index* parked failure, not the first to arrive — otherwise the identity result (`true` / `false`) returns. This makes the Kleene rule (an operand failure matters only if the result depends on it) fall out of the control flow rather than needing case analysis.

Notes: JS can't preempt a synchronous operator body, so cancellation lands at node boundaries and via the client-threaded signal — which is where the time lives anyway (network). Parked failures that lose the race never surface in `mode: 'report'` (per the spec); `trace` records per-operand status (value / failed-discarded / cancelled). Whether *sibling* parked failures also appear in report output when the node does fail is a report-shape question for the Evaluator-methods area.

## Timeout shielding rides the compile artifact

The `fallback` rule-3 exception ([v3-api.md → `fallback` semantics](v3-api.md#fallback-semantics)) needs no evaluation-time machinery beyond what deep evaluation already builds. At parse: for each hole, precompute a `staticFallback` constant (present iff the hole's `fallback` subtree is classified constant), and derive one expression-level `shielded` flag (every hole has one). On timeout: if unshielded, throw/report; if shielded, splice each hole's completed result — or its precomputed static-fallback constant where incomplete — into the constant skeleton and return. Pure constant assembly, no evaluation after the deadline. The same precomputed flag powers the `validate()` / editor "timeout-shielded" badge.

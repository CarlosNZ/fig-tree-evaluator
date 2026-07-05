# FigTree v3 — implementation notes

*Non-binding. This doc captures **suggested mechanisms** raised during the design discussions so they aren't lost by implementation time. The contract lives in [v3-api.md](v3-api.md); if an idea here turns out to conflict with the spec, the spec wins. Nothing in this file is agreed API.*

## Deep evaluation without a runtime traversal cost

The spec makes deep evaluation the only semantics ([v3-api.md → Deep evaluation](v3-api.md#deep-evaluation)). The naive reading — walk the whole input on every `evaluate()` call looking for nodes — is exactly what v2's `evaluateFullObject` does ([evaluate.ts:59](../src/evaluate.ts#L59)), and it re-pays the full traversal on every evaluation. The suggested v3 mechanism moves all recognition to a one-time parse so the per-evaluation cost is proportional to the number of *evaluable* nodes, not the size of the input.

### Parse → compile → evaluate

1. **Parse/normalize once.** A single walk over the raw input normalizes shorthand faces and symbolic/namespace aliases to canonical form, recognizes reference strings, runs structural validation (`maxDepth` / `maxNodes`, unknown-`operator` hard errors, unresolved-`$` warnings), and classifies every subtree. This is the same pass the spec already requires for "shorthand normalizes once, at parse" — deep recognition adds no extra traversal, just one more question asked per node.

2. **Classify subtrees bottom-up.** During that walk, mark each subtree **constant** iff it contains no operator/fragment/function node and no reference string (and everything inside `literal` is constant by fiat, unwalked). The flag is free to compute: a node is constant iff all its children are constant and the node itself isn't evaluable.

3. **Compile plain literals to constants-with-holes.** A plain object/array literal containing evaluable descendants compiles to a *template*: the constant skeleton plus a list of `(path, compiledNode)` holes. Evaluating the literal = evaluate all holes (concurrently, the way `evaluateArray` already works in v2) and splice the results into a copy of the skeleton. A literal with zero holes — the fully-constant case — evaluates as **identity**: return it as-is without touching it.

4. **Cache the compiled form.** Key the parse cache on input identity (`WeakMap` keyed on the object reference) with a fallback path for fresh/serialized inputs. The dominant real-world pattern (Conforma) is the same config object evaluated many times against different `data` — after the first call, every subsequent evaluation skips recognition entirely. This is also why the spec forbids per-call `operators`, `fragments` and `functions`: the compiled form bakes in registry resolution (which `$key`s invoke, which are inert), so the parse cache is only sound against a stable registry — and why an `updateOptions()` call that changes the invocable registry must invalidate the parse cache.

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

## Timeout shielding rides the compile artifact

The `fallback` rule-3 exception ([v3-api.md → `fallback` semantics](v3-api.md#fallback-semantics)) needs no evaluation-time machinery beyond what deep evaluation already builds. At parse: for each hole, precompute a `staticFallback` constant (present iff the hole's `fallback` subtree is classified constant), and derive one expression-level `shielded` flag (every hole has one). On timeout: if unshielded, throw/report; if shielded, splice each hole's completed result — or its precomputed static-fallback constant where incomplete — into the constant skeleton and return. Pure constant assembly, no evaluation after the deadline. The same precomputed flag powers the `validate()` / editor "timeout-shielded" badge.

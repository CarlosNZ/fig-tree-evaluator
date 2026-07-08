# FigTree v3 — the compile artifact: obligations checklist

*Chunk-3.1 deliverable (implementation plan, Phase 3). This checklist consolidates every obligation the specs place on the parse/compile artifact, each with its source. **The checklist is the contract; the internal types in [src/parse/artifact.ts](../../src/parse/artifact.ts) are freely refactorable against it** — no test or later phase may depend on the artifact's field shapes, only on the behaviours listed here (via `validate()` and, later, `evaluate()`/introspection). Where a mechanism note conflicts with a spec doc, the spec wins ([v3-implementation-notes.md](v3-implementation-notes.md) header rule).*

## A · What the artifact is — the four products of the parse pass

One walk over the raw input, once per distinct input, produces ("One spine, three views" in [v3-evaluator-methods.md](v3-evaluator-methods.md)):

1. **The canonical AST.** Shorthand faces, operator symbol aliases and namespace aliases (`$d` → `$data`, …) are normalized away; positional payloads are mapped onto named parameters via `positionalParams`; the compiled tree holds canonical names only — evaluation and tooling never see a spelling. ("Shorthand grammar" and "Naming rules" in [v3-api.md](v3-api.md); "The runtime interface" in [v3-operator-contract.md](v3-operator-contract.md).)
2. **The hole list.** Every maximal evaluable node, tagged with its **path in the input as authored** — the same paths `FigTreeError` is tagged with in report mode and editor diagnostics. A node root is the degenerate case: one hole at path `[]`. ("Subtleties to resolve at implementation" in [v3-implementation-notes.md](v3-implementation-notes.md); worked examples 1–2 in [v3-worked-examples.md](v3-worked-examples.md).)
3. **The issue stream.** Every *option-independent* static error and warning, in deterministic tree order. Option-dependent checks (`maxDepth`/`maxNodes`, the sample-data warning) are **never stored** — they run per `validate()`/`evaluate()` call against obligations B4 and B6. ("The check inventory" in [v3-evaluator-methods.md](v3-evaluator-methods.md); option-independence below.)
4. **Constancy classification.** Bottom-up: a subtree is constant iff it contains no operator/fragment node and no reference string; everything inside `literal` is constant by fiat, unwalked; non-plain values (class instances, `Date`s, functions) are opaque constants, never traversed. Constancy powers the identity short-circuit, hole extraction, "literal parameter" detection for static checks, and shielding. ("Parse → compile → evaluate" step 2 in [v3-implementation-notes.md](v3-implementation-notes.md); "Non-plain-object values: opaque constants" in [v3-api.md](v3-api.md).)

## B · Precomputations riding the artifact

1. **Skeleton + holes.** A plain-literal root (or any plain literal containing evaluable descendants) compiles to a constant skeleton plus `(path, compiledNode)` holes; zero-hole literals evaluate as identity. ("Parse → compile → evaluate" step 3 in [v3-implementation-notes.md](v3-implementation-notes.md).)
2. **Shielding.** Per hole: a `staticFallback` constant, present iff the hole root's `fallback` subtree is classified constant — an `operatorDefaults` modifier fallback (`plus: { fallback: 0 }`) counts. Expression-level: one `shielded` flag, true iff every hole has one. Powers the `validate()` badge (3.3) and timeout assembly (Phase 10). ("Timeout shielding rides the compile artifact" and the invalidation-set entry in [v3-implementation-notes.md](v3-implementation-notes.md); fallback rule 3 in [v3-api.md](v3-api.md).)
3. **Delivery-mode binding.** Each compiled parameter is bound to its declared evaluation mode from registry metadata at parse — "lazy branches become structure rather than behaviour". Constants under lazy declarations become pre-resolved handles (the degeneration rule) — the *binding* is recorded now; the handle machinery is Phase 4. ("Step 2" in [v3-worked-examples.md](v3-worked-examples.md); "Evaluation modes" in [v3-operator-contract.md](v3-operator-contract.md).)
4. **Counts.** `nodeCount` and `maxDepth` measured and stored as numbers; `literal` contents are never counted. Limits are compared per call, never baked in. ("The full invalidation set" in [v3-implementation-notes.md](v3-implementation-notes.md); "`literal` boundaries" there.)
5. **Compiled literal regexes** (slot reserved; mechanism lands with `regex`, Phase 7.2): a literal `pattern` compiles once at parse, the same moment the validate hook checks it; dynamic patterns compile per evaluation; `lastIndex` state never leaks. ("String primitives are shared functions too" in [v3-implementation-notes.md](v3-implementation-notes.md).)
6. **Dependency recording.** Statically-known `$data` paths (literal `get` paths included via the sugar equivalence; `[*]` projections as written), the `dynamic` flag (computed `get` path, bare `$data`, dynamic fragment arguments), canonical operators invoked, fragments called. Consumed by the sample-data check now (3.3) and `getDependencies()`/`isEvaluable()` later (Phase 13). ("`getDependencies()`" in [v3-evaluator-methods.md](v3-evaluator-methods.md).)
7. **Result-key skeletons** (deliberately deferred, recorded so it isn't lost): the artifact *may* precompute cacheable nodes' result-key skeletons — a micro-optimization for Phase 9, not a coupling. ("Two caches, deliberately disjoint" in [v3-implementation-notes.md](v3-implementation-notes.md).)

## C · Independence and self-containment rules

1. **Option-independent.** No option-dependent result is baked in, so per-call options never affect the artifact — and per-call `operators`/`fragments` do not exist at all (registry stability, Options area). The only thing that ever invalidates an artifact is an `updateOptions()` touching one of the three registry-affecting keys — `operators`, `fragments`, `operatorDefaults` — which exist at construction/`updateOptions()` only. ("The full invalidation set" in [v3-implementation-notes.md](v3-implementation-notes.md).)
2. **Data-independent.** One compile serves every `data` input forever. ("Step 5" in [v3-worked-examples.md](v3-worked-examples.md).)
3. **Registry resolution baked in.** The artifact records which `$name` keys invoke and which are inert, and holds resolved registry entries (`instanceDefaults` included) — which is *why* the artifact is per-instance and why per-call `operators`/`fragments` don't exist. ("Parse → compile → evaluate" step 4 in [v3-implementation-notes.md](v3-implementation-notes.md).)
4. **The input is never mutated**, and compiled constants/skeletons may share structure with it — the results-are-immutable and don't-mutate-evaluated-expressions contract lines. ("Result immutability — the ruling" in [v3-evaluator-methods.md](v3-evaluator-methods.md).)
5. **Identity-only marking.** An input containing opaque constants is flagged identity-only: it must never be served from the content-keyed cache layer (two such expressions can serialize identically and splice the wrong constants). Consumed by Phase 8.2. ("Cache keying for non-identical inputs" in [v3-implementation-notes.md](v3-implementation-notes.md).)
6. **Comments and `vars` are consumed.** `//` keys are stripped everywhere (except inside `literal`); plain-literal `vars` blocks scope their subtree and are removed from the compiled skeleton. ("Comments: the `//` key" and "`vars` on plain object literals" in [v3-api.md](v3-api.md).)
7. **`undefined` is normalized at parse** per JSON semantics: `{ a: undefined }` = absent key, `[1, undefined]` = `[1, null]` — the parse half of boundary normalization. ("The value domain" in [v3-api.md](v3-api.md); "Null policies and boundary normalization live in the engine" in [v3-implementation-notes.md](v3-implementation-notes.md).)

## D · Who consumes what (the artifact's forward contract)

| Obligation | First consumer | Later consumers |
|---|---|---|
| Canonical AST (A1) | 3.3 static checks | Phase 4 evaluation; Phase 15 converter (normalizer reuse) |
| Hole list + paths (A2) | 3.3 (`timeoutShielded`) | Phase 4 evaluation; Phase 12 report `holePath`; Phase 10 shielded assembly |
| Issue stream (A3) | 3.3 `validate()` | Phase 4 `evaluate()` static-error gate; Phase 12 static-errors-under-report |
| Constancy (A4) | 3.2 holes/skeleton; 3.3 literal-param checks | Phase 4 identity short-circuit; Phase 10 shielding |
| Shielding precompute (B2) | 3.3 badge | Phase 10 timeout assembly |
| Delivery-mode binding (B3) | — (structure only) | Phase 4/5 handle construction |
| Counts (B4) | 3.3 `maxDepth`/`maxNodes` | every `evaluate()` call |
| Dependencies (B6) | 3.3 sample-data check | Phase 13 `getDependencies()`/`isEvaluable()` |
| Identity-only flag (C5) | — | Phase 8.2 content-layer guard |
| Fragment-body reuse (whole pipeline) | — | Phase 11 registration-time body compilation |

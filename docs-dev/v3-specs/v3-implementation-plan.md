# FigTree v3 — implementation plan

*Working document. The build sequence: discrete, individually-testable chunks in dependency order — review and amend freely; once agreed, each chunk likely becomes a GitHub issue and we work through them top to bottom. This plan sequences steps 2–3 of [v3-testing-strategy.md](v3-testing-strategy.md) (hand-migrate tests + implement, interleaved per chunk); its step 1 is Phase 0 here, and its steps 4–5 are Phase 12.*

## Working rules (apply to every chunk)

1. **Tests first, per chunk.** Before building a chunk, write its tests: hand-migrated v2 tests where v2 coverage exists (the independent-oracle rule — never converter-generated), new tests for new semantics. The [gradient register](v3-cases-for-review.md) rows and the [worked examples](v3-worked-examples.md) are named test sources — each chunk lists which rows it discharges.
2. **A chunk is done when**: its tests pass; every previously-green suite still passes; and any divergence from the spec discovered while building has been taken **back to the spec docs for a ruling** before moving on (the operator-contract doc's standing rule — implementation reshapes details, but the docs stay the source of truth).
3. **Interfaces early, features behind them.** Cross-cutting interfaces (`OperatorContext` with `signal` / `cache.memo` / `trace.note`) exist as working stubs from the first evaluator chunk, so operator bodies are written in final shape once and features (caching, tracing, abort) light up behind stable interfaces later — no retrofit passes over 42 operator bodies.
4. **The frozen `V2/` corpus is never edited** and never runs against v3 source — it is a record and the converter's oracle (Phase 12), nothing else.
5. **No chunk starts until the previous one is validated whole** — the discrete-chunks requirement. Chunks within a phase are sequential unless marked parallel-safe.
6. **Every phase closes with a build and a size reading.** Run `pnpm build` (it must be green — CI runs it too) and add the phase's row to the [bundle-size table](#bundle-size-by-phase). Growth is watched as it happens, not audited at Phase 14.
7. **Every phase closes with a runnable showcase** (Carl, September 2026): `src/dev/phase<N>_showcase.ts`, run with `pnpm dev phase<N>_showcase` — a range of expressions exercising the phase's features, printing each expression and its result or error. Not a test (the suites are the assertions); a reading of the phase for humans, and the seed material for release notes. First instance: `phase4_showcase.ts`. TO-DO: retroactive showcases for Phases 1–3 (primitives and errors; definitions and registry; the parser and `validate()`).

---

## Phase 0 — Scaffolding & corpus freeze

**Posture: full rewrite.** No v2 engine code is ported — the architecture inverts at every layer (per-visit recognition → parse-once; body-side checks → engine layers; alias machinery deleted), and v2's systemic metadata/runtime default drift makes copying actively hazardous. What does carry over, as assets rather than code: the **test corpus** (0.1); the **v2 source as data** for Phase 15's converter (the alias tables, property aliases and `parseChildren` positional mappings are the authoritative record of what v2 accepted — mined, never ported); **reference implementations** for fiddly corners (fetch/axios error-payload extraction, `dequal` semantics in EQUAL — the dependency itself likely survives); and the package/publish/CI plumbing, adjusted in 0.2 and Phase 14.

**0.1 · Freeze the v2 corpus.** Copy the current `test/` suite into `test/V2/`, immutable, expected outputs included (testing-strategy step 1). Tag which files are pure expression-tree tests vs infrastructure tests (options/cache/HTTP/SQL wiring) — only the former flow through the eventual differential. The v2 source is **renamed to `/v2-src` and kept in-repo until v3 approaches release** (Carl's call): the frozen corpus stays *runnable* against it (on demand, not in v3 CI) — live v2 behaviour on tap during hand-migration and Phase-15 divergence cataloguing, not just recorded expectations.

**0.2 · v3 skeleton.** Fresh `src/` beside `/v2-src` on `v3.0-dev`; tsconfig/eslint/rollup exclude `/v2-src` entirely (plus an import-ban lint so v3 source can never reach into it); jest config for the v3 suite; CI running the v3 suite only. Test doubles built once, used everywhere: a **scripted mock `HttpClient`** (fixed responses, failure/latency switches, call counter) and a **recording `CacheStore`** (`{ get, set }` logging keys) — the observability harness the worked examples assume.

---

## Phase 1 — Foundations (pure functions, zero dependencies)

**1.1 · Shared primitives.** The one-function requirements from [v3-implementation-notes.md](v3-implementation-notes.md): `isTruthy`, the ordering comparator, the stringification renderer (`renderText` with `<array>`/`<object>` placeholders), the shared whitespace set / trim, code-point segmentation, decimal-representation rounding, and the **path resolver** (dot/bracket grammar, `[*]` projection, null drill-through, own-enumerable-only, `strictDataPaths` flag). Pure unit tests; these are also the exported author-facing helpers, so their tests are contract tests.
*Spec: implementation notes; Type area; References §3.*

**1.2 · `FigTreeError` + `Issue`.** The error class (code / path / holePath / fragment+fragmentPath / errorData / related / cause / issues / trace slot / `prettyPrint`), the issue shape, and a first cut of the stable `code` vocabulary. `OperatorFailure` (contract Q6) decided here.
*Spec: evaluator-methods § FigTreeError; contract § Runtime interface.*

**1.3 · Type vocabulary checker.** The metadata types (basics, `integer`, unions, literal unions) plus `constraints` (length / homogeneous / elementShape). One table, consumed later by three moments (registration, parse, runtime) — tested standalone against fixtures.
*Spec: Type area § Metadata type vocabulary; contract § Constraints.*

---

## Phase 2 — Definitions & registry (still no evaluation)

**2.1 · `defineOperator()`.** Definition validation in isolation: name/alias legality + reservation set, parameter declarations, `positionalParams` rules, nullPolicy declarability (type-driven admission), **conditional nullPolicy compilation** (enumerate the literal union → policy table), `replacesNullAt` constraints, `timeoutParam` (contract Q5 resolved: definition-level pointer), `returns`, the `EvaluationData` sentinel. Fixture-based tests: every registration error in the contract's validation list gets a fixture that triggers it.
*Spec: contract §§ Definition shape → Registration & validation.*

**2.2 · Registry assembly.** Building the instance registry from the `operators` array: flattening, cross-registry collision checks (one namespace), alias map, `operatorDefaults` validation against metadata — including the **required-parameter ban** (evaluator-methods Q12, signed off). `new FigTree()` exists as a shell that registers and throws on bad input; no `evaluate` yet. (`excludeOperators` removed from v3 — Options ruling, July 2026, at Phase-2 planning.)
*Spec: Options § Operator registration, § operatorDefaults; Operators §4–5.*

---

## Phase 3 — The parser (the artifact), with `validate()` as its public face

**3.1 · Artifact obligations checklist + internal types.** First act: consolidate the artifact's scattered obligations (hole paths, constancy, shielding flags + static-fallback constants, issue stream, depth/node counts, canonical normalization, delivery-mode binding, compiled regexes, option-independence, self-containment) into a checklist and design the internal artifact types against it. Internal and freely refactorable — the checklist, not the types, is the contract.

**3.2 · Parse / normalize / classify.** The single walk: node-kind recognition, shorthand + alias normalization, positional mapping via `positionalParams`, the sibling-key rule, all malformed-node hard errors, `//` stripping, `vars` block structure, `literal` boundaries, reference-token recognition, name legality, constancy classification bottom-up, skeleton + hole extraction, counts. Tests assert artifacts (white-box, internal) *and* the issue stream.
*Spec: Node grammar, entire; Operators § Shorthand grammar; References §§1–3, 7.*

**3.3 · Static validation + `validate()`.** The metadata-driven layer on the artifact: literal parameter type checks + constraints, missing-required / unknown-key, empty-literal-aggregate, unresolved `$vars`/`$params`/`$element`/`$index`, vars cycles, `as` collisions, `returns` feeding-position check, operator `validate` hooks, all warnings (unrecognized-`$`, shadowing, unreferenced vars, useless modifiers — the excluded-operator row is retired with `excludeOperators`), `timeoutShielded` computation. Public `fig.validate()` ships here — the parser's test surface goes black-box from this point. *(Built July 2026 as a second parse-time pass over the compiled AST — ruled with Carl at Phase-3 planning: identical asymptotics to the literal single walk for the constant-heavy workloads, since pass 2 never descends into collapsed constants. The empty-literal-aggregate check has no generic trigger yet — whether each aggregate's check is hook-authored or earns a declarative constraint is decided at Phase 4's first aggregate.)*
*Spec: evaluator-methods § validate (the check inventory table is the test list); contract § validate hook.*

---

## Phase 4 — Evaluator core: eager evaluation, throw mode

**4.0 · Carried from Phase 3 — the recursion ceiling (defect, found September 2026).** `maxDepth` is measured during the walk and compared afterwards, so a deep input throws `RangeError: Maximum call stack size exceeded` out of the walk before the check can report: with `maxDepth: 50` set, depth 1,000 reports `max-depth` but depth 1,500 throws — breaking `validate()`'s never-throws-on-content invariant, and defeating the one rationale that clearly justifies a depth limit (stack safety, which applies to inert data as much as to expressions). Add a built-in, option-independent ceiling inside `walk()` (conservative, ~500 — environments differ), emitting an error issue and refusing to descend; the user's `maxDepth` stays the per-call check against the measured depth. The Phase-4 constancy probe (implementation notes) recurses too and carries the same ceiling. Tests: a 5,000-deep input reports instead of throwing, through both `validate()` and `evaluate()`.
Same chunk, same root cause: **`nodeCount` narrows to count *evaluable* nodes only** (ruled September 2026, Carl — *provisional, up for further refinement*), so inert data stops tripping a limit meant for runaway logic, and a built-in mid-walk ceiling bounds walk cost on untrusted input instead. Tests: a 200-entry options list no longer trips `maxNodes: 500`; an expression with 600 operators does.
*Built (September 2026): evaluable = operator, fragment-call, reference and invalid nodes — constants and plain containers are structure, not work (Carl's ruling at Phase-4 planning). The ceiling is `DEPTH_CEILING = 500` in `src/parse/probe.ts`, reported as code `depth-ceiling`; the probe is the shared `probeConstant`, its shipping property `probe(x).constant === (parse(x).root is a constant holding x itself)` — stricter than the notes' `holes.length === 0`, since a `//` key, a `vars` block or an `undefined` value normalizes the value without adding a hole. Also carried here: the static layer type-checked literal nulls before applying null policy, so register rows 13 and 14 failed `validate()` — fixed to mirror the runtime order (unset at optionals, element policy before constraints).*
*Spec: obligations B4 (amended); implementation notes § `maxDepth` cannot currently do its job; evaluator-methods § validate() — the process.*

**4.1 · The dispatch + engine layers.** The four-kind recursive evaluation (constant / reference / node / skeleton + splice), eager parameter resolution, runtime type checks, engine-side null-policy enforcement (propagate short-circuit, type-driven admission, null-means-unset, `replacesNullAt`), boundary normalization (`undefined`→`null`, finite guard, escaped-handle guard), **fallback rules 1–2 and 4–6**, `evaluate()` with minimal per-call merge, `mode: 'throw'`. `OperatorContext` lands with working `signal` passthrough and **stub** `cache.memo` (identity) and `trace.note` (no-op) — rule 3 above.
*Built (September 2026): `operatorDefaults` **parameter defaults and the default-`fallback` catch land here, not in 8.1** — the unset chain needs the defaults, and the parser already counts a default fallback toward shielding, so the runtime catch must honour it; the `replacesNullAt` holder is an internal evaluate-once thunk (`once()` in src/utils.ts) that Phase 5 wraps into the body-facing `LazyValue`; the two-level option merge is implemented as `mergeOptions` (src/evaluate/context.ts), leaving 8.1 `updateOptions`/`getOptions`/re-validation; the probe fast path runs before the parse (off when `trace` is requested); contract Q6 resolved as the exported `OperatorFailure(message, { code?, errorData? })`. Options owned by later phases (`mode: 'report'`, `trace`, `timeout`, `useCache`, `cache`) are accepted and inert.*
*Spec: evaluator-methods § One spine; Node grammar § fallback; Type § Null policy; contract § Engine guarantees.*

**4.2 · First operator batch: the eager set.** Arithmetic (`plus` and friends), comparisons, simple strings (`lower`/`upper`/`trim`/`split`/`length`), `convert` (conditional nullPolicy's proof), `equal`/`notEqual`. Tests: hand-migrated v2 math/comparison/string suites + new null-gradient and no-coercion tests.
*Built (September 2026): 24 definitions as flat `defineOperator()` literals under `src/operators/` (`math`, `comparison`, `string`, `array`, `convert`; `coreOperators` in `index.ts`); `dequal` **vendored** as `src/primitives/deepEqual.ts` (Carl — zero runtime dependencies); the body-params TypeScript inference built here too (`defineOperator<const P>`, `src/inference.ts` — Carl's call to pull it forward); the empty-literal-aggregate check is validate-hook-authored (`src/operators/shared.ts`), with one known edge: a literal `[]` beside a *dynamic* `expect` reports the error, since hooks see literals only. Test files are feature-named (`test/operators-*.test.ts`, `test/null-gradient.test.ts`, `test/inference.test.ts`).*
*Register rows: 2, 3, 10, 11, 12, 13, 14. Parameter passes: batches 2–4 (eager subset).*

---

## Phase 5 — Scoping & laziness

**Phase 5 ships Batch 1 — Logic & control entire** (`and`, `or`, `not`, `if`, `match`, `firstOf`): the operator set that forced these capabilities into the ledger. `truthiness` is *not* a delivery mode and landed in Phase 4 as `applyTruthiness`; what remains of it here is its per-element form on a settlement stream. `not` is eager — it appears in 5.3 because it completes the batch, not because it is lazy.

**5.0 · The artifact shapes, and corrections carried in (added at planning, September 2026).** `lazyElements`, `lazyEntries` and `race` need element- and entry-addressable compiled nodes, which a skeleton cannot give: its holes are *maximal*, so a partly-constant element dissolves into the enclosing shape and stops being a node at all. New `ElementsNode` / `EntriesNode`, parameter position only, built on a mode-aware path covering both the shorthand and canonical faces, and only when at least one child is non-constant — an all-constant literal stays a `ConstantNode`, which is what keeps literal arrays visible to `validate` hooks and the dead-expression warnings alive.
*Built (September 2026): `staticChecks.visit()` traverses both kinds and its switch ends in `return node satisfies never`, so a future node kind is a build error — load-bearing, because `visit` is the only resolver of the scoped namespaces and the only builder of the vars cycle graph, and a cycle routed through an untraversed kind hangs at runtime rather than failing validation. `nodeCount` restated positively (a new kind is structure until deliberately counted); `maxDepth` unified, so an expression measures the same through either face. Two defects fixed here: a `vars` block on a plain-literal root made `rootHoles` treat the root as a single hole and reported `shielded: false` although every hole carried a static fallback (fallback rule 3 says per-hole for a literal root); and engine-internal errors are now branded and cut through the fallback process, which previously served them back as the author's placeholder.*

**5.1 · `vars`.** Lexical scope chain, lazy + memoized promise mechanism (shared in-flight evaluation, memoized rejections, fallback rule-5 corner), shadowing, plain-literal `vars` consumption. Tests count evaluations via spy operators — evaluate-at-most-once is the assertion.
*Built (September 2026): `src/evaluate/scope.ts`; `once()` from Phase 4 already carried the whole guarantee. A thunk binds to the scope that DECLARED it, never to whichever node demanded it first — the alternative lets an early-resolving `and` cancel a var, memoize that cancellation, and poison a later legitimate demand. One scope spans a node's parameters and its fallback; the abort scope (5.3) is deliberately narrower. Ruled with Carl: **`strictDataPaths` governs every namespace's drill, not just `$data`** — authoring-time path checking, the strongest of the assessment's three typo mitigations, exists for `$data` alone, so the runtime throw is the only protection the others can have. Follow-up: `strictDataPaths` and the code `missing-data-path` now both under-describe their scope.*
*Spec: References § $vars; Node grammar § vars on plain literals.*

**5.2 · Lazy delivery modes + their holders.** `lazy` (`if`, `match.default`, the `…Default` family), `lazyElements` (`firstOf`), `lazyEntries` (`match`), the degeneration rule (dynamic values → pre-resolved handles). Tests: branch-never-evaluates assertions via spies; the `…Default` semantics.
*Built (September 2026): the layers apply to a lazily-delivered value **at the moment of demand**, inside the handle — Carl's ruling, so the contract's post-everything promise holds for every mode and `and`/`or` receive plain booleans rather than calling `isTruthy` by hand. `nullPolicy: 'propagate'` is the one layer that cannot come along, and the skip had to be **enforced, not merely documented**: an unsupplied lazy parameter takes its declared default, and that default is a whole value reaching the null-policy layer, so `if.else`'s `default: null` made `{ $if: [true, 'yes'] }` resolve `null` with the taken branch never demanded. The derived reject is untouched. `inference.ts` now tests the delivery mode before truthiness (a `race` parameter declares both, and the stream is what arrives), and the container modes deliver `LazyValue<unknown>` — the declared type describes the container and there is no element-type declaration to do better with.*
*Register rows: 1, 5, 6, 7, 8, 9. Contract § Evaluation modes.*

**5.3 · `race`: `and`/`or`.** Parallel early resolution, per-node abort scopes, settlement streams, Kleene parking, deterministic lowest-index failure, vacuous identities. Latency-scripted mock operators make completion-order permutations testable.
*Built (September 2026): per-node abort scopes are a **general rule of the runtime interface, not an `and`/`or` quirk** (Carl's ruling) — a node derives a controller when any parameter is delivered as a handle, and settles it the moment its body settles; Phase 10 composes the deadline into the same chain. Specifics that had to be right: the abort scope covers parameters only, not the fallback (which runs after the body settled and would be refused at its first node boundary); cancellation is not failure, so it travels the same bail-out as an engine bug and reaches no `fallback`; `rootSignal` distinguishes a scope abort from the kill switch; an element's promise resolves to a `Settlement` and never rejects, so an abandoned operand cannot become an unhandled rejection — the handler is attached where the promise is created, the only point early enough to matter. The scope chain is hand-rolled rather than `AbortSignal.any`, whose browser floor (Chrome 116, Safari 17.4) is higher than this package should ask for. Honest about reach: JS cannot interrupt running code, so an abandoned subtree completes and its result is discarded; what the abort reliably stops is work not yet started, and anything holding the signal — the I/O clients, where the time lives.*
*Register row 4; worked example 5; implementation notes § race with error parking.*

**Deferred out of Phase 5, recorded (September 2026).** Register row 9's agreed `validate()` lint — warning when `$not` sits directly over a propagate-family node — cannot be written: an operator's `validate` hook receives *literal* parameter values only, so a hook on `not` never learns that its `value` is a `$greaterThan` node. `not`'s runtime behaviour is correct and tested without it. The same root cause holds Phase 4's recorded `plus`/`expect` edge, and both want the same fix: an additive third hook argument describing node-valued parameters. Carried to the authoring-polish phases.

**Raised and parked at 5.3 (September 2026, Carl).** Whether `and` / `or` should get a symbolic alias was re-opened — the Operators area recorded an outcome but no argument — and settled the same way: they stay alias-free, because alias-free is the reversible direction, because `match` and `firstOf` are bare too (so there is no inconsistency to fix), and because rule 0 favours the plain words. Reasoning and the note that any future symbol should be `&&` / `||` rather than `&` / `|` are recorded in the Operators area of [v3-api.md](v3-api.md).

---

## Phase 6 — Iterators

**6.1 · `perElement` + bindings.** `$element`/`$index`, `as` renaming and its scope boundary, per-index memoized child scopes; `nullInputDefault`; decider iterators reusing the race machinery.
*Built (September 2026): the phase turned out to be **runtime-only** — Phases 2, 3 and 5 had already landed the `perElement`/`over` registration checks, the structural `as`, the binding frames, `$order`/`$orderIndex` recognition, the binding-scope walk order and `resolveBinding`, with a green static suite over all of it. Three holes remained: the delivery in `src/evaluate/params.ts`, `$element`/`$index` in `src/evaluate/reference.ts`, and the definitions. The binding chain (`src/evaluate/bindings.ts`) deliberately mirrors the vars chain next door but stays a **separate chain**, because the lifetimes differ — a vars scope spans a node, a binding frame spans one element. The handle is built in **pass 2**, not pass 1, since it closes over the `over` sibling's VETTED value: `layerOrder()` puts the target ahead of its dependant, which is what lets `nullInputDefault` replace a null `input` before the derived reject sees it (that parameter needed no engine work at all — the Phase-4 `replacesNullAt` layer already ran at the right moment). Ruled at planning (Carl): **`PerElement.settle()`** — the deciders get their settlement stream from the engine rather than building one, so "parked, never thrown" stays an engine guarantee and Phase 12 has one place to hook per-element statuses; `race.ts`'s private `streamOf` generalized to `indexedStream(count, run, vet)`, of which `raceStream` and `settledStream` became callers. `perElement` runs the **full vet per index** (not truthiness alone, as for the container modes) because its declared type describes the element, not a container — the contract's "When the layers run" paragraph had omitted it. With the last mode built there is no unbuilt mode left for a test to reach, so the delivery switch is now exhaustive by `satisfies never`: an eighth mode is a **build** error, which is strictly stronger than the runtime test it replaced.*
*Register rows: 23, 24. Parameter passes batch 5.*

**6.2 · The five operators.** `map`/`filter`/`find`/`some`/`every`.
*Built (September 2026): all five in `src/operators/array.ts` beside `length`. `decide()` moved out of `logic.ts` into `shared.ts` and is now shared verbatim by `and`/`or` and `some`/`every` — the quantifiers really are batch 1's machinery with the condition list factored into data. Its sibling `collectAll()` serves the transforms, applying the same lowest-index rule to failures (evaluator-methods' "iterators likewise") and raising as soon as that index is **known** lowest, so determinism costs no wait on elements that cannot change the answer. `find` is the one bespoke body: order-aware early resolution, resolving at the first truthy index once every earlier index is known falsy. The shared parameter block is spelled as `as const` objects rather than built by a factory — a factory's return type widens `evaluation` to `string` and the inferred body types collapse; with the const spelling the five bodies need **no casts at all**, which is the inference machinery earning its keep. `src/dev/demoOperators.ts`'s `map` stand-in had to go, not merely could: `inspect.ts` registers it beside `coreOperators` and the names would collide.*

**6.3 · Static checks, docs and the close.** The dead-binding warning; the out-of-scope `as` error; the generated reference.
*Built (September 2026): two checks batch 5 promised but nothing implemented. `dead-binding` rides the `IteratorFrame`, marked when a reference resolves against it and warned on pop. The out-of-scope `as` fix could not be done during the walk — depth-first meets an iterator's `input` before its `as` — so the parser collects every declared `as` name and upgrades the matching unrecognized-`$` warnings to `unresolved-binding` errors afterwards, replacing in place so the issue stream keeps tree order. `codegen/buildOperatorReference.ts`'s PENDING `iterators()` block was deleted (the build fails while a pending entry names a registered operator). The showcase scaffolding that Phases 4 and 5 had duplicated verbatim is extracted to `src/dev/showcase.ts` rather than copied a third time.*

---

## Phase 7 — Remaining core operators (core-complete milestone)

**7.1 · Data & objects.** `get` (path resolver reuse, `missingPathDefault`, `from` + the `EvaluationData` sentinel), `buildObject` (duplicate-key semantics + warning).
*Built (September 2026): both in `src/operators/data.ts`. Almost nothing in the engine had to move — the `EvaluationData` sentinel, the `replacesNullAt` layer, the `lazy` handle and the `elementShape` constraint were all already load-bearing elsewhere, and `get`'s whole path grammar (quoted segments, the segments array, `[*]`) had shipped with the Phase-1 resolver. Two things were genuinely new. `get` reads `strictDataPaths` off **`context.options`**, the only channel a body has to an option, so the sugar contract's "same strictness response" became one flag consulted once rather than two layers agreeing by coincidence (it arrived declared, via `readsOptions`; that declaration was dropped at the Phase-8 opening — contract open Q10 — leaving the read as it was); and the parser gained **`get`'s dependency recording** (obligation B6), which was specified but never built — a literal `path` with no `from` joins `dataPaths`, a computed one sets `dynamic`, a supplied `from` contributes neither. Batch 6's three unruled `[*]` sub-questions all closed on the built resolver rather than by decision: chained projections nest, `missingPathDefault` fires on a whole-path miss only (a per-element miss is already a `null` slot in a found result), and the segments-array form cannot spell a projection at all. `from` declares `any`, not the contract example's `['object', 'array']` — its `value` policy is declarable only where the type names null.*
*Register rows: 25, 26. Batch 6.*

**7.2 · Renderers & regex.** `buildString` (token engine, literal-face validate hook, unbound-token rendering, `closeGaps` over the segment list), `join`, `regex` (modes, compiled-literal-pattern reuse, `noMatchDefault`), `literal` (mostly parse-side already — confirm end to end).
*Built (September 2026): the token grammar is one scanner in `src/templateTokens.ts` with two consumers — the parser and the body — so it cannot drift. Four rulings shaped it. **Reference tokens desugar into `substitutions`** (Carl): a literal `{{$d.first}}` adds the compiled reference to the substitutions object under the token's own text, leaving the template byte-unchanged, which means the body needs no reference machinery at all and `nullValueDefault`, the static scope walk and dependency recording all reach reference-token values for free. It needs an object to grow, so it was **narrowed to the named and no-substitutions faces**; beside a literal array or a dynamic map the token is unrecognized, renders itself, and warns. **The literal-face findings are warnings, not the errors the pass drafted** — an error refuses the expression, which would have made a percent-encoded URL in a positional template unevaluable and stopped register row 15's own example from rendering. And they are emitted by the **parser**, not a `validate` hook, because the desugar turns `substitutions` into a skeleton and hooks see constant parameters only. `regex` came out as a pure rename of v2 plus everything new, with **artifact obligation B5 deferred**: nothing can write the precompute slot, and a `RegExp` the engine already caches by source and flags is not worth a definition-level hook — constructing per use is also the only `lastIndex` story that needs no care. `closeGaps` runs over the segment list with the run stripped in place, which is what makes "each run consumed at most once" fall out instead of needing bookkeeping. One wording correction went back to the pass: zero-length matches advance one UTF-16 unit, and one code point only under `u` — "the JS `matchAll` rule" and "advance one code point" are the same thing only when the flag is set, and the batch's code-point unit ruling does not reach inside a pattern. `literal` needed no code: Phase 3 had built the boundary, and what Phase 7 added is the evaluation-level proof that a quoted payload comes back by identity and nothing downstream re-captures it.*
*Register rows: 15–19, 21, 22. Batch 4.*

**Milestone: all 41 core operators live — 40 definitions plus `literal` as grammar; the bulk of hand-migrated v2 expression tests pass.** Worked examples 1 (minus http) becomes a passing test here.

---

## Phase 8 — The instance layer, completed

**8.1 · Full options semantics.** The two-level merge rule (all the consequence-table cases — the merge itself landed in 4.1 as `mergeOptions`; this chunk proves every table row), frozen per-evaluation context, never-mutate-the-instance, `updateOptions` + registry re-validation, the `useCache` modifier default (parameter defaults and the default-`fallback` catch landed in 4.1), `getOptions` snapshot.
*Spec: Options, entire.*

**8.2 · The parse cache.** Two layers (identity `WeakMap` + bounded content LRU, re-register-on-content-hit, opaque-constant identity-only guard), invalidation by exactly `operators`/`fragments`/`operatorDefaults`. Observable via a spy `validate` hook counting compiles — no internals in assertions.
*Spec: implementation notes § two-layer parse cache; worked-examples lifecycle steps 3, 4, 6.*

---

## Phase 9 — Result caching & I/O

**9.1 · The result cache.** Store/TTL/maxSize, `auto` keying, `context.cache.memo` goes live behind the existing stub, failures-never-cached, `clearCache()`. Recording-store tests.
*Spec: contract § Caching; Options § Caching.*

**9.2 · Clients & factories.** `HttpClient`/`SqlConnection` contracts, `FetchClient`/`AxiosClient`, SQL wrappers, `httpOperators(client)`/`sqlOperators(connection)` factories. Contract-conformance tests run against the mock client too (it must satisfy the same interface — contract Q8's check). **Start from v2's `httpClients.ts`/`databaseConnections.ts`** (Carl, July 2026) — the one sanctioned code port, being engine-independent: reshape to the single `request()`/`query({ text })` entry points, add `signal` passthrough, throw `OperatorFailure`, drop the query-string assembly (operator-owned in v3), the `getHttpClient` window-sniffing, the `console.log`s and the node-fetch types; the axios/fetch error-payload extraction carries over nearly verbatim.

**9.3 · The I/O operators.** `http`/`graphQL`/`sql`: effective-request manual memo keys (`returnPath` outside the key), wire-null rules, `requestTimeout` composition into `context.signal`, `errorData` (header names only), mutation/injection lints. Mock-client tests are primary (fetch counts — the lifecycle example verbatim); live-network and Northwind SQL tests tagged and optional.
*Register rows: 27–30. Batch 8; ledger #15–17.*

**Milestone: the full lifecycle worked example passes as a test, fetch counts and all.**

---

## Phase 10 — Kill switch & shielding

**10.1 · `timeout` + `signal`.** Strict whole-evaluation deadline, abort threading through the scope chain into clients, cancellation at node boundaries, shielded assembly on timeout (splicing the artifact's precomputed static fallbacks), signal-rejects-always. The `validate()` badge already exists (3.3); this makes it true.
*Spec: Node grammar fallback rule 3; worked example 3 verbatim.*

---

## Phase 11 — Fragments

**11.1 · Registration.** Body compilation at registration (rides the Phase-3 parser), signature validation, cycle detection, batch semantics, replacement re-validation.
**11.2 · Calls.** `$params` on the vars mechanism (lazy memoized args, caller-scope closure), both argument modes, call-site static checks (already parsed in 3.x — now evaluated), fragment shorthand faces.
*Spec: Fragments, entire; worked example 4.*

---

## Phase 12 — Report & trace

**12.1 · `mode: 'report'`.** Hole-boundary degradation, error collection in tree order, `holePath`, static-errors-under-report, the throw/report invariant tests, timeout-under-report shapes, `related` parking attachment. Worked example 1 in full becomes the acceptance test.
**12.2 · `trace`.** Instance-tree assembly in the node-boundary wrapper, statuses (incl. `skipped`/`cancelled`), `trace.note` goes live behind the stub (operator bodies have been emitting since Phase 4), reference/var entries, `error.trace` in throw mode, the envelope + TS conditional return types.
*Spec: evaluator-methods §§ report, trace, return shapes — signed off July 2026; the former spec gate (open questions 1–3 + 11) is discharged.*

---

## Phase 13 — Introspection & surface completion

**13.1 · `getOperators()` / `getFragments()`** (effective defaults merged, capability flags, snapshots), **`getDependencies()`** (transitive, `dynamic` flag — dependency recording rides the Phase-3 artifact, forced by validate()'s sample-data check; this method is a read of it, plus fragment transitivity), **`isEvaluable()`**, `version`. The full v2→v3 method-disposition table becomes a checklist test (deleted methods absent, kept methods present).
*Spec: evaluator-methods §§ Introspection, getDependencies; contract § Introspection.*

---

## Phase 14 — Packaging ⚠

Subpath exports, rollup build, `editor-hints` module, bundle-size checks, tree-shaking verification. **Spec: [v3-packaging.md](v3-packaging.md)** — drafted July 2026, awaiting review (7 open questions at its end).

---

## Phase 15 — Converter & differential (testing-strategy steps 4–5)

**15.1 · `convertV2ToV3`** in `./convert`, built on the parser's normalizer.
**15.2 · The differential runner** over the frozen `V2/` corpus: `evaluate(convert(v2Tree))` vs recorded expected values; the **divergence catalog** (non-convertible / intentional-semantic-change / lossy-default) as a first-class output feeding the migration docs. Expect this phase to surface spec gaps — treat each as a spec-refinement loop, per the testing-strategy note.

---

## Phase 16 — Benchmarks: v2 vs v3, head to head (the last act for `/v2-src`)

**16.1 · Benchmark harness + corpus.** Enabled by two earlier deliverables: `/v2-src` still runnable, and the Phase-15 converter making the comparison honest — each case runs the v2 tree on `/v2-src` and `convert(tree)` on v3, same logic both sides. Corpus: the **largest expression trees from the frozen V2 suite**, plus synthetic scale cases targeting each claimed win so the claims get *measured*, not assumed:

- whole-config, few holes — the O(holes) claim vs `evaluateFullObject`'s full re-walk
- repeated evaluation, changing data — parse-cache steady state vs v2's per-call preprocessing
- instance churn — content-layer hit (serialize+hash) vs full reparse
- deep nesting; and **small hot expressions**, where v3's compile overhead could plausibly *lose* on first call — cold and steady-state measured separately

I/O excluded or zero-latency mocked (network variance would swamp the signal). Output: a recorded results doc — the release notes' performance story; a non-blocking CI job at most. Any case where v3 fails to beat v2 at its own claimed game is a pre-release finding to investigate, not a footnote. **`/v2-src` is deleted only after this phase.**

---

## Milestones

| # | After | You can… |
|---|---|---|
| M1 | Phase 3 | `validate()` any expression — the editor's static half works with zero evaluation capability |
| M2 | Phase 4 | evaluate eager expressions end to end, throw mode |
| M3 | Phase 7 | run all 41 core operators — bulk of migrated v2 tests green |
| M4 | Phase 9 | full I/O with caching — the lifecycle example passes with observable fetch counts |
| M5 | Phase 13 | feature-complete engine, whole method surface |
| M6 | Phase 15 | converter + differential green — migration-ready |
| M7 | Phase 16 | ship with a measured performance story — and `/v2-src` retired |

## Bundle size by phase

Bundle size is a v3 goal in its own right ([v3-packaging.md](v3-packaging.md)), so it is tracked as the engine is built rather than discovered at Phase 14. `pnpm build` prints the numbers below plus a per-module table; `pnpm size` re-prints them without rebuilding. **Recorded at the close of each phase** (working rule 6), measured on the phase's last commit.

Per-PR movement is caught without anyone remembering to look: `.github/workflows/pr-bundle-size.yml` builds both sides of a pull request and posts the difference as a sticky comment, so growth is attributable to the change that caused it rather than noticed a phase later. It shares the measuring code with the report above. Phase 14's *size budget* (packaging, Build & CI mechanics) is a separate check still to come — a threshold assertion, once there is a number worth asserting.

`minified` is the published `build/index.js` — ESM, terser, tree-shaken from `src/index.ts`; there are no external runtime dependencies (`dequal` is vendored as `deepEqual` from Phase 4). `brotli` is the figure that matters for a browser consumer; `types` is the rolled-up `index.d.ts`, uncompressed.

**What the figure is, and is not.** It is the whole public surface reachable from the main entry point — a ceiling, not a per-consumer cost. Because the package is ESM with `sideEffects: false`, a consumer's own bundler shakes the single published file down to what they actually import. Measured against the Phase-3 build by rolling up a consumer entry per import subset:

| A consumer importing… | raw | brotli | *(Phase 3, for contrast)* |
|---|---|---|---|
| `version` only | 0.04 kB | 0.05 kB | 0.21 kB |
| two primitives (`isTruthy`, `resolvePath`) | 1.75 kB | 0.77 kB | 1.96 kB |
| `FigTree` | 82.52 kB | 22.31 kB | 30.38 kB |
| `FigTree` + `defineOperator` | 82.54 kB | 22.31 kB | 43.41 kB |
| everything (`import * as`) | 85.62 kB | 22.83 kB | 44.57 kB |

*Re-measured at Phase 7 on the same method (a consumer entry per import subset, rolled up from `src/index.ts` with `moduleSideEffects: false`, which is what the package's `sideEffects: false` tells a consumer's bundler). The two ends of the range still hold — a consumer who imports a primitive still pays for a primitive — but the middle has collapsed into one figure, which is the finding below.*

One caveat the figure cannot carry: the HTTP/SQL clients are deliberately consumer-supplied ([v3-packaging.md](v3-packaging.md)), so anyone using `GET`/`SQL` pays for `axios`/`pg` on top — both dwarf the engine.

| After | minified | gzip | brotli | types | Largest contributors (pre-minify share) |
|---|---|---|---|---|---|
| Phase 0 — skeleton | 0.04 kB | 0.06 kB | 0.04 kB | 0.66 kB | `version.ts` only |
| Phase 1 — foundations | 5.70 kB | 2.31 kB | 2.11 kB | 4.42 kB | `path` 34%, `typeCheck` 33%, `FigTreeError` 15% |
| Phase 2 — definitions & registry | 22.48 kB | 6.99 kB | 6.29 kB | 9.10 kB | `defineOperator` 50%, `registry` 14%, `typeCheck` 14% |
| Phase 3 — parser + `validate()` | 44.17 kB | 13.43 kB | 12.10 kB | 10.43 kB | `parse` 30%, `defineOperator` 25%, `staticChecks` 12% |
| Phase 4 — evaluator core + 24 eager operators | 62.69 kB | 19.07 kB | 17.07 kB | 14.56 kB | `parse` 21%, `defineOperator` 18%, `staticChecks` 9%, `math` 6%, `params` 6% |
| Phase 5 — scoping & laziness + 6 logic operators | 71.05 kB | 21.39 kB | 19.16 kB | 14.57 kB | `parse` 21%, `defineOperator` 16%, `staticChecks` 8%, `params` 7%, `math` 5% |
| Phase 6 — iterators + 5 operators | 75.59 kB | 22.66 kB | 20.30 kB | 14.64 kB | `parse` 20%, `defineOperator` 15%, `params` 8%, `staticChecks` 8%, `typeCheck` 5% |
| Phase 7 — remaining core operators (core-complete) | 85.64 kB | 25.66 kB | 22.86 kB | 14.87 kB | `parse` 21%, `defineOperator` 13%, `staticChecks` 7%, `params` 6%, `string` 6% |

Phases 0–2 were measured retroactively by building each phase's `src/` with the current toolchain, so the columns are apples to apples (the Phase-3 row reproduces the live build exactly). The package has no runtime dependency to understate: `dequal` was vendored into the bundle with Phase 4's `equal`. The Phase-0 gzip figure exceeding its minified figure is just container overhead on a 40-byte file.

Two things to watch, not yet act on. **`defineOperator` has stopped being optional, and it happened earlier than this plan predicted.** The Phase-3 note said it would stop shaking off "the moment `coreOperators` is itself built with it, which is Phase 7" — but `coreOperators` has been built with it since **Phase 4**, and the measurement confirms the gap between the `FigTree` and `FigTree + defineOperator` rows was already 0.02 kB at Phase 6, where at Phase 3 it was 13 kB. Importing the class now brings the whole registration validator, because the core definitions run through it at module scope. And `parse` + `staticChecks` is 28% of the bundle (down from 42% in share, up in absolute terms): authoring-time machinery that a consumer who only evaluates still pays for, since it is reachable from the class. Whether either splits out is a **Phase 14** packaging decision — the numbers accumulated here are its evidence, and the first of the two now has a measured cost rather than a predicted one.

## Standing dependencies & flags

- **Spec gates**: discharged July 2026 — evaluator-methods signed off (Qs 1–3 + 11 settled at close-off; Q12's operatorDefaults-required ban signed off and amended into Options); Packaging drafted in [v3-packaging.md](v3-packaging.md), awaiting review before Phase 14.
- **Environment**: 9.3's live-network and Northwind-SQL tests are tagged, never blocking CI; the mock client is the primary oracle.
- **Contract watch-list**: the chunks most likely to bounce details back to [v3-operator-contract.md](v3-operator-contract.md) are 5.2/5.3 (mode vocabulary, Q1), 9.1 (caching split, Q2), 4.1 (absent-key delivery, Q4) — budget review time there.

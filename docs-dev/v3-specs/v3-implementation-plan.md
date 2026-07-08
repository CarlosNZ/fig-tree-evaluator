# FigTree v3 — implementation plan

*Working document. The build sequence: discrete, individually-testable chunks in dependency order — review and amend freely; once agreed, each chunk likely becomes a GitHub issue and we work through them top to bottom. This plan sequences steps 2–3 of [v3-testing-strategy.md](v3-testing-strategy.md) (hand-migrate tests + implement, interleaved per chunk); its step 1 is Phase 0 here, and its steps 4–5 are Phase 12.*

## Working rules (apply to every chunk)

1. **Tests first, per chunk.** Before building a chunk, write its tests: hand-migrated v2 tests where v2 coverage exists (the independent-oracle rule — never converter-generated), new tests for new semantics. The [gradient register](v3-cases-for-review.md) rows and the [worked examples](v3-worked-examples.md) are named test sources — each chunk lists which rows it discharges.
2. **A chunk is done when**: its tests pass; every previously-green suite still passes; and any divergence from the spec discovered while building has been taken **back to the spec docs for a ruling** before moving on (the operator-contract doc's standing rule — implementation reshapes details, but the docs stay the source of truth).
3. **Interfaces early, features behind them.** Cross-cutting interfaces (`OperatorContext` with `signal` / `cache.memo` / `trace.note`) exist as working stubs from the first evaluator chunk, so operator bodies are written in final shape once and features (caching, tracing, abort) light up behind stable interfaces later — no retrofit passes over 42 operator bodies.
4. **The frozen `V2/` corpus is never edited** and never runs against v3 source — it is a record and the converter's oracle (Phase 12), nothing else.
5. **No chunk starts until the previous one is validated whole** — the discrete-chunks requirement. Chunks within a phase are sequential unless marked parallel-safe.

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

**2.1 · `defineOperator()`.** Definition validation in isolation: name/alias legality + reservation set, parameter declarations, `positionalParams` rules, nullPolicy declarability (type-driven admission), **conditional nullPolicy compilation** (enumerate the literal union → policy table), `replacesNullAt` constraints, `requestTimeout`, `returns`, the `EvaluationData` sentinel. Fixture-based tests: every registration error in the contract's validation list gets a fixture that triggers it.
*Spec: contract §§ Definition shape → Registration & validation.*

**2.2 · Registry assembly.** Building the instance registry from the `operators` array: flattening, cross-registry collision checks (one namespace), alias map, `excludeOperators` / `operatorDefaults` validation against metadata — including the **required-parameter ban** (evaluator-methods open Q12, assuming sign-off). `new FigTree()` exists as a shell that registers and throws on bad input; no `evaluate` yet.
*Spec: Options § Operator registration, § operatorDefaults; Operators §4–5.*

---

## Phase 3 — The parser (the artifact), with `validate()` as its public face

**3.1 · Artifact obligations checklist + internal types.** First act: consolidate the artifact's scattered obligations (hole paths, constancy, shielding flags + static-fallback constants, issue stream, depth/node counts, canonical normalization, delivery-mode binding, compiled regexes, option-independence, self-containment) into a checklist and design the internal artifact types against it. Internal and freely refactorable — the checklist, not the types, is the contract.

**3.2 · Parse / normalize / classify.** The single walk: node-kind recognition, shorthand + alias normalization, positional mapping via `positionalParams`, the sibling-key rule, all malformed-node hard errors, `//` stripping, `vars` block structure, `literal` boundaries, reference-token recognition, name legality, constancy classification bottom-up, skeleton + hole extraction, counts. Tests assert artifacts (white-box, internal) *and* the issue stream.
*Spec: Node grammar, entire; Operators § Shorthand grammar; References §§1–3, 7.*

**3.3 · Static validation + `validate()`.** The metadata-driven layer on the artifact: literal parameter type checks + constraints, missing-required / unknown-key, empty-literal-aggregate, unresolved `$vars`/`$params`/`$element`/`$index`, vars cycles, `as` collisions, `returns` feeding-position check, operator `validate` hooks, all warnings (unrecognized-`$`, shadowing, unreferenced vars, useless modifiers, excluded-operator use), `timeoutShielded` computation. Public `fig.validate()` ships here — the parser's test surface goes black-box from this point.
*Spec: evaluator-methods § validate (the check inventory table is the test list); contract § validate hook.*

---

## Phase 4 — Evaluator core: eager evaluation, throw mode

**4.1 · The dispatch + engine layers.** The four-kind recursive evaluation (constant / reference / node / template + splice), eager parameter resolution, runtime type checks, engine-side null-policy enforcement (propagate short-circuit, type-driven admission, null-means-unset, `replacesNullAt`), boundary normalization (`undefined`→`null`, finite guard, escaped-handle guard), **fallback rules 1–2 and 4–6**, `evaluate()` with minimal per-call merge, `mode: 'throw'`. `OperatorContext` lands with working `signal` passthrough and **stub** `cache.memo` (identity) and `trace.note` (no-op) — rule 3 above.
*Spec: evaluator-methods § One spine; Node grammar § fallback; Type § Null policy; contract § Engine guarantees.*

**4.2 · First operator batch: the eager set.** Arithmetic (`plus` and friends), comparisons, simple strings (`lower`/`upper`/`trim`/`split`/`length`), `convert` (conditional nullPolicy's proof), `equal`/`notEqual`. Tests: hand-migrated v2 math/comparison/string suites + new null-gradient and no-coercion tests.
*Register rows: 2, 3, 10, 11, 12, 13, 14. Parameter passes: batches 2–4 (eager subset).*

---

## Phase 5 — Scoping & laziness

**5.1 · `vars`.** Lexical scope chain, lazy + memoized promise mechanism (shared in-flight evaluation, memoized rejections, fallback rule-5 corner), shadowing, plain-literal `vars` consumption. Tests count evaluations via spy operators — evaluate-at-most-once is the assertion.
*Spec: References § $vars; Node grammar § vars on plain literals.*

**5.2 · Lazy delivery modes + their holders.** `lazy` (`if`, `match.default`, the `…Default` family), `truthiness` delivery, `lazyElements` (`firstOf`), `lazyEntries` (`match`), the degeneration rule (dynamic values → pre-resolved handles), `not`. Tests: branch-never-evaluates assertions via spies; the `…Default` semantics.
*Register rows: 1, 5, 6, 7, 8, 9. Contract § Evaluation modes.*

**5.3 · `race`: `and`/`or`.** Parallel early resolution, per-node abort scopes (the kill switch's groundwork), settlement streams, Kleene parking, deterministic lowest-index failure, vacuous identities. Latency-scripted mock operators make completion-order permutations testable.
*Register row 4; worked example 5; implementation notes § race with error parking.*

---

## Phase 6 — Iterators

**6.1 · `perElement` + bindings.** `$element`/`$index`, `as` renaming and its scope boundary, per-index memoized child scopes; `map`/`filter`/`find`/`some`/`every`; `nullInputDefault`; decider iterators reusing the race machinery.
*Register rows: 23, 24. Parameter passes batch 5.*

---

## Phase 7 — Remaining core operators (core-complete milestone)

**7.1 · Data & objects.** `get` (path resolver reuse, `missingPathDefault`, `from` + the `EvaluationData` sentinel), `buildObject` (duplicate-key semantics + warning).
*Register rows: 25, 26. Batch 6.*

**7.2 · Renderers & regex.** `buildString` (token engine, literal-face validate hook, unbound-token rendering), `join`, `regex` (modes, compiled-literal-pattern reuse, `noMatchDefault`), `literal` (mostly parse-side already — confirm end to end).
*Register rows: 15–19, 21, 22. Batch 4.*

**Milestone: all 42 core operators live; the bulk of hand-migrated v2 expression tests pass.** Worked examples 1 (minus http) becomes a passing test here.

---

## Phase 8 — The instance layer, completed

**8.1 · Full options semantics.** The two-level merge rule (all the consequence-table cases), frozen per-evaluation context, never-mutate-the-instance, `updateOptions` + registry re-validation, `operatorDefaults` application (parameter + modifier defaults, incl. default-`fallback` participation in catch/shielding), `excludeOperators` as runtime restriction, `getOptions` snapshot.
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

**13.1 · `getOperators()` / `getFragments()`** (effective defaults merged, capability flags, snapshots), **`getDependencies()`** (transitive, `dynamic` flag — dependency recording added to the artifact if not already riding Phase 3), **`isEvaluable()`**, `version`. The full v2→v3 method-disposition table becomes a checklist test (deleted methods absent, kept methods present).
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
| M3 | Phase 7 | run all 42 core operators — bulk of migrated v2 tests green |
| M4 | Phase 9 | full I/O with caching — the lifecycle example passes with observable fetch counts |
| M5 | Phase 13 | feature-complete engine, whole method surface |
| M6 | Phase 15 | converter + differential green — migration-ready |
| M7 | Phase 16 | ship with a measured performance story — and `/v2-src` retired |

## Standing dependencies & flags

- **Spec gates**: discharged July 2026 — evaluator-methods signed off (Qs 1–3 + 11 settled at close-off; Q12's operatorDefaults-required ban signed off and amended into Options); Packaging drafted in [v3-packaging.md](v3-packaging.md), awaiting review before Phase 14.
- **Environment**: 9.3's live-network and Northwind-SQL tests are tagged, never blocking CI; the mock client is the primary oracle.
- **Contract watch-list**: the chunks most likely to bounce details back to [v3-operator-contract.md](v3-operator-contract.md) are 5.2/5.3 (mode vocabulary, Q1), 9.1 (caching split, Q2), 4.1 (absent-key delivery, Q4) — budget review time there.

# FigTree v3 — Packaging & exports

*Working document — first sketch (Claude, July 2026), awaiting review. This area discharges the packaging deferrals scattered across the other docs: export grouping (Operators § Deferred), the editor-hints module mechanics ([v3-operator-parameters.md](v3-operator-parameters.md) § The editor-hints module), the subpath sketch ([v3-assessment.md](v3-assessment.md) §3.6), and the client-factory homes (Options § Operator registration). It unblocks [implementation-plan](v3-implementation-plan.md) Phase 14. Open questions are collected at the end.*

## The package at a glance

One npm package, `fig-tree-evaluator`, three entry points:

| Entry point | Contents | Consumers |
|---|---|---|
| `fig-tree-evaluator` | **The runtime, whole**: `FigTree`, `defineOperator`, `coreOperators`, the I/O factories and client wrappers, `FigTreeError`, guards, author-facing helpers, the `EvaluationData` sentinel, every public type | every host |
| `fig-tree-evaluator/convert` | v2→v3 conversion + shorthand round-trip utilities (contents specified by the Migration area — this doc fixes only the subpath's existence and its isolation guarantees) | migration tooling, the editor |
| `fig-tree-evaluator/editor-hints` | typed display-hint data: colours, per-parameter editor seeds (content fixed in [v3-operator-parameters.md](v3-operator-parameters.md) § The editor-hints module) | the editor and other tooling |

Explicitly **not** entry points:

- **`./clients`** — considered and rejected; the I/O toolkit lives in the root entry (ruling below).
- **`./internal`** — floated in the assessment as the editor's back door; dissolved rather than shipped (ruling below).
- **Date/duration operators** — a separate published package, not a subpath (settled under Operators § Deferred); it consumes the same public `defineOperator` surface as any third-party plugin, which is the point.

## Principles

1. **Capability is gated by registration, not by import path.** Importing `httpOperators` gives you nothing; handing it a client and putting the result in the `operators` array is the act with consequences (Options § opt-in by construction). Import-path layering would duplicate — weakly — a boundary the registry already enforces strongly, so import ergonomics are free to optimize for discoverability instead.
2. **Subpaths are for code that must never ride the runtime.** `./convert` and `./editor-hints` are tooling-side by definition; the root entry never imports either (v2's editor entanglement — every consumer bundling the converter suite — is the recorded failure this rule prevents). Runtime-side imports of a subpath are a lint error in this repo, not just a convention.
3. **Everything exported is contract.** If it is reachable from an entry point, its behaviour is specified in these docs and its tests are contract tests (the Phase-1.1 rule). No incidental exports, no "for the editor" exceptions — that clause is how v2's root entry accreted `truncateString`.
4. **No re-exports of third-party packages.** v2 re-exported `dequal` for the editor's convenience; a consumer who wants a published package can depend on it. (`dequal` remains an internal *dependency* — `equal`'s semantics are specified by it — it just isn't our export surface.)
5. **Tree-shakability is verified, not assumed.** `sideEffects: false` plus a CI fixture that bundles engine + `coreOperators` only and asserts the I/O toolkit and both subpaths are absent. A principle without a check is a hope.

## The root entry

The complete value-export inventory. Types are inventoried separately below.

| Export | Kind | Specified in |
|---|---|---|
| `FigTree` | class | Options; [evaluator-methods](v3-evaluator-methods.md) |
| `defineOperator` | function | [operator contract](v3-operator-contract.md) |
| `coreOperators` | `OperatorDefinition[]` — all 42 core operators | Operators § canonical list |
| `httpOperators` | `(client?: HttpClient) => OperatorDefinition[]` — `[http, graphQL]`; no argument defaults to `new FetchClient()` over global fetch (ruling below) | Options; contract § client contracts |
| `sqlOperators` | `(connection: SqlConnection) => OperatorDefinition[]` — `[sql]` | Options; contract § client contracts |
| `FetchClient`, `AxiosClient` | `HttpClient` wrappers | contract § client contracts |
| `PostgresConnection`, `SQLiteConnection` | `SqlConnection` wrappers *(names: open Q2)* | contract § client contracts |
| `FigTreeError`, `isFigTreeError` | error class + guard | evaluator-methods § FigTreeError |
| `isOperatorNode`, `isFragmentNode` | structural node guards (registry-*unaware*; the registry-aware question is the `isEvaluable()` method) | Node grammar; evaluator-methods |
| `isTruthy`, `compareValues`, `renderText`, `resolvePath` | engine-parity helpers *(list & names: open Q3)* | implementation notes § shared one-function requirements |
| `EvaluationData` | sentinel value, legal only in a parameter `default` | contract § runtime interface |
| `version` | string, generated from package.json (also the instance property) | evaluator-methods |

### Ruling: the I/O toolkit lives in the root entry

The assessment sketched a `./clients` subpath; the worked examples were written the other way (`import { FigTree, coreOperators, httpOperators, FetchClient } from 'fig-tree-evaluator'`) — and the worked examples have it right.

- The subpath's only real payoff would be keeping I/O code out of bundles — but that is tree-shaking's job (principle 5 verifies it), and the *security* layering is already registration's job (principle 1). A `./clients` subpath would split the single most common setup line across two imports to buy nothing that isn't already bought.
- The wrappers are thin adapters over an *injected* client (contract § client contracts) — `axios`, `pg` etc. are never dependencies, so there is no weight argument either. The v2 discipline (HTTP/SQL clients passed in by the consumer, never bundled) carries over unchanged.

**Considered and rejected: `./clients`.** Revisit only if a wrapper ever grows a real dependency — that, not aesthetics, would be the trigger for quarantining it behind a subpath (or out of the package entirely, as with the dates plugin).

### Ruling: `httpOperators()` defaults to `new FetchClient()` (Carl, July 2026)

The zero-config spelling works on every modern runtime — global `fetch` is universal on the platform floor below:

```ts
const fig = new FigTree({
  operators: [coreOperators, httpOperators()], // fetch-backed http + graphQL
})
```

- **Opt-in by construction is intact**: the visible, deliberate act is registering the factory's output — importing `httpOperators` still gives you nothing, and an instance still can't reach the network unless the host put I/O operators in the array. The Options phrasing ("someone visibly handed it a client") reads as "someone visibly registered the I/O operators"; this extends batch 8's `FetchClient()` no-arg ruling (wrap global fetch; only *implicit* adoption died) up one level to the factory.
- **No global `fetch` → the no-arg call throws at registration**, loudly, naming the remedy (`httpOperators(new FetchClient(myFetch))` or another client) — the fragment/`defineOperator` registration posture, never a first-evaluation surprise.
- **Only fetch gets this** — it is the one client with an ambient standard global. `AxiosClient` must be handed the axios import (`httpOperators(new AxiosClient(axios))` — the parameter is always an `HttpClient` *instance*, and axios is never our dependency), and `sqlOperators(connection)` stays required: there is no ambient SQL connection to default to.

### Ruling: one `coreOperators` array — no grouped arrays, no per-operator exports

The export-grouping question deferred from Operators (fat `coreOperators` vs lean core + `mathOperators` / `stringOperators`): **fat**. All 42 core operators ship in the one array.

- The weight argument fails on arithmetic: the core operators are small pure functions — the entire set is a rounding error next to any host application, and the only genuinely heavy things (I/O, Intl/dates) are already outside `coreOperators` by construction. Grouping would tax every consumer with registration ceremony (and every doc with "which array is `round` in?") to serve a bundle-size case that doesn't exist.
- The floated constraint — the default core must cover everything v2 had post-conversion, so converted v2 expressions run without extra registration — is satisfied trivially: converted v2 trees can only need core operators (I/O conversion necessarily involves handing over a client, which is registration).
- Regret is asymmetric, as usual: grouped arrays are plain `OperatorDefinition[]` values and can be *added* later without breaking anything (`coreOperators` would simply be their concatenation); a shipped grouping can never be re-fattened without breaking lean consumers.

**Per-operator named exports** (`import { round } from …`) are also rejected: the canonical names are author-facing words, not JS-facing ones — `if` is a reserved word outright, and `get`, `not`, `map`, `join` are collision bait in any host module — so individual exports would need a renaming scheme (`ifOperator`, …) that forfeits the one thing individual exports are for. A host wanting a minimal registry filters the array (`coreOperators.filter(…)`) or uses `excludeOperators`; both are supported surface.

### Ruling: engine-parity helpers export from the root

A custom operator must be able to *match core behaviour exactly* — the same truthiness at a declared truthiness position, the same ordering as `greaterThan`, the same stringification as `buildString`, the same path grammar as `get`. These are one-function requirements ([implementation notes](v3-implementation-notes.md)) with specified semantics; exporting them is what makes the first-class principle practical rather than aspirational, and their unit tests are already contract tests (Phase 1.1). Proposed set: `isTruthy`, `compareValues` (the ordering comparator), `renderText` (the shared stringifier), `resolvePath` (the `$data` path resolver, `strictDataPaths`-flag included). The finer-grained primitives (whitespace set, code-point segmentation, decimal rounding) stay internal unless a concrete author need surfaces — open Q3.

### Types

Grouped by owning doc; packaging adds no shapes of its own, it only fixes what is reachable. All types export from the root — including those whose *values* live in subpaths, so `./convert` and `./editor-hints` stay data/function modules without private type surfaces.

- **Expressions & nodes**: `FigTreeExpression` (the evaluable-input type — name: open Q4), `OperatorNode`, `FragmentNode`, `OperatorName`.
- **Options**: `FigTreeOptions`, `CacheStore`.
- **Operator contract**: `OperatorDefinition`, the parameter-declaration types, `OperatorContext`, `OperatorFailure`, `LazyValue`, `PerElement`.
- **Clients**: `HttpClient`, `SqlConnection`.
- **Fragments**: `FragmentDefinition` (+ its parameter-declaration types).
- **Methods & results**: `EvaluationResult`, the report envelope and trace shapes (names reserved; shapes deferred per evaluator-methods), `Issue`, the `getDependencies()` report shape, `FigTreeError` (class doubles as type).
- **Editor hints**: the hint-map type — the documented key convention for definition authors ([v3-operator-parameters.md](v3-operator-parameters.md) § The editor-hints module).

## `./convert`

Exists so that no conversion code can ever ride the runtime bundle again — the direct fix for v2's entanglement finding. Packaging fixes only:

- The subpath name: `fig-tree-evaluator/convert`.
- **Isolation**: the root entry never imports from it (lint-enforced); it *may* import from the root (it is built on the parser's normalizer — Phase 15.1) — the dependency arrow points one way.
- Its exports are functions and types only, same module formats and `.d.ts` treatment as the root.
- Contents — `convertV2ToV3` (+ its `ConversionResult` / `ConversionIssue` types) and the v3 shorthand round-trip utilities (`toShorthand` / `fromShorthand`, per the evaluator-methods ruling that these are not instance methods) — are fixed by the **Migration area** ([v3-migration.md](v3-migration.md) § module surface). v1 support is **dropped** (no `convertV1ToV2` here — Migration § v1 ruling).

## `./editor-hints`

Discharges the deferral from the parameter passes ("final name and packaging mechanics → Packaging area"):

- **Name confirmed: `editor-hints`** — self-describing, and the awkwardness of typing it is borne by tooling authors, not expression authors.
- A **data-only module**: a plain typed map from canonical operator names to display values (colours, per-parameter editor seeds). No functions, no engine imports at runtime — type-only imports from the root (e.g. `OperatorName`) are fine, since they erase at build.
- The exported map type is the documented key convention for plugin/custom-operator authors who want their definitions to display well in the same tools (settled in the parameters doc; the type itself exports from the root per the Types rule above).
- Co-versioned here rather than in the editor repo so an operator/parameter change and its hint update land in the same PR (rationale recorded in the parameters doc).

## Ruling: no `./internal`

The assessment floated `./internal` for the editor's leftover needs. Examined item by item, the need dissolves:

| v2 editor dependency | v3 answer |
|---|---|
| `standardiseOperatorName` | dies with the machinery — exact-match canonical names, no case folding (Operators § naming rule 1) |
| `truncateString` | a three-line display utility; the editor owns its own |
| `dequal` | a published package; the editor depends on it directly (principle 4) |
| structural/registry checks | `isOperatorNode` / `isFragmentNode` (root) + the `isEvaluable()` method |
| operator metadata, defaults merged | `getOperators()` |
| static diagnostics | `validate()` |
| display seeds & colours | `./editor-hints` |
| conversion / display modes | `./convert` |

**The editor's sanctioned surface is the public surface.** A `./internal` subpath would be a standing invitation to grow exactly the entanglement v3 is deleting; if the editor genuinely needs something not listed above, that is a spec conversation, not an import path.

## Module format & platform floor

- **Dual ESM + CJS**, ESM primary (`"type": "module"`, CJS artifacts as `.cjs`). The consumer base skews toward long-lived back-end config systems where CJS still walks; the marginal cost is one extra rollup output per entry. ESM-only is a live alternative — arguments recorded in open Q1.
- **`sideEffects: false`** — kept, and now verified (principle 5). All three entries must be side-effect-free at import time; nothing registers, connects, or mutates globals on import (registration is explicit, per Options).
- **Node floor: `engines: { "node": ">=20" }`** (open Q5 for 20 vs 22). Advisory (npm warns, doesn't block); the real commitments are: language target **ES2022**, no down-leveled output, no polyfills, and **no assumed globals beyond the ES standard + `AbortSignal`/`AbortController`**. The one sanctioned global probe is the no-arg `httpOperators()` / `FetchClient()` default reading global `fetch` — at registration, failing loudly there if absent (ruling above). The engine and core operators never touch it, which is what keeps the package runtime-agnostic (Node, Deno, Bun, browsers) without a compatibility matrix: a host without global fetch passes a client.
- **Runtime dependencies: `dequal` only** (likely `dequal/lite`, external as today). `object-property-extractor` is retired: the v3 path resolver is a new in-repo primitive with deliberately different semantics (null drill-through by default, `[*]` projection, own-enumerable-only — References §3) — depending on the old package would mean overriding most of it. HTTP/SQL client libraries remain dev-only, injected by consumers, never bundled.

Sketch of the resulting manifest (mechanics, not contract — final paths are implementation detail):

```jsonc
{
  "name": "fig-tree-evaluator",
  "version": "3.0.0",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=20" },
  "files": ["build"],
  "main": "./build/index.cjs",          // legacy-resolver fallback only
  "types": "./build/index.d.ts",
  "exports": {
    ".": {
      "types": "./build/index.d.ts",
      "import": "./build/index.js",
      "require": "./build/index.cjs"
    },
    "./convert": {
      "types": "./build/convert/index.d.ts",
      "import": "./build/convert/index.js",
      "require": "./build/convert/index.cjs"
    },
    "./editor-hints": {
      "types": "./build/editor-hints/index.d.ts",
      "import": "./build/editor-hints/index.js",
      "require": "./build/editor-hints/index.cjs"
    }
  }
}
```

## Build & CI mechanics

Implementation notes for Phase 14, not contract — free to reshape provided the published surface above holds:

- **Rollup stays** (three inputs, six bundles + three `.d.ts` rollups); no reason to switch tooling for its own sake.
- **Two CI checks**, added at Phase 14 and kept forever:
  1. *Tree-shake fixture*: a tiny app importing only `{ FigTree, coreOperators }`, bundled with default settings, asserted to contain no I/O-toolkit, `./convert`, or `./editor-hints` code (marker-identifier scan). This is principle 5 made executable.
  2. *Size budget*: bundle-size assertion on the root ESM entry. The number is set from measurement at Phase 14; the check existing is the contract, the number is maintenance.
- **Import-direction lint**: root source may not import from `convert/` or `editor-hints/` source (extends the Phase-0.2 `/v2-src` import ban).
- **Codegen disposition**: `getVersion` (package.json → `src/version.ts`) survives, feeding the `version` export/property. `buildOperatorAliasReference` **dies** — v2 generated a global alias table because aliases were unbounded; v3's 13 symbolic aliases live in their operators' definitions and the registry builds its lookup at construction (Operators § naming rules).
- **Generated README operator reference**: the metadata-as-single-source commitment (assessment §3.6) lands as repo tooling that renders `getOperators()` output into the README section — a build script, not a package export.

## Publishing & versioning

- Package name unchanged; v3 ships as **`fig-tree-evaluator@3.0.0`**. It's a clean break in content but the same package identity — the Migration area owns the story for what upgrading means.
- **dist-tags**: `latest` moves to 3.x at release; the final 2.x is tagged **`v2`** and maintained fix-only from a `v2.x` maintenance branch. Pre-release 3.x publishes (for editor integration work) go out under **`next`**, never `latest`.
- The frozen in-repo `/v2-src` (Phase 0) is a build/test asset only — excluded from the published package (`files: ["build"]` already guarantees this) and deleted after Phase 16.
- The date/duration plugin is a **separate package** (name TBD with its own area), depending on `fig-tree-evaluator` as a peer and consuming only the public `defineOperator` surface.

## v2 root-export disposition

Every export of v2's `src/index.ts`, accounted for:

| v2 export | Disposition |
|---|---|
| `FigTreeEvaluator` | **Renamed** `FigTree` (evaluator-methods) |
| `evaluateExpression` | **Deleted** — evaluator-methods ruling (throwaway instance discards the parse cache; one-liner shown in migration doc) |
| `SQLNodePostgres`, `SQLite` | **Replaced** by `SqlConnection` wrappers + `sqlOperators(connection)` (names: open Q2) |
| `AxiosClient`, `FetchClient` | **Kept** — now implementing the contract's `HttpClient`; the FetchClient `console.log`s die with the no-console principle |
| `FigTreeError`, `isFigTreeError` | **Kept** — shape respecified in evaluator-methods |
| `isOperatorNode`, `isFragmentNode` | **Kept** — structural guards against the v3 grammar |
| `isFigTreeExpression` | **Deleted as standalone** — registry-aware question becomes the `isEvaluable()` method; structural question is `isOperatorNode` |
| `isAliasString` | **Deleted** — v2 alias nodes died; `vars` is grammar, not string convention |
| `isObject` | **Deleted** — generic utility, never our contract |
| `preProcessShorthand` | **Deleted** — normalization is parse-internal; round-trip utilities live in `./convert` |
| `standardiseOperatorName` | **Deleted** — no case folding, no alias machinery |
| `truncateString` | **Deleted** — editor-owned display concern |
| `convertToShorthand`, `convertFromShorthand` | **Moved & reshaped** → `./convert` as `toShorthand` / `fromShorthand` (Migration area § module surface) |
| `convertV1ToV2`, `isV1Node` | **Deleted** — v1 support dropped from v3; v1 holdouts convert via still-published v2 first (Migration area § v1 ruling) |
| `dequal` re-export | **Deleted** — principle 4 |
| `Operator` (name union) | **Replaced** by `OperatorName` |
| `OperatorAlias` | **Deleted** — aliases are per-definition metadata, not a public type |
| `FigTreeOptions` | **Kept** — new shape (Options) |
| `FigTreeConfig` | **Deleted** — died with `getConfig()` |
| `EvaluatorNode` | **Renamed/kept** — the evaluable-input type (name: open Q4) |
| `OperatorNode`, `FragmentNode` | **Kept** — v3 canonical node shapes |
| `Fragment`, `Fragments`, `FragmentMetadata`, `FragmentParameterMetadata` | **Replaced** by `FragmentDefinition` + its declaration types (Fragments) |
| `EvaluatorOutput`, `OutputType` | **Deleted** — result vocabulary is evaluator-methods'; `outputType` died into `convert` |
| `OperatorData`, `OperatorMetadata`, `OperatorParameterMetadata` | **Replaced** by `OperatorDefinition` + parameter-declaration types (contract) |
| `CustomFunctionMetadata`, `FunctionDefinition`, `UnknownFunction` | **Deleted** — the functions tier is gone |
| `GraphQLConnection` | **Deleted** — `graphQL` rides `httpOperators` + the `graphQL` options block |
| `BasicType`, `LiteralType`, `ExpectedType` | **Replaced** by the contract's metadata type vocabulary types |

## Open questions

1. **ESM-only instead of dual?** For: one artifact per entry, no dual-package hazard, Node ≥20.17 can `require()` sync ESM anyway, and 2026 ecosystem momentum is firmly ESM. Against: the embedded-config-system consumer base is exactly where old CJS toolchains linger, and a major version asking for expression rewrites *plus* a module-system change is two migrations in one. Sketch above says dual; genuinely Carl's call on ecosystem posture.
2. **SQL wrapper names.** `SQLNodePostgres`/`SQLite` are v2 oddities; proposed `PostgresConnection` / `SQLiteConnection` (matching the `SqlConnection` contract they implement). Also: confirm both wrappers still earn their place in-package vs living in README recipes. And one spelling for construction across all four wrappers — v2's are plain factories (`AxiosClient(axios)`), the v3 examples currently say `new FetchClient()`; class or factory, one wins at implementation (plan chunk 9.2, which ports the v2 wrappers as starting points).
3. **The engine-parity helper list.** Proposed: `isTruthy`, `compareValues`, `renderText`, `resolvePath` — confirm names, and whether any of the finer primitives (whitespace set, code-point segmentation, decimal rounding) deserve export too.
4. **The public name of the expression-input type.** v2's `EvaluatorNode` is accurate but engine-flavoured; `FigTreeExpression` reads better in host code (`const expr: FigTreeExpression = …`). One name only, whichever it is.
5. **Node floor: 20 or 22?** 20 is the conservative advisory floor (18 is EOL); 22 buys `require(esm)` universality if Q1 lands ESM-only. Pure signalling either way given the no-polyfill/ES2022 commitments.
6. **Publish automation.** v2 publishes manually via `prepublishOnly`. Worth moving to CI trusted publishing (provenance attestation, tag-triggered) as part of Phase 14, or keep manual? Low stakes, decide once.
7. **`next`-tag pre-releases for the editor.** The sketch assumes the editor integrates against `3.0.0-next.*` pre-releases during Phases 13–15 — confirm that workflow suits the editor repo, or whether a workspace/link setup replaces it.

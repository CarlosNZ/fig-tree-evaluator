# FigTree v3 — Packaging & exports

_Working document — first sketch (Claude, July 2026), awaiting review. This area discharges the packaging deferrals scattered across the other docs: export grouping (Operators § Deferred), the editor-hints module mechanics ([v3-operator-parameters.md](v3-operator-parameters.md) § The editor-hints module), the subpath sketch ([v3-assessment.md](v3-assessment.md) §3.6), and the client-factory homes (Options § Operator registration). It unblocks [implementation-plan](v3-implementation-plan.md) Phase 14. Open questions are collected at the end._

## The package at a glance

One npm package, `fig-tree-evaluator`, three entry points:

| Entry point                       | Contents                                                                                                                                                                                                     | Consumers                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| `fig-tree-evaluator`              | **The runtime, whole**: `FigTree`, `defineOperator`, `coreOperators`, the I/O factories and client wrappers, `FigTreeError`, guards, author-facing helpers, the `EvaluationData` sentinel, every public type | every host                    |
| `fig-tree-evaluator/convert`      | v2→v3 conversion + shorthand round-trip utilities (contents specified by the Migration area — this doc fixes only the subpath's existence and its isolation guarantees)                                      | migration tooling, the editor |
| `fig-tree-evaluator/editor-hints` | typed display-hint data: colours, per-parameter editor seeds, category presentation (content fixed in "The editor-hints module" in [v3-operator-parameters.md](v3-operator-parameters.md))                   | the editor and other tooling  |

Explicitly **not** entry points:

- **`./clients`** — considered and rejected; the I/O toolkit lives in the root entry (ruling below).
- **`./internal`** — floated in the assessment as the editor's back door; dissolved rather than shipped (ruling below).
- **Date/duration operators** — a separate published package, not a subpath (settled under Operators § Deferred); it consumes the same public `defineOperator` surface as any third-party plugin, which is the point.

## Principles

1. **Capability is gated by registration, not by import path.** Importing `httpOperators` gives you nothing; handing it a client and putting the result in the `operators` array is the act with consequences (Options § opt-in by construction). Import-path layering would duplicate — weakly — a boundary the registry already enforces strongly, so import ergonomics are free to optimize for discoverability instead.
2. **Subpaths are for code that must never ride the runtime.** `./convert` and `./editor-hints` are tooling-side by definition; the root entry never imports either (v2's editor entanglement — every consumer bundling the converter suite — is the recorded failure this rule prevents). Runtime-side imports of a subpath are a lint error in this repo, not just a convention.
3. **Everything exported is contract.** If it is reachable from an entry point, its behaviour is specified in these docs and its tests are contract tests (the Phase-1.1 rule). No incidental exports, no "for the editor" exceptions — that clause is how v2's root entry accreted `truncateString`.
4. **No re-exports of third-party packages.** v2 re-exported `dequal` for the editor's convenience; a consumer who wants a published package can depend on it. (`equal`'s semantics are specified by `dequal`, **vendored** into `src/primitives/deepEqual.ts` with MIT attribution at Phase 4 — Carl, September 2026 — so the package has zero runtime dependencies; `deepEqual` is exported as a shared primitive, `dequal` itself is not.)
5. **Tree-shakability is verified, not assumed.** `sideEffects: false` plus a CI fixture that bundles engine + `coreOperators` only and asserts the I/O toolkit, `defineOperator()`'s checks and both subpaths are absent. A principle without a check is a hope.

## The root entry

The complete value-export inventory. Types are inventoried separately below.

| Export                                                                | Kind                                                                                                                                              | Specified in                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `FigTree`                                                             | class                                                                                                                                             | Options; [evaluator-methods](v3-evaluator-methods.md)           |
| `defineOperator`                                                      | function                                                                                                                                          | [operator contract](v3-operator-contract.md)                    |
| `coreOperators`                                                       | `OperatorDefinition[]` — all 40 core operator definitions (`literal` is grammar, so it has none)                                                  | Operators § canonical list                                      |
| `httpOperators`                                                       | `(client?: HttpClient) => OperatorDefinition[]` — `[http, graphQL]`; no argument defaults to `new FetchClient()` over global fetch (ruling below) | Options; contract § client contracts                            |
| `sqlOperators`                                                        | `(connection: SqlConnection) => OperatorDefinition[]` — `[sql]`                                                                                   | Options; contract § client contracts                            |
| `FetchClient`, `AxiosClient`                                          | `HttpClient` wrappers                                                                                                                             | contract § client contracts                                     |
| `PostgresConnection`, `SQLiteConnection`                              | `SqlConnection` wrappers _(names: open Q2)_                                                                                                       | contract § client contracts                                     |
| `FigTreeError`, `isFigTreeError`                                      | error class + guard                                                                                                                               | evaluator-methods § FigTreeError                                |
| `ErrorCodes`                                                          | the named error-code vocabulary (`FigTreeErrorCode` is `string`, so this object is the only named list a host can switch on)                      | "`FigTreeError` — the shape the area owns" in evaluator-methods |
| `OperatorFailure`, `isOperatorFailure`                                | the body-side failure class + guard                                                                                                               | "The runtime interface" in the contract                         |
| `isTruthy`, `compareValues`, `renderText`, `resolvePath`, `deepEqual` | engine-parity helpers (ruling below)                                                                                                              | implementation notes § shared one-function requirements         |
| `parsePath`, `WILDCARD`                                               | the path parser, whose output `resolvePath` also accepts, and the wildcard segment that output can contain                                        | "Reference grammar" in [v3-api.md](v3-api.md)                   |
| `ARRAY`, `OBJECT`                                                     | `renderText`'s placeholder strings (`'<array>'`, `'<object>'`)                                                                                    | "Text rendering is one function" in implementation notes        |
| `OPERATOR_CATEGORIES`                                                 | the closed `category` vocabulary, as a value                                                                                                      | "`category` — the closed vocabulary" in the contract            |
| `inspect`                                                             | the compiled-expression inspector (standalone; its report shape is outside semver)                                                                | [inspect](v3-inspect.md)                                        |
| `EvaluationData`                                                      | sentinel value, legal only in a parameter `default`                                                                                               | contract § runtime interface                                    |
| `version`                                                             | string, generated from package.json (also the instance property)                                                                                  | evaluator-methods                                               |

### Ruling: the I/O toolkit lives in the root entry

The assessment sketched a `./clients` subpath; the worked examples were written the other way (`import { FigTree, coreOperators, httpOperators, FetchClient } from 'fig-tree-evaluator'`) — and the worked examples have it right.

- The subpath's only real payoff would be keeping I/O code out of bundles — but that is tree-shaking's job (principle 5 verifies it), and the _security_ layering is already registration's job (principle 1). A `./clients` subpath would split the single most common setup line across two imports to buy nothing that isn't already bought.
- The wrappers are thin adapters over an _injected_ client (contract § client contracts) — `axios`, `pg` etc. are never dependencies, so there is no weight argument either. The v2 discipline (HTTP/SQL clients passed in by the consumer, never bundled) carries over unchanged.

**Considered and rejected: `./clients`.** Revisit only if a wrapper ever grows a real dependency — that, not aesthetics, would be the trigger for quarantining it behind a subpath (or out of the package entirely, as with the dates plugin).

### Ruling: `httpOperators()` defaults to `new FetchClient()` (Carl, July 2026)

The zero-config spelling works on every modern runtime — global `fetch` is universal on the platform floor below:

```ts
const fig = new FigTree({
  operators: [coreOperators, httpOperators()], // fetch-backed http + graphQL
})
```

- **Opt-in by construction is intact**: the visible, deliberate act is registering the factory's output — importing `httpOperators` still gives you nothing, and an instance still can't reach the network unless the host put I/O operators in the array. The Options phrasing ("someone visibly handed it a client") reads as "someone visibly registered the I/O operators"; this extends batch 8's `FetchClient()` no-arg ruling (wrap global fetch; only _implicit_ adoption died) up one level to the factory.
- **No global `fetch` → the no-arg call throws at registration**, loudly, naming the remedy (`httpOperators(new FetchClient(myFetch))` or another client) — the fragment/`defineOperator` registration posture, never a first-evaluation surprise.
- **Only fetch gets this** — it is the one client with an ambient standard global. `AxiosClient` must be handed the axios import (`httpOperators(new AxiosClient(axios))` — the parameter is always an `HttpClient` _instance_, and axios is never our dependency), and `sqlOperators(connection)` stays required: there is no ambient SQL connection to default to.

### Ruling: one `coreOperators` array — no grouped arrays, no per-operator exports

The export-grouping question deferred from Operators (fat `coreOperators` vs lean core + `mathOperators` / `stringOperators`): **fat**. All 40 core operator definitions ship in the one array.

- The weight argument fails on arithmetic: the core operators are small pure functions — the entire set is a rounding error next to any host application, and the only genuinely heavy things (I/O, Intl/dates) are already outside `coreOperators` by construction. Grouping would tax every consumer with registration ceremony (and every doc with "which array is `round` in?") to serve a bundle-size case that doesn't exist.
- The floated constraint — the default core must cover everything v2 had post-conversion, so converted v2 expressions run without extra registration — is satisfied trivially: converted v2 trees can only need core operators (I/O conversion necessarily involves handing over a client, which is registration).
- Regret is asymmetric, as usual: grouped arrays are plain `OperatorDefinition[]` values and can be _added_ later without breaking anything (`coreOperators` would simply be their concatenation); a shipped grouping can never be re-fattened without breaking lean consumers.

**Per-operator named exports** (`import { round } from …`) are also rejected: the canonical names are author-facing words, not JS-facing ones — `if` is a reserved word outright, and `get`, `not`, `map`, `join` are collision bait in any host module — so individual exports would need a renaming scheme (`ifOperator`, …) that forfeits the one thing individual exports are for. A host wanting a minimal registry filters the array (`coreOperators.filter(…)`) — the supported surface (`excludeOperators` removed from v3: Options ruling, July 2026).

### Ruling: engine-parity helpers export from the root

A custom operator must be able to _match core behaviour exactly_ — the same truthiness at a declared truthiness position, the same ordering as `greaterThan`, the same stringification as `buildString`, the same path grammar as `get`. These are one-function requirements ([implementation notes](v3-implementation-notes.md)) with specified semantics; exporting them is what makes the first-class principle practical rather than aspirational, and their unit tests are already contract tests (Phase 1.1). The set: `isTruthy`, `compareValues` (the ordering comparator), `renderText` (the shared stringifier), `resolvePath` (the `$data` path resolver, `strictDataPaths`-flag included) and `deepEqual` (the equality `equal` is specified by, principle 4).

**Ruled (Carl, September 2026, Phase-14 review), resolving open Q3 and widened to every value the root exported at the Phase-14 stock-take.** The rule behind the list: the root carries what hosts and operator-body authors need. Authors of `validate` hooks get their toolbox through the hook's `helpers` argument (src/compile/helpers.ts), so nothing is exported from the root on their account alone. A constant may be exported when its value is already contract, since exporting it then adds no new promise.

- **Kept beside the parity helpers:** `ErrorCodes` (the only named list of codes, `FigTreeErrorCode` being `string`); `isOperatorFailure`, pairing with `isFigTreeError` (under ESM-only `instanceof` works too, so the guard is for symmetry rather than need); `OPERATOR_CATEGORIES`, the `category` vocabulary as a value, which tooling iterates; `parsePath` and `WILDCARD`, since `resolvePath` accepts parsed segments and those segments can contain the wildcard symbol, so the parser's output cannot be read without it; `ARRAY` and `OBJECT`, whose text is already specified as `renderText`'s output.
- **Not exported:** the type checker's functions — `checkType`, `checkConstraints` and `describeType` reach hook authors through `helpers`, and a body never needs them because the engine runs its declared checks, while `isLiteralType`, `isExpectedType` and `validateConstraintsShape` are declaration-checking internals. `isValidatedOperator`, because the contract promises only that the registry trusts the brand, not a way to test for it, and `defineOperator()`'s output is always branded. `trim`, `toCodePoints` and `roundDecimal`, the finer-grained primitives, which stay internal until a concrete author need surfaces. The types those functions use stay exported, as the parameter declarations and the `helpers` signature reference them.

Adding an export later breaks nothing; removing one does. That asymmetry is why anything no host or body needs is left out.

### Ruling: the definition checks shake off; the compiler stays

**Ruled (Carl, September 2026, Phase-14 review)**, settling the split the implementation plan's size notes left to this phase: a consumer that only evaluates was paying for two pieces of authoring-time machinery, the compiler and `defineOperator()`'s checks.

- **The compiler stays in the engine.** Evaluating means compiling first, and `evaluate()` refuses an expression whose static checks find an error, so the compiler is part of what `evaluate()` is. Leaving it out would take shipping precompiled artifacts: a serialised format with its own stability promise, which is a feature rather than a packaging change.
- **`defineOperator()`'s checks shake off.** Nothing in the engine imports `defineOperator`, but every core definition used to call it at module scope, so importing `coreOperators` ran and bundled the whole validator. The package's own definitions — the 40 core operators and the three I/O operators — are instead declared as plain literals and built by an internal, unexported builder (`buildOperator`, src/buildOperator.ts), which does the same normalizing, deriving, fingerprinting, branding and freezing but none of the checks. `defineOperator()` is the checks followed by that same assembly, so a host's own definitions are checked exactly as before, and a host still has one mint.
- **Where the package's definitions are checked.** They are constants, so they cannot change between this repo's CI and a host's import; checking them on every import re-verified the same objects every time. They are checked where a failure stops a release: `test/package-definitions.test.ts` runs each literal through `defineOperator()` and holds the shipped artifact equal to its output, fingerprint and derived fields included, and `codegen/checkDefinitions.ts` runs the checks in `pnpm build`, which `prepublishOnly` runs.
- **Measured** on an engine-only consumer (`FigTree` + `coreOperators`, bundled from `build/` with esbuild, minified): 113.26 → 104.57 kB minified, 31.23 → 29.41 kB brotli. The root bundle itself grows 0.09 kB brotli (128.52 kB minified, 34.38 kB brotli), the cost of the seam. The saving holds only for hosts that define no operator of their own, since `defineOperator` brings the checks back, as it must. The tree-shake fixture asserts it: a validator message is among its markers.

### Types

Grouped by owning doc; packaging adds no shapes of its own, it only fixes what is reachable. All types export from the root — including those whose _values_ live in subpaths, so `./convert` and `./editor-hints` stay data/function modules without private type surfaces.

- **Expressions & nodes**: none. Every method takes `expression: unknown`, because any value evaluates (ruling on open Q4, below).
- **Options**: `FigTreeOptions`, `CacheStore`.
- **Operator contract**: `OperatorDefinition`, the parameter-declaration types, `OperatorContext`, `OperatorFailure` (class doubles as type), `LazyValue`, `PerElement`.
- **Clients**: `HttpClient`, `SqlConnection`.
- **Fragments**: `FragmentDefinition` (+ its parameter-declaration types).
- **Methods & results**: `EvaluationResult`, the report envelope and trace shapes (names reserved; shapes deferred per evaluator-methods), `Issue`, the `getDependencies()` report shape, `FigTreeError` (class doubles as type).
- **Editor hints**: the hint-map type — the documented key convention for definition authors ([v3-operator-parameters.md](v3-operator-parameters.md) § The editor-hints module).

## `./convert`

Exists so that no conversion code can ever ride the runtime bundle again — the direct fix for v2's entanglement finding. Packaging fixes only:

- The subpath name: `fig-tree-evaluator/convert`.
- **Isolation**: the root entry never imports from it (lint-enforced); it _may_ import from the root (it is built on the compiler's normalizer — Phase 15.1) — the dependency arrow points one way.
- Its exports are functions and types only, same module formats and `.d.ts` treatment as the root.
- Contents — `convertV2ToV3` (+ its `ConversionResult` / `ConversionIssue` types) and the v3 shorthand round-trip utilities (`toShorthand` / `fromShorthand`, per the evaluator-methods ruling that these are not instance methods) — are fixed by the **Migration area** ([v3-migration.md](v3-migration.md) § module surface). v1 support is **dropped** (no `convertV1ToV2` here — Migration § v1 ruling).

## `./editor-hints`

Discharges the deferral from the parameter passes ("final name and packaging mechanics → Packaging area"):

- **Name confirmed: `editor-hints`** — self-describing, and the awkwardness of typing it is borne by tooling authors, not expression authors.
- A **data-only module**: two plain typed maps — canonical operator names to display values (colours, per-parameter editor seeds), and `category` values to their presentation (display label, listing position, colour; added at Phase-13 planning, where the field itself was ruled onto the definition). No functions, no engine imports at runtime — type-only imports from the root (e.g. `OperatorCategory`) are fine, since they erase at build.
- The exported map type is the documented key convention for plugin/custom-operator authors who want their definitions to display well in the same tools (settled in the parameters doc; the type itself exports from the root per the Types rule above).
- Co-versioned here rather than in the editor repo so an operator/parameter change and its hint update land in the same PR (rationale recorded in the parameters doc).

## Ruling: no `./internal`

The assessment floated `./internal` for the editor's leftover needs. Examined item by item, the need dissolves:

| v2 editor dependency               | v3 answer                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `standardiseOperatorName`          | dies with the machinery — exact-match canonical names, no case folding (Operators § naming rule 1)                                 |
| `truncateString`                   | a three-line display utility; the editor owns its own                                                                              |
| `dequal`                           | a published package; the editor depends on it directly (principle 4) — the engine's own copy is the vendored `deepEqual` primitive |
| structural/registry checks         | the `isEvaluable()` method; a registry-aware per-node question, if the editor port shows it needs one, is a spec conversation      |
| operator metadata, defaults merged | `getOperators()`                                                                                                                   |
| static diagnostics                 | `validate()`                                                                                                                       |
| display seeds & colours            | `./editor-hints`                                                                                                                   |
| conversion / display modes         | `./convert`                                                                                                                        |

**The editor's sanctioned surface is the public surface.** A `./internal` subpath would be a standing invitation to grow exactly the entanglement v3 is deleting; if the editor genuinely needs something not listed above, that is a spec conversation, not an import path.

## Module format & platform floor

- **ESM-only** (`"type": "module"`, no CJS artifacts — **ruled, Carl, July 2026**, resolving open Q1; supersedes this doc's earlier dual sketch). The deciding argument was not bundle weight but the **dual-load hazard being fatal to v3's identity machinery**: if one process loads both copies (one dependency `require`s, another `import`s), the `defineOperator()` brand symbol, the `EvaluationData` sentinel and `instanceof FigTreeError` all fail across the copy boundary — a class of "impossible" consumer bugs a CJS artifact invites and ESM-only makes structurally impossible. CJS consumers on Node ≥20.19 use native `require(esm)`; older consumers stay on v2.
- **`sideEffects: false`** — kept, and now verified (principle 5). All three entries must be side-effect-free at import time; nothing registers, connects, or mutates globals on import (registration is explicit, per Options).
- **Node floor: `engines: { "node": ">=22" }`** (**ruled, Carl, July 2026**, resolving open Q5 — Node 20 went EOL April 2026, so 22 is the oldest supported LTS; it also guarantees `require(esm)` for the CJS consumers above). Advisory (npm warns, doesn't block); the real commitments are: language target **ES2022**, no down-leveled output, no polyfills, and **no assumed globals beyond the ES standard + `AbortSignal`/`AbortController`**. The one sanctioned global probe is the no-arg `httpOperators()` / `FetchClient()` default reading global `fetch` — at registration, failing loudly there if absent (ruling above). The engine and core operators never touch it, which is what keeps the package runtime-agnostic (Node, Deno, Bun, browsers) without a compatibility matrix: a host without global fetch passes a client.
- **Runtime dependencies: none** (`dequal` vendored as `deepEqual`, Phase 4 — full build, since `dequal/lite` lacks the Date/RegExp branches `equal` specifies). `object-property-extractor` is retired: the v3 path resolver is a new in-repo primitive with deliberately different semantics (null drill-through by default, `[*]` projection, own-enumerable-only — References §3) — depending on the old package would mean overriding most of it. HTTP/SQL client libraries remain dev-only, injected by consumers, never bundled.

Sketch of the resulting manifest (mechanics, not contract — final paths are implementation detail):

```jsonc
{
  "name": "fig-tree-evaluator",
  "version": "3.0.0",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=22" },
  "files": ["build"],
  "main": "./build/index.js", // legacy-resolver fallback only
  "types": "./build/index.d.ts",
  "exports": {
    ".": {
      "types": "./build/index.d.ts",
      "default": "./build/index.js",
    },
    "./convert": {
      "types": "./build/convert/index.d.ts",
      "default": "./build/convert/index.js",
    },
    "./editor-hints": {
      "types": "./build/editor-hints/index.d.ts",
      "default": "./build/editor-hints/index.js",
    },
  },
}
```

The root-entry half of this manifest is live in the repo already (July 2026, the toolchain-modernization pass): `type: module`, `engines >=22`, the ESM-only exports map, and the single-bundle rollup output. The `./convert` / `./editor-hints` subpaths still land at their owning phases.

## Build & CI mechanics

Implementation notes for Phase 14, not contract — free to reshape provided the published surface above holds:

- **Rollup stays** (three inputs, three ESM bundles + three `.d.ts` rollups — halved by the ESM-only ruling); no reason to switch tooling for its own sake. Repo tooling as of the July 2026 modernization pass: pnpm (Carl's call, `packageManager`-pinned), TypeScript 5.9 (TS 6.x deferred until ts-jest / typescript-eslint / @rollup/plugin-typescript declare support), ESLint 9 flat config, Jest 30, tsx for script running (ts-node retired).
- **Two CI checks**, added at Phase 14 and kept forever:
  1. _Tree-shake fixture_: a tiny app importing only `{ FigTree, coreOperators }`, bundled with default settings, asserted to contain no I/O-toolkit, `./convert`, `./editor-hints` or `defineOperator()`-check code (marker-identifier scan). This is principle 5 made executable.
  2. _Size budget_: bundle-size assertion on the root ESM entry. The number is set from measurement at Phase 14; the check existing is the contract, the number is maintenance.
- **Import-direction lint**: root source may not import from `convert/` or `editor-hints/` source (extends the Phase-0.2 `/v2-src` import ban).
- **Codegen disposition**: `getVersion` (package.json → `src/version.ts`) survives, feeding the `version` export/property. `checkDefinitions` joins it in `pnpm build`, running the package's own operator definitions through `defineOperator()`'s checks (ruling above). `buildOperatorAliasReference` **dies** — v2 generated a global alias table because aliases were unbounded; v3's 13 symbolic aliases live in their operators' definitions and the registry builds its lookup at construction (Operators § naming rules).
- **Generated README operator reference**: the metadata-as-single-source commitment (assessment §3.6) lands as repo tooling that renders `getOperators()` output into the README section — a build script, not a package export.

## Publishing & versioning

- Package name unchanged; v3 ships as **`fig-tree-evaluator@3.0.0`**. It's a clean break in content but the same package identity — the Migration area owns the story for what upgrading means.
- **dist-tags**: `latest` moves to 3.x at release; the final 2.x is tagged **`v2`** and maintained fix-only from a `v2.x` maintenance branch. Pre-release 3.x publishes (for editor integration work) go out under **`next`**, never `latest`.
- The frozen in-repo `/v2-src` (Phase 0) is a build/test asset only — excluded from the published package (`files: ["build"]` already guarantees this) and deleted after Phase 16.
- The date/duration plugin is a **separate package** (name TBD with its own area), depending on `fig-tree-evaluator` as a peer and consuming only the public `defineOperator` surface.

## v2 root-export disposition

Every export of v2's `src/index.ts`, accounted for:

| v2 export                                                                | Disposition                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FigTreeEvaluator`                                                       | **Renamed** `FigTree` (evaluator-methods)                                                                                                                                                                                                                                                           |
| `evaluateExpression`                                                     | **Deleted** — evaluator-methods ruling (throwaway instance discards the compile cache; one-liner shown in migration doc)                                                                                                                                                                            |
| `SQLNodePostgres`, `SQLite`                                              | **Replaced** by `SqlConnection` wrappers + `sqlOperators(connection)` (names: open Q2)                                                                                                                                                                                                              |
| `AxiosClient`, `FetchClient`                                             | **Kept** — now implementing the contract's `HttpClient`; the FetchClient `console.log`s die with the no-console principle                                                                                                                                                                           |
| `FigTreeError`, `isFigTreeError`                                         | **Kept** — shape respecified in evaluator-methods                                                                                                                                                                                                                                                   |
| `isFigTreeExpression`, `isOperatorNode`, `isFragmentNode`                | **Deleted** — the registry-aware question is the `isEvaluable()` method, and there is no structural export (Carl, September 2026, Phase-14 review): a guard that cannot consult the registry cannot recognise shorthand, since `{ $plus: [1, 2] }` is an operator node only if `plus` is registered |
| `isAliasString`                                                          | **Deleted** — v2 alias nodes died; `vars` is grammar, not string convention                                                                                                                                                                                                                         |
| `isObject`                                                               | **Deleted** — generic utility, never our contract                                                                                                                                                                                                                                                   |
| `preProcessShorthand`                                                    | **Deleted** — normalization is compile-internal; round-trip utilities live in `./convert`                                                                                                                                                                                                           |
| `standardiseOperatorName`                                                | **Deleted** — no case folding, no alias machinery                                                                                                                                                                                                                                                   |
| `truncateString`                                                         | **Deleted** — editor-owned display concern                                                                                                                                                                                                                                                          |
| `convertToShorthand`, `convertFromShorthand`                             | **Moved & reshaped** → `./convert` as `toShorthand` / `fromShorthand` (Migration area § module surface)                                                                                                                                                                                             |
| `convertV1ToV2`, `isV1Node`                                              | **Deleted** — v1 support dropped from v3; v1 holdouts convert via still-published v2 first (Migration area § v1 ruling)                                                                                                                                                                             |
| `dequal` re-export                                                       | **Deleted** — principle 4                                                                                                                                                                                                                                                                           |
| `Operator` (name union)                                                  | **Deleted** — operator names are open-ended (custom operators), so a name is a `string`, as `operatorDefaults` already types it                                                                                                                                                                     |
| `OperatorAlias`                                                          | **Deleted** — aliases are per-definition metadata, not a public type                                                                                                                                                                                                                                |
| `FigTreeOptions`                                                         | **Kept** — new shape (Options)                                                                                                                                                                                                                                                                      |
| `FigTreeConfig`                                                          | **Deleted** — died with `getConfig()`                                                                                                                                                                                                                                                               |
| `EvaluatorNode`                                                          | **Deleted** — every method takes `expression: unknown` (ruling on open Q4)                                                                                                                                                                                                                          |
| `OperatorNode`, `FragmentNode`                                           | **Deleted** — a node shape type could describe only the canonical form, not shorthand (ruling on open Q4)                                                                                                                                                                                           |
| `Fragment`, `Fragments`, `FragmentMetadata`, `FragmentParameterMetadata` | **Replaced** by `FragmentDefinition` + its declaration types (Fragments)                                                                                                                                                                                                                            |
| `EvaluatorOutput`, `OutputType`                                          | **Deleted** — result vocabulary is evaluator-methods'; `outputType` died into `convert`                                                                                                                                                                                                             |
| `OperatorData`, `OperatorMetadata`, `OperatorParameterMetadata`          | **Replaced** by `OperatorDefinition` + parameter-declaration types (contract)                                                                                                                                                                                                                       |
| `CustomFunctionMetadata`, `FunctionDefinition`, `UnknownFunction`        | **Deleted** — the functions tier is gone                                                                                                                                                                                                                                                            |
| `GraphQLConnection`                                                      | **Deleted** — `graphQL` rides `httpOperators` + the `graphQL` options block                                                                                                                                                                                                                         |
| `BasicType`, `LiteralType`, `ExpectedType`                               | **Replaced** by the contract's metadata type vocabulary types                                                                                                                                                                                                                                       |

## Open questions

1. **ESM-only instead of dual?** — **resolved (Carl, July 2026): ESM-only.** The clincher was the dual-load hazard against v3's identity machinery (brand symbol, `EvaluationData` sentinel, `instanceof FigTreeError` — see Module format & platform floor); the "two migrations in one" concern was accepted as the cost of a major that already asks for expression rewrites. `require(esm)` on Node ≥20.19 covers CJS consumers.
2. **SQL wrapper names** — **resolved (Carl, September 2026, at Phase-9.2 implementation).** `PostgresConnection` / `SQLiteConnection` as proposed, and **both ship in-package**: each is about fifteen lines with no dependency of its own (the drivers' types are declared structurally rather than imported, so `pg` and `sqlite` stay out of the emitted `.d.ts`), and the Northwind fixtures for both are already in the repo. **Classes, with `new`, across all four wrappers** — matching the worked examples, which already say `new FetchClient()` in three places. The compile-time conformance check turned out to be available either way (a factory annotated `: HttpClient` checks at the definition site exactly as `implements` does), so what decided it was that `new` reads as construction for things holding a connection, and that subclassing is a real extension path. Methods are arrow class fields, so a torn-off `const { request } = client` keeps its instance.
3. **The engine-parity helper list** — **resolved (Carl, September 2026, Phase-14 review)**, widened to the whole root value list. The names stand as proposed, plus `deepEqual`; the finer primitives stay internal. Kept beside them: `ErrorCodes`, `isOperatorFailure`, `OPERATOR_CATEGORIES`, `parsePath` + `WILDCARD`, `ARRAY` / `OBJECT`. Not exported: the type checker's functions, `isValidatedOperator`, `trim` / `toCodePoints` / `roundDecimal`. Reasoning in "Ruling: engine-parity helpers export from the root".
4. **The public name of the expression-input type** — **resolved (Carl, September 2026, Phase-14 review): there is no expression type**, and no node or name types either (`OperatorNode`, `FragmentNode`, `OperatorName`). Every method takes `expression: unknown`, and that is the true domain: any value evaluates, and JS-authored expressions may carry non-plain objects as opaque constants. A JSON type would reject those, and would also reject a host interface that lacks an index signature. The only honest alias, `type FigTreeExpression = unknown`, would add nothing, since TypeScript shows `unknown` in hovers and errors regardless. Node shape types could describe only the canonical form, not shorthand, which is the limit that ruled out the structural guards. Operator names are `string` because custom operators make the set open. Adding any of these later breaks nothing.
5. **Node floor: 20 or 22?** — **resolved (Carl, July 2026): `>=22`.** Node 20 went EOL April 2026, so 22 is the oldest supported LTS; it also buys `require(esm)` universality for Q1's ESM-only ruling.
6. **Publish automation.** v2 publishes manually via `prepublishOnly`. Worth moving to CI trusted publishing (provenance attestation, tag-triggered) as part of Phase 14, or keep manual? Low stakes, decide once.
7. **`next`-tag pre-releases for the editor.** The sketch assumes the editor integrates against `3.0.0-next.*` pre-releases during Phases 13–15 — confirm that workflow suits the editor repo, or whether a workspace/link setup replaces it.

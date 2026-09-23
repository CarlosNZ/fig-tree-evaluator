# Phase 14 — packaging: stock-take and proposed work

_Temporary working file for Phase 14 of [the implementation plan](docs-dev/v3-specs/v3-implementation-plan.md), whose Phase 14 entry links here. Delete it when the phase closes; rulings go into [v3-packaging.md](docs-dev/v3-specs/v3-packaging.md) and the plan, not here. Stock-take taken 2026-09-24 on `v3.0-dev` at `b2397ab`._

**In short:** the root entry is mostly in place, and tree-shaking already works. Still to do: the `./editor-hints` module, a build that can produce more than one entry point, the two CI checks the spec promises, a check of what the root actually exports against the spec's list, and rulings on the packaging spec (it's still marked "awaiting review").

## Already done

- **Manifest and format.** The package is ESM-only with `sideEffects: false`, `engines >=22`, `files: ["build"]` and an `exports` map for the root only ([package.json](package.json)). Packaging questions 1, 2 and 5 are resolved.
- **Root entry.** [src/index.ts](src/index.ts) exports everything the runtime needs: `FigTree`, `defineOperator`, `coreOperators` (40), both I/O factories, all four client classes, `FigTreeError`, `EvaluationData`, `OperatorFailure`, `inspect`, the primitives and `version`. There are no runtime dependencies.
- **Size reporting.** The size report prints on every build ([codegen/bundleSize.mjs](codegen/bundleSize.mjs)), and every PR gets a size-diff comment ([.github/workflows/pr-bundle-size.yml](.github/workflows/pr-bundle-size.yml)).
- **Tree-shaking works, but nothing enforces it yet.** A consumer bundled with esbuild (`--bundle --format=esm --minify --platform=neutral`) against the published `build/index.js`:

  | Consumer imports                 | minified | brotli  |
  | -------------------------------- | -------- | ------- |
  | `FigTree` + `coreOperators` only | 113.3 kB | 31.2 kB |
  | everything (`import *`)          | 127.3 kB | 35.2 kB |

  The same engine-only consumer bundled from `src/` with an esbuild metafile shows no module from `src/inspect`, `src/clients` or `src/operators/io` in the output. Where the engine-only bundle's bytes go: `src/compile` 25%, `src/operators` 20%, `src/evaluate` 18%, `defineOperator.ts` 11%.

- **CJS consumers.** A CJS file can `require()` the build on Node 22.21.

## Proposed chunks

### 14.0 · Finish the spec review (done)

Rule on the open questions (3, 4, 6, 7) plus the new ones listed under [Decisions](#decisions), and write the rulings back into [v3-packaging.md](docs-dev/v3-specs/v3-packaging.md) before building.

### 14.1 · Bring the root exports into line with the spec

- The root exports 37 values, and 17 of them aren't in the spec's list:
  - `checkType`, `checkConstraints`, `describeType`, `isLiteralType`, `isExpectedType`, `validateConstraintsShape`
  - `ErrorCodes`, `isValidatedOperator`, `OPERATOR_CATEGORIES`, `isOperatorFailure`
  - `ARRAY`, `OBJECT`, `WILDCARD`, `parsePath`
  - `trim`, `toCodePoints`, `roundDecimal`

  The spec's principle 3 says everything exported is contract, so each one either gets added to the list or is removed.

- **An exports test.** It checks the root's exported names against the spec's list exactly, so any deleted v2 export that reappears fails it without the test having to name one.
- **Comment cleanup.** Rewrite the file's comments: the header still says "Phase-0 skeleton … exposes only the version", and one comment says packaging is "deferred to Phase 14 … for now".

### 14.1a · Tree-shakeable definition checks (done)

Decision 4. The core and I/O definitions are `declareOperator()` literals built by the internal `buildOperator` ([src/buildOperator.ts](src/buildOperator.ts)), which skips the checks. They're checked by [test/package-definitions.test.ts](test/package-definitions.test.ts) (each shipped artifact equals `defineOperator()`'s output) and by [codegen/checkDefinitions.ts](codegen/checkDefinitions.ts) in `pnpm build`. Engine-only consumer: 31.23 → 29.41 kB brotli.

### 14.2 · `./editor-hints` (module and drift tests built; the build entry is 14.3)

- Create `src/editor-hints/index.ts` with two typed maps:
  - operator name → colours, per-parameter seeds and probably a display name;
  - category → label, position in listings, colour.
- **Content sources:**
  - Colours and display names come from `src/operatorDisplay.ts` in [fig-tree-editor-react](https://github.com/CarlosNZ/fig-tree-editor-react), which is keyed by v2 names.
  - Seeds come from the `default`s in v2's `data.ts` files under [v2-src/operators](v2-src/operators).
  - The v3 operators that have no v2 counterpart need new colours.
  - The category labels already exist in the `GROUPS` table in [codegen/buildOperatorReference.ts](codegen/buildOperatorReference.ts), which still says `special` where the contract says `other`.
- **Types:** the map types are exported from the root, and editor-hints imports types only.
- **Tests that catch drift:**
  - every key names a registered operator;
  - every seed names a declared parameter and passes `checkType` against its declared type;
  - the category map covers exactly the values in `OPERATOR_CATEGORIES`.

### 14.3 · Build more than one entry point

- **One rollup pass with several inputs, so shared code goes into shared chunks. Not one config per entry.** At Phase 15, `./convert` will import compiler internals. A bundle built separately for it would carry its own copy of the `defineOperator` brand symbol, `EvaluationData` and `FigTreeError`. That is the same failure as loading two copies of the package, which the ESM-only ruling was made to prevent. Editor-hints shares no runtime code, but the build should be right before Phase 15 needs it.
- **Checking the shared chunk:** nothing in Phase 14 imports the root's runtime from a subpath (editor-hints imports types only). Confirm the config with a throwaway entry that imports `FigTreeError`, check rollup emits a shared chunk, and don't commit the entry. Phase 15.1 asserts it for real.
- **Declarations:** one `.d.ts` rollup per entry point.
- **`exports`:** add `./editor-hints` to the map.
- **Stale config:** remove `external: ['dequal', 'dequal/lite']` and its "one runtime dependency" comment from [rollup.config.mjs](rollup.config.mjs).
- **Size report:** make [codegen/bundleSize.mjs](codegen/bundleSize.mjs) chunk-aware (today it assumes a single chunk) and driven by a list of entries. The PR comment then updates itself.

### 14.4 · The two CI checks and the lint rules

- **Tree-shake fixture.** It bundles the published `build/` with default settings and scans the output for marker strings.
  - Markers have to be string literals such as error messages, because minification renames classes and functions. Searching for a name like `FetchClient` would pass even if the code were there.
  - Each marker is first checked to be present in an `import *` bundle, so a marker that a refactor removed fails the check instead of passing it.
  - The fixture asserts that the I/O toolkit, the inspector (carried in from Phase 13, "Open" in [v3-inspect.md](docs-dev/v3-specs/v3-inspect.md)), `defineOperator()`'s checks (14.1a; a validator message such as "is named for the '…Default' family" is a usable marker) and both subpaths are absent.
- **Size budget.** Add a threshold on the root entry's brotli size, and probably on the engine-only fixture too, run as `bundleSize.mjs --check`. Set the number from what we measure now plus a small margin.
- **Import-direction lint.** Extend `no-restricted-imports` in [eslint.config.mjs](eslint.config.mjs): the root source may not import `editor-hints/` or `convert/`, and editor-hints may use type-only imports only (`allowTypeImports`).
- **Globals check.** The library tsconfig includes `@types/node`, so an accidental Node-only global would compile without complaint. Typechecking `src` with only the ES2022 library and no ambient types shows that, beyond the sanctioned `AbortSignal`/`AbortController`, it uses:
  - `setTimeout` / `clearTimeout`
  - `performance` (trace timings)
  - `URL` / `URLSearchParams` (HTTP query assembly)

  All of these exist on every runtime we target, but the spec's list ("no assumed globals beyond the ES standard + `AbortSignal`/`AbortController`") is incomplete. Amend the spec, and enforce the list with a small ambient declaration file.

- **Pack smoke test (recommended).** Run `pnpm pack`, install the tarball in a temp directory, then import each entry point by package name and `require()` it from CJS. This tests `exports`, `files` and `sideEffects` exactly as a consumer sees them.

### 14.5 · Publishing and housekeeping

- **Publishing (done):** `pnpm release [--dry-run]` ([codegen/release.mjs](codegen/release.mjs)); betas are `-beta.N` under `beta`. Q6 and Q7 resolved in the packaging spec. CI trusted publishing stays a later improvement.
- **Stale files:**
  - [tsconfig.json](tsconfig.json)'s comments still mention yarn, a ts-node block and Node >= 20.
  - [CLAUDE.md](CLAUDE.md)'s "Generated files" section describes the v2 alias table.
  - `buildOperatorAliasReference` is due to die anyway (packaging, "Codegen disposition").
- **Reference generator:** [codegen/buildOperatorReference.ts](codegen/buildOperatorReference.ts) reads section labels and order from `categoryHints`, each operator's section from its definition's `category`, and order within a section from `coreOperators`. That deletes the hand-maintained `CANONICAL` table and `GROUPS`' labels (the duplication flagged at Phase 13, [v3-implementation-plan.md](docs-dev/v3-specs/v3-implementation-plan.md) 13.x close-out), keeping only the one-line section notes and `literal`'s `PENDING` entry. Visible on the page: "Special" becomes "Other", "String" becomes "Strings", `abs` follows `ceil`.

## Decisions

| Decision                                                                                      | Recommendation                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q3, widened to the 17 unlisted exports                                                        | Keep `ErrorCodes`, `isOperatorFailure`, `parsePath` + `WILDCARD`, `ARRAY` / `OBJECT`, `OPERATOR_CATEGORIES`. Drop the six type-checker functions (hook authors already get the useful ones via `helpers`), `trim` / `toCodePoints` / `roundDecimal`, and `isValidatedOperator`. The spec's own argument applies: adding an export later breaks nothing, removing one does. |
| Structural node guards                                                                        | Keep them, recognising the canonical form only, and document that limit.                                                                                                                                                                                                                                                                                                   |
| Q4, the expression type                                                                       | Name it `FigTreeExpression`. But first decide what it is: every JSON value evaluates, and a strict JSON type rejects host interfaces that lack index signatures. So it's probably a documented alias, not a narrowing of what the methods accept.                                                                                                                          |
| Split `compile` / `defineOperator` out of the engine (flagged in the plan's size notes)       | Don't split for 3.0. They are 25% and 11% of the engine-only bundle. The static gate is part of how `evaluate()` behaves, and splitting it out would be a big architectural change to save about 10 kB brotli. Let the size budget watch it.                                                                                                                               |
| Scaffold `./convert` now?                                                                     | No. Don't ship an empty subpath. Make the build, the size report and the fixture list-driven so Phase 15 adds one entry.                                                                                                                                                                                                                                                   |
| Display names in editor-hints; colours for new operators                                      | Include display names. Carl chooses the colours, or Claude proposes a palette per category.                                                                                                                                                                                                                                                                                |
| `engines`                                                                                     | Change to `>=22.12`. The spec says `>=22` guarantees `require(esm)`, but that only became unflagged in 22.12. The alternative is to reword the spec.                                                                                                                                                                                                                       |
| Q6 publishing                                                                                 | Tag-triggered CI publishing with provenance: pre-releases for the editor will be frequent.                                                                                                                                                                                                                                                                                 |
| Q7 editor workflow                                                                            | Publish `3.0.0-next.N` under the `next` tag. The editor still does `export * from 'fig-tree-evaluator'` and imports six v2 names (`EvaluatorNode`, `Operator`, `OperatorAlias`, `isObject`, …), so porting it is a real job that needs something published to build against.                                                                                               |
| Rewriting the README and its generated operator reference (packaging, "Build & CI mechanics") | Not Phase 14. The README is entirely v2, and the plan has no docs or release phase, so add a release-prep phase: README, the 3.0.0 CHANGELOG entry, the migration guide, and cutting the `v2.x` maintenance branch (it doesn't exist yet).                                                                                                                                 |

## Closing the phase

Per the plan's working rules: the bundle-size row(s), `src/dev/phase14_showcase.ts`, and re-running the 16a benchmarks against the packaged build (the plan asks for this before those numbers become the release-notes story).

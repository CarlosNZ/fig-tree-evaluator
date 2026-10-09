# Import map

Every import the package offers, grouped by the bundle it comes from, with what each one costs a consumer. The export lists themselves are contract, held by `test/exports.test.ts` to "The root entry" in [v3-specs/v3-packaging.md](v3-specs/v3-packaging.md). This page adds the part no test records: which imports pull in which code.

**Keep it current.** Update this page whenever an export is added, removed or moved, an entry point is added, or a change moves one of the sizes noticeably. Entries marked PLANNED are specified but not built yet. The tree in "What shares what" is generated: `pnpm size:imports --write` re-measures it and rewrites it in place. The figures in the import list are written by hand, and `pnpm size:imports` prints the tree's figures to check them against.

**How the sizes are measured.** After `pnpm build`, each import is bundled alone from the built files (`import { X } from '<repo>/build/index.js'; console.log(X)`), using esbuild with `bundle`, `minify` and `format: 'esm'`. The figure is the brotli size of that output. That is roughly what a consumer's bundler ships for that import alone. esbuild is used rather than rollup because, like webpack, it relies on `/*#__PURE__*/` annotations, whereas rollup's own purity analysis flatters the result. `pnpm size:imports` measures the same way. Re-measured October 2026, at the bundle review that moved the package operators' descriptions into `./editor-hints`: every figure on this page. The `./catalog` block was re-measured with #243, which renamed that subpath and added `getCatalog`.

<!-- prettier-ignore -->
```ts
// ═══ Root: 'fig-tree-evaluator' → build/index.js ═════════════════════════
// Published as one file over two chunks: the engine, which it shares with
// ./authoring, and the small modules it shares with ./format (both below).
// A consumer's bundler has to shake them, which works because nothing at
// their top level has a side effect a bundler cannot rule out (#193;
// `pnpm check:package` guards it). Everything imported (35.5 kB) is the
// ceiling.

// ── The engine tree: 29.2 kB ─────────────────────────────────────────────
import { FigTree } from 'fig-tree-evaluator'
// The whole runtime: registry, compiler, validate(), evaluator, caches,
// fragments and trace. coreOperators is part of it, since FigTree
// registers the core set itself, so FigTree + coreOperators is also
// 29.2 kB. No operator's description is in it: an operator's text lives
// in its ./catalog listing, which getCatalog joins with getOperators().
import { coreOperators } from 'fig-tree-evaluator'

// ── Add-ons on top of the engine ─────────────────────────────────────────
import { defineOperator } from 'fig-tree-evaluator'
// +3.1 kB: the definition checks, for hosts registering custom operators
import { inspect } from 'fig-tree-evaluator'
// +1.0 kB: the compiled-expression inspector
import { httpOperators, sqlOperators } from 'fig-tree-evaluator'
// +1.6 kB for HTTP with FetchClient; +0.80 kB for SQL with PostgresConnection
import { FetchClient, AxiosClient, PostgresConnection, SQLiteConnection } from 'fig-tree-evaluator'
// +0.15 to 0.4 kB each: thin adapters; axios / pg / sqlite are the host's
// Without the engine, as a tool that only reads definitions would import
// them: coreOperators 7.5 kB, defineOperator 6.4 kB, httpOperators 4.7 kB,
// sqlOperators 3.0 kB. inspect alone is 3.3 kB, but it reads a handle, and
// only FigTree makes one.

// ── Small values ─────────────────────────────────────────────────────────
import { version } from 'fig-tree-evaluator' // 0.04 kB
import { FigTreeError, isFigTreeError, ErrorCodes } from 'fig-tree-evaluator' // 0.92 kB
// ErrorCodes alone is 0.58 kB
import { OperatorFailure, isOperatorFailure } from 'fig-tree-evaluator' // 0.14 kB
import { httpFailure, sqlFailure } from 'fig-tree-evaluator' // 0.92 kB
// The failures a custom client throws, so its operator passes their codes
// through. Mostly ErrorCodes, which they read the codes from: beside the
// engine the two add 0.13 kB
import { EvaluationData, OPERATOR_CATEGORIES } from 'fig-tree-evaluator' // 0.10 kB
import {
  // The engine-parity helpers, so custom operators match core behaviour:
  // 1.3 kB together. Alone, isTruthy is 0.06 kB, renderText 0.11 kB,
  // compareValues 0.19 kB, deepEqual 0.43 kB, parsePath 0.47 kB and
  // resolvePath (which parses) 0.73 kB
  isTruthy, compareValues, renderText, ARRAY, OBJECT,
  parsePath, resolvePath, WILDCARD, deepEqual,
} from 'fig-tree-evaluator'

// ── Types only: 0 kB ─────────────────────────────────────────────────────
import type {
  // The instance
  CompiledExpression, CallOptions, EvaluationOptions, EvaluationResult, FigTreeOptions,
  Merge, NoOptions, OnlyCallOptions, OptionsUpdate, ResultShape, CacheStore,
  Dependencies, FragmentInfo, OperatorInfo, ParameterInfo,
  FragmentDefinition, FragmentParameter, FragmentParameterDeclaration,
  // Errors, diagnostics and trace
  FigTreeErrorInit, FigTreeErrorCode, FallbackError, FallbackErrorCode, Issue, ValidationResult,
  Severity,
  TraceNode, TraceKind, TraceStatus, KnownTraceEvent, CacheTraceEvent, RequestTraceEvent,
  QueryTraceEvent, RenderTraceEvent, KeyOverwriteTraceEvent, ShieldedFallbackTraceEvent,
  // Authoring operators
  OperatorDefinition, ParameterDeclaration, ParameterDeclarations, ValidatedOperatorDefinition,
  ValidatedParameter, OperatorCategory, EvaluationMode, NullPolicy, NullPolicyValue,
  ConditionalNullPolicy, CompiledNullPolicy, OperatorEvaluate, OperatorValidate, ValidateFinding,
  BasicType, LiteralType, ExpectedType, Constraints, TypeDeclaration, TypeCheckResult,
  ValidateHelpers, OperatorFailureInit, OperatorContext, LazyValue, PerElement, Settlement,
  SettlementStream, TraceEvent, ResolvedParams, ParamValue, TypeOf,
  PathSegment, Wildcard, ResolveResult,
  // I/O
  HttpClient, HttpRequest, SqlConnection, SqlRequest, HttpFailureInfo,
  FetchLike, FetchResponseLike, AxiosLike, AxiosErrorLike, PgClientLike, SqliteDatabaseLike,
  // The inspector
  InspectDependencies, InspectIssue, InspectNode, InspectReport,
  // The subpaths' shapes, kept at the root so the subpaths stay small
  CategoryListing, CategoryListingMap, FragmentListing, OperatorListing, OperatorListingMap,
  TypeSeeds, Catalog, CatalogCategory, CatalogOperator, CatalogParameter, CatalogFragment,
  CatalogFragmentParameter,
  FragmentMigrationResult, MigrationIssue, MigrationResult, V2Options,
  CanonicalOptions, NameOptions, Registry, ShorthandOptions, Spelling,
  ObjectClass, PositionalLayout, PositionalShape, ReferenceRecognition, ReferenceNamespace,
  FallbackCoverage, FallbackCoverageOptions, CoverageFinding, CoveredFinding,
  OperatorAnalysis, FailureRule, FailureTest, DeclaredOutput,
} from 'fig-tree-evaluator'

// ═══ 'fig-tree-evaluator/migrate' → build/migrate/index.js: 19.6 kB ══════
// Separate from the engine: it shares no runtime code with the root and
// imports only types from it. Neither function pulls in FigTree.
import { migrateV2Expression } from 'fig-tree-evaluator/migrate' // 19.7 kB
import { migrateV2Fragments } from 'fig-tree-evaluator/migrate' // 20.0 kB, mostly shared with the above

// ═══ 'fig-tree-evaluator/catalog' → build/catalog/index.js: 5.0 kB ══════
// How operators and categories are presented, and one function joining it
// into what an instance reports; no engine code at all.
import { operatorListings } from 'fig-tree-evaluator/catalog' // 4.3 kB
// Mostly the core and I/O operators' descriptions, which no definition
// carries, so a host that never shows them never ships them
import { categoryListings } from 'fig-tree-evaluator/catalog' // 0.23 kB
import { typeSeeds } from 'fig-tree-evaluator/catalog' // 0.10 kB
import { getCatalog } from 'fig-tree-evaluator/catalog' // 4.9 kB
// +0.45 kB beside the three: getCatalog(fig, ...listings) is the operators,
// fragments and categories, each with its listing joined in and resolved

// ═══ 'fig-tree-evaluator/format' → build/format/index.js: 6.4 kB ════════
// Takes a FigTree, or its snapshots, as an argument and never imports the
// class. It reads expressions exactly as the compiler does, so it shares a
// few small root modules with the engine: the reference grammar, the shared
// grammar in src/compile/grammar.ts, the type intersection, the path
// parser, FigTreeError and ErrorCodes. The build emits those once, in
// build/chunks/shared.js, which the root and ./authoring import too
// (figures below include it).

// ── The conversions ──────────────────────────────────────────────────────
import { toCanonical } from 'fig-tree-evaluator/format' // 4.5 kB
import { toShorthand } from 'fig-tree-evaluator/format' // 5.1 kB
import { toCanonical, toShorthand } from 'fig-tree-evaluator/format' // 5.4 kB
import { toGet } from 'fig-tree-evaluator/format' // 1.7 kB
import { toReference } from 'fig-tree-evaluator/format' // 2.5 kB

// ── The reading primitives: the compiler's own functions ────────────────
import { classifyObject } from 'fig-tree-evaluator/format' // 0.32 kB
import { positionalLayout } from 'fig-tree-evaluator/format' // 0.15 kB
import { singlePositionalTarget } from 'fig-tree-evaluator/format' // 0.10 kB
import { recognizeReference } from 'fig-tree-evaluator/format' // 1.5 kB
import { typesIntersect } from 'fig-tree-evaluator/format' // 0.30 kB
// All five together: 2.1 kB
// Its types come from the root, listed there under "The subpaths' shapes":
// Registry, Spelling, NameOptions, CanonicalOptions, ShorthandOptions, for
// the conversions; ObjectClass, PositionalShape, PositionalLayout,
// ReferenceRecognition, ReferenceNamespace, ReferenceScope, for the
// primitives.

// ═══ 'fig-tree-evaluator/authoring' → build/authoring/index.js: 40.0 kB ══
// Analyses the compiled tree, so it shares the engine with the root: the
// build emits it once, in build/chunks/engine.js, which the root imports
// too (figures below include it). A caller passes it a FigTree, so the
// engine is in the bundle already, and beside FigTree it costs 11.6 kB:
// the analysis itself.
import { fallbackCoverage } from 'fig-tree-evaluator/authoring' // 40.8 kB alone; +11.6 kB beside FigTree
// Its types come from the root, listed there under "The subpaths' shapes":
// FallbackCoverage, FallbackCoverageOptions, CoverageFinding and
// CoveredFinding for what it takes and returns; OperatorAnalysis,
// FailureRule, FailureTest and DeclaredOutput for a definition's
// `analysis` field.
```

Two shared chunks, under `build/chunks/`, each named by what it holds: `engine.js`, the engine the root shares with `./authoring`, and `shared.js`, the modules listed in `./format`'s block, which all three share. Each module is emitted once, so there is one `FigTreeError` class for every entry. `./migrate` and `./catalog` import only types from the root, so their bundles are fully separate. An entry's size budget (`codegen/entries.mjs`) counts its own file compressed together with the chunks it imports.

## What shares what

Sizes do not add up. Two imports that share code cost less together than their sizes alone, and most of what `fallbackCoverage` costs alone is the engine, which `FigTree` brings anyway. The tree shows the sharing. Each row bundles its parent's imports plus its own, so going down a branch adds imports to one bundle:

- **adds**: what the row's imports cost beside everything above them.
- **total**: the whole bundle so far.
- **alone**: the row's own imports, bundled by themselves. Where it is well above `adds`, the difference is code the row shares with its parent: `defineOperator` alone is more than twice what it adds beside `FigTree`, since the type checks and the operator builder are in the engine already.
- **mostly from**: the source modules of the added code, with their share of it, traced from the minified bundle back to `src/` through sourcemaps.

A set of imports from different branches costs roughly the union of their paths: `FigTree` with `inspect` and `fallbackCoverage` is about the `FigTree` row's total plus both their `adds`. Which rows the tree has is set in `codegen/importTree.mjs`.

<!-- IMPORT_TREE:START -->

Generated by `pnpm size:imports --write` at d6ad520, with uncommitted changes to src/. Sizes in kB, brotli.

```text
                                                              adds  total  alone   mostly from
coreOperators                                                  7.5    7.5    7.5   operators/string 16%, buildOperator 12%, operators/math 12%
└─ FigTree                                                    21.8   29.2   29.2   compile/compile 23%, compile/staticChecks 10%, fragments 7%
   ├─ inspect                                                  1.0   30.3    3.3   inspect/nodes 41%, inspect/index 34%, inspect/values 25%
   ├─ defineOperator                                           3.0   32.2    6.4   defineOperator 75%, analysisCheck 24%
   ├─ httpOperators, FetchClient                               1.6   30.9    4.7   operators/io 39%, operators/ioHelpers 31%, clients/failures 15%
   ├─ sqlOperators, PostgresConnection                        0.78   30.0    3.0   clients/failures 31%, operators/io 27%, operators/ioHelpers 22%
   ├─ toCanonical, toShorthand (./format)                      2.5   31.7    5.5   format/read 43%, format/shorthand 18%, format/walk 15%
   └─ fallbackCoverage (./authoring)                          11.5   40.8   40.8   authoring/walk 25%, authoring/known 23%, authoring/run 16%

defineOperator                                                 6.4    6.4    6.4   defineOperator 42%, typeCheck 15%, analysisCheck 14%

httpOperators, FetchClient                                     4.7    4.7    4.7   buildOperator 23%, operators/io 16%, operators/ioHelpers 13%
└─ sqlOperators, PostgresConnection                           0.53    5.2    3.0   operators/io 34%, clients/sql 26%, operators/ioHelpers 26%

FigTreeError, isFigTreeError, ErrorCodes                      0.98   0.98   0.98   errorCodes 61%, FigTreeError 39%

httpFailure, sqlFailure                                       0.92   0.92   0.92   errorCodes 69%, clients/failures 23%, OperatorFailure 8%

isTruthy, compareValues, renderText, deepEqual, resolvePath    1.3    1.3    1.3   primitives/path 51%, primitives/deepEqual 33%, primitives/ordering 10%

toCanonical (./format)                                         4.5    4.5    4.5   format/read 32%, errorCodes 11%, format/walk 11%
└─ toShorthand (./format)                                     0.92    5.5    5.1   format/shorthand 63%, format/references 27%, compile/references 9%

recognizeReference (./format)                                  1.5    1.5    1.5   errorCodes 40%, compile/references 36%, primitives/path 24%

toGet (./format)                                               1.7    1.7    1.7   errorCodes 35%, compile/references 31%, primitives/path 21%

migrateV2Expression (./migrate)                               19.7   19.7   19.7   migrate/convert 27%, migrate/issues 16%, migrate/normalize 16%
└─ migrateV2Fragments (./migrate)                             0.43   20.2   20.0   migrate/fragments 51%, migrate/convert 31%, migrate/v3Values 18%

operatorListings, categoryListings, typeSeeds (./catalog)      4.5    4.5    4.5   catalog/index 100%
└─ getCatalog (./catalog)                                     0.45    4.9    4.9   catalog/index 100%
```

<!-- IMPORT_TREE:END -->

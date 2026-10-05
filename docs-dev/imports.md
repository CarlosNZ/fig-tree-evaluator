# Import map

Every import the package offers, grouped by the bundle it comes from, with what each one costs a consumer. The export lists themselves are contract, held by `test/exports.test.ts` to "The root entry" in [v3-specs/v3-packaging.md](v3-specs/v3-packaging.md). This page adds the part no test records: which imports pull in which code.

**Keep it current.** Update this page whenever an export is added, removed or moved, an entry point is added, or a change moves one of the sizes noticeably. Entries marked PLANNED are specified but not built yet. The tree in "What shares what" is generated: `pnpm size:imports --write` re-measures it and rewrites it in place. The figures in the import list are written by hand, and `pnpm size:imports` prints the tree's figures to check them against.

**How the sizes are measured.** After `pnpm build`, each import is bundled alone from the built files (`import { X } from '<repo>/build/index.js'; console.log(X)`), using esbuild with `bundle`, `minify` and `format: 'esm'`. The figure is the brotli size of that output. That is roughly what a consumer's bundler ships for that import alone. esbuild is used rather than rollup because, like webpack, it relies on `/*#__PURE__*/` annotations, whereas rollup's own purity analysis flatters the result. `pnpm size:imports` measures the same way. Every figure re-measured October 2026, with `fallbackCoverage`'s rule walk (#217).

<!-- prettier-ignore -->
```ts
// ═══ Root: 'fig-tree-evaluator' → build/index.js ═════════════════════════
// Published as one file over two chunks: the engine, which it shares with
// ./authoring, and the small modules it shares with ./format (both below).
// A consumer's bundler has to shake them, which works because nothing at
// their top level has a side effect a bundler cannot rule out (#193;
// `pnpm check:package` guards it). Everything imported (37.1 kB) is the
// ceiling.

// ── The engine tree: 30.8 kB ─────────────────────────────────────────────
import { FigTree } from 'fig-tree-evaluator'
// The whole runtime: registry, compiler, validate(), evaluator, caches,
// fragments and trace. coreOperators is part of it, since FigTree
// registers the core set itself, so FigTree + coreOperators is also
// 30.8 kB.
import { coreOperators } from 'fig-tree-evaluator'

// ── Add-ons on top of the engine ─────────────────────────────────────────
import { defineOperator } from 'fig-tree-evaluator'
// +2.6 kB: the definition checks, for hosts registering custom operators
import { inspect } from 'fig-tree-evaluator'
// +1.0 kB: the compiled-expression inspector
import { httpOperators, sqlOperators } from 'fig-tree-evaluator'
// +1.8 kB for HTTP with FetchClient; +0.8 kB for SQL with PostgresConnection
import { FetchClient, AxiosClient, PostgresConnection, SQLiteConnection } from 'fig-tree-evaluator'
// +0.15 to 0.4 kB each: thin adapters; axios / pg / sqlite are the host's
// Without the engine, as a tool that only reads definitions would import
// them: coreOperators 9.8 kB, defineOperator 6.1 kB, httpOperators 5.3 kB,
// sqlOperators 3.2 kB. inspect alone is 3.4 kB, but it reads a handle, and
// only FigTree makes one.

// ── Small values ─────────────────────────────────────────────────────────
import { version } from 'fig-tree-evaluator' // 0.18 kB
import { FigTreeError, isFigTreeError, ErrorCodes } from 'fig-tree-evaluator' // 1.0 kB
// ErrorCodes alone is 0.7 kB
import { OperatorFailure, isOperatorFailure } from 'fig-tree-evaluator' // 0.3 kB
import { EvaluationData, OPERATOR_CATEGORIES } from 'fig-tree-evaluator' // 0.2 kB
import {
  // The engine-parity helpers, so custom operators match core behaviour:
  // 1.41 kB together. Alone, isTruthy is 0.18 kB, renderText 0.23 kB,
  // compareValues 0.31 kB, deepEqual 0.54 kB, parsePath 0.59 kB and
  // resolvePath (which parses) 0.84 kB
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
  FigTreeErrorInit, FigTreeErrorCode, Issue, ValidationResult, Severity,
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
  HttpClient, HttpRequest, SqlConnection, SqlRequest,
  FetchLike, FetchResponseLike, AxiosLike, AxiosErrorLike, PgClientLike, SqliteDatabaseLike,
  // The inspector
  InspectDependencies, InspectIssue, InspectNode, InspectReport,
  // The subpaths' shapes, kept at the root so the subpaths stay small
  CategoryHintMap, CategoryHints, FragmentHints, OperatorHintMap, OperatorHints, TypeSeeds,
  FragmentMigrationResult, MigrationIssue, MigrationResult, V2Options,
  CanonicalOptions, NameOptions, Registry, ShorthandOptions, Spelling,
  ObjectClass, PositionalLayout, PositionalShape, ReferenceRecognition, ReferenceNamespace,
  FallbackCoverage, FallbackCoverageOptions,
} from 'fig-tree-evaluator'

// ═══ 'fig-tree-evaluator/migrate' → build/migrate/index.js: 19.5 kB ══════
// Separate from the engine: it shares no runtime code with the root and
// imports only types from it. Neither function pulls in FigTree.
import { migrateV2Expression } from 'fig-tree-evaluator/migrate' // 19.8 kB
import { migrateV2Fragments } from 'fig-tree-evaluator/migrate' // 19.9 kB, mostly shared with the above

// ═══ 'fig-tree-evaluator/editor-hints' → build/editor-hints/index.js: 1.7 kB
// Data only; no engine code at all.
import { operatorHints } from 'fig-tree-evaluator/editor-hints' // 1.46 kB
import { categoryHints } from 'fig-tree-evaluator/editor-hints' // 0.23 kB
import { typeSeeds } from 'fig-tree-evaluator/editor-hints' // 0.10 kB

// ═══ 'fig-tree-evaluator/format' → build/format/index.js: 6.6 kB ════════
// Takes a FigTree, or its snapshots, as an argument and never imports the
// class. It reads expressions exactly as the compiler does, so it shares a
// few small root modules with the engine: the reference grammar, the shared
// grammar in src/compile/grammar.ts, the type intersection, the path
// parser, FigTreeError and ErrorCodes. The build emits those once, in
// build/chunks/shared.js, which the root and ./authoring import too
// (figures below include it).

// ── The conversions ──────────────────────────────────────────────────────
import { toCanonical } from 'fig-tree-evaluator/format' // 4.6 kB
import { toShorthand } from 'fig-tree-evaluator/format' // 5.0 kB
import { toCanonical, toShorthand } from 'fig-tree-evaluator/format' // 5.4 kB
import { toGet } from 'fig-tree-evaluator/format' // 1.8 kB
import { toReference } from 'fig-tree-evaluator/format' // 2.4 kB

// ── The reading primitives: the compiler's own functions ────────────────
import { classifyObject } from 'fig-tree-evaluator/format' // 0.38 kB
import { positionalLayout } from 'fig-tree-evaluator/format' // 0.23 kB
import { singlePositionalTarget } from 'fig-tree-evaluator/format' // 0.19 kB
import { recognizeReference } from 'fig-tree-evaluator/format' // 1.5 kB
import { typesIntersect } from 'fig-tree-evaluator/format' // 0.38 kB
// All five together: 2.1 kB
// Its types come from the root, listed there under "The subpaths' shapes":
// Registry, Spelling, NameOptions, CanonicalOptions, ShorthandOptions, for
// the conversions; ObjectClass, PositionalShape, PositionalLayout,
// ReferenceRecognition, ReferenceNamespace, ReferenceScope, for the
// primitives.

// ═══ 'fig-tree-evaluator/authoring' → build/authoring/index.js: 37.6 kB ══
// Analyses the compiled tree, so it shares the engine with the root: the
// build emits it once, in build/chunks/engine.js, which the root imports
// too (figures below include it). A caller passes it a FigTree, so the
// engine is in the bundle already, and beside FigTree it costs 7.1 kB:
// the analysis itself.
import { fallbackCoverage } from 'fig-tree-evaluator/authoring' // 37.9 kB alone; +7.1 kB beside FigTree
// Its types come from the root, listed there under "The subpaths' shapes":
// FallbackCoverage, FallbackCoverageOptions.
```

Two shared chunks, under `build/chunks/`, each named by what it holds: `engine.js`, the engine the root shares with `./authoring`, and `shared.js`, the modules listed in `./format`'s block, which all three share. Each module is emitted once, so there is one `FigTreeError` class for every entry. `./migrate` and `./editor-hints` import only types from the root, so their bundles are fully separate. An entry's size budget (`codegen/entries.mjs`) counts its own file compressed together with the chunks it imports.

## What shares what

Sizes do not add up. Two imports that share code cost less together than their sizes alone, and most of what `fallbackCoverage` costs alone is the engine, which `FigTree` brings anyway. The tree shows the sharing. Each row bundles its parent's imports plus its own, so going down a branch adds imports to one bundle:

- **adds**: what the row's imports cost beside everything above them.
- **total**: the whole bundle so far.
- **alone**: the row's own imports, bundled by themselves. Where it is well above `adds`, the difference is code the row shares with its parent: `defineOperator` alone is more than twice what it adds beside `FigTree`, since the type checks and the operator builder are in the engine already.
- **mostly from**: the source modules of the added code, with their share of it, traced from the minified bundle back to `src/` through sourcemaps.

A set of imports from different branches costs roughly the union of their paths: `FigTree` with `inspect` and `fallbackCoverage` is about the `FigTree` row's total plus both their `adds`. Which rows the tree has is set in `codegen/importTree.mjs`.

<!-- IMPORT_TREE:START -->

Generated by `pnpm size:imports --write` at 00fcba0. Sizes in kB, brotli.

```text
                                                              adds  total  alone   mostly from
coreOperators                                                  9.8    9.8    9.8   operators/string 18%, operators/math 15%, buildOperator 11%
└─ FigTree                                                    21.0   30.8   30.8   compile/compile 23%, compile/staticChecks 10%, fragments 7%
   ├─ inspect                                                 0.97   31.8    3.4   inspect/nodes 41%, inspect/index 34%, inspect/values 25%
   ├─ defineOperator                                           2.6   33.4    6.1   defineOperator 78%, coverageCheck 21%
   ├─ httpOperators, FetchClient                               1.8   32.6    5.3   operators/io 54%, operators/ioHelpers 28%, clients/http 14%
   ├─ sqlOperators, PostgresConnection                        0.81   31.6    3.5   operators/io 52%, operators/ioHelpers 21%, clients/sql 19%
   ├─ toCanonical, toShorthand (./format)                      2.6   33.3    5.4   format/read 42%, format/shorthand 17%, format/references 16%
   └─ fallbackCoverage (./authoring)                           7.1   37.9   37.9   authoring/walk 28%, authoring/known 23%, authoring/rules 19%

defineOperator                                                 6.1    6.1    6.1   defineOperator 41%, buildOperator 18%, typeCheck 14%

httpOperators, FetchClient                                     5.3    5.3    5.3   buildOperator 25%, operators/io 22%, operators/ioHelpers 11%
└─ sqlOperators, PostgresConnection                           0.72    6.0    3.5   operators/io 51%, clients/sql 20%, operators/ioHelpers 20%

FigTreeError, isFigTreeError, ErrorCodes                       1.0    1.0    1.0   errorCodes 55%, FigTreeError 36%, names 6%

isTruthy, compareValues, renderText, deepEqual, resolvePath    1.4    1.4    1.4   primitives/path 48%, primitives/deepEqual 30%, primitives/ordering 9%

toCanonical (./format)                                         4.6    4.6    4.6   format/read 31%, format/walk 11%, errorCodes 10%
└─ toShorthand (./format)                                     0.83    5.4    5.0   format/shorthand 67%, format/references 25%, compile/references 7%

recognizeReference (./format)                                  1.5    1.5    1.5   errorCodes 36%, compile/references 34%, primitives/path 25%

toGet (./format)                                               1.8    1.8    1.8   errorCodes 29%, compile/references 28%, primitives/path 20%

migrateV2Expression (./migrate)                               19.7   19.7   19.7   migrate/convert 27%, migrate/issues 16%, migrate/normalize 16%
└─ migrateV2Fragments (./migrate)                             0.41   20.2   19.9   migrate/fragments 51%, migrate/convert 31%, migrate/v3Values 18%

operatorHints, categoryHints, typeSeeds (./editor-hints)       1.7    1.7    1.7   editor-hints/index 100%
```

<!-- IMPORT_TREE:END -->

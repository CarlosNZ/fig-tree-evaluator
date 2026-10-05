# Import map

Every import the package offers, grouped by the bundle it comes from, with what each one costs a consumer. The export lists themselves are contract, held by `test/exports.test.ts` to "The root entry" in [v3-specs/v3-packaging.md](v3-specs/v3-packaging.md). This page adds the part no test records: which imports pull in which code.

**Keep it current.** Update this page whenever an export is added, removed or moved, an entry point is added, or a change moves one of the sizes noticeably. Entries marked PLANNED are specified but not built yet.

**How the sizes are measured.** After `pnpm build`, each import is bundled alone from the built files (`import { X } from '<repo>/build/index.js'; console.log(X)`), using esbuild with `bundle`, `minify` and `format: 'esm'`. The figure is the brotli size of that output. That is roughly what a consumer's bundler ships for that import alone. esbuild is used rather than rollup because, like webpack, it relies on `/*#__PURE__*/` annotations, whereas rollup's own purity analysis flatters the result. Measured September 2026, at the #193 fix (after `e6c02cd`); the `./format` block re-measured with its reading primitives (#199, #201), and the engine after the sample-data read sites and fragment result types (#200). `./migrate` re-measured October 2026, with the caching rework (#204), and the root's totals with the removal of report mode (#208). The root and `./authoring` re-measured October 2026, with the engine chunk the two share (#209).

<!-- prettier-ignore -->
```ts
// ═══ Root: 'fig-tree-evaluator' → build/index.js ═════════════════════════
// Published as one file over two chunks: the engine, which it shares with
// ./authoring, and the small modules it shares with ./format (both below).
// A consumer's bundler has to shake them, which works because nothing at
// their top level has a side effect a bundler cannot rule out (#193;
// `pnpm check:package` guards it). Everything imported (36.4 kB) is the
// ceiling.

// ── The engine tree: 30.6 kB ─────────────────────────────────────────────
import { FigTree } from 'fig-tree-evaluator'
// The whole runtime: registry, compiler, validate(), evaluator, caches,
// fragments and trace. coreOperators is part of it, since FigTree
// registers the core set itself, so FigTree + coreOperators is also
// 30.6 kB.
import { coreOperators } from 'fig-tree-evaluator'

// ── Add-ons on top of the engine ─────────────────────────────────────────
import { defineOperator } from 'fig-tree-evaluator'
// +2.0 kB: the definition checks, for hosts registering custom operators
import { inspect } from 'fig-tree-evaluator'
// +1.0 kB: the compiled-expression inspector
import { httpOperators, sqlOperators } from 'fig-tree-evaluator'
// +1.8 kB for HTTP with FetchClient; +0.9 kB for SQL with PostgresConnection
import { FetchClient, AxiosClient, PostgresConnection, SQLiteConnection } from 'fig-tree-evaluator'
// +0.15 to 0.4 kB each: thin adapters; axios / pg / sqlite are the host's
// Without the engine, as a tool that only reads definitions would import
// them: coreOperators 9.9 kB, defineOperator 5.4 kB, httpOperators 5.3 kB,
// sqlOperators 3.3 kB. inspect alone is 3.2 kB, but it reads a handle, and
// only FigTree makes one.

// ── Small values ─────────────────────────────────────────────────────────
import { version } from 'fig-tree-evaluator' // 0.12 kB
import { FigTreeError, isFigTreeError, ErrorCodes } from 'fig-tree-evaluator' // 1.1 kB
// ErrorCodes alone is 0.7 kB
import { OperatorFailure, isOperatorFailure } from 'fig-tree-evaluator' // 0.2 kB
import { EvaluationData, OPERATOR_CATEGORIES } from 'fig-tree-evaluator' // 0.2 kB
import {
  // The engine-parity helpers, so custom operators match core behaviour:
  // 1.45 kB together. Alone, isTruthy is 0.14 kB, renderText 0.19 kB,
  // compareValues 0.26 kB, deepEqual 0.49 kB, parsePath 0.62 kB and
  // resolvePath (which parses) 0.88 kB
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

// ═══ 'fig-tree-evaluator/migrate' → build/migrate/index.js: 20.2 kB ══════
// Separate from the engine: it shares no runtime code with the root and
// imports only types from it. Neither function pulls in FigTree.
import { migrateV2Expression } from 'fig-tree-evaluator/migrate' // 19.8 kB
import { migrateV2Fragments } from 'fig-tree-evaluator/migrate' // 19.9 kB, mostly shared with the above

// ═══ 'fig-tree-evaluator/editor-hints' → build/editor-hints/index.js: 1.7 kB
// Data only; no engine code at all.
import { operatorHints } from 'fig-tree-evaluator/editor-hints' // 1.46 kB
import { categoryHints } from 'fig-tree-evaluator/editor-hints' // 0.23 kB
import { typeSeeds } from 'fig-tree-evaluator/editor-hints' // 0.10 kB

// ═══ 'fig-tree-evaluator/format' → build/format/index.js: 5.9 kB ════════
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
import { toGet } from 'fig-tree-evaluator/format' // 1.9 kB
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

// ═══ 'fig-tree-evaluator/authoring' → build/authoring/index.js: 31.1 kB ══
// Analyses the compiled tree, so it shares the engine with the root: the
// build emits it once, in build/chunks/engine.js, which the root imports
// too (figures below include it). A caller passes it a FigTree, so the
// engine is in the bundle already, and beside FigTree it costs 0.5 kB.
import { fallbackCoverage } from 'fig-tree-evaluator/authoring' // 31.1 kB alone; +0.5 kB beside FigTree
// Its types come from the root, listed there under "The subpaths' shapes":
// FallbackCoverage, FallbackCoverageOptions.
```

Two shared chunks, under `build/chunks/`, each named by what it holds: `engine.js`, the engine the root shares with `./authoring`, and `shared.js`, the modules listed in `./format`'s block, which all three share. Each module is emitted once, so there is one `FigTreeError` class for every entry. `./migrate` and `./editor-hints` import only types from the root, so their bundles are fully separate. An entry's size budget (`codegen/entries.mjs`) counts its own file compressed together with the chunks it imports.

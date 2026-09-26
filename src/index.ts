/**
 * fig-tree-evaluator — the root entry: the whole runtime, and every public
 * type.
 *
 * Everything exported here is contract ("Principles" in
 * docs-dev/v3-specs/v3-packaging.md). The value exports are exactly the
 * inventory in "The root entry" there, which test/exports.test.ts holds this
 * file to; the types follow that doc's "Types" list.
 *
 * The root never imports the `./editor-hints` or `./migrate` subpaths. The
 * types of editor-hints' data are exported here instead, so that subpath
 * stays a data module.
 */
export { version } from './version'

// ── The instance ─────────────────────────────────────────────────────────
export { FigTree } from './FigTree'
// The handle `compile()` returns. Type-only: `compile()` is the one mint,
// and the constructor takes engine internals.
export type { CompiledExpression } from './FigTree'
export type {
  CallOptions,
  EvaluationOptions,
  EvaluationResult,
  FigTreeOptions,
  Merge,
  NoOptions,
  OnlyCallOptions,
  ResultShape,
} from './options'
export type { CacheStore } from './types'
// What the introspection methods return. Assembly stays internal.
export type { Dependencies, FragmentInfo, OperatorInfo, ParameterInfo } from './introspect'
export type {
  FragmentDefinition,
  FragmentParameter,
  FragmentParameterDeclaration,
} from './fragments'

// ── Errors and diagnostics ───────────────────────────────────────────────
export { FigTreeError, isFigTreeError } from './FigTreeError'
export type { FigTreeErrorInit } from './FigTreeError'
export { ErrorCodes } from './errorCodes'
export type { FigTreeErrorCode } from './errorCodes'
export type { Issue, ValidationResult, Severity } from './issues'
export type {
  TraceNode,
  TraceKind,
  TraceStatus,
  KnownTraceEvent,
  CacheTraceEvent,
  RequestTraceEvent,
  QueryTraceEvent,
  RenderTraceEvent,
  KeyOverwriteTraceEvent,
  ShieldedFallbackTraceEvent,
} from './trace'

// ── Operators ────────────────────────────────────────────────────────────
// The brand symbol stays internal: `defineOperator()` is the one public
// mint, so a plain object can never pass for a checked definition.
export { defineOperator } from './defineOperator'
export { coreOperators } from './operators'
export { EvaluationData, OPERATOR_CATEGORIES } from './operatorDefinition'
export type {
  OperatorDefinition,
  ParameterDeclaration,
  ParameterDeclarations,
  ValidatedOperatorDefinition,
  ValidatedParameter,
  OperatorCategory,
  EvaluationMode,
  NullPolicy,
  NullPolicyValue,
  ConditionalNullPolicy,
  CompiledNullPolicy,
  OperatorEvaluate,
  OperatorValidate,
  ValidateFinding,
} from './operatorDefinition'
export type {
  BasicType,
  LiteralType,
  ExpectedType,
  Constraints,
  TypeDeclaration,
  TypeCheckResult,
} from './typeCheck'
// The toolbox a `validate` hook receives — part of that hook's signature.
export type { ValidateHelpers } from './compile/helpers'
// The body side: the failure class a body throws, and what it is handed.
// The evaluator itself is internal; `FigTree.evaluate()` is its face.
export { OperatorFailure, isOperatorFailure } from './OperatorFailure'
export type { OperatorFailureInit } from './OperatorFailure'
export type {
  OperatorContext,
  LazyValue,
  PerElement,
  Settlement,
  SettlementStream,
  TraceEvent,
} from './runtimeInterface'
export type { ResolvedParams, ParamValue, TypeOf } from './inference'

// ── Engine-parity helpers ────────────────────────────────────────────────
// So that a custom operator can match core behaviour exactly: the same
// truthiness, ordering, rendering, path grammar and equality ("Ruling:
// engine-parity helpers export from the root" in v3-packaging.md).
export {
  isTruthy,
  compareValues,
  renderText,
  ARRAY,
  OBJECT,
  parsePath,
  resolvePath,
  WILDCARD,
  deepEqual,
} from './primitives'
export type { PathSegment, Wildcard, ResolveResult } from './primitives'

// ── The I/O toolkit ──────────────────────────────────────────────────────
// In the root entry rather than a `./clients` subpath (packaging ruling):
// the wrappers are thin adapters over an injected driver, so there is no
// weight to quarantine, and capability is gated by registration rather than
// by import path — importing these gives an instance nothing until the
// factories' output is put in the `operators` array.
export { httpOperators, sqlOperators } from './operators/io'
export { FetchClient, AxiosClient, PostgresConnection, SQLiteConnection } from './clients'
export type { HttpClient, HttpRequest, SqlConnection, SqlRequest } from './types'
export type {
  FetchLike,
  FetchResponseLike,
  AxiosLike,
  AxiosErrorLike,
  PgClientLike,
  SqliteDatabaseLike,
} from './clients'

// ── The compiled-expression inspector ────────────────────────────────────
// Standalone, and imported by nothing in the engine, so a bundle that never
// imports it never carries it. The report's shape follows the compiler and
// is outside semver.
export { inspect } from './inspect'
export type { InspectDependencies, InspectIssue, InspectNode, InspectReport } from './inspect'

// ── Editor hints ─────────────────────────────────────────────────────────
// The shapes of the `./editor-hints` subpath's data, and the key convention
// for plugin operators and for a fragment's `metadata`.
export type {
  CategoryHintMap,
  CategoryHints,
  FragmentHints,
  OperatorHintMap,
  OperatorHints,
  TypeSeeds,
} from './editorHintTypes'

// ── Migration ────────────────────────────────────────────────────────────
// The shapes the `./migrate` subpath's two functions take and return.
export type {
  FragmentMigrationResult,
  MigrationIssue,
  MigrationResult,
  V2Options,
} from './migrationTypes'

// ── Format ───────────────────────────────────────────────────────────────
// The shapes the `./format` subpath's four functions take.
export type {
  CanonicalOptions,
  NameOptions,
  Registry,
  ShorthandOptions,
  Spelling,
} from './formatTypes'

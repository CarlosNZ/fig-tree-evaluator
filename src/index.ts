/**
 * fig-tree-evaluator — public entry point.
 *
 * ⚠ v3 rebuild in progress. This is the Phase-0 skeleton
 * (docs-dev/v3-specs/v3-implementation-plan.md): a fresh source tree built up
 * phase by phase, beside the frozen v2 engine kept in /v2-src (excluded from
 * this build; v3 source may never import from it).
 *
 * Today the public surface exposes only the version and the client/cache
 * contracts the test doubles implement. Everything else — `FigTree`,
 * `defineOperator`, `coreOperators`, the I/O factories, `FigTreeError`, guards
 * and helpers — lands in later phases (see docs-dev/v3-specs/v3-packaging.md
 * for the final export inventory).
 */
export { version } from './version'

export type { HttpClient, HttpRequest, SqlConnection, SqlRequest, CacheStore } from './types'

// Phase 1.2 — errors & diagnostics
export { FigTreeError, isFigTreeError } from './FigTreeError'
export type { FigTreeErrorInit } from './FigTreeError'
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
export { ErrorCodes } from './errorCodes'
export type { FigTreeErrorCode } from './errorCodes'
export type { Issue, ValidationResult, Severity } from './issues'

// Phase 1.3 — type vocabulary & checker
export {
  checkType,
  checkConstraints,
  describeType,
  isLiteralType,
  isExpectedType,
  validateConstraintsShape,
} from './typeCheck'
export type {
  BasicType,
  LiteralType,
  ExpectedType,
  Constraints,
  TypeDeclaration,
  TypeCheckResult,
} from './typeCheck'

// Phase 2.1 — operator definitions. The brand symbol itself stays internal:
// `defineOperator()` is the only mint, `isValidatedOperator` the only probe.
export { defineOperator } from './defineOperator'
export { EvaluationData, isValidatedOperator, OPERATOR_CATEGORIES } from './operatorDefinition'

// Phase 13 — the introspection snapshots. Assembly stays internal; the
// shapes are public, being what three methods return.
export type { Dependencies, FragmentInfo, OperatorInfo, ParameterInfo } from './introspect'

// Phase 2.2 — the instance shell. Registry machinery stays internal.
export { FigTree } from './FigTree'
export type { CallOptions, EvaluationOptions, FigTreeOptions, OnlyCallOptions } from './options'
// Phase 12 — the diagnostic surfaces' return shape
export type { EvaluationResult, Merge, NoOptions, ResultShape } from './options'
export type {
  FragmentDefinition,
  FragmentParameter,
  FragmentParameterDeclaration,
} from './fragments'
export type {
  OperatorDefinition,
  ParameterDeclaration,
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
// The toolbox a `validate` hook receives — part of that hook's signature.
export type { ValidateHelpers } from './compile/helpers'

// Phase 1.1 — shared primitives (author-facing helpers). Final subpath /
// editor-hints packaging is deferred to Phase 14; the main barrel carries them
// for now.
export {
  isTruthy,
  compareValues,
  renderText,
  ARRAY,
  OBJECT,
  trim,
  toCodePoints,
  roundDecimal,
  parsePath,
  resolvePath,
  WILDCARD,
} from './primitives'
export type { PathSegment, Wildcard, ResolveResult } from './primitives'

// Phase 4.1 — the evaluator's author-facing surface: the body-side failure
// class and the runtime interface types. The evaluator itself is internal;
// `FigTree.evaluate()` is its face.
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
export type { ParameterDeclarations } from './operatorDefinition'

// Phase 4.2 — the core operators (the eager set so far; later phases add
// their groups) and the deep-equality primitive `equal` is specified by.
export { coreOperators } from './operators'
export { deepEqual } from './primitives'

// Phase 9.2 — the I/O toolkit. It lives in the root entry rather than a
// `./clients` subpath (packaging ruling): the wrappers are thin adapters
// over an injected driver, so there is no weight to quarantine, and
// capability is gated by registration rather than by import path —
// importing these gives an instance nothing until the factories' output
// is put in the `operators` array.
export { httpOperators, sqlOperators } from './operators/io'
export { FetchClient, AxiosClient, PostgresConnection, SQLiteConnection } from './clients'
export type {
  FetchLike,
  FetchResponseLike,
  AxiosLike,
  AxiosErrorLike,
  PgClientLike,
  SqliteDatabaseLike,
} from './clients'

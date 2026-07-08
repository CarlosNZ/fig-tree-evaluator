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

export type { HttpClient, SqlConnection, CacheStore } from './types'

// Phase 1.2 — errors & diagnostics
export { FigTreeError, isFigTreeError } from './FigTreeError'
export type { FigTreeErrorInit, TraceNode } from './FigTreeError'
export { ErrorCodes } from './errorCodes'
export type { FigTreeErrorCode } from './errorCodes'
export type { Issue, ValidationResult, Severity } from './issues'

// Phase 1.3 — type vocabulary & checker
export { checkType, checkConstraints, describeType, isLiteralType } from './typeCheck'
export type {
  BasicType,
  LiteralType,
  ExpectedType,
  Constraints,
  TypeDeclaration,
  TypeCheckResult,
} from './typeCheck'

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

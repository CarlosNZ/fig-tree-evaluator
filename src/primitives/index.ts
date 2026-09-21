/**
 * Shared single-source primitives (Phase 1.1). Each is the one definition of a
 * rule the rest of the engine reuses — refining a rule later is a one-place
 * change. These are also author-facing exports, so their tests are contract
 * tests.
 */
export { isTruthy } from './truthiness'
export { compareValues } from './ordering'
export { renderText, ARRAY, OBJECT } from './renderText'
export { trim, toCodePoints, stripLeadingRun, stripTrailingRun } from './strings'
export { roundDecimal } from './rounding'
export { canonicalSegments, isPathSegment, parsePath, resolvePath, WILDCARD } from './path'
export type { PathSegment, Wildcard, ResolveResult } from './path'
export { deepEqual } from './deepEqual'

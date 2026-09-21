/**
 * `mode: 'report'` — the collection half ("mode: 'report' — the process"
 * in docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * Report mode is the same evaluation with one thing changed: an uncaught
 * failure degrades its HOLE to `null` and is collected, instead of
 * rejecting the call. This module owns what is collected and in what
 * order; ./run.ts owns where the catching happens (the hole boundary) and
 * the class owns the envelope. The split matches Phase 10's — meaning
 * here, policy there.
 *
 * Three rules the shape depends on, each a ruling rather than a detail:
 *
 *   - `path` names the FAILING NODE, `holePath` the hole that degraded.
 *     The engine already gives the first for free — the node wrapper tags
 *     the origin and every enclosing wrapper passes it through untouched —
 *     so all this adds is the second.
 *   - Tree order, never completion order. Every compiled node carries its
 *     preorder position from the parse walk, so ordering is a sort on a
 *     number rather than a comparison of paths.
 *   - One entry per failing hole. Where one error object degrades two
 *     holes — reachable through a memoized `vars` rejection, which two
 *     holes can both demand — the second hole takes a COPY carrying its
 *     own `holePath`, so no entry ever names a hole it did not degrade.
 */
import { FigTreeError, isFigTreeError } from '../FigTreeError'
import { ErrorCodes } from '../errorCodes'
import type { ArtifactHole, NodePath } from '../parse'

export interface ErrorCollector {
  /** Record an uncaught failure against the hole it just degraded. */
  record: (error: unknown, hole: ArtifactHole) => void
  /** Record an error belonging to the evaluation rather than to a hole. */
  add: (error: FigTreeError) => void
  /** Everything collected, in tree order. */
  emit: () => FigTreeError[]
}

/** A collected error, with the sort key that puts it in tree order. */
interface Entry {
  error: FigTreeError
  order: number
}

/**
 * The evaluation-level sort key: after every hole, since the only errors
 * that arrive this way are the kill switch's, which belong at the end.
 */
const LAST = Number.MAX_SAFE_INTEGER

export const createErrorCollector = (): ErrorCollector => {
  const entries: Entry[] = []
  return {
    record: (error, hole) => {
      entries.push({
        error: tagHole(asFigTreeError(error, hole), hole.path),
        order: hole.node.order,
      })
    },
    add: (error) => {
      entries.push({ error, order: LAST })
    },
    // Sorted on emission rather than on insert: holes settle concurrently,
    // so arrival order is exactly what must not survive
    emit: () => [...entries].sort((a, b) => a.order - b.order).map((entry) => entry.error),
  }
}

/**
 * Anything escaping a hole should already be a `FigTreeError` — the node
 * wrapper wraps every body throw. A hole whose root is a *reference* is
 * the case that does not go through a wrapper at all, and `strictDataPaths`
 * makes it throw one directly; this covers whatever else may reach here
 * rather than letting a bare string into `errors`.
 */
const asFigTreeError = (error: unknown, hole: ArtifactHole): FigTreeError => {
  if (isFigTreeError(error)) return error
  const message = error instanceof Error ? error.message : String(error)
  return new FigTreeError({ code: ErrorCodes.operatorFailure, message, path: hole.path })
}

/**
 * Attach the hole, copying where the error already names one. The first
 * hole to tag an error owns it in place — the `anchor()` brand pattern
 * fragments use for the same reason — and a second hole reaching the same
 * instance gets its own copy, so both entries are true.
 */
const tagHole = (error: FigTreeError, holePath: NodePath): FigTreeError => {
  if (error.holePath === undefined) {
    error.holePath = holePath
    return error
  }
  const copy = new FigTreeError({
    code: error.code,
    message: error.message,
    path: error.path,
    holePath,
    ...(error.operator !== undefined ? { operator: error.operator } : {}),
    ...(error.fragment !== undefined ? { fragment: error.fragment } : {}),
    ...(error.fragmentPath !== undefined ? { fragmentPath: error.fragmentPath } : {}),
    ...(error.errorData !== undefined ? { errorData: error.errorData } : {}),
    ...(error.related !== undefined ? { related: error.related } : {}),
    ...(error.cause !== undefined ? { cause: error.cause } : {}),
    ...(error.issues !== undefined ? { issues: error.issues } : {}),
    ...(error.trace !== undefined ? { trace: error.trace } : {}),
  })
  copy.stack = error.stack
  return copy
}

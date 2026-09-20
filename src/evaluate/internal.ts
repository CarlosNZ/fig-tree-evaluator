/**
 * The engine's own bail-outs — everything that cuts through the fallback
 * process untouched: engine-bug errors, cancellation, and the shared
 * answer to "which abort has landed".
 *
 * Engine-bug errors are raised where the static gate should have made a
 * branch unreachable, or where a later phase's machinery is not yet built.
 * Deliberately a plain Error, never a FigTreeError — these are not
 * expression failures and no fallback should catch them.
 *
 * "Should not" needs a mechanism, not just an intention: the node wrapper
 * turns *any* throw into a FigTreeError and hands it to the node's
 * fallback, so an engine bug raised from a parameter subtree would come
 * back as the author's fallback value and the bug would never be seen.
 * Hence the brand, and the wrapper's bail on it.
 */
import { ErrorCodes } from '../errorCodes'
import { FigTreeError } from '../FigTreeError'
import type { EvaluationContext } from './context'

const INTERNAL: unique symbol = Symbol('fig-tree:internal-error')

export const internalError = (message: string): Error =>
  branded(`[fig-tree internal] ${message}`, INTERNAL)

/** True for an engine-bug error: never caught, never wrapped, never shaped. */
export const isInternalError = (error: unknown): boolean => hasBrand(error, INTERNAL)

/**
 * The abandonment marker: a node declined to start because its scope was
 * cancelled — a sibling operand already decided the result, or the body
 * that asked for this work has settled.
 *
 * Cancellation is not failure. Nobody is waiting on an abandoned branch,
 * so this must never be wrapped into a FigTreeError, never reach a
 * `fallback`, and never surface under `mode: 'report'`. It travels the same
 * bail-out as an engine bug for that reason, and for no other.
 */
const CANCELLED: unique symbol = Symbol('fig-tree:cancelled')

export const cancellation = (): Error => branded('[fig-tree] evaluation cancelled', CANCELLED)

export const isCancellation = (error: unknown): boolean => hasBrand(error, CANCELLED)

/**
 * The outcome where an abort has ALREADY landed, or `undefined` where
 * none has. One helper, because three places need the same answer: at the
 * node boundary, before a body starts, and after one throws.
 *
 * The order is the contract's: the caller's kill switch outranks an
 * enclosing scope, because they mean opposite things — a scope abort is
 * silent abandonment, a caller's abort is a decision that cuts through
 * every fallback.
 *
 * `ctx.signal` is a node's effective signal, never its own deadline, so
 * "someone upstream aborted me" stays distinguishable from "my own timer
 * fired".
 */
export const abortedOutcome = (
  ctx: Pick<EvaluationContext, 'signal' | 'rootSignal'>,
  path: (string | number)[],
  operator?: string
): Error | undefined => {
  if (ctx.rootSignal.aborted)
    return new FigTreeError({
      code: ErrorCodes.aborted,
      message: 'evaluation was aborted by the caller',
      path,
      ...(operator !== undefined ? { operator } : {}),
    })
  if (ctx.signal.aborted) return cancellation()
  return undefined
}

// ── The brand mechanism ─────────────────────────────────────────────

type Branded = Record<PropertyKey, unknown>

/** A plain Error carrying `brand` as an own property. */
const branded = (message: string, brand: symbol): Error => {
  const error = new Error(message)
  ;(error as unknown as Branded)[brand] = true
  return error
}

const hasBrand = (error: unknown, brand: symbol): boolean =>
  error instanceof Error && (error as unknown as Branded)[brand] === true

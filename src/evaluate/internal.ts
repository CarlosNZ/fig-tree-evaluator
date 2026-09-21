/**
 * The engine's own bail-outs — everything that cuts through the fallback
 * process untouched: engine-bug errors, cancellation, the kill switch, and
 * the shared answer to "which abort has landed". The MEANING half of
 * cancellation, reading the reason markers ./abort.ts defines: what a
 * given abort implies for the node that noticed it.
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
import { FigTreeError, isFigTreeError } from '../FigTreeError'
import { EVALUATION_TIMEOUT, SCOPE_SETTLED } from './abort'
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

type Path = (string | number)[]

/**
 * The outcome where an abort has ALREADY landed, or `undefined` where
 * none has. One helper, because three places need the same answer: at the
 * node boundary, before a body starts, and after one throws.
 *
 * The order is the contract's: the root outranks an enclosing scope,
 * because they mean opposite things — a scope abort is silent
 * abandonment, the kill switch is a decision that cuts through every
 * fallback.
 *
 * `ctx.signal` is a node's effective signal, never its own deadline, so
 * "someone upstream aborted me" stays distinguishable from "my own timer
 * fired".
 */
export const abortedOutcome = (
  ctx: Pick<EvaluationContext, 'signal' | 'rootSignal'>,
  path: Path,
  operator?: string
): Error | undefined => {
  if (ctx.rootSignal.aborted) return rootOutcome(ctx.rootSignal.reason, path, operator)
  if (ctx.signal.aborted) return cancellation()
  return undefined
}

/**
 * What the root's abort means at a node boundary. The root scope settles
 * with the evaluation like any node scope, so a check landing after the
 * call has returned is silent abandonment, exactly as under a node scope.
 * Any other reason is the kill switch.
 */
const rootOutcome = (reason: unknown, path: Path, operator: string | undefined): Error =>
  reason === SCOPE_SETTLED ? cancellation() : killSwitchError(reason, path, { operator })

/**
 * The kill switch as an error: the whole-evaluation `timeout`, told apart
 * by its reason marker, else the caller's `signal`. Built at the root
 * (path `[]`, naming the budget) for the error the caller receives, and at
 * a node boundary as the vehicle that carries the abort up through the
 * fallback process untouched — the root's rejection wins that race, so a
 * node-level one is never the error a caller sees.
 */
export const killSwitchError = (
  reason: unknown,
  path: Path,
  detail: { operator?: string; ms?: number } = {}
): FigTreeError => {
  const { operator, ms } = detail
  const timedOut = reason === EVALUATION_TIMEOUT
  const budget = ms === undefined ? '' : `${ms}ms `
  return new FigTreeError({
    code: timedOut ? ErrorCodes.timeout : ErrorCodes.aborted,
    message: timedOut
      ? `evaluation exceeded its ${budget}timeout`
      : 'evaluation was aborted by the caller',
    path,
    ...(operator !== undefined ? { operator } : {}),
  })
}

/** The kill switch, `timeout` or `signal`: no fallback may answer it. */
export const isKillSwitch = (error: unknown): boolean =>
  isFigTreeError(error) && (error.code === ErrorCodes.aborted || error.code === ErrorCodes.timeout)

// ── The brand mechanism ─────────────────────────────────────────────

type Branded = Record<PropertyKey, unknown>

/** A plain Error carrying `brand` as an own property. */
const branded = (message: string, brand: symbol): Error => {
  const error = new Error(message)
  brand_(error, brand)
  return error
}

/** Mark an existing error — for a brand that records what has happened to
 * it rather than what it is (./fragment's anchoring). */
export const brand = (error: Error, mark: symbol): void => brand_(error, mark)

const brand_ = (error: Error, mark: symbol): void => {
  ;(error as unknown as Branded)[mark] = true
}

export const hasBrand = (error: unknown, mark: symbol): boolean =>
  error instanceof Error && (error as unknown as Branded)[mark] === true

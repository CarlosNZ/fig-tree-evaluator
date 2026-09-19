/**
 * Engine-bug errors: raised where the static gate should have made a
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

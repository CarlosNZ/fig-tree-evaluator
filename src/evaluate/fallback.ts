/**
 * What happens once a node's fallback runs, for both wrappers
 * (./operator.ts, ./fragment.ts): rules 4 and 5 of "`fallback` semantics"
 * in docs-dev/v3-specs/v3-api.md, and the exception to rule 4 for a
 * fallback that reads its own `$error` (#239). Each wrapper finds its own
 * fallback and locates its own failures; the rules after that are one.
 */
import { isFigTreeError } from '../FigTreeError'
import type { EvaluationContext } from './context'
import { cutsThrough } from './internal'

/**
 * Run `fallback` for an attempt that failed with `failure`, and answer for
 * the node.
 *
 * - A bail-out landing at the fallback's own node boundary passes through
 *   untouched, rather than being wrapped, or having `cause` attached.
 * - A fallback that reads its own `$error` exists to report the failure,
 *   and never fails itself: the node gives `null`, and the fallback's own
 *   trace entry records what it failed with.
 * - Any other fallback's failure fails the node (rule 4), located by
 *   `wrap`, with the attempt's failure as its `cause`. A fallback that
 *   reads the var that failed re-receives the very same error (rule 5),
 *   which must not become its own cause.
 *
 * A fallback firing is the author's designed degradation, so it is a
 * success, which makes trace the only record that it happened, and of
 * what it caught.
 */
export const runFallback = async (
  fallback: () => unknown,
  failure: unknown,
  readsError: boolean | undefined,
  wrap: (error: unknown) => unknown,
  ctx: Pick<EvaluationContext, 'trace' | 'traceParent'>
): Promise<unknown> => {
  let answered: unknown
  try {
    answered = await fallback()
  } catch (error) {
    if (cutsThrough(error)) throw error
    if (!readsError) {
      const wrapped = wrap(error)
      if (isFigTreeError(wrapped) && wrapped !== failure && wrapped.cause === undefined)
        wrapped.cause = failure
      throw wrapped
    }
    answered = null
  }
  if (ctx.trace !== undefined && ctx.traceParent !== undefined && isFigTreeError(failure))
    ctx.trace.markFallback(ctx.traceParent, failure)
  return answered
}

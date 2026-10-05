/**
 * `fig-tree-evaluator/authoring` — static analyses for authoring tools (the
 * design record is docs-dev/v3-specs/v3-authoring.md). Nothing here has any
 * bearing on evaluation, so nothing in the engine imports it: `evaluate()`
 * never pays for these checks, however thorough they become.
 *
 * The subpath reads a compiled handle through `viewHandle`, the reader the
 * inspector uses, so its bundle shares the engine's chunk with the root. A
 * caller always holds a `FigTree` already, so that code is in its bundle
 * either way.
 */
import { FigTree, viewHandle } from '../FigTree'
import { FigTreeError } from '../FigTreeError'
import { ErrorCodes } from '../errorCodes'
import type { FallbackCoverage, FallbackCoverageOptions } from '../authoringTypes'
import { coveredFinding, isDemand, report, uncoveredFinding } from './findings'
import type { Caught, Failure } from './findings'
import { Analysis } from './walk'

/**
 * Where each node of an expression can fail, and which fallback, if any,
 * catches it (docs-dev/v3-specs/v3-fallback-coverage.md). A failure is
 * reported where it starts, once, and is covered by the nearest fallback
 * above it. Async, because the analysis runs a pure node's own body where
 * enough is known of its inputs, and a body is async.
 *
 * Under a timeout nothing runs after the deadline, so a top-level value is
 * shielded only by a constant fallback: the instance's `timeout`, or the
 * one passed here for a host that passes it to `evaluate()` per call. The
 * expression compiles through `compile()`, so it shares the compile cache
 * with `evaluate()`.
 */
export const fallbackCoverage = async (
  fig: unknown,
  expression: unknown,
  options?: FallbackCoverageOptions
): Promise<FallbackCoverage> => {
  if (!(fig instanceof FigTree)) throw new TypeError('fallbackCoverage() takes a FigTree instance')
  // The call's timeout laid over the instance's options, and checked, as
  // `evaluate()` would; the analysis's own options are not evaluate()'s.
  // A handle from this copy is always readable
  const timeout = options?.timeout
  const { artifact, options: effective } = viewHandle(
    fig.compile(expression),
    timeout !== undefined ? { timeout } : undefined
  )!
  const numbers = options?.numbers ?? 'ordinary'
  if (numbers !== 'ordinary' && numbers !== 'strict')
    throw new FigTreeError({
      code: ErrorCodes.invalidOptions,
      message: `'numbers' must be 'ordinary' or 'strict', received ${JSON.stringify(numbers)}`,
      path: [],
    })
  const evaluation = effective as unknown as Record<string, unknown>
  const analysis = new Analysis({ numbers, evaluation }, artifact.issues)

  const caught: Caught[] = []
  const { escapes } = await analysis.root(artifact.root, caught)
  const uncovered = escapes
    // A demand is a body's, and every call answers its own
    .filter((pending): pending is Failure => !isDemand(pending))
    .map(uncoveredFinding)

  // The runtime's shielding: a hole is spliced on a timeout only when its
  // fallback is constant (`timeoutFallback`)
  if (effective.timeout !== undefined)
    for (const hole of artifact.holes)
      if (hole.timeoutFallback === undefined)
        uncovered.push(
          uncoveredFinding({
            path: hole.node.path,
            code: 'timeout',
            message: 'may be cut off by the timeout: it has no constant fallback to shield it',
            certainty: 'may',
            order: [hole.node.order],
          })
        )

  const covered = caught.flatMap(({ pending, by }) =>
    isDemand(pending) ? [] : [coveredFinding(pending, by)]
  )
  return { uncovered: report(uncovered), covered: report(covered) }
}

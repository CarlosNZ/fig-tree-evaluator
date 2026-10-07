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
import { limitIssues } from '../validation'
import type { FallbackCoverage, FallbackCoverageOptions } from '../authoringTypes'
import { coveredFinding, isDemand, report, staticFinding, uncoveredFinding } from './findings'
import type { Caught, Failure } from './findings'
import { Analysis } from './walk'

/**
 * Where each node of an expression can fail, and which fallback, if any,
 * catches it (docs-dev/v3-specs/v3-fallback-coverage.md). A failure is
 * reported where it starts, once, and is covered by the nearest fallback
 * above it. Async, because the analysis runs a pure node's own body where
 * enough is known of its inputs, and a body is async.
 *
 * It answers as the instance would evaluate the expression, under the
 * instance's own options: under its `timeout`, nothing runs after the
 * deadline, so a top-level value is shielded only by a constant fallback.
 * Only an evaluation that waits on something outside it can be cut off,
 * and shielding is all or nothing (see "Timeouts" in the spec). The
 * expression compiles through `compile()`, so it shares the compile cache
 * with `evaluate()`.
 *
 * An expression with a static error never runs: `evaluate()` refuses it
 * before anything starts, so no fallback can catch one. Its report is
 * every static error, uncovered, in the order `evaluate()` reads them to
 * choose the one it throws, and nothing is walked ("Static errors" in the
 * spec).
 */
export const fallbackCoverage = async (
  fig: unknown,
  expression: unknown,
  options?: FallbackCoverageOptions
): Promise<FallbackCoverage> => {
  if (!(fig instanceof FigTree)) throw new TypeError('fallbackCoverage() takes a FigTree instance')
  const strictNumbers = options?.strictNumbers ?? false
  if (typeof strictNumbers !== 'boolean')
    throw new FigTreeError({
      code: ErrorCodes.invalidOptions,
      message: `'strictNumbers' must be a boolean, received ${JSON.stringify(strictNumbers)}`,
      path: [],
    })
  // A handle from this copy is always readable
  const { artifact, options: effective } = viewHandle(fig.compile(expression))!

  // The static gate, as `evaluate()` applies it
  const errors = [
    ...limitIssues(artifact, effective),
    ...artifact.issues.map((s) => s.issue),
  ].filter((issue) => issue.severity === 'error')
  if (errors.length > 0) return { uncovered: errors.map(staticFinding), covered: [] }

  const evaluation = effective as unknown as Record<string, unknown>
  const analysis = new Analysis({ strictNumbers, evaluation })

  const caught: Caught[] = []
  const { escapes, waits } = await analysis.root(artifact.root, caught)
  const uncovered = escapes
    // A demand is a body's, and every call answers its own
    .filter((pending): pending is Failure => !isDemand(pending))
    .map(uncoveredFinding)

  // The runtime's shielding: on a timeout, every hole is spliced with its
  // constant fallback (`timeoutFallback`) if every hole has one, and the
  // evaluation is rejected otherwise. An evaluation that never waits
  // finishes before the deadline's timer can fire
  if (effective.timeout !== undefined && waits)
    for (const { node, timeoutFallback } of artifact.holes) {
      const at = {
        path: node.path,
        code: 'timeout',
        certainty: 'may' as const,
        order: [node.order],
      }
      if (!artifact.timeoutShielded) {
        if (timeoutFallback === undefined)
          uncovered.push(
            uncoveredFinding({
              ...at,
              message:
                'the timeout may reject the evaluation: something in it can wait, and this value has no constant fallback to shield it',
            })
          )
      } else if (analysis.waiting.has(node))
        caught.push({
          pending: {
            ...at,
            message: 'may be cut off by the timeout, which puts its constant fallback in its place',
          },
          by: { path: node.path },
        })
    }

  const covered = caught.flatMap(({ pending, by }) =>
    isDemand(pending) ? [] : [coveredFinding(pending, by)]
  )
  return { uncovered: report(uncovered), covered: report(covered) }
}

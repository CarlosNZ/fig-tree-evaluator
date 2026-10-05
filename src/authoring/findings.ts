/**
 * The findings the coverage walk builds, as they travel (Finding shapes in
 * "What it returns", docs-dev/v3-specs/v3-fallback-coverage.md). A finding
 * is located in the frame it was found in: the input, or a fragment body.
 * Crossing a call lifts it into the caller's frame the way the engine
 * anchors an error (`anchor` in src/evaluate/fragment.ts), so `path` ends up
 * the outermost call and `fragmentPath` a place in the innermost body.
 */
import { toNodePath } from '../compile/artifact'
import type { FragmentCallNode, LinkedPath, NodePath } from '../compile/artifact'
import type { FigTreeErrorCode } from '../errorCodes'
import type { CoverageFinding, CoveredFinding } from '../authoringTypes'

/** One way a node can fail, where the failure starts. */
export interface Failure {
  path: LinkedPath
  fragment?: string
  fragmentPath?: NodePath
  code: FigTreeErrorCode
  message: string
  certainty: 'may' | 'always'
  operator?: string
  parameter?: string
  /**
   * Tree order: the node's preorder position, preceded by the position of
   * each call it was lifted through
   */
  order: number[]
}

/**
 * A fragment body reading one of its parameters. What can fail there is the
 * argument, which only the call knows, so the demand travels up the body
 * like a failure and each call answers it with its argument's findings.
 */
export interface Demand {
  demand: string
}

export type Pending = Failure | Demand

export const isDemand = (pending: Pending): pending is Demand => 'demand' in pending

/** The node whose fallback catches a failure, in the frame it sits in. */
export interface Catcher {
  path: LinkedPath
  fragmentPath?: NodePath
}

export interface Caught {
  pending: Pending
  by: Catcher
}

/** A failure inside a body, as the call it escapes through reports it. */
export const liftFailure = (failure: Failure, call: FragmentCallNode): Failure => ({
  ...failure,
  path: call.path,
  ...(failure.fragment === undefined
    ? { fragment: call.name, fragmentPath: toNodePath(failure.path) }
    : {}),
  order: [call.order, ...failure.order],
})

/** A fallback inside a body, as the call reports it. */
export const liftCatcher = (by: Catcher, call: FragmentCallNode): Catcher =>
  by.fragmentPath === undefined
    ? { path: call.path, fragmentPath: toNodePath(by.path) }
    : { ...by, path: call.path }

const toFinding = (failure: Failure): CoverageFinding => {
  const { code, message, certainty, operator, parameter, fragment, fragmentPath } = failure
  return {
    path: toNodePath(failure.path),
    code,
    message,
    certainty,
    ...(operator !== undefined ? { operator } : {}),
    ...(parameter !== undefined ? { parameter } : {}),
    ...(fragment !== undefined ? { fragment, fragmentPath } : {}),
  }
}

const byOrder = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]
  return a.length - b.length
}

/**
 * The public lists: in tree order, each finding once. A var or an argument
 * is read wherever it is referenced, so one failure can reach the same
 * place, or the same fallback, by more than one route; and two rules can
 * give one node the same failure. Findings alike but for their message are
 * one, `always` if either is.
 */
export const report = <T extends CoverageFinding>(
  items: { order: number[]; finding: T }[]
): T[] => {
  const kept = new Map<string, T>()
  for (const { finding } of [...items].sort((a, b) => byOrder(a.order, b.order))) {
    const key = JSON.stringify({ ...finding, message: undefined, certainty: undefined })
    const earlier = kept.get(key)
    if (earlier === undefined) kept.set(key, finding)
    else if (finding.certainty === 'always') earlier.certainty = 'always'
  }
  return [...kept.values()]
}

export const uncoveredFinding = (failure: Failure) => ({
  order: failure.order,
  finding: toFinding(failure),
})

export const coveredFinding = (failure: Failure, by: Catcher) => ({
  order: failure.order,
  finding: {
    ...toFinding(failure),
    coveredBy: toNodePath(by.path),
    ...(by.fragmentPath !== undefined ? { coveredByFragmentPath: by.fragmentPath } : {}),
  } satisfies CoveredFinding,
})

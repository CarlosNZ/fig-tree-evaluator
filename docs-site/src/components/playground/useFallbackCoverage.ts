import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  FallbackCoverage,
  FallbackCoverageOptions,
  FigTree,
  OperatorAnalysis,
} from 'fig-tree-evaluator'
import { fallbackCoverage } from 'fig-tree-evaluator/authoring'

type Analyses = readonly (OperatorAnalysis | readonly OperatorAnalysis[])[]

/** What a refresh can be given in place of what the hook last rendered with. */
export interface CoverageRefresh {
  expression?: unknown
  options?: FallbackCoverageOptions
}

/**
 * An expression's `fallbackCoverage()` report, held as state, and
 * `refreshCoverage()`, which works it out again. It's worked out once when
 * the hook mounts, and again only when `refreshCoverage()` is called, so the
 * caller calls it wherever something coverage depends on changes: an edit,
 * given the new expression, since the hook hasn't rendered with it yet, or a
 * change of the instance's options or fragments, which an instance changed
 * in place can't announce. Coverage is null while the expression has errors,
 * when it means nothing, and the last report stays until the next one
 * settles; a report that settles after a later refresh started is dropped.
 */
export const useFallbackCoverage = (
  figTree: FigTree,
  expression: unknown,
  analyses?: Analyses,
  options?: FallbackCoverageOptions
) => {
  const [coverage, setCoverage] = useState<FallbackCoverage | null>(null)
  const latest = useRef({ expression, analyses, options })
  latest.current = { expression, analyses, options }
  const run = useRef(0)

  const refreshCoverage = useCallback(
    async (refresh: CoverageRefresh = {}): Promise<FallbackCoverage | null> => {
      const current = { ...latest.current, ...refresh }
      const id = ++run.current
      // fallbackCoverage() reports only the static errors of an expression
      // that has them, so it's validate() that says whether to show any
      const result = figTree.validate(current.expression).valid
        ? await fallbackCoverage(
            figTree,
            current.expression,
            current.analyses,
            current.options
          ).catch(() => null)
        : null
      if (id === run.current) setCoverage(result)
      return result
    },
    [figTree]
  )

  // The first report, when the hook mounts: every later one comes from a call
  // to refreshCoverage()
  useEffect(() => {
    refreshCoverage()
  }, [refreshCoverage])

  return { coverage, refreshCoverage }
}

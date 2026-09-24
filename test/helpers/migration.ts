/**
 * Shared by the converter's suites (Phase 15.1): inputs held still, and the
 * published v2 package (the devDependency `fig-tree-evaluator-v2`) as the
 * oracle beside v3.
 */
import { FigTreeEvaluator, type EvaluatorNode, type FigTreeOptions } from 'fig-tree-evaluator-v2'
import type { FigTree } from '../../src'

/** What an engine made of an expression: its value, or that it failed */
export type Outcome = { value: unknown } | { error: true }

/**
 * A deep copy made in this realm. `structuredClone` makes Node's objects,
 * which fail v2's `instanceof Object` test for a node inside Jest's context.
 */
export const clone = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(clone)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, clone(v)]))
}

export const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

/** v2's outcome, on a fresh instance with the given options */
export const v2Outcome = async (expression: unknown, options: object = {}) => {
  const fig = new FigTreeEvaluator(options as FigTreeOptions)
  try {
    return { value: await fig.evaluate(clone(expression) as EvaluatorNode) }
  } catch {
    return { error: true } as const
  }
}

/** v3's outcome on the instance given */
export const v3Outcome = async (
  fig: FigTree,
  expression: unknown,
  data?: Record<string, unknown>
) => {
  try {
    return { value: await fig.evaluate(expression, data === undefined ? {} : { data }) }
  } catch {
    return { error: true } as const
  }
}

/** The errors v3's `validate()` finds, by code and path */
export const v3Errors = (fig: FigTree, expression: unknown, data?: Record<string, unknown>) =>
  fig
    .validate(expression, data === undefined ? {} : { data })
    .issues.filter(({ severity }) => severity === 'error')
    .map(({ code, path, message }) => ({ code, path, message }))

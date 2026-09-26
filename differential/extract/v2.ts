/**
 * The published v2 package, as the release's tests import it during
 * extraction, recording every evaluation they make. The extraction's Jest
 * config maps the tests' `./evaluator` and `../src/…` imports here.
 *
 * What is recorded is what v2 evaluated with: the instance's options with
 * the call's merged over them, as v2's `evaluate` merged them, and whether
 * its SQL connection was SQLite, which the corpus leaves out.
 */
import * as v2 from 'fig-tree-evaluator-v2'
import type { EvaluatorNode, FigTreeOptions } from 'fig-tree-evaluator-v2'
import type { Outcome } from '../outcome'

export * from 'fig-tree-evaluator-v2'

export interface Evaluation {
  test: string
  expression: unknown
  options: FigTreeOptions
  onSqlite: boolean
  /** What the test saw */
  outcome: Promise<Outcome>
}

/** This test file's evaluations, in the order they were made */
export const evaluations: Evaluation[] = []

const sqlite = new WeakSet<object>()

export const SQLite: typeof v2.SQLite = (db) => {
  const connection = v2.SQLite(db)
  sqlite.add(connection)
  return connection
}

// v2 reads `objects` as `data`, and merges a call's options over the
// instance's, deeply for these four
const standardise = (options: FigTreeOptions): FigTreeOptions =>
  'objects' in options ? { ...options, data: options.objects } : options
const DEEP = ['data', 'functions', 'fragments', 'headers'] as const
const merge = (instance: FigTreeOptions, call: FigTreeOptions): FigTreeOptions => {
  const merged: Record<string, unknown> = { ...instance, ...call }
  for (const key of DEEP)
    if (instance[key] || call[key]) merged[key] = { ...instance[key], ...call[key] }
  return merged as FigTreeOptions
}

const record = (expression: unknown, options: FigTreeOptions, result: Promise<unknown>) => {
  const connection = options.sqlConnection as object | undefined
  evaluations.push({
    test: expect.getState().currentTestName ?? '',
    expression,
    options,
    onSqlite: connection !== undefined && sqlite.has(connection),
    outcome: result.then(
      (value) => ({ value }),
      (error: unknown) => ({ error: String((error as Error)?.message ?? error) })
    ),
  })
}

export class FigTreeEvaluator extends v2.FigTreeEvaluator {
  evaluate(expression: EvaluatorNode, options: FigTreeOptions = {}) {
    const result = super.evaluate(expression, options)
    record(expression, merge(this.getOptions(), standardise(options)), result)
    return result
  }
}

export const evaluateExpression = (expression: EvaluatorNode, options: FigTreeOptions = {}) => {
  const result = new v2.FigTreeEvaluator(options).evaluate(expression)
  record(expression, merge(standardise(options), {}), result)
  return result
}

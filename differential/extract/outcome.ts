/**
 * Running a case through v2 as the runner will, and comparing outcomes as
 * the differential does: two failures match, whatever their messages.
 */
import { isDeepStrictEqual } from 'node:util'
import type * as V2 from 'fig-tree-evaluator-v2'
import { v2Options, type Case, type V2Io } from '../case'

export type Outcome = { value: unknown } | { error: string }

export const sameOutcome = (a: Outcome, b: Outcome): boolean =>
  'value' in a && 'value' in b ? isDeepStrictEqual(a.value, b.value) : 'error' in a && 'error' in b

/** The v2 package is passed in: Jest and tsx load it differently */
export const runV2 = async (
  v2: typeof V2,
  entry: Case,
  io: V2Io,
  extra: V2.FigTreeOptions = {}
): Promise<Outcome> => {
  try {
    const fig = new v2.FigTreeEvaluator({ ...v2Options(entry, io), ...extra })
    return { value: await fig.evaluate(entry.expression as V2.EvaluatorNode) }
  } catch (error) {
    return { error: String((error as Error)?.message ?? error) }
  }
}

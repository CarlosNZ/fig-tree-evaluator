/**
 * Running a case through v2 as the runner does, and comparing outcomes as
 * the differential does ("Comparing" in docs-dev/v3-specs/v3-converter.md):
 * two failures match, whatever their messages.
 */
import { isDeepStrictEqual } from 'node:util'
import type * as V2 from 'fig-tree-evaluator-v2'
import { v2Options, type Case, type V2Io } from './case'

export type Outcome = { value: unknown } | { error: string }

export const sameOutcome = (a: Outcome, b: Outcome): boolean =>
  'value' in a && 'value' in b ? isDeepStrictEqual(a.value, b.value) : 'error' in a && 'error' in b

/**
 * Whether v2's outcome and v3's match. v3 has no `undefined`, so v2's is
 * read as JSON writes it, which is v3's own reading of it: a key holding it
 * is absent, and an array element or the whole value is `null`. Key order is
 * ignored, since v3's evaluation reorders keys.
 */
export const sameResult = (v2: Outcome, v3: Outcome): boolean =>
  sameOutcome('value' in v2 ? { value: withoutUndefined(v2.value) } : v2, v3)

const withoutUndefined = (value: unknown): unknown => {
  if (value === undefined) return null
  if (Array.isArray(value)) return value.map(withoutUndefined)
  // A plain object, and not a Date or a Buffer
  if (Object.prototype.toString.call(value) !== '[object Object]') return value
  return Object.fromEntries(
    Object.entries(value as object)
      .filter(([, v]) => v !== undefined)
      .map(([key, v]) => [key, withoutUndefined(v)])
  )
}

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

import type { TraceNode } from 'fig-tree-evaluator'
import { toJson5 } from './json5'

/**
 * The order an entry's keys are shown in: where it is and what it is, then
 * what became of it, then what it holds. Anything not listed follows, in
 * the order the trace has it.
 */
const ORDER = ['path', 'source', 'kind', 'operator', 'ref', 'var', 'status', 'value', 'error']

/**
 * An entry as an example shows it. `elapsed` is left out, since it differs
 * on every run, and an error is shown as its code and message, as the error
 * display under an example shows it.
 */
const display = (entry: TraceNode): Record<string, unknown> => {
  const shown: Record<string, unknown> = {}
  const keys = [...ORDER, ...Object.keys(entry)]
  for (const key of keys) {
    if (key in shown || key === 'elapsed' || !(key in entry)) continue
    const value = entry[key as keyof TraceNode]
    if (key === 'error' && entry.error !== undefined)
      shown.error = `${entry.error.code}: ${entry.error.message}`
    else if (key === 'children' && entry.children !== undefined)
      shown.children = entry.children.map(display)
    else shown[key] = value
  }
  return shown
}

/** A trace as JSON5, for an example's Trace block. */
export const showTrace = (trace: TraceNode): string => toJson5(display(trace))

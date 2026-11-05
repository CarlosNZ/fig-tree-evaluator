import type { JsonData } from 'json-edit-react'

/** An example's expression and data, as the reader has edited them, or as written. */
export interface Work {
  expression: unknown
  data: JsonData
}

/** Where the reader's edits are kept, by example id. */
const WORK_KEY = 'fds-playground-work'

/** Plain data, so its serialisation is enough to compare it. */
export const sameWork = (a: Work, b: Work) => JSON.stringify(a) === JSON.stringify(b)

const allWork = (): Record<string, Work> => {
  try {
    return JSON.parse(localStorage.getItem(WORK_KEY) ?? '{}')
  } catch {
    return {}
  }
}

const keepAll = (all: Record<string, Work>) => {
  try {
    localStorage.setItem(WORK_KEY, JSON.stringify(all))
  } catch {
    // Not kept, then: the edits last until the page closes
  }
}

/** The examples the reader has edits to. */
export const editedExamples = () => Object.keys(allWork())

/** The reader's edits to an example, if they've made any. */
export const savedWork = (id: string): Work | undefined => allWork()[id]

/**
 * Keeps the reader's edits to an example, or drops them once they're back to
 * the example as written, which needs nothing kept.
 */
export const keepWork = (id: string, work: Work, original: Work) => {
  const all = allWork()
  if (sameWork(work, original)) delete all[id]
  else all[id] = work
  keepAll(all)
}

export const discardWork = (id: string) => {
  const all = allWork()
  delete all[id]
  keepAll(all)
}

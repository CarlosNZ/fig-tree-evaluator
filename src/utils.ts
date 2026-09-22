/**
 * Small generic helpers shared across modules. Anything here should be
 * domain-free — no knowledge of nodes, operators, or evaluation.
 */

/**
 * Does nothing. The one no-op the engine shares: the discarding trace
 * channel, the rejection swallower on a promise nobody may await, the
 * default `settle` of a scope its owner settles.
 */
export const noop = (): void => {}

/**
 * A value or a promise of one: what a node evaluation hands back once a
 * leaf may answer without a promise. `await` accepts either, so most
 * callers never look; the ones that collect several check with
 * `isThenable` and skip the wait when nothing is pending.
 */
export type MaybePromise<T> = T | Promise<T>

/** Whether a value is something `await` would wait on. */
export const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { then?: unknown }).then === 'function'

/** A plain object: an object that is neither null nor an array. */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A plain *data* object: prototype is `Object.prototype` or `null`. Class
 * instances, `Date`s, `Map`s etc. fail this — the compiler treats them as
 * opaque constants ("Non-plain-object values" in docs-dev/v3-specs/v3-api.md).
 */
export const isPlainDataObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Levenshtein edit distance — powers the cheap did-you-mean suggestions in
 * compile/validate messages. Plain dynamic-programming, fine for name-length
 * strings.
 */
export const editDistance = (a: string, b: string): number => {
  if (a === b) return 0
  const rows = a.length + 1
  const cols = b.length + 1
  let prev = Array.from({ length: cols }, (_, j) => j)
  for (let i = 1; i < rows; i++) {
    const current = [i]
    for (let j = 1; j < cols; j++) {
      const substitution = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      current.push(Math.min(prev[j] + 1, current[j - 1] + 1, substitution))
    }
    prev = current
  }
  return prev[cols - 1]
}

/**
 * The nearest candidate within edit distance 2, for did-you-mean hints;
 * undefined when nothing is close enough.
 */
export const nearestName = (name: string, candidates: Iterable<string>): string | undefined => {
  let best: string | undefined
  let bestDistance = 3
  for (const candidate of candidates) {
    const distance = editDistance(name, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

/**
 * Run an async producer at most once and hand every caller the same
 * promise — rejections included, so a failure is memoized like a value. A
 * synchronous throw inside `fn` becomes a rejection.
 */
export const once = <T>(fn: () => Promise<T> | T): (() => Promise<T>) => {
  let pending: Promise<T> | undefined
  return () => {
    if (pending === undefined) pending = (async () => fn())()
    return pending
  }
}

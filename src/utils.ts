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
 * Edit distance, bounded: the exact distance when it is at most `max`,
 * otherwise any value above `max`. Levenshtein with one more edit, the
 * swap of two adjacent characters (`plsu` for `plus`), so the commonest
 * typo costs one edit rather than two (optimal string alignment). Three
 * rows of the dynamic-programming table, rotated rather than reallocated,
 * and the walk stops at the first row whose smallest entry already exceeds
 * the bound, since distances only grow down the table. Candidates whose
 * lengths differ by more than `max` are rejected before the table starts.
 * Compile raises a did-you-mean on every unrecognized `$` key it meets, so
 * this runs once per such key, however many an expression holds (#215).
 */
export const editDistanceWithin = (a: string, b: string, max: number): number => {
  if (a === b) return 0
  const rows = a.length
  const cols = b.length
  if (Math.abs(rows - cols) > max) return max + 1
  let twoUp: number[] = new Array(cols + 1)
  let prev: number[] = new Array(cols + 1)
  let current: number[] = new Array(cols + 1)
  for (let j = 0; j <= cols; j++) prev[j] = j
  for (let i = 1; i <= rows; i++) {
    current[0] = i
    let rowMin = i
    const code = a.charCodeAt(i - 1)
    for (let j = 1; j <= cols; j++) {
      const other = b.charCodeAt(j - 1)
      const substitution = prev[j - 1] + (code === other ? 0 : 1)
      let distance = Math.min(prev[j] + 1, current[j - 1] + 1, substitution)
      if (
        i > 1 &&
        j > 1 &&
        code === b.charCodeAt(j - 2) &&
        other === a.charCodeAt(i - 2) &&
        twoUp[j - 2] + 1 < distance
      )
        distance = twoUp[j - 2] + 1
      current[j] = distance
      if (distance < rowMin) rowMin = distance
    }
    if (rowMin > max) return max + 1
    const recycled = twoUp
    twoUp = prev
    prev = current
    current = recycled
  }
  return prev[cols]
}

/**
 * The did-you-mean for a name none of `candidates` matched. The one
 * candidate the name begins, so an abbreviation finds its full name
 * (`mod`, `modulo`); otherwise the one nearest it, within an edit for a
 * name of 3 to 5 characters and two for a longer one. Nothing for a name
 * under 3 characters, which is that near to too much, nor when two
 * candidates are equally near: a suggestion names the name meant, not one
 * of several. Each distance is computed only as far as the nearest so far.
 */
export const nearestName = (name: string, candidates: Iterable<string>): string | undefined => {
  if (name.length < 3) return undefined
  let completion: string | undefined
  let completions = 0
  let nearest: string | undefined
  let nearestDistance = name.length < 6 ? 1 : 2
  let tied = false
  for (const candidate of candidates) {
    if (candidate.startsWith(name)) {
      completion = candidate
      completions++
    }
    const distance = editDistanceWithin(name, candidate, nearestDistance)
    if (distance > nearestDistance) continue
    tied = nearest !== undefined && distance === nearestDistance
    nearest = candidate
    nearestDistance = distance
  }
  if (completions === 1) return completion
  return tied ? undefined : nearest
}

/** The message tail offering a `nearestName` suggestion, or nothing. */
export const didYouMean = (suggestion: string | undefined): string =>
  suggestion ? ` — did you mean '${suggestion}'?` : ''

/** `a`, `a and b`, `a, b and c`: items as a message lists them. */
export const listing = (items: string[]): string =>
  items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * FNV-1a over a string's UTF-16 code units, as eight hex characters. A
 * content fingerprint, not a security hash: 32 bits is ample where a
 * collision also needs the same operator name, and the whole thing is
 * six lines with no dependency.
 */
export const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
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

/**
 * Every cycle in a directed graph of names, found depth-first from each
 * root in turn: a back edge to a name still on the stack closes the cycle
 * of the names above it, which `report` receives in stack order. A cycle
 * is reported once, keyed on its member set, though every entry point into
 * it would find it again. Returns whether the graph is acyclic.
 */
export const findCycles = (
  roots: Iterable<string>,
  edges: (name: string) => Iterable<string> | undefined,
  report: (members: string[]) => void
): boolean => {
  const stack: string[] = []
  const done = new Set<string>()
  const reported = new Set<string>()
  const visit = (name: string) => {
    const at = stack.indexOf(name)
    if (at !== -1) {
      const members = stack.slice(at)
      const key = [...members].sort().join('\0')
      if (!reported.has(key)) {
        reported.add(key)
        report(members)
      }
      return
    }
    if (done.has(name)) return
    stack.push(name)
    for (const target of edges(name) ?? []) visit(target)
    stack.pop()
    done.add(name)
  }
  for (const root of roots) visit(root)
  return reported.size === 0
}

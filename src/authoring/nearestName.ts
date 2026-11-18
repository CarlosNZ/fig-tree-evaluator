/**
 * The did-you-mean behind `validate()`'s suggestions ("Suggestions are
 * validate()'s alone" in docs-dev/v3-specs/v3-evaluator-methods.md). It
 * lives here, in `./authoring`, so the root never ships it: lint keeps the
 * root from importing this folder.
 */

/**
 * Edit distance, bounded: the exact distance when it is at most `max`,
 * otherwise any value above `max`. Levenshtein with one more edit, the
 * swap of two adjacent characters (`plsu` for `plus`), so the commonest
 * typo costs one edit rather than two (optimal string alignment). Three
 * rows of the dynamic-programming table, rotated rather than reallocated,
 * and the walk stops at the first row whose smallest entry already exceeds
 * the bound, since distances only grow down the table. Candidates whose
 * lengths differ by more than `max` are rejected before the table starts.
 * `validate()` raises a did-you-mean on every unrecognized `$` key it
 * meets, so this runs once per such key, however many an expression holds
 * (#215).
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

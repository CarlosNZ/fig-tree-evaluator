/**
 * The did-you-mean scan (src/utils.ts): a bounded edit distance that is
 * exact within its bound, and the nearest-name pick built on it (#215).
 */
import { editDistanceWithin, nearestName } from '../src/utils'

/** The textbook unbounded distance, as the oracle. */
const editDistance = (a: string, b: string): number => {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++)
      current.push(
        Math.min(prev[j] + 1, current[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      )
    prev = current
  }
  return prev[b.length]
}

const names = ['plus', 'minus', 'and', 'or', 'equal', 'notEqual', 'buildString', 'get', 'set']
const probes = [
  '',
  'plus',
  'plsu',
  'pluss',
  'lus',
  'add',
  'buildStrin',
  'buildSting',
  'ste',
  'xyzzy',
]

describe('editDistanceWithin', () => {
  test('is exact whenever the distance is within the bound', () => {
    for (const a of probes)
      for (const b of names)
        for (const max of [0, 1, 2, 5, 20]) {
          const exact = editDistance(a, b)
          const bounded = editDistanceWithin(a, b, max)
          if (exact <= max) expect(bounded).toBe(exact)
          else expect(bounded).toBeGreaterThan(max)
        }
  })

  test('rejects on length alone when the lengths differ by more than the bound', () => {
    expect(editDistanceWithin('set', 'buildString', 2)).toBeGreaterThan(2)
    expect(editDistanceWithin('buildString', 'set', 2)).toBeGreaterThan(2)
  })

  test('identical strings are distance 0 under any bound', () => {
    expect(editDistanceWithin('plus', 'plus', 0)).toBe(0)
  })
})

describe('nearestName', () => {
  test('picks the candidate at the smallest distance under 3', () => {
    expect(nearestName('plsu', names)).toBe('plus')
    expect(nearestName('buildSting', names)).toBe('buildString')
    expect(nearestName('ste', names)).toBe('set')
  })

  test('answers nothing when every candidate is 3 or more away', () => {
    expect(nearestName('xyzzy', names)).toBeUndefined()
  })

  test('the first of equally near candidates wins', () => {
    // 'ad' is one edit from both 'and' and 'add'
    expect(nearestName('ad', ['and', 'add'])).toBe('and')
    expect(nearestName('ad', ['add', 'and'])).toBe('add')
  })

  test('an exact match wins over an earlier near miss', () => {
    expect(nearestName('plus', ['plsu', 'plus'])).toBe('plus')
  })
})

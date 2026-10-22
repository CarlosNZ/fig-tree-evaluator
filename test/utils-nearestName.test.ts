/**
 * The did-you-mean scan (src/utils.ts): a bounded edit distance that is
 * exact within its bound, and the nearest-name pick built on it (#215).
 */
import { editDistanceWithin, nearestName } from '../src/utils'

/** The textbook unbounded distance, adjacent swaps included, as the oracle. */
const editDistance = (a: string, b: string): number => {
  const table = [Array.from({ length: b.length + 1 }, (_, j) => j)]
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row.push(
        Math.min(
          table[i - 1][j] + 1,
          row[j - 1] + 1,
          table[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        )
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j], table[i - 2][j - 2] + 1)
    }
    table.push(row)
  }
  return table[a.length][b.length]
}

const names = ['plus', 'minus', 'and', 'or', 'equal', 'notEqual', 'buildString', 'get', 'set']
const probes = [
  '',
  'plus',
  'plsu',
  'lpsu',
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

  test('a swap of two adjacent characters is one edit', () => {
    expect(editDistanceWithin('plsu', 'plus', 2)).toBe(1)
    expect(editDistanceWithin('lpsu', 'plus', 2)).toBe(2)
  })
})

describe('nearestName', () => {
  test('picks the nearest candidate: within 1 edit at 3 to 5 characters, 2 above', () => {
    expect(nearestName('plsu', names)).toBe('plus')
    expect(nearestName('ste', names)).toBe('set')
    expect(nearestName('buildSting', names)).toBe('buildString')
    expect(nearestName('notEqaul', names)).toBe('notEqual')
    // Two edits from 'plus' and 'equal', too far for names of 4 and 5
    expect(nearestName('plsa', names)).toBeUndefined()
    expect(nearestName('eqxxl', names)).toBeUndefined()
  })

  test('answers nothing when every candidate is too far', () => {
    expect(nearestName('xyzzy', names)).toBeUndefined()
  })

  test('answers nothing for a name under 3 characters (#259)', () => {
    const symbols = ['!', '+', '-', '*', '/', '?', '=', '!=', 'or', 'and']
    for (const name of ['b', 'x', 'up', '=>']) expect(nearestName(name, symbols)).toBeUndefined()
  })

  test('answers nothing when two candidates are equally near', () => {
    expect(nearestName('cat', ['bat', 'cot'])).toBeUndefined()
    expect(nearestName('cat', ['bat', 'cot', 'cart'])).toBeUndefined()
  })

  test('a nearer candidate settles an earlier tie', () => {
    expect(nearestName('cats', ['bats', 'cuts', 'cats'])).toBe('cats')
  })

  test('the one candidate a name begins is its suggestion, however far (#271)', () => {
    const math = ['and', 'not', 'min', 'max', 'plus', 'subtract', 'multiply', 'divide', 'modulo']
    expect(nearestName('mod', math)).toBe('modulo')
    expect(nearestName('sub', math)).toBe('subtract')
    expect(nearestName('mult', math)).toBe('multiply')
    expect(nearestName('div', math)).toBe('divide')
  })

  test('a name several candidates begin falls back to edit distance', () => {
    const comparisons = ['lessThan', 'lessThanOrEqual', 'buildString', 'buildObject']
    expect(nearestName('lessTha', comparisons)).toBe('lessThan')
    expect(nearestName('build', comparisons)).toBeUndefined()
    expect(nearestName('buildS', comparisons)).toBe('buildString')
  })

  test('an exact match wins over an earlier near miss', () => {
    expect(nearestName('plus', ['plsu', 'plus'])).toBe('plus')
    expect(nearestName('not', ['notEqual', 'not'])).toBe('not')
  })
})

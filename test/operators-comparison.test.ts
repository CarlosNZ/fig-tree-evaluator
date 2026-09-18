/**
 * Chunk 4.2 — batch 2, comparison. Hand-migrated from the v2 corpus
 * (test/v2-working/3_equality.test.ts and the ordering cases of
 * 5_otherArithmetic.test.ts), plus the v3 rulings: totality over 0/1
 * elements, the strict/inclusive operator split, codepoint ordering, null
 * propagation on ordering (rows 10, 13) and `nullValueDefault`.
 */
import { FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})
const failure = (expression: unknown, data?: Record<string, unknown>) =>
  rejection<FigTreeError>(ev(expression, data))

const avengers = {
  user: { id: 2, firstName: 'Steve', lastName: 'Rogers', title: 'The First Avenger' },
  organisation: { id: 1, name: 'The Avengers', category: 'Superheroes' },
  form: { q1: 'Thor', q2: 'Asgard' },
  form2: { q1: 'Company Registration', q2: 'XYZ Chemicals' },
}

describe('equal', () => {
  test.each([
    ['numbers', { operator: '=', values: [100, 100] }, true],
    ['numbers, different', { $equal: [5, -5] }, false],
    ['strings', { $equal: ['Monday', 'Monday'] }, true],
    ['strings, no match', { '$=': ['Monday', 'Tuesday'] }, false],
    ['strings, case sensitive by default', { $equal: ['MonDay', 'monDAY'] }, false],
    ['case insensitive', { $equal: { values: ['MonDay', 'monDAY'], caseInsensitive: true } }, true],
    [
      'case insensitive, still different',
      { $equal: { values: ['MoonDay', 'monDAY'], caseInsensitive: true } },
      false,
    ],
    ['many numbers', { $equal: [99, 99, 99, 99, 99] }, true],
    ['single element is vacuously true', { $equal: ['All by myself'] }, true],
    ['empty is vacuously true', { $equal: [] }, true],
    ['cross-type is false, never an error', { $equal: [1, '1'] }, false],
    ['null equals null', { $equal: [null, null] }, true],
    ['null vs anything is false', { $equal: [null, 0] }, false],
    [
      'objects, deep, key order irrelevant',
      {
        $equal: [
          avengers,
          {
            form2: avengers.form2,
            form: avengers.form,
            organisation: avengers.organisation,
            user: avengers.user,
          },
        ],
      },
      true,
    ],
    [
      'objects built by plus',
      {
        $equal: [
          avengers,
          {
            $plus: [
              { user: avengers.user },
              { organisation: avengers.organisation, form: avengers.form, form2: avengers.form2 },
            ],
          },
        ],
      },
      true,
    ],
    [
      'objects, not matching',
      {
        $equal: [
          avengers,
          { ...avengers, form2: { q1: 'Company Application', q2: 'XYZ Chemicals' } },
        ],
      },
      false,
    ],
    [
      'arrays, multiple',
      {
        $equal: [
          [1, 2, 3, { propOne: 'ONE' }],
          [1, 2, 3, { propOne: 'ONE' }],
          { $plus: [[1, 2, 3], [{ propOne: 'ONE' }]] },
        ],
      },
      true,
    ],
    [
      'arrays, not matching',
      {
        $equal: [
          [1, 2, 3, { propOne: 'ONE' }],
          [1, 2, 3, { propOne: 'ONE', propTwo: 'TWO' }],
        ],
      },
      false,
    ],
    [
      'nested comparison nodes',
      { $equal: [{ $greaterThan: [2, 1] }, { $lessThan: [1, 2] }] },
      true,
    ],
  ])('%s', async (_label, expression, expected) => {
    expect(await ev(expression)).toBe(expected)
  })

  test('the is-set idiom: notEqual against null', async () => {
    expect(await ev({ $notEqual: ['$data.x', null] }, { x: 0 })).toBe(true)
    expect(await ev({ $notEqual: ['$data.x', null] }, {})).toBe(false)
  })

  test('caseInsensitive via operatorDefaults, overridable per node', async () => {
    const instance = new FigTree({ operatorDefaults: { equal: { caseInsensitive: true } } })
    expect(await instance.evaluate({ $equal: ['MonDay', 'monDAY'] })).toBe(true)
    expect(
      await instance.evaluate({ $equal: { values: ['MonDay', 'monDAY'], caseInsensitive: false } })
    ).toBe(false)
    // stated per operator — notEqual does not inherit it
    expect(await instance.evaluate({ $notEqual: ['MonDay', 'monDAY'] })).toBe(true)
  })

  test('opaque values: Date by time, RegExp by source and flags', async () => {
    expect(
      await ev({ $equal: ['$data.a', '$data.b'] }, { a: new Date(1000), b: new Date(1000) })
    ).toBe(true)
    expect(
      await ev({ $equal: ['$data.a', '$data.b'] }, { a: new Date(1000), b: new Date(2000) })
    ).toBe(false)
    expect(await ev({ $equal: ['$data.a', '$data.b'] }, { a: /x/g, b: /x/g })).toBe(true)
  })

  test('a literal array under two elements is a dead-expression warning', () => {
    const result = fig.validate({ $equal: ['solo'] })
    expect(result.valid).toBe(true)
    expect(result.issues.some((issue) => issue.severity === 'warning')).toBe(true)
  })

  test('any operand failure fails the node — nothing discarded', async () => {
    expect((await failure({ $equal: [1, { $divide: [1, 0] }] })).code).toBe('non-finite-result')
  })

  test('a whole-null values is a type error (ledger #8)', async () => {
    expect((await failure({ $equal: '$data.missing' })).code).toBe('type-check')
  })
})

describe('notEqual', () => {
  test.each([
    ['numbers', { $notEqual: [3.14, Math.PI] }, true],
    ['numbers, equal', { '$!=': [666, 600 + 66] }, false],
    ['strings', { $notEqual: ['this', 'is not that'] }, true],
    ['strings, equal', { $notEqual: ['Matching', 'Matching'] }, false],
    ['case insensitive', { $notEqual: { values: ['one', 'OnE'], caseInsensitive: true } }, false],
    ['nested, all equal', { $notEqual: [{ $plus: [5, 5] }, 10, 10, 10] }, false],
    ['all different', { $notEqual: [1, 2, 3, 4, 5] }, true],
    ['only first different — "not all equal"', { $notEqual: ['A', 'B', 'B', 'B'] }, true],
    ['one different in the middle', { $notEqual: ['B', 'B', 'other', 'B'] }, true],
    ['single element', { $notEqual: ['ONE'] }, false],
    ['empty', { $notEqual: [] }, false],
  ])('%s', async (_label, expression, expected) => {
    expect(await ev(expression)).toBe(expected)
  })
})

describe('the ordering four', () => {
  test.each([
    ['greaterThan integers', { $greaterThan: [5, 3] }, true],
    ['greaterThan strings (codepoint)', { $greaterThan: ['Large', 'Small'] }, false],
    ['greaterThan equal values is false', { '$>': [99.5, 99.5] }, false],
    ['greaterThanOrEqual equal values is true', { '$>=': [99.5, 99.5] }, true],
    ['greaterThan equal strings is false', { '$>': ['99.5, 99.5', '99.5, 99.5'] }, false],
    ['greaterThanOrEqual equal strings is true', { $greaterThanOrEqual: ['One', 'One'] }, true],
    ['lessThan integers', { $lessThan: [5, 3] }, false],
    ['lessThan strings', { $lessThan: ['Large', 'Small'] }, true],
    ['lessThan equal values is false', { '$<': [99.5, 99.5] }, false],
    ['lessThanOrEqual equal values is true', { '$<=': [99.5, 99.5] }, true],
    ['uppercase sorts before lowercase', { $lessThan: ['Z', 'a'] }, true],
    ['string order is not numeric', { $lessThan: ['10', '9'] }, true],
    ['true code-point order beyond the BMP', { $lessThan: ['\u{1F600}', '\u{FF01}'] }, false],
  ])('%s', async (_label, expression, expected) => {
    expect(await ev(expression)).toBe(expected)
  })

  test('heterogeneous operands are a type error — the deliberate asymmetry with equal', async () => {
    expect((await failure({ $greaterThan: '$data.v' }, { v: [1, 'a'] })).code).toBe('type-check')
    expect((await failure({ $lessThan: '$data.v' }, { v: [true, false] })).code).toBe('type-check')
    expect(fig.validate({ '$>': [1, 'a'] }).valid).toBe(false)
  })

  test('exactly two values: a literal violation fails validate(), a dynamic one fails at runtime', async () => {
    expect(fig.validate({ $greaterThan: [12] }).valid).toBe(false)
    expect(fig.validate({ '$<': [] }).valid).toBe(false)
    expect((await failure({ $lessThan: '$data.v' }, { v: [1, 2, 3] })).code).toBe('type-check')
  })

  test('a null operand propagates — even on the inclusive pair (row 10)', async () => {
    expect(await ev({ $greaterThan: ['$data.age', 18] }, {})).toBe(null)
    expect(await ev({ $greaterThanOrEqual: [null, null] })).toBe(null)
    expect(await ev({ $greaterThan: ['$data.age', 18], fallback: 'fb' }, {})).toBe(null)
  })

  test('nullValueDefault makes the node total (ledger #18)', async () => {
    expect(await ev({ $greaterThan: { values: ['$data.age', 18], nullValueDefault: 0 } }, {})).toBe(
      false
    )
    const instance = new FigTree({ operatorDefaults: { lessThan: { nullValueDefault: 0 } } })
    expect(await instance.evaluate({ $lessThan: ['$data.age', 18] }, { data: {} })).toBe(true)
  })

  test('operand failure beats propagation', async () => {
    expect((await failure({ $greaterThan: [null, { $divide: [1, 0] }] })).code).toBe(
      'non-finite-result'
    )
  })
})

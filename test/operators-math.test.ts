/**
 * Chunk 4.2 — batch 3, arithmetic & math. Hand-migrated from the v2 corpus
 * (test/v2-working/4_plus.test.ts, 5_otherArithmetic.test.ts — the
 * independent-oracle rule), plus the new v3 semantics the pass settled:
 * no coercion, `expect`, floored modulo, half-away-from-zero rounding, the
 * finite guard, `nullValueDefault`.
 */
import { FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})
const failure = (expression: unknown, data?: Record<string, unknown>) =>
  rejection<FigTreeError>(ev(expression, data))

describe('plus', () => {
  test.each([
    ['adding 2 numbers', { operator: '+', values: [6, 6] }, 12],
    ['adding 4 numbers', { $plus: [7.5, 25, -0.1, 6] }, 38.4],
    [
      'concatenate 2 arrays',
      {
        '$+': [
          [1, 2, 3],
          ['Four', 'Five', 'Six'],
        ],
      },
      [1, 2, 3, 'Four', 'Five', 'Six'],
    ],
    [
      'concatenate 4 arrays, nested kept as an element',
      { $plus: [[1, 2, 3], ['Four'], [7, 'Nine'], [['Four', 'Five'], 'End']] },
      [1, 2, 3, 'Four', 7, 'Nine', ['Four', 'Five'], 'End'],
    ],
    ['concatenate 3 strings', { $plus: ['Tony', ' ', 'Stark'] }, 'Tony Stark'],
    [
      'merge 2 objects',
      {
        $plus: [
          { one: 1, two: '2', three: false },
          { four: [1, 2, 3], five: true },
        ],
      },
      { one: 1, two: '2', three: false, four: [1, 2, 3], five: true },
    ],
    [
      'merge 3 objects, later keys win',
      { $plus: [{ a: 1, b: 2 }, { b: 3 }, { c: 4 }] },
      { a: 1, b: 3, c: 4 },
    ],
    ['single operand returned verbatim', { $plus: [42] }, 42],
    ['single string operand', { $plus: ['solo'] }, 'solo'],
    ['nested nodes as operands', { $plus: [{ $plus: [1, 2] }, { $plus: [3, 4] }] }, 10],
    ['dynamic whole-array supply', { $plus: '$data.scores' }, 6],
  ])('%s', async (_label, expression, expected) => {
    expect(await ev(expression, { scores: [1, 2, 3] })).toEqual(expected)
  })

  test('mixed operands are a type error — the headline death of coercion', async () => {
    expect((await failure({ $plus: [1, '2'] })).code).toBe('type-check')
    expect((await failure({ $plus: ['a', [1]] })).code).toBe('type-check')
    expect((await failure({ $plus: [true, true] })).code).toBe('type-check')
  })

  test('expect asserts, never converts', async () => {
    expect(
      await ev({ $plus: { values: '$data.scores', expect: 'number' } }, { scores: [1, 2] })
    ).toBe(3)
    const error = await failure(
      { $plus: { values: '$data.mixed', expect: 'number' } },
      { mixed: [1, '2'] }
    )
    expect(error.code).toBe('type-check')
    expect((await failure({ $plus: { values: ['a', 'b'], expect: 'number' } })).code).toBe(
      'type-check'
    )
  })

  test('empty input: error unmoded, identity when pinned (rows 2 and 11)', async () => {
    const error = await failure({ $plus: '$data.empty' }, { empty: [] })
    expect(error.code).toBe('empty-aggregate')
    expect(await ev({ $plus: { values: '$data.empty', expect: 'number' } }, { empty: [] })).toBe(0)
    expect(await ev({ $plus: { values: '$data.empty', expect: 'string' } }, { empty: [] })).toBe('')
    expect(await ev({ $plus: { values: '$data.empty', expect: 'array' } }, { empty: [] })).toEqual(
      []
    )
    expect(await ev({ $plus: { values: '$data.empty', expect: 'object' } }, { empty: [] })).toEqual(
      {}
    )
    // a LITERAL [] is a static error the gate refuses — no fallback applies
    // (rule 2); the fallback cell of row 2 is the dynamic case
    expect(await ev({ $plus: '$data.empty', fallback: 0 }, { empty: [] })).toBe(0)
  })

  test('a literal empty values fails validate() unless a literal expect pins it', () => {
    const unpinned = fig.validate({ $plus: [] })
    expect(unpinned.valid).toBe(false)
    const pinned = fig.validate({ $plus: { values: [], expect: 'number' } })
    expect(pinned.valid).toBe(true)
    expect(pinned.issues.some((issue) => issue.severity === 'warning')).toBe(true)
  })

  test('a null operand propagates; nullValueDefault replaces it (row 3, ledger #18)', async () => {
    expect(await ev({ $plus: ['$data.missing', 5] })).toBe(null)
    expect(await ev({ $plus: { values: ['$data.missing', 5], nullValueDefault: 0 } })).toBe(5)
    expect(await ev({ $plus: { values: [null, 5], expect: 'number' } })).toBe(null)
    const instance = new FigTree({ operatorDefaults: { plus: { nullValueDefault: 0 } } })
    expect(await instance.evaluate({ $plus: ['$data.a', 5] }, { data: {} })).toBe(5)
  })

  test('propagation is success — a fallback is ignored (row 3)', async () => {
    expect(await ev({ $plus: [null, 5], fallback: 'fb' })).toBe(null)
  })

  test('a missing values parameter is a static error', () => {
    expect(fig.validate({ operator: '+' }).issues.map((i) => i.code)).toContain('missing-required')
  })
})

describe('subtract / divide / modulo', () => {
  test.each([
    ['subtract integers', { $subtract: [9, 6] }, 3],
    ['subtract via named face', { operator: '-', value: 100, minus: 76 }, 24],
    ['subtract, negative result', { '$-': [66, 99] }, -33],
    ['subtract floats', { $subtract: [10.5, 4.1] }, 6.4],
    ['subtract floats, negative', { $subtract: [0.3, 49.777] }, -49.477000000000004],
    ['divide integers', { $divide: [60, 20] }, 3],
    ['divide via named face', { operator: '/', value: 150, by: 4 }, 37.5],
    ['divide, fractional result', { '$/': [100, 3] }, 33.333333333333336],
    ['divide with node operands', { '$/': [{ $plus: [70, 20] }, { $plus: [1, 1, 1] }] }, 30],
    ['quotient is a composition', { $floor: { $divide: [145, 3] } }, 48],
    ['modulo positive', { $modulo: [145, 3] }, 1],
    ['modulo is floored: negative dividend', { $modulo: [-7, 3] }, 2],
    ['modulo is floored: negative modulus', { $modulo: [7, -3] }, -2],
    ['modulo via named face', { operator: 'modulo', value: 10, mod: 3 }, 1],
  ])('%s', async (_label, expression, expected) => {
    expect(await ev(expression)).toBe(expected)
  })

  test('division by zero fails via the finite guard, catchably', async () => {
    const error = await failure({ operator: '/', value: 69, by: { $subtract: [6, 6] } })
    expect(error.code).toBe('non-finite-result')
    expect(error.operator).toBe('divide')
    expect(await ev({ $divide: [1, 0], fallback: null })).toBe(null)
    expect((await failure({ $modulo: [5, 0] })).code).toBe('non-finite-result')
  })

  test('a non-number operand is a type error, not NaN', async () => {
    expect((await failure({ $subtract: [0.3, '$data.s'] }, { s: 'five' })).code).toBe('type-check')
    expect(fig.validate({ $divide: [0.3, 'five'] }).valid).toBe(false)
  })

  test('arity is fixed: surplus and missing operands are static errors', () => {
    expect(fig.validate({ $subtract: [0.3] }).issues.map((i) => i.code)).toContain(
      'missing-required'
    )
    expect(fig.validate({ $divide: [1, 2, 3] }).issues.map((i) => i.code)).toContain(
      'positional-arity'
    )
    expect(fig.validate({ operator: '-', minus: 0.3 }).valid).toBe(false)
  })

  test('null operands propagate', async () => {
    expect(await ev({ $subtract: ['$data.missing', 1] })).toBe(null)
    expect(await ev({ operator: 'divide', value: 1, by: '$data.missing' })).toBe(null)
  })
})

describe('multiply', () => {
  test.each([
    ['2 values', { $multiply: [2, 4] }, 8],
    ['multiple values', { '$*': [7, 3, 99] }, 2079],
    ['single value', { $multiply: [6.5] }, 6.5],
    ['floats', { $multiply: [8.5, 6, 12] }, 612],
  ])('%s', async (_label, expression, expected) => {
    expect(await ev(expression)).toBe(expected)
  })

  test('empty input is 1 — the empty product (row 12); a literal [] warns', async () => {
    expect(await ev({ $multiply: '$data.factors' }, { factors: [] })).toBe(1)
    const result = fig.validate({ $multiply: [] })
    expect(result.valid).toBe(true)
    expect(result.issues.some((issue) => issue.severity === 'warning')).toBe(true)
  })

  test('non-number inputs are a type error', async () => {
    expect((await failure({ $multiply: '$data.v' }, { v: [17, 'twelve'] })).code).toBe('type-check')
  })

  test('null factors propagate unless nullValueDefault says otherwise', async () => {
    expect(await ev({ $multiply: [2, '$data.missing'] })).toBe(null)
    expect(await ev({ $multiply: { values: [2, '$data.missing'], nullValueDefault: 1 } })).toBe(2)
  })
})

describe('power / round / floor / ceil / abs', () => {
  test.each([
    ['power', { $power: [2, 10] }, 1024],
    ['power alias', { '$^': [3, 2] }, 9],
    ['power 0^0 is 1', { $power: [0, 0] }, 1],
    ['round default 0 decimals', { $round: 3.7 }, 4],
    ['round to 2 decimals', { $round: [3.14159, 2] }, 3.14],
    ['round ties half away from zero', { $round: 2.5 }, 3],
    ['round ties half away from zero, negative', { $round: -2.5 }, -3],
    ['round works on the decimal representation', { $round: [1.005, 2] }, 1.01],
    ['round negative decimals', { $round: [1234, -2] }, 1200],
    ['floor', { $floor: -3.5 }, -4],
    ['ceil', { $ceil: -3.5 }, -3],
    ['abs', { $abs: -12 }, 12],
  ])('%s', async (_label, expression, expected) => {
    expect(await ev(expression)).toBe(expected)
  })

  test('overflow and complex results fail via the finite guard', async () => {
    expect((await failure({ $power: [10, 400] })).code).toBe('non-finite-result')
    expect((await failure({ $power: [-8, 0.5] })).code).toBe('non-finite-result')
  })

  test('round: a null decimals means unset — 0 (row 14); a null value propagates', async () => {
    expect(await ev({ $round: ['$data.price', null] }, { price: 3.7 })).toBe(4)
    expect(
      await ev({ operator: 'round', value: 3.7, decimals: '$data.settings.precision' }, {})
    ).toBe(4)
    expect(await ev({ $round: ['$data.missing', 2] })).toBe(null)
    expect((await failure({ $round: [3.7, '$data.d'] }, { d: 1.5 })).code).toBe('type-check')
  })
})

describe('min / max', () => {
  test.each([
    ['min numbers', { $min: [3, 1, 7] }, 1],
    ['max numbers', { $max: [3, 1, 7] }, 7],
    [
      'max strings — ISO timestamps order by codepoint',
      { $max: ['2024-01-05', '2023-12-31'] },
      '2024-01-05',
    ],
    ['min strings: uppercase sorts first', { $min: ['a', 'Z'] }, 'Z'],
    ['min strings: string order is not numeric', { $min: ['10', '9'] }, '10'],
    ['returns the element itself', { $max: [1.0, 2.5] }, 2.5],
  ])('%s', async (_label, expression, expected) => {
    expect(await ev(expression)).toBe(expected)
  })

  test('heterogeneous candidates are a type error', async () => {
    expect((await failure({ $min: '$data.v' }, { v: [1, 'a'] })).code).toBe('type-check')
    expect(fig.validate({ $max: [1, 'a'] }).valid).toBe(false)
  })

  test('empty input is an error, no identity in the domain', async () => {
    expect((await failure({ $min: '$data.empty' }, { empty: [] })).code).toBe('empty-aggregate')
    expect(fig.validate({ $max: [] }).valid).toBe(false)
    expect(await ev({ $min: '$data.empty', fallback: 0 }, { empty: [] })).toBe(0)
  })

  test('a null candidate propagates (row 13); nullValueDefault replaces it', async () => {
    expect(await ev({ $min: [3, '$data.missing', 7] })).toBe(null)
    expect(await ev({ $min: { values: [3, '$data.missing', 7], nullValueDefault: 0 } })).toBe(0)
  })
})

test('combined arithmetic, the v2 corpus finale respelled without coercion', async () => {
  const expression = {
    $plus: [
      { $subtract: [10, { $length: [1, 2, 3, 4, 5, 6, 7, 8, 9] }] },
      { $multiply: [0.5, { $modulo: [48, 10] }, 0.5] },
      { operator: 'divide', value: 81, by: 9 },
    ],
  }
  expect(await ev(expression)).toBe(12)
})

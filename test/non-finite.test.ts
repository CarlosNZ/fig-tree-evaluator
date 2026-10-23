/**
 * NaN and ±Infinity arriving from host data or a JS-authored literal (#269).
 * NaN fails only where an operator needs a number; elsewhere it is a value,
 * and a falsy one. The infinities are numbers.
 */
import { FigTree, FigTreeError } from '../src'

const fig = new FigTree()

const rejection = async (promise: Promise<unknown>): Promise<FigTreeError> => {
  try {
    await promise
  } catch (error) {
    return error as FigTreeError
  }
  throw new Error('expected a rejection')
}

describe('NaN at a number parameter', () => {
  test.each([
    ['plus', { $plus: ['$data.x', 1] }],
    ['divide', { $divide: [1, '$data.x'] }],
    ['min', { $min: ['$data.x', 1] }],
    ['greaterThan', { $greaterThan: ['$data.x', 1] }],
    ['round', { $round: ['$data.x'] }],
  ])('%s fails type-check', async (_, expression) => {
    const error = await rejection(fig.evaluate(expression, { data: { x: NaN } }))
    expect(error.code).toBe('type-check')
    expect(error.message).toContain('NaN')
  })

  test('an aggregate fails on a NaN element', async () => {
    const error = await rejection(fig.evaluate({ $max: '$data.xs' }, { data: { xs: [1, NaN] } }))
    expect(error.code).toBe('type-check')
    expect(error.message).toContain('NaN')
  })

  test('the failure is catchable', async () => {
    expect(await fig.evaluate({ $plus: ['$data.x', 1], fallback: 0 }, { data: { x: NaN } })).toBe(0)
  })

  test('validate() reports a JS-authored NaN at a number parameter', () => {
    const { valid, issues } = fig.validate({ $plus: [NaN, 1] })
    expect(valid).toBe(false)
    expect(issues.map((issue) => issue.code)).toContain('type-check')
  })
})

describe('NaN as a condition is falsy', () => {
  const data = { x: NaN, xs: [NaN, 1, 0] }

  test('if, not, and, or', async () => {
    expect(await fig.evaluate({ $if: ['$data.x', 'yes', 'no'] }, { data })).toBe('no')
    expect(await fig.evaluate({ $not: '$data.x' }, { data })).toBe(true)
    expect(await fig.evaluate({ $and: ['$data.x', true] }, { data })).toBe(false)
    expect(await fig.evaluate({ $or: ['$data.x', false] }, { data })).toBe(false)
  })

  test('filter drops NaN elements', async () => {
    expect(await fig.evaluate({ $filter: ['$data.xs', '$element'] }, { data })).toEqual([1])
  })

  test('convert to boolean', async () => {
    expect(await fig.evaluate({ $convert: ['$data.x', 'boolean'] }, { data })).toBe(false)
  })
})

describe('the infinities are numbers', () => {
  const data = { x: Infinity, y: -Infinity }

  test('in comparisons', async () => {
    expect(await fig.evaluate({ $greaterThan: ['$data.x', 1e308] }, { data })).toBe(true)
    expect(await fig.evaluate({ $lessThan: ['$data.y', -1e308] }, { data })).toBe(true)
    expect(await fig.evaluate({ $greaterThanOrEqual: ['$data.x', '$data.x'] }, { data })).toBe(true)
  })

  test('in math with a finite result', async () => {
    expect(await fig.evaluate({ $min: ['$data.x', 10] }, { data })).toBe(10)
    expect(await fig.evaluate({ $divide: [1, '$data.x'] }, { data })).toBe(0)
  })

  test('as a condition', async () => {
    expect(await fig.evaluate({ $if: ['$data.x', 'yes', 'no'] }, { data })).toBe('yes')
  })

  test('an integer parameter rejects one', async () => {
    const error = await rejection(fig.evaluate({ $round: [1.5, '$data.x'] }, { data }))
    expect(error.code).toBe('type-check')
  })

  test('arithmetic carries one from an operand', async () => {
    expect(await fig.evaluate({ $max: ['$data.x', 10] }, { data })).toBe(Infinity)
    expect(await fig.evaluate({ $plus: ['$data.x', 1] }, { data })).toBe(Infinity)
    expect(await fig.evaluate({ $subtract: [0, '$data.x'] }, { data })).toBe(-Infinity)
    expect(await fig.evaluate({ $multiply: ['$data.y', 2] }, { data })).toBe(-Infinity)
    expect(await fig.evaluate({ $floor: '$data.x' }, { data })).toBe(Infinity)
    expect(await fig.evaluate({ $round: ['$data.x', 2] }, { data })).toBe(Infinity)
    expect(await fig.evaluate({ $convert: ['$data.x', 'number'] }, { data })).toBe(Infinity)
  })

  test('operators handing a value on return one', async () => {
    expect(await fig.evaluate({ $firstNonNull: [null, '$data.x'] }, { data })).toBe(Infinity)
    expect(await fig.evaluate({ $get: { from: '$data', path: 'x' } }, { data })).toBe(Infinity)
  })

  test('a NaN computed from one fails', async () => {
    const error = await rejection(fig.evaluate({ $subtract: ['$data.x', '$data.x'] }, { data }))
    expect(error.code).toBe('non-finite-result')
    expect(error.message).toBe('subtract – produced a non-finite number (NaN)')
  })

  test('renderers write them out', async () => {
    expect(await fig.evaluate({ $buildString: ['%1 %2', '$data.x', '$data.y'] }, { data })).toBe(
      'Infinity -Infinity'
    )
    expect(await fig.evaluate({ $convert: ['$data.x', 'string'] }, { data })).toBe('Infinity')
  })
})

describe('an infinity created from finite operands fails', () => {
  test.each([
    ['plus', { $plus: [1.7e308, 1.7e308] }, 'Infinity'],
    ['subtract', { $subtract: [-1.7e308, 1.7e308] }, '-Infinity'],
    ['multiply', { $multiply: [1e200, 1e200] }, 'Infinity'],
    ['divide by zero', { $divide: [1, 0] }, 'Infinity'],
    ['divide overflow', { $divide: [1e308, 1e-10] }, 'Infinity'],
    ['power', { $power: [10, 400] }, 'Infinity'],
    ['power of zero', { $power: [0, -1] }, 'Infinity'],
    ['convert', { $convert: ['1e400', 'number'] }, 'Infinity'],
    ['convert spelled out', { $convert: ['-Infinity', 'number'] }, '-Infinity'],
  ])('%s', async (_, expression, shown) => {
    const error = await rejection(fig.evaluate(expression))
    expect(error.code).toBe('non-finite-result')
    expect(error.message).toContain(`produced a non-finite number (${shown})`)
  })

  test('a NaN computed from finite operands fails at the result boundary', async () => {
    const error = await rejection(fig.evaluate({ $divide: [0, 0] }))
    expect(error.code).toBe('non-finite-result')
    expect(error.message).toBe('divide – produced a non-finite number (NaN)')
  })
})

describe('NaN where nothing computes with it', () => {
  const data = { x: NaN, xs: [NaN, 1] }

  test('a bare reference, a plain literal, a fallback', async () => {
    expect(await fig.evaluate('$data.x', { data })).toBeNaN()
    expect(await fig.evaluate({ a: '$data.x' }, { data })).toEqual({ a: NaN })
    expect(await fig.evaluate({ $divide: [0, 0], fallback: '$data.x' }, { data })).toBeNaN()
  })

  test('operators handing it on return it', async () => {
    expect(await fig.evaluate({ $if: [true, '$data.x', 0] }, { data })).toBeNaN()
    expect(await fig.evaluate({ $firstNonNull: ['$data.x', 0] }, { data })).toBeNaN()
    expect(await fig.evaluate({ $get: { from: '$data', path: 'x' } }, { data })).toBeNaN()
    expect(await fig.evaluate({ $find: ['$data.xs', true] }, { data })).toBeNaN()
    expect(await fig.evaluate({ $map: ['$data.xs', '$element'] }, { data })).toEqual([NaN, 1])
  })

  test('equality', async () => {
    expect(await fig.evaluate({ $equal: ['$data.x', '$data.x'] }, { data })).toBe(true)
    expect(await fig.evaluate({ $equal: ['$data.x', null] }, { data })).toBe(false)
    expect(await fig.evaluate({ $notEqual: ['$data.x', '$data.x'] }, { data })).toBe(false)
  })

  test('renderers write it out', async () => {
    expect(await fig.evaluate({ $buildString: ['v=%1', '$data.x'] }, { data })).toBe('v=NaN')
    expect(await fig.evaluate({ $join: { values: '$data.xs', delimiter: '-' } }, { data })).toBe(
      'NaN-1'
    )
    expect(await fig.evaluate({ $convert: ['$data.x', 'string'] }, { data })).toBe('NaN')
  })

  test('convert to number fails', async () => {
    const error = await rejection(fig.evaluate({ $convert: ['$data.x', 'number'] }, { data }))
    expect(error.code).toBe('non-finite-result')
  })
})

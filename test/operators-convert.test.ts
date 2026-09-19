/**
 * Chunk 4.2 — `convert`, the one explicit cast ("convert semantics" in
 * docs-dev/v3-specs/v3-api.md). Respelled from
 * test/v2-working/16_outputConversion.test.ts: v2's `outputType` modifier
 * becomes a `convert` node, and its implicit number-mining cases become
 * failures (that job is regex extract's).
 */
import { FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})
const failure = (expression: unknown, data?: Record<string, unknown>) =>
  rejection<FigTreeError>(ev(expression, data))

describe('to: number', () => {
  test.each([
    ['number is identity', { $convert: [42, 'number'] }, 42],
    ['numeric string', { $convert: ['5.5', 'number'] }, 5.5],
    ['surrounding whitespace allowed', { $convert: [' 42 ', 'number'] }, 42],
    ['leading dot', { $convert: ['.001', 'number'] }, 0.001],
    ['boolean true is 1', { $convert: [true, 'number'] }, 1],
    ['boolean false is 0', { $convert: [false, 'number'] }, 0],
    ['already a number, from a node', { $convert: [{ $plus: [1, 2, 3, 4, 5, 6] }, 'number'] }, 21],
  ])('%s', async (_label, expression, expected) => {
    expect(await ev(expression)).toBe(expected)
  })

  test.each([
    ['text with a number inside — no mining', 'There is a number 46 inside here!'],
    ['no numeric content', 'this plus this'],
    ['empty string', ''],
    ['whitespace only', '   '],
  ])('fails on %s', async (_label, input) => {
    const error = await failure({ $convert: ['$data.s', 'number'] }, { s: input })
    expect(error.code).toBe('operator-failure')
    expect(error.operator).toBe('convert')
  })

  test('arrays and objects fail', async () => {
    expect((await failure({ $convert: [[1], 'number'] })).code).toBe('operator-failure')
    expect((await failure({ $convert: [{ a: 1 }, 'number'] })).code).toBe('operator-failure')
  })
})

describe('to: string', () => {
  test.each([
    ['string is identity', { $convert: ['abc', 'string'] }, 'abc'],
    ['number', { $convert: [300, 'string'] }, '300'],
    ['number from a node', { $convert: [{ $plus: [150, 150] }, 'string'] }, '300'],
    ['boolean', { $convert: [false, 'string'] }, 'false'],
    ['decimal form', { $convert: [999.99, 'string'] }, '999.99'],
  ])('%s', async (_label, expression, expected) => {
    expect(await ev(expression)).toBe(expected)
  })

  test('composites fail — a cast is not a render', async () => {
    expect((await failure({ $convert: [[1, 2], 'string'] })).code).toBe('operator-failure')
    expect((await failure({ $convert: [{ a: 1 }, 'string'] })).code).toBe('operator-failure')
  })
})

describe('to: boolean', () => {
  test.each([
    ['non-empty string', 'string', true],
    ['positive number', 5, true],
    ['zero', 0, false],
    ['empty string', '', false],
    ['the carve-out: "false"', 'false', false],
    ['the carve-out is case-insensitive and trimmed', ' FALSE ', false],
    ['the carve-out: "true"', 'true', true],
    ['empty array is truthy', [], true],
  ])('%s', async (_label, input, expected) => {
    expect(await ev({ $convert: ['$data.v', 'boolean'] }, { v: input })).toBe(expected)
  })

  test('null is consumed — false, not propagated (the conditional policy)', async () => {
    expect(await ev({ $convert: ['$data.missing', 'boolean'] }, {})).toBe(false)
    expect(await ev({ $convert: [null, 'boolean'] })).toBe(false)
  })
})

describe('to: array', () => {
  test('wraps anything that is not already an array', async () => {
    expect(await ev({ $convert: [4, 'array'] })).toEqual([4])
    expect(await ev({ $convert: [[4], 'array'] })).toEqual([4])
    expect(await ev({ $plus: [[1, 2, 3], { $convert: [4, 'array'] }] })).toEqual([1, 2, 3, 4])
  })
})

describe('null and the selector', () => {
  test('null propagates for number, string and array', async () => {
    for (const to of ['number', 'string', 'array']) {
      expect(await ev({ $convert: ['$data.missing', to] }, {})).toBe(null)
    }
  })

  test('a literal to outside the union fails validate(); a dynamic one fails at runtime', async () => {
    expect(fig.validate({ $convert: [1, 'integer'] }).valid).toBe(false)
    expect((await failure({ $convert: [1, '$data.to'] }, { to: 'integer' })).code).toBe(
      'type-check'
    )
  })

  test('a dynamic to works like a literal one', async () => {
    expect(await ev({ $convert: ['5', '$data.to'] }, { to: 'number' })).toBe(5)
  })

  test('to is required — a single payload is a static error', () => {
    expect(fig.validate({ $convert: 5 }).issues.map((i) => i.code)).toContain('missing-required')
  })

  test('a failed cast is catchable, and the mining respelling now runs', async () => {
    expect(await ev({ $convert: ['$data.w', 'number'], fallback: null }, { w: '15 grams' })).toBe(
      null
    )
    // The sanctioned pipeline the Operators table promised: extract, then
    // cast. Its own assertions live in test/operators-regex.test.ts
    expect(
      await ev(
        {
          $convert: {
            value: { $regex: { value: '$data.w', pattern: '\\d+', mode: 'extract' } },
            to: 'number',
          },
        },
        { w: '15 grams' }
      )
    ).toBe(15)
  })
})

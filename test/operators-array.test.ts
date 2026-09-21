/**
 * Chunk 4.2 — `length` (batch 5's eager member). Hand-migrated from the
 * COUNT cases in test/v2-working/5_otherArithmetic.test.ts, plus string
 * support counted in code points.
 */
import { FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data?: Record<string, unknown>) =>
  fig.evaluate(expression, data !== undefined ? { data } : {})

test.each([
  ['simple array', { operator: 'length', value: [1, 2, 3] }, 3],
  ['rest-only positional binds the whole list', { $length: ['a', 'b', { $plus: [1, 2, 3] }] }, 3],
  ['a node returning an array', { $length: { $plus: [[1, 2], [3]] } }, 3],
  ['empty array', { $length: [] }, 0],
  ['string counts code points', { $length: 'hello' }, 5],
  ['emoji is one code point', { $length: '😀' }, 1],
  ['empty string', { $length: '' }, 0],
  ['dynamic supply', { $length: '$data.tags' }, 2],
])('%s', async (_label, expression, expected) => {
  expect(await ev(expression, { tags: ['a', 'b'] })).toBe(expected)
})

test('null propagates — the composed guard degrades to null', async () => {
  expect(await ev({ $length: '$data.tags' }, {})).toBe(null)
  expect(await ev({ $greaterThan: [{ $length: '$data.tags' }, 0] }, {})).toBe(null)
})

test('an object input is a type error', async () => {
  const error = await rejection<FigTreeError>(ev({ $length: '$data.o' }, { o: { a: 1 } }))
  expect(error.code).toBe('type-check')
})

test('a missing value is a static error', () => {
  expect(fig.validate({ operator: 'length' }).issues.map((i) => i.code)).toContain(
    'missing-required'
  )
})

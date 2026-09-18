/**
 * Chunk 4.2 — the settled gradient rulings the eager set discharges
 * (docs-dev/v3-specs/v3-cases-for-review.md rows 2, 3, 10, 11, 12, 13, 14),
 * each row verbatim: the case, without and with a `fallback`.
 */
import { FigTree } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data: Record<string, unknown> = {}) =>
  fig.evaluate(expression, { data })

test('row 2 — empty aggregate, no mode pinned: error; F with fallback', async () => {
  expect((await rejection<{ code: string }>(ev({ $plus: '$data.e' }, { e: [] }))).code).toBe(
    'empty-aggregate'
  )
  expect(await ev({ $plus: '$data.e', fallback: 0 }, { e: [] })).toBe(0)
  const host = new FigTree({ operatorDefaults: { plus: { fallback: 0 } } })
  expect(await host.evaluate({ $plus: '$data.e' }, { data: { e: [] } })).toBe(0)
})

test('row 3 — null operand: null, propagate; fallback ignored', async () => {
  expect(await ev({ $plus: ['$data.missing', 5] })).toBe(null)
  expect(await ev({ $plus: ['$data.missing', 5], fallback: 'F' })).toBe(null)
})

test('row 10 — inclusive ordering on two nulls: null, not true; fallback ignored', async () => {
  expect(await ev({ $greaterThanOrEqual: ['$data.a', '$data.b'] })).toBe(null)
  expect(await ev({ $greaterThanOrEqual: ['$data.a', '$data.b'], fallback: 'F' })).toBe(null)
})

test('row 11 — empty aggregate with the mode pinned: the identity', async () => {
  expect(await ev({ $plus: { values: '$data.e', expect: 'number' } }, { e: [] })).toBe(0)
  expect(
    await ev({ $plus: { values: '$data.e', expect: 'number' }, fallback: 'F' }, { e: [] })
  ).toBe(0)
})

test('row 12 — empty multiply: 1, the vacuous product', async () => {
  expect(await ev({ $multiply: '$data.e' }, { e: [] })).toBe(1)
  expect(await ev({ $multiply: '$data.e', fallback: 'F' }, { e: [] })).toBe(1)
})

test('row 13 — null element in min: null; fallback ignored', async () => {
  expect(await ev({ $min: [3, '$data.missing', 7] })).toBe(null)
  expect(await ev({ $min: [3, '$data.missing', 7], fallback: 'F' })).toBe(null)
})

test('row 14 — null at optional decimals means unset; a null value still propagates', async () => {
  expect(await ev({ $round: ['$data.price', null] }, { price: 3.7 })).toBe(4)
  expect(await ev({ $round: ['$data.price', null], fallback: 'F' }, { price: 3.7 })).toBe(4)
  expect(await ev({ $round: ['$data.missing', null] })).toBe(null)
})

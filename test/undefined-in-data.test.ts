/**
 * `undefined` inside host data ("The value domain" in
 * docs-dev/v3-specs/v3-api.md, #275). A reference hands a container over as
 * given, `undefined` and all; wherever an operator ACTS on a value —
 * renders it, applies a null policy to it, type-checks it, skips it — it
 * reads `undefined` as `null`. Each case sits beside its `null` twin, which
 * it must match.
 */
import { FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'

const fig = new FigTree()
const ev = (expression: unknown, data: Record<string, unknown>) =>
  fig.evaluate(expression, { data })
const failure = (expression: unknown, data: Record<string, unknown>) =>
  rejection<FigTreeError>(ev(expression, data))

type Data = Record<string, unknown>
const both = (make: (absent: null | undefined) => Data): [string, Data][] => [
  ['null', make(null)],
  ['undefined', make(undefined)],
]

describe('acting on a value: undefined reads as null', () => {
  test.each(both((absent) => ({ xs: ['a', absent, 'b'] })))(
    'join renders %s as empty, keeping its delimiter',
    async (_label, data) => {
      expect(await ev({ $join: { values: '$data.xs', delimiter: ',' } }, data)).toBe('a,,b')
    }
  )

  test.each(both((absent) => ({ o: { a: 1, b: absent } })))(
    'buildString renders a named %s as empty',
    async (_label, data) => {
      const template = { $buildString: { template: '{{a}}|{{b}}', substitutions: '$data.o' } }
      expect(await ev(template, data)).toBe('1|')
    }
  )

  test.each(both((absent) => ({ xs: [3, absent, 1] })))(
    'an element null policy propagates %s',
    async (_label, data) => {
      expect(await ev({ $plus: '$data.xs' }, data)).toBeNull()
      expect(await ev({ $max: '$data.xs' }, data)).toBeNull()
    }
  )

  test.each(both((absent) => ({ xs: [3, absent, 1] })))(
    'nullValueDefault replaces %s',
    async (_label, data) => {
      expect(await ev({ operator: 'plus', values: '$data.xs', nullValueDefault: 10 }, data)).toBe(
        14
      )
    }
  )

  test.each(both((absent) => ({ xs: [absent, 'second'] })))(
    'firstNonNull skips %s',
    async (_label, data) => {
      expect(await ev({ $firstNonNull: '$data.xs' }, data)).toBe('second')
    }
  )

  test.each(both((absent) => ({ entries: [{ key: absent, value: 1 }] })))(
    'an elementShape property holding %s is type-checked as null',
    async (_label, data) => {
      const error = await failure({ $buildObject: '$data.entries' }, data)
      expect(error.code).toBe('type-check')
      expect(error.message).toContain('received null')
    }
  )
})

describe('carrying a value: undefined stays as given', () => {
  const xs = [1, undefined]

  test('a reference returns the container itself', async () => {
    expect(await ev('$data.xs', { xs })).toBe(xs)
  })

  test('filter keeps the element as it found it', async () => {
    const kept = (await ev({ $filter: ['$data.xs', true] }, { xs })) as unknown[]
    expect(kept).toHaveLength(2)
    expect(kept[1]).toBeUndefined()
  })

  test('equal compares what it is given', async () => {
    expect(await ev({ $equal: ['$data.o', { a: 1 }] }, { o: { a: 1, b: undefined } })).toBe(false)
    expect(await ev({ $equal: ['$data.xs', [1, null]] }, { xs })).toBe(false)
  })
})

/**
 * Chunk 4.1 — the dispatch and `evaluate()`'s own behaviour ("One spine,
 * two views" and "evaluate() return shapes" in
 * docs-dev/v3-specs/v3-evaluator-methods.md): identity for constants,
 * skeleton splicing, `$data` references, the static-error gate, the probe
 * fast path and the per-call limits.
 */
import { FigTree, FigTreeError, type CallOptions } from '../src'
import { boomOp, echoOp, spyOp } from './fixtures/evalOperators'

const fig = new FigTree({ operators: [echoOp(), boomOp()] })

const nest = (depth: number, leaf: unknown, asArray = false): unknown => {
  let value = leaf
  for (let i = 0; i < depth; i++) value = asArray ? [value] : { k: value }
  return value
}

const rejection = async (promise: Promise<unknown>): Promise<FigTreeError> => {
  try {
    await promise
  } catch (error) {
    return error as FigTreeError
  }
  throw new Error('expected a rejection')
}

describe('constants evaluate by identity', () => {
  test('primitives come back as themselves', async () => {
    expect(await fig.evaluate(42)).toBe(42)
    expect(await fig.evaluate('text')).toBe('text')
    expect(await fig.evaluate(null)).toBe(null)
    expect(await fig.evaluate(true)).toBe(true)
  })

  test('a fully-constant container is returned by reference — the O(1) short-circuit', async () => {
    const input = { a: [1, { b: 'c' }], d: { e: null } }
    expect(await fig.evaluate(input)).toBe(input)
  })

  test('opaque values pass through untouched', async () => {
    const when = new Date(0)
    const input = { when, fn: () => 1 }
    expect(await fig.evaluate(input)).toBe(input)
    expect(await fig.evaluate(when)).toBe(when)
  })

  test('literal contents are returned as data, never evaluated', async () => {
    const quoted = { operator: 'echo', value: 1 }
    expect(await fig.evaluate({ $literal: quoted })).toBe(quoted)
  })

  test('normalizing inputs are not identity: comments and undefined are consumed', async () => {
    expect(await fig.evaluate({ a: 1, '//': 'note' })).toEqual({ a: 1 })
    expect(await fig.evaluate({ a: 1, b: undefined })).toEqual({ a: 1 })
    expect(await fig.evaluate([1, undefined])).toEqual([1, null])
  })
})

describe('skeletons splice hole results into a copy', () => {
  test('values land at their authored positions', async () => {
    const result = await fig.evaluate({
      a: { $echo: 1 },
      b: 'x',
      c: [1, { $echo: 2 }, { d: { $echo: 3 } }],
    })
    expect(result).toEqual({ a: 1, b: 'x', c: [1, 2, { d: 3 }] })
  })

  test('the input and the cached skeleton are never mutated', async () => {
    const input = { a: '$data.x', b: { c: '$data.y', d: 'static' } }
    const snapshot = JSON.parse(JSON.stringify(input))
    const first = await fig.evaluate(input, { data: { x: 1, y: 2 } })
    const second = await fig.evaluate(input, { data: { x: 10, y: 20 } })
    expect(first).toEqual({ a: 1, b: { c: 2, d: 'static' } })
    expect(second).toEqual({ a: 10, b: { c: 20, d: 'static' } })
    expect(input).toEqual(snapshot)
    expect(first).not.toBe(input)
  })

  test('constant subtrees are shared, not copied', async () => {
    const shared = { deep: [1, 2, 3] }
    const result = (await fig.evaluate({ a: '$data.x', keep: shared }, { data: { x: 1 } })) as {
      keep: unknown
    }
    expect(result.keep).toBe(shared)
  })

  test('a node root is the degenerate one-hole case', async () => {
    expect(await fig.evaluate({ $echo: 'root' })).toBe('root')
  })
})

describe('a sparse array compiles as its undefined elements do (#178)', () => {
  const core = new FigTree()
  // eslint-disable-next-line no-sparse-arrays
  const sparse = [1, , 3]

  test('validate() reports it rather than throwing', () => {
    expect(core.validate(sparse)).toEqual({ valid: true, issues: [] })
  })

  test('compile() and evaluate() read the gap as null', async () => {
    expect(await core.compile(sparse).evaluate()).toStrictEqual([1, null, 3])
    expect(await core.evaluate(sparse)).toStrictEqual([1, null, 3])
    expect(await core.evaluate({ $plus: sparse })).toBe(
      await core.evaluate({ $plus: [1, undefined, 3] })
    )
  })

  test('a gap beside a hole', async () => {
    const holes = new Array(3) as unknown[]
    holes[1] = '$data.x'
    expect(await core.evaluate(holes, { data: { x: 'X' } })).toStrictEqual([null, 'X', null])
  })

  test('a gap in a lazyElements parameter is a null element', async () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(await core.evaluate({ $and: [true, , '$data.x'] }, { data: { x: true } })).toBe(false)
    // eslint-disable-next-line no-sparse-arrays
    expect(await core.evaluate({ $firstOf: [, , '$data.x'] }, { data: { x: 2 } })).toBe(2)
  })
})

describe('a __proto__ key is data like any other key (#182)', () => {
  // Only JSON can carry an own `__proto__` key: an object literal's sets the
  // prototype instead
  const parse = (json: string): unknown => JSON.parse(json)
  const own = (result: unknown): unknown =>
    Object.getOwnPropertyDescriptor(result as object, '__proto__')?.value
  const isPlain = (result: unknown): boolean => Object.getPrototypeOf(result) === Object.prototype

  test('a hole at the key lands as an own property', async () => {
    const result = await fig.evaluate(parse('{"__proto__": "$data.x", "a": 1}'), {
      data: { x: 'X' },
    })
    expect(Object.keys(result as object).sort()).toEqual(['__proto__', 'a'])
    expect(own(result)).toBe('X')
    expect(isPlain(result)).toBe(true)
  })

  test('a constant at the key survives beside a hole', async () => {
    const result = await fig.evaluate(parse('{"__proto__": 5, "b": "$data.y"}'), {
      data: { y: 'Y' },
    })
    expect(Object.keys(result as object).sort()).toEqual(['__proto__', 'b'])
    expect(own(result)).toBe(5)
  })

  test('an all-constant container still comes back by identity, key intact', async () => {
    const input = parse('{"__proto__": 5, "b": 1}')
    expect(await fig.evaluate(input)).toBe(input)
  })

  test("an object value never becomes the result's prototype", async () => {
    const o = { x: 1 }
    const result = await fig.evaluate(parse('{"__proto__": "$data.o", "a": 1}'), { data: { o } })
    expect(own(result)).toBe(o)
    expect(isPlain(result)).toBe(true)
    expect((result as { x?: unknown }).x).toBeUndefined()
  })

  test('a nested literal at the key is spliced into, not adopted', async () => {
    const result = await fig.evaluate(parse('{"__proto__": {"x": "$data.v"}, "a": 1}'), {
      data: { v: 'V' },
    })
    expect(own(result)).toEqual({ x: 'V' })
    expect(isPlain(result)).toBe(true)
  })
})

describe('$data references', () => {
  const data = { user: { name: 'Ada', tags: ['x', 'y'] }, orders: [{ total: 1 }, { total: 2 }] }

  test('bare $data is the whole merged data object', async () => {
    const result = (await fig.evaluate('$data', { data })) as Record<string, unknown>
    expect(result.user).toBe(data.user)
  })

  test('per-call data replaces instance data wholesale — no merge, no copy', async () => {
    const instance = new FigTree({ operators: [echoOp()], data: { org: 'Acme', user: { a: 1 } } })
    const perCall = { user: { b: 2 } }
    expect(await instance.evaluate('$data', { data: perCall })).toBe(perCall)
    expect(await instance.evaluate('$data')).toEqual({ org: 'Acme', user: { a: 1 } })
  })

  test('drilled paths, aliases and projection resolve through the shared resolver', async () => {
    expect(await fig.evaluate('$data.user.name', { data })).toBe('Ada')
    expect(await fig.evaluate('$d.user.tags[1]', { data })).toBe('y')
    expect(await fig.evaluate('$data.orders[*].total', { data })).toEqual([1, 2])
  })

  test('a missing path is null — absence is not failure', async () => {
    expect(await fig.evaluate('$data.user.phone', { data })).toBe(null)
    expect(await fig.evaluate('$data.nothing.at.all', { data })).toBe(null)
  })

  test('a found undefined normalizes to null (the value domain)', async () => {
    expect(await fig.evaluate('$data.a', { data: { a: undefined } })).toBe(null)
  })

  test('strictDataPaths turns a miss into a catchable runtime failure', async () => {
    // Instance configuration: not one of the per-call options
    const strict = new FigTree({ operators: [echoOp()], strictDataPaths: true })
    const error = await rejection(strict.evaluate('$data.user.phone', { data }))
    expect(error).toBeInstanceOf(FigTreeError)
    expect(error.code).toBe('missing-data-path')
    expect(error.path).toEqual([])
    expect(await strict.evaluate({ $echo: '$data.user.phone', fallback: 'n/a' }, { data })).toBe(
      'n/a'
    )
  })
})

describe('the static-error gate', () => {
  test('an error-severity issue throws before any evaluation, with the full stream attached', async () => {
    const error = await rejection(fig.evaluate({ $echo: [1, 2] }))
    expect(error).toBeInstanceOf(FigTreeError)
    expect(error.code).toBe('positional-arity')
    expect(error.issues!.length).toBeGreaterThan(0)
    expect(error.issues![0].code).toBe('positional-arity')
  })

  test('the first error in tree order is the one thrown', async () => {
    const error = await rejection(fig.evaluate({ a: { operator: 'nope' }, b: '$vars.x' }))
    expect(error.code).toBe('unknown-operator')
    expect(error.path).toEqual(['a'])
    expect(error.issues!.map((issue) => issue.code)).toEqual(['unknown-operator', 'unresolved-var'])
  })

  test('warnings never block evaluation', async () => {
    expect(await fig.evaluate({ greeting: '$flibble', x: { $echo: 2 } })).toEqual({
      greeting: '$flibble',
      x: 2,
    })
  })

  test('an unrecognized $ key is refused before anything runs, its fallback too', async () => {
    // The probe would call the object constant were it not stopped by the
    // `$` key, and then return it untouched
    const post = spyOp('post', {})
    const withPost = new FigTree({ operators: [echoOp(), post.definition] })
    for (const expression of [
      { $flibble: [1, 2] },
      { $flibble: [1, 2], fallback: 'fb' },
      [{ $post: {} }, { a: { $flibble: 1 } }],
    ]) {
      const error = await rejection(withPost.evaluate(expression))
      expect(error.code).toBe('unrecognized-identifier')
    }
    expect(post.calls).toHaveLength(0)
  })

  test('inside literal, the same object is data', async () => {
    const quoted = { $flibble: [1, 2], fallback: 'fb' }
    expect(await fig.evaluate({ $literal: quoted })).toBe(quoted)
  })

  test('static errors are never caught by fallback (rule 2)', async () => {
    const error = await rejection(fig.evaluate({ $echo: { operator: 'nope' }, fallback: 'fb' }))
    expect(error.code).toBe('unknown-operator')
  })

  test('a configuration option passed per call is a method-misuse throw', async () => {
    // Typed out of the signature, so the runtime refusal is reached by
    // widening — what a JS host, or a TS host spreading a config, would do
    for (const misuse of [{ operators: [] }, { fragments: {} }, { maxDepth: 5 }, { http: {} }]) {
      await expect(fig.evaluate(1, misuse as CallOptions)).rejects.toMatchObject({
        code: 'invalid-options',
        message: /not a per-call option/,
      })
    }
  })
})

describe('limits at evaluation', () => {
  test('a 5,000-deep input rejects with depth-ceiling instead of overflowing', async () => {
    const error = await rejection(fig.evaluate(nest(5000, 1, true)))
    expect(error).toBeInstanceOf(FigTreeError)
    expect(error.code).toBe('depth-ceiling')
  })

  test('the user maxDepth applies to inert input too, via the probe', async () => {
    const inert = nest(10, 'leaf')
    expect(await fig.evaluate(inert)).toBe(inert)
    const limited = new FigTree({ operators: [echoOp()], maxDepth: 5 })
    const error = await rejection(limited.evaluate(inert))
    expect(error.code).toBe('max-depth')
  })

  test('maxNodes counts evaluable nodes', async () => {
    const limited = new FigTree({ operators: [echoOp()], maxNodes: 500 })
    const items = Array.from({ length: 600 }, (_, i) => ({ $echo: i }))
    const error = await rejection(limited.evaluate({ items }))
    expect(error.code).toBe('max-nodes')
    const options = Array.from({ length: 200 }, (_, i) => ({ label: `L${i}`, value: i }))
    expect(await limited.evaluate({ options })).toEqual({ options })
  })
})

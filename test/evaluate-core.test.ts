/**
 * Chunk 4.1 — the dispatch and `evaluate()`'s own behaviour ("One spine,
 * three views" and "evaluate() return shapes" in
 * docs-dev/v3-specs/v3-evaluator-methods.md): identity for constants,
 * skeleton splicing, `$data` references, the static-error gate, the probe
 * fast path and the per-call limits. Throw mode only.
 */
import { FigTree, FigTreeError, type CallOptions } from '../src'
import { boomOp, echoOp } from './fixtures/evalOperators'

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
    expect(await fig.evaluate({ $flibble: 'inert', x: { $echo: 2 } })).toEqual({
      $flibble: 'inert',
      x: 2,
    })
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

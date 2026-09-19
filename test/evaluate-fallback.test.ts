/**
 * Chunk 4.1 — `fallback` rules 1, 2, 4 and 6 ("fallback semantics" in
 * docs-dev/v3-specs/v3-api.md) and the `operatorDefaults` modifier default
 * ("operatorDefaults" in the Options area). Rule 3 (the kill switch) is
 * Phase 10; rule 5 (vars scope) is Phase 5.
 */
import { coreOperators, FigTree, FigTreeError } from '../src'
import { boomOp, echoOp, latencyOp, spyOp } from './fixtures/evalOperators'

const rejection = async (promise: Promise<unknown>): Promise<FigTreeError> => {
  try {
    await promise
  } catch (error) {
    return error as FigTreeError
  }
  throw new Error('expected a rejection')
}

const base = () => [echoOp(), boomOp()]

describe('rule 1 — nearest enclosing catch', () => {
  const fig = new FigTree({ operators: base() })

  test('a failing child resolves to the enclosing fallback', async () => {
    expect(await fig.evaluate({ $echo: { $boom: 1 }, fallback: 'fb' })).toBe('fb')
  })

  test('propagation passes through arrays and plain literals on the way', async () => {
    expect(
      await fig.evaluate({ $echo: { value: { list: [1, { $boom: 1 }] } }, fallback: 'fb' })
    ).toBe('fb')
  })

  test('the innermost fallback wins', async () => {
    expect(await fig.evaluate({ $echo: { $boom: 1, fallback: 'inner' }, fallback: 'outer' })).toBe(
      'inner'
    )
  })

  test('fallback: null is a value, distinct from no fallback', async () => {
    expect(await fig.evaluate({ $boom: 1, fallback: null })).toBe(null)
    await expect(fig.evaluate({ $boom: 1 })).rejects.toBeInstanceOf(FigTreeError)
  })

  test('a fallback is a full expression, evaluated only on failure', async () => {
    expect(
      await fig.evaluate({ $boom: 1, fallback: '$data.backup' }, { data: { backup: 'b' } })
    ).toBe('b')
  })

  test('sibling holes are independent — an uncaught failure in one rejects the call', async () => {
    const error = await rejection(fig.evaluate({ a: { $echo: 1 }, b: { $boom: 'x' } }))
    expect(error.path).toEqual(['b'])
  })
})

describe('rule 4 — a failing fallback fails the node', () => {
  const fig = new FigTree({ operators: base() })

  test("the node fails with the fallback's error, the original attached as cause", async () => {
    const error = await rejection(fig.evaluate({ $boom: 'first', fallback: { $boom: 'second' } }))
    expect(error.message).toContain('second')
    expect(error.cause).toBeInstanceOf(FigTreeError)
    expect((error.cause as FigTreeError).message).toContain('first')
  })

  test('that failure bubbles to the next enclosing fallback', async () => {
    expect(
      await fig.evaluate({ $echo: { $boom: 1, fallback: { $boom: 2 } }, fallback: 'outer' })
    ).toBe('outer')
  })
})

describe('rule 6 — lazy, at most once', () => {
  test('the fallback never evaluates on success and once on failure', async () => {
    const counter = spyOp('count', {}, { result: 'fb' })
    const fig = new FigTree({ operators: [...base(), counter.definition] })
    expect(await fig.evaluate({ $echo: 'fine', fallback: { $count: {} } })).toBe('fine')
    expect(counter.calls).toHaveLength(0)
    expect(await fig.evaluate({ $boom: 1, fallback: { $count: {} } })).toBe('fb')
    expect(counter.calls).toHaveLength(1)
  })
})

describe('fallback catches failure only', () => {
  test('a propagated null is success — the fallback is ignored (row 3)', async () => {
    const spy = spyOp('prop', { p: { type: ['number', 'null'] } })
    const fig = new FigTree({ operators: [...base(), spy.definition] })
    expect(await fig.evaluate({ $prop: { p: null }, fallback: 'fb' })).toBe(null)
  })

  test('a runtime type error is failure — caught', async () => {
    const spy = spyOp('strict', { p: { type: 'number' } })
    const fig = new FigTree({ operators: [...base(), spy.definition] })
    expect(
      await fig.evaluate({ $strict: { p: '$data.s' }, fallback: 'fb' }, { data: { s: 'x' } })
    ).toBe('fb')
  })
})

describe('operatorDefaults fallback — the instance-wide catch', () => {
  test('a default fallback catches like an authored one, and the node key overrides it', async () => {
    const fig = new FigTree({
      operators: base(),
      operatorDefaults: { boom: { fallback: 'default-fb' } },
    })
    expect(await fig.evaluate({ $boom: 1 })).toBe('default-fb')
    expect(await fig.evaluate({ $boom: 1, fallback: 'mine' })).toBe('mine')
    expect(fig.validate({ $boom: 1 }).timeoutShielded).toBe(true)
  })
})

describe('cancellation is not an expression failure', () => {
  // A fallback catches what the EXPRESSION did wrong. Cancellation is not
  // something anything did wrong — a sibling simply decided the result
  // first — so it travels the engine-bug bail-out rather than the failure
  // path: it must reach no fallback, its own or an enclosing one. Without
  // that bail the node wrapper would wrap it into a FigTreeError and serve
  // the author's placeholder for work nobody is waiting on.
  const fig = () => {
    const slow = latencyOp('slow')
    return { slow, fig: new FigTree({ operators: [coreOperators, slow.definition] }) }
  }

  test('a cancelled operand reaches its own fallback with nothing to catch', async () => {
    const { slow, fig: instance } = fig()
    // `or` resolves on the quick truthy operand and abandons the other
    const result = await instance.evaluate({
      $or: [{ $slow: [true, 0] }, { $slow: [true, 50], fallback: 'masked' }],
    })
    expect(result).toBe(true)
    expect(slow.aborted).toEqual([true])
  })

  test('and does not surface through an enclosing fallback either', async () => {
    const { fig: instance } = fig()
    const result = await instance.evaluate({
      $or: [{ $slow: [true, 0] }, { $slow: [true, 50] }],
      fallback: 'masked',
    })
    expect(result).toBe(true)
  })
})

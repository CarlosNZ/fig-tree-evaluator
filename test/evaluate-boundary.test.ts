/**
 * Chunk 4.1 — the operator-result boundary and error wrapping ("Engine
 * guarantees" and "The runtime interface" in
 * docs-dev/v3-specs/v3-operator-contract.md; "FigTreeError" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 */
import { FigTree, FigTreeError, OperatorFailure, isOperatorFailure } from '../src'
import { LAZY_HANDLE } from '../src/runtimeInterface'
import { boomOp, echoOp, failOp, rawOp } from './fixtures/evalOperators'

const rejection = async (promise: Promise<unknown>): Promise<FigTreeError> => {
  try {
    await promise
  } catch (error) {
    return error as FigTreeError
  }
  throw new Error('expected a rejection')
}

const fig = new FigTree({
  operators: [
    echoOp(),
    boomOp(),
    failOp(),
    rawOp('undef', () => undefined),
    rawOp('nan', () => NaN),
    rawOp('inf', () => 1 / 0),
    rawOp('nested', () => ({ deep: undefined, n: NaN })),
    rawOp('handle', () => ({ [LAZY_HANDLE]: true, evaluate: async () => 1 })),
    rawOp('str', () => {
      throw 'a string, not an Error'
    }),
  ],
})

describe('result normalization', () => {
  test('undefined becomes null', async () => {
    expect(await fig.evaluate({ $undef: {} })).toBe(null)
  })

  test('the finite guard fails NaN and ±Infinity results as catchable runtime failures', async () => {
    expect((await rejection(fig.evaluate({ $nan: {} }))).code).toBe('non-finite-result')
    const error = await rejection(fig.evaluate({ $inf: {} }))
    expect(error.code).toBe('non-finite-result')
    expect(error.operator).toBe('inf')
    expect(await fig.evaluate({ $inf: {}, fallback: 0 })).toBe(0)
  })

  test('the guards apply to the top-level result only', async () => {
    const result = (await fig.evaluate({ $nested: {} })) as { deep: unknown; n: number }
    expect(Number.isNaN(result.n)).toBe(true)
    expect(result.deep).toBe(undefined)
  })

  test('an escaped engine handle fails loudly', async () => {
    const error = await rejection(fig.evaluate({ $handle: {} }))
    expect(error.code).toBe('escaped-handle')
  })
})

describe('error wrapping', () => {
  test('OperatorFailure: code and errorData carry through, path and operator are tagged', async () => {
    const error = await rejection(
      fig.evaluate({
        box: { $fail: { message: 'bad input', code: 'type-check', errorData: { x: 1 } } },
      })
    )
    expect(error).toBeInstanceOf(FigTreeError)
    expect(error.code).toBe('type-check')
    expect(error.errorData).toEqual({ x: 1 })
    expect(error.path).toEqual(['box'])
    expect(error.operator).toBe('fail')
    expect(error.message).toContain('bad input')
    expect(error.message).toContain('fail')
  })

  test('OperatorFailure without a code is operator-failure', async () => {
    const error = await rejection(fig.evaluate({ $fail: ['plain'] }))
    expect(error.code).toBe('operator-failure')
    expect(error.errorData).toBeUndefined()
  })

  test('a plain Error is operator-failure, named after the operator', async () => {
    const error = await rejection(fig.evaluate({ $boom: 'x' }))
    expect(error.code).toBe('operator-failure')
    expect(error.operator).toBe('boom')
    expect(error.message).toContain('boom x')
  })

  test('a non-Error throw is wrapped too', async () => {
    const error = await rejection(fig.evaluate({ $str: {} }))
    expect(error.code).toBe('operator-failure')
    expect(error.message).toContain('a string, not an Error')
  })

  test("a child's FigTreeError passes through untouched", async () => {
    const error = await rejection(
      fig.evaluate({ outer: { $echo: { value: { inner: { $boom: 1 } } } } })
    )
    expect(error.operator).toBe('boom')
    expect(error.path).toEqual(['outer', '$echo', 'value', 'inner'])
  })

  test('the OperatorFailure class is exported for authors', () => {
    const failure = new OperatorFailure('msg', { code: 'custom', errorData: { a: 1 } })
    expect(failure).toBeInstanceOf(Error)
    expect(failure.code).toBe('custom')
    expect(failure.errorData).toEqual({ a: 1 })
    expect(isOperatorFailure(failure)).toBe(true)
    expect(isOperatorFailure(new Error('x'))).toBe(false)
  })
})

/**
 * Chunk 13.3 — the public `compile()` and the `CompiledExpression` handle
 * ("compile()" and "Rulings on the surface" in
 * docs-dev/v3-specs/v3-evaluator-methods.md; issue #155).
 *
 * The handle is the tail half of `evaluate()`, so most of what it does is
 * already pinned by the evaluate suites. What is pinned here is what the
 * handle adds: that it shares the compile cache with `evaluate()`, that an
 * inert input gets a handle too, that the handle is a snapshot of the
 * instance and that nothing of the engine leaks through it. Cache
 * membership is inferred as the compile-cache suite infers it, from the
 * compile counter — never from internals.
 */
import { ErrorCodes, FigTree } from '../src'
import type { CallOptions, EvaluationResult } from '../src'
import { compileSpyOp, type CompileSpy } from './fixtures/evalOperators'
import { coreOperators } from '../src/operators'

const rig = (options: object = {}) => {
  const spy: CompileSpy = compileSpyOp()
  const fig = new FigTree({ operators: [coreOperators, spy.definition], ...options })
  return { fig, spy }
}

/** A distinct expression, each carrying exactly one counted node. */
const expr = (tag: unknown) => ({ $counted: tag })
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('compile() shares the compile cache with evaluate()', () => {
  it('a handle over an evaluated expression costs no compile, and the reverse', async () => {
    const { fig, spy } = rig()
    const expression = expr('x')
    const first = fig.compile(expression)
    const second = fig.compile(expression)
    expect(await fig.evaluate(expression)).toBe('x')
    expect(await first.evaluate()).toBe('x')
    expect(await second.evaluate()).toBe('x')
    expect(spy.compiles()).toBe(1)
  })

  it('a content-equal copy hits too', async () => {
    const { fig, spy } = rig()
    const expression = expr('x')
    fig.compile(expression)
    expect(await fig.compile(copy(expression)).evaluate()).toBe('x')
    expect(spy.compiles()).toBe(1)
  })

  it('two handles over one reference report the identical stream', () => {
    const { fig } = rig()
    // A hole beside a stray `$` string: one compile, one warning
    const expression = [expr('x'), '$nosuchthing']
    const first = fig.compile(expression)
    const second = fig.compile(expression)
    expect(first.issues).toEqual(second.issues)
    expect(first.issues.map((issue) => issue.severity)).toEqual(['warning'])
  })

  it('a primitive expression compiles into the handle and evaluates from it', async () => {
    const { fig } = rig()
    const handle = fig.compile('$data.user.name')
    expect(await handle.evaluate({ data: { user: { name: 'Ada' } } })).toBe('Ada')
    expect(await handle.evaluate({ data: { user: { name: 'Grace' } } })).toBe('Grace')
    expect(handle.issues).toEqual([])
    expect(handle.getDependencies()).toEqual({
      data: { paths: ['user.name'], dynamic: false },
      operators: [],
      fragments: [],
    })
  })
})

describe('the inert flavour', () => {
  const config = { title: 'Report', rows: [1, 2, 3] }

  it('evaluates to the input by identity, with the envelope when asked', async () => {
    const { fig, spy } = rig()
    const handle = fig.compile(config)
    expect(await handle.evaluate()).toBe(config)
    expect(await handle.evaluate({ mode: 'report' })).toEqual({ result: config, errors: [] })
    expect(spy.compiles()).toBe(0)
  })

  it('compiles fresh under trace, as evaluate() does, so the trace has nodes', async () => {
    const { fig } = rig()
    const handle = fig.compile(config)
    const traced = await handle.evaluate({ trace: true })
    const direct = await fig.evaluate(config, { trace: true })
    expect(traced.result).toBe(config)
    expect(traced.errors).toEqual([])
    // The same tree, timings aside
    const shape = { kind: 'literal', path: [], status: 'value', value: config }
    expect(traced.trace).toMatchObject(shape)
    expect(direct.trace).toMatchObject(shape)
  })

  it('agrees with validate() on the issues, and warms nothing by reading them', async () => {
    const { fig, spy } = rig()
    // A stray `$` key is inert data with a warning: the probe cannot
    // report it, so the handle compiles once, lazily, to answer
    const stray = { title: '$nosuchthing' }
    const handle = fig.compile(stray)
    expect(handle.issues).toEqual(fig.validate(stray).issues)
    expect(handle.issues.map((issue) => issue.severity)).toEqual(['warning'])
    expect(handle.hasErrors).toBe(false)
    expect(handle.getDependencies()).toEqual({
      data: { paths: [], dynamic: false },
      operators: [],
      fragments: [],
    })
    // The verdict in the cache is still the inert one
    expect(await fig.evaluate(stray)).toBe(stray)
    expect(await handle.evaluate()).toBe(stray)
    expect(spy.compiles()).toBe(0)
  })

  it('still applies maxDepth to the probe depth', async () => {
    const { fig } = rig({ maxDepth: 2 })
    const handle = fig.compile({ a: { b: { c: { d: 1 } } } })
    await expect(handle.evaluate()).rejects.toMatchObject({ code: ErrorCodes.maxDepthExceeded })
    expect(await handle.evaluate({ mode: 'report' })).toMatchObject({
      result: null,
      errors: [{ code: ErrorCodes.maxDepthExceeded }],
    })
  })
})

describe('a compiled expression is a snapshot', () => {
  it('keeps the registry it compiled against across a registry-affecting update', async () => {
    const { fig, spy } = rig({ operatorDefaults: { counted: { value: 'seed' } } })
    const handle = fig.compile({ $counted: {} })
    expect(await handle.evaluate()).toBe('seed')
    fig.updateOptions({ operatorDefaults: { counted: { value: 'other' } } })
    expect(await handle.evaluate()).toBe('seed')
    expect(await fig.evaluate({ $counted: {} })).toBe('other')
    // The handle's answer came from its own artifact, not a recompile
    expect(spy.compiles()).toBe(2)
    expect(await fig.compile({ $counted: {} }).evaluate()).toBe('other')
  })

  it('keeps the evaluation options too — data, and the return shape', async () => {
    const { fig } = rig({ data: { v: 1 } })
    const handle = fig.compile(expr('$data.v'))
    fig.updateOptions({ data: { v: 2 }, mode: 'report' })
    expect(await handle.evaluate()).toBe(1)
    expect(await fig.evaluate(expr('$data.v'))).toEqual({ result: 2, errors: [] })
  })

  it('layers the call over the pinned options, and refuses the same keys', async () => {
    const { fig } = rig({ data: { v: 1 } })
    const handle = fig.compile(expr('$data.v'))
    expect(await handle.evaluate({ data: { v: 3 } })).toBe(3)
    expect(await handle.evaluate({ mode: 'report' })).toEqual({ result: 1, errors: [] })
    await expect(handle.evaluate({ maxDepth: 1 } as CallOptions)).rejects.toMatchObject({
      code: ErrorCodes.invalidOptions,
    })
  })

  it('shares the result store with the instance', async () => {
    let runs = 0
    const { fig } = rig()
    fig.updateOptions({
      operators: [
        coreOperators,
        compileSpyOp().definition,
        (await import('../src')).defineOperator({
          name: 'ticker',
          category: 'other',
          description: 'count runs',
          parameters: {},
          useCache: true,
          evaluate: () => (runs += 1),
        }),
      ],
    })
    const handle = fig.compile({ $ticker: {} })
    expect(await handle.evaluate()).toBe(1)
    expect(await fig.evaluate({ $ticker: {} })).toBe(1)
    expect(await fig.compile({ $ticker: {} }).evaluate()).toBe(1)
    fig.clearCache()
    expect(await handle.evaluate()).toBe(2)
  })
})

describe('the static gate on the handle', () => {
  it('exposes the stream, rejects in throw mode and reports under report', async () => {
    const { fig } = rig()
    const handle = fig.compile({ operator: 'nosuch', values: [1] })
    expect(handle.hasErrors).toBe(true)
    const [first] = handle.issues
    expect(first.severity).toBe('error')
    await expect(handle.evaluate()).rejects.toMatchObject({
      code: first.code,
      issues: handle.issues,
    })
    const reported = (await handle.evaluate({ mode: 'report' })) as EvaluationResult
    expect(reported.result).toBeNull()
    expect(reported.errors.map((error) => error.code)).toEqual([first.code])
  })
})

describe('nothing of the engine leaks through the handle', () => {
  it('serializes to nothing, and renders as a string', () => {
    const { fig } = rig()
    const expression = expr('$data.v')
    const handle = fig.compile(expression)
    expect(JSON.stringify(handle)).toBe('{}')
    expect(handle.expression).toBe(expression)
    expect(typeof handle.prettyPrint()).toBe('string')
    expect(Object.keys(handle)).toEqual([])
  })
})

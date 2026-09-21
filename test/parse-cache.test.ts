/**
 * Chunk 8.2 — the two-layer parse cache ("Cache keying for non-identical
 * inputs" and "Parse-cache sizing and eligibility" in
 * docs-dev/v3-specs/v3-implementation-notes.md; lifecycle steps 3, 4 and 6
 * in docs-dev/v3-specs/v3-worked-examples.md; artifact obligations C1, C5).
 *
 * Every assertion goes through a compile counter — an operator whose
 * `validate` hook counts the compiles that walked it. Nothing here reaches
 * into the cache, so which layer answered is inferred the same way a host
 * would see it: by whether work happened.
 */
import { ErrorCodes, FigTree } from '../src'
import { CONTENT_LAYER_SIZE } from '../src/parse'
import { compileSpyOp, type CompileSpy } from './fixtures/evalOperators'
import { coreOperators } from '../src/operators'
import { makeOp } from './fixtures/registryOptions'

/** An unrelated operator, so the registry can change around the counter. */
const extraOp = makeOp('extra')

const rig = (options: object = {}) => {
  const spy: CompileSpy = compileSpyOp()
  const fig = new FigTree({ operators: [coreOperators, spy.definition], ...options })
  return { fig, spy }
}

/** A distinct expression, each carrying exactly one counted node. */
const expr = (tag: unknown) => ({ $counted: tag })
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('the identity layer — lifecycle step 3', () => {
  it('compiles once however often the same object is evaluated', async () => {
    const { fig, spy } = rig()
    const expression = expr('x')
    expect(await fig.evaluate(expression)).toBe('x')
    await fig.evaluate(expression)
    await fig.evaluate(expression)
    expect(spy.compiles()).toBe(1)
  })

  it('serves every data input from one compile — the artifact is data-independent', async () => {
    const { fig, spy } = rig()
    const expression = { $counted: '$data.value' }
    expect(await fig.evaluate(expression, { data: { value: 1 } })).toBe(1)
    expect(await fig.evaluate(expression, { data: { value: 2 } })).toBe(2)
    expect(spy.compiles()).toBe(1)
  })
})

describe('the content layer — lifecycle step 4', () => {
  it('a fresh object with the same content reuses the artifact', async () => {
    const { fig, spy } = rig()
    const expression = expr('x')
    await fig.evaluate(expression)
    await fig.evaluate(copy(expression))
    expect(spy.compiles()).toBe(1)
  })

  it('re-registers the hit under the new object’s identity', async () => {
    const { fig, spy } = rig()
    const original = expr('x')
    const fresh = copy(original)
    await fig.evaluate(original)
    await fig.evaluate(fresh)
    spy.reset()

    // Push the content layer past its bound, so nothing of `fresh` can
    // still be held there. Only the re-registration can answer now.
    for (let i = 0; i < CONTENT_LAYER_SIZE + 1; i++) await fig.evaluate(expr(`filler-${i}`))
    spy.reset()
    await fig.evaluate(fresh)
    expect(spy.compiles()).toBe(0)
  })

  it('treats a key-order permutation as an honest miss', async () => {
    const { fig, spy } = rig()
    await fig.evaluate({ operator: 'counted', value: 'x' })
    await fig.evaluate({ value: 'x', operator: 'counted' })
    expect(spy.compiles()).toBe(2)
  })

  it('misses honestly when the content differs', async () => {
    const { fig, spy } = rig()
    await fig.evaluate(expr('x'))
    await fig.evaluate(expr('y'))
    expect(spy.compiles()).toBe(2)
  })

  it('evicts the least recently used, and a promoted entry survives', async () => {
    const { fig, spy } = rig()
    const first = expr('first')
    const last = expr(`filler-${CONTENT_LAYER_SIZE - 1}`)
    await fig.evaluate(first)
    for (let i = 0; i < CONTENT_LAYER_SIZE; i++) await fig.evaluate(expr(`filler-${i}`))
    spy.reset()
    // `first` was pushed out; the most recent arrival was not
    await fig.evaluate(copy(first))
    expect(spy.compiles()).toBe(1)
    spy.reset()
    await fig.evaluate(copy(last))
    expect(spy.compiles()).toBe(0)
  })
})

describe('the identity-only guard', () => {
  // Two independent guards, one per route an opaque value can take.
  it('never serves an opaque constant the parser walked', async () => {
    const { fig } = rig()
    const stampA = new Date(0)
    const stampB = new Date(0)
    expect(await fig.evaluate({ $counted: stampA })).toBe(stampA)
    expect(await fig.evaluate({ $counted: stampB })).toBe(stampB)
  })

  it('never serves an opaque constant hidden under literal', async () => {
    const { fig } = rig()
    const mapA = new Map([['k', 'a']])
    const mapB = new Map([['k', 'b']])
    expect(await fig.evaluate({ $counted: { $literal: mapA } })).toBe(mapA)
    expect(await fig.evaluate({ $counted: { $literal: mapB } })).toBe(mapB)
  })
})

describe('inert inputs', () => {
  it('returns a constant container by identity, without parsing it', async () => {
    const { fig, spy } = rig()
    const config = { title: 'Report', rows: [1, 2, 3] }
    expect(await fig.evaluate(config)).toBe(config)
    expect(await fig.evaluate(config)).toBe(config)
    expect(spy.compiles()).toBe(0)
  })

  it('still applies maxDepth to a memoized inert verdict', async () => {
    const { fig } = rig()
    const deep = { a: { b: { c: { d: 1 } } } }
    await fig.evaluate(deep)
    await expect(fig.evaluate(deep, { maxDepth: 2 })).rejects.toMatchObject({
      code: ErrorCodes.maxDepthExceeded,
    })
  })
})

describe('validate() stays out of the cache', () => {
  it('neither warms the cache nor reads it', async () => {
    const { fig, spy } = rig()
    const expression = expr('x')
    fig.validate(expression)
    await fig.evaluate(expression)
    expect(spy.compiles()).toBe(2)
    fig.validate(expression)
    expect(spy.compiles()).toBe(3)
  })

  it('still reports on an input evaluate answered as inert', async () => {
    const { fig } = rig()
    // A stray `$` key is inert data, but validate must still flag it
    const config = { title: '$nosuchthing' }
    expect(await fig.evaluate(config)).toBe(config)
    const { issues } = fig.validate(config)
    expect(issues.map((issue) => issue.severity)).toEqual(['warning'])
    // ...and evaluate's identity return is untouched by the report
    expect(await fig.evaluate(config)).toBe(config)
  })
})

describe('invalidation — lifecycle step 6', () => {
  /** How many compiles a given update costs the next evaluation. */
  const recompilesOn = async (update: (spy: CompileSpy) => object) => {
    const { fig, spy } = rig({ operatorDefaults: { counted: { value: 'seed' } } })
    const expression = expr('x')
    await fig.evaluate(expression)
    spy.reset()
    fig.updateOptions(update(spy))
    await fig.evaluate(expression)
    return spy.compiles()
  }

  it('drops both layers when operatorDefaults changes', async () => {
    expect(await recompilesOn(() => ({ operatorDefaults: { counted: { value: 'other' } } }))).toBe(
      1
    )
  })

  it('drops both layers when the operator set changes', async () => {
    // The counted operator has to stay registered, or there would be
    // nothing left to count; what changes is the set around it
    expect(
      await recompilesOn((spy) => ({ operators: [coreOperators, spy.definition, extraOp] }))
    ).toBe(1)
  })

  it('drops both layers when fragments change', async () => {
    expect(await recompilesOn(() => ({ fragments: {} }))).toBe(1)
  })

  it('keeps the cache for an option the artifact does not consume', async () => {
    expect(await recompilesOn(() => ({ data: { a: 1 } }))).toBe(0)
    expect(await recompilesOn(() => ({ maxNodes: 500 }))).toBe(0)
  })

  it('a changed operatorDefault is in force on the recompiled artifact', async () => {
    const fig = new FigTree({
      operators: [coreOperators],
      operatorDefaults: { join: { delimiter: ', ' } },
    })
    const expression = { $join: ['a', 'b'] }
    expect(await fig.evaluate(expression)).toBe('a, b')
    fig.updateOptions({ operatorDefaults: { join: { delimiter: ' | ' } } })
    expect(await fig.evaluate(expression)).toBe('a | b')
  })
})

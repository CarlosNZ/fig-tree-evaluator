/**
 * Chunk 8.1 — `updateOptions()` and `getOptions()` ("The method surface at
 * a glance" and the introspection section in
 * docs-dev/v3-specs/v3-evaluator-methods.md; the Options area of
 * docs-dev/v3-specs/v3-api.md).
 *
 * The snapshot case is hand-migrated from
 * test/v2-working/18_optionHandling.test.ts, INVERTED: v2 replaced `data`
 * and `fragments` wholesale on `updateOptions`, where v3 merges them by
 * the same rule as per-call options. Two of that file's `excludeOperators`
 * cases were really registry-replacement tests and re-express here.
 */
import { FigTree, ErrorCodes, isFigTreeError, type CallOptions, type FigTreeError } from '../src'
import { spyOp } from './fixtures/evalOperators'
import { makeOp } from './fixtures/registryOptions'

/** An operator that evaluates to its own name, so the registry is visible. */
const namedOp = (name: string) => spyOp(name, {}, { result: name }).definition

const updateInvalid = (fig: FigTree, options: Parameters<FigTree['updateOptions']>[0]) => {
  try {
    fig.updateOptions(options)
  } catch (error) {
    if (isFigTreeError(error)) return error as FigTreeError
    throw error
  }
  throw new Error('expected updateOptions to throw')
}

describe('updateOptions merges by the two-level rule', () => {
  // The rule is the instance's alone: per-call options are a flat override
  // of five request-scoped keys and never reach a configuration block
  // (options-merge.test.ts), so there is one entry point to prove it on
  const cases: { name: string; instance: object; update: object; expected: unknown }[] = [
    {
      name: 'a block merges, keeping untouched keys',
      instance: { http: { baseEndpoint: 'https://x.test', headers: { a: '1' } } },
      update: { http: { headers: { b: '2' } } },
      expected: { baseEndpoint: 'https://x.test', headers: { b: '2' } },
    },
    {
      name: 'an undefined value is ignored',
      instance: { http: { baseEndpoint: 'https://x.test' } },
      update: { http: { baseEndpoint: undefined } },
      expected: { baseEndpoint: 'https://x.test' },
    },
  ]

  it.each(cases)('updateOptions: $name', async ({ instance, update, expected }) => {
    const spy = spyOp('peek', {})
    const fig = new FigTree({ operators: [spy.definition], ...instance })
    fig.updateOptions(update)
    await fig.evaluate({ $peek: {} })
    expect(spy.contexts[0].options.http).toEqual(expected)
  })

  it('replaces data rather than merging it — data is state, not configuration', async () => {
    const fig = new FigTree({ data: { one: 1, two: 2 } })
    const next = { two: 22, three: 3 }
    fig.updateOptions({ data: next })
    expect(await fig.evaluate(['$data.one', '$data.two', '$data.three'])).toEqual([null, 22, 3])
    // And by reference: the instance holds the host's object, uncopied
    expect(await fig.evaluate('$data')).toBe(next)
  })

  it('accepts the registry keys, which are rejected per call', async () => {
    const fig = new FigTree()
    expect(() => fig.updateOptions({ operators: [namedOp('alpha')] })).not.toThrow()
    await expect(
      fig.evaluate({ $alpha: {} }, { operators: [] } as CallOptions)
    ).rejects.toMatchObject({ code: ErrorCodes.invalidOptions })
    // An undefined value means "not supplied", exactly as the merge rule
    // says, so an unset config key is not a misuse of the method
    await expect(
      fig.evaluate({ $alpha: {} }, { operators: undefined } as CallOptions)
    ).resolves.toBe('alpha')
  })

  it('is a no-op when given nothing', async () => {
    const fig = new FigTree({ data: { a: 1 }, maxNodes: 9 })
    const before = fig.getOptions()
    fig.updateOptions()
    fig.updateOptions({})
    expect(fig.getOptions()).toEqual(before)
  })
})

describe('the registry is rebuilt and re-validated', () => {
  it('replaces the operator set wholesale — arrays never merge', async () => {
    const fig = new FigTree({ operators: [namedOp('alpha')] })
    expect(await fig.evaluate({ $alpha: {} })).toBe('alpha')
    fig.updateOptions({ operators: [namedOp('beta')] })
    expect(await fig.evaluate({ $beta: {} })).toBe('beta')
    // `alpha` is no longer registered, so its key is inert data
    expect(await fig.evaluate({ $alpha: {} })).toEqual({ $alpha: {} })
  })

  it('catches a combination neither call alone was invalid for', () => {
    // Valid at construction: `alpha` is registered and takes the default.
    const fig = new FigTree({
      operators: [makeOp('alpha')],
      operatorDefaults: { alpha: { fallback: 'x' } },
    })
    // Valid in isolation too — but the surviving default now names an
    // operator the new set does not register. Reachable no other way.
    const error = updateInvalid(fig, { operators: [makeOp('beta')] })
    expect(error.code).toBe(ErrorCodes.invalidOptions)
    expect(error.issues?.some((issue) => issue.code === ErrorCodes.unknownOperator)).toBe(true)
  })

  it('rejects an unbranded operator entry, as construction does', () => {
    const fig = new FigTree()
    const error = updateInvalid(fig, {
      operators: [{ name: 'raw', description: 'x', parameters: {}, evaluate: () => 1 } as never],
    })
    expect(error.code).toBe(ErrorCodes.invalidOptions)
  })
})

describe('the swap is atomic', () => {
  it('changes nothing at all when the update is rejected', async () => {
    const fig = new FigTree({ operators: [namedOp('alpha')], maxNodes: 5 })
    updateInvalid(fig, { operators: [{ nope: true } as never], maxNodes: 99 })
    // The registry is untouched...
    expect(await fig.evaluate({ $alpha: {} })).toBe('alpha')
    // ...and so is the valid key that travelled in the same payload
    expect(fig.getOptions().maxNodes).toBe(5)
  })

  it('leaves an in-flight evaluation on the state it began with', async () => {
    const slow = spyOp('slow', {})
    const fig = new FigTree({ operators: [slow.definition], data: { tag: 'before' } })
    const inFlight = fig.evaluate({ $slow: {} })
    fig.updateOptions({ data: { tag: 'after' } })
    await inFlight
    expect(slow.contexts[0].options.data).toEqual({ tag: 'before' })
  })
})

describe('getOptions is a snapshot', () => {
  it('excludes the registry keys, as absent keys rather than undefined ones', () => {
    const fig = new FigTree({ operators: [makeOp('alpha')], maxNodes: 5 })
    const options = fig.getOptions()
    expect('operators' in options).toBe(false)
    expect('fragments' in options).toBe(false)
    expect(options).toEqual({ maxNodes: 5 })
  })

  it('reports options as supplied, injecting no defaults', () => {
    const fig = new FigTree({ data: { one: 1 }, http: { baseEndpoint: 'https://x.test' } })
    fig.updateOptions({ data: { two: 2 }, http: { headers: { a: '1' } } })
    expect(fig.getOptions()).toStrictEqual({
      data: { two: 2 },
      http: { baseEndpoint: 'https://x.test', headers: { a: '1' } },
    })
  })

  it('returns a fresh object each call that cannot write back', async () => {
    const fig = new FigTree({ http: { baseEndpoint: 'https://x.test' } })
    const first = fig.getOptions()
    expect(fig.getOptions()).not.toBe(first)
    expect(fig.getOptions()).toEqual(first)

    first.http!.baseEndpoint = 'https://hacked.test'
    first.maxNodes = 1
    expect(fig.getOptions().http?.baseEndpoint).toBe('https://x.test')
    expect(fig.getOptions().maxNodes).toBeUndefined()
  })

  it('shares by reference exactly what cannot be cloned', () => {
    const store = new Map<string, unknown>()
    const controller = new AbortController()
    const user = { name: 'Ada' }
    const fig = new FigTree({ cache: { store }, signal: controller.signal, data: { user } })
    const options = fig.getOptions()
    expect(options.cache?.store).toBe(store)
    expect(options.signal).toBe(controller.signal)
    // Level 3: a caller's own data value, shared so results may reference it
    expect(options.data?.user).toBe(user)
  })
})

/**
 * How far `noCache` reaches at runtime ("`noCache` semantics" in
 * docs-dev/v3-specs/v3-api.md; "Caching" in
 * docs-dev/v3-specs/v3-operator-contract.md): nothing evaluated in the
 * subtree of a node that carries it reads or writes the result cache —
 * the node, its parameters, its vars, its fallback and, on a call, its
 * arguments and the whole body. It is lexical, so a deferred evaluation
 * declared outside the subtree caches as it would anywhere.
 *
 * Every expression runs twice against one instance: a unit that ran twice
 * was kept away from the cache, and one that ran once was served from it.
 */
import { FigTree, coreOperators, defineOperator } from '../src'
import { RecordingCacheStore } from './helpers'

/** A caching operator that counts the units it ran, per key. */
const fetcher = () => {
  const runs = new Map<string, number>()
  const definition = defineOperator({
    name: 'fetch',
    category: 'other',
    description: 'A caching operator that counts the units it ran',
    parameters: { key: { type: 'string' } },
    positionalParams: ['key'],
    returns: 'string',
    cache: true,
    evaluate: ({ key }, context) =>
      context.cache.memo(key, async () => {
        const n = (runs.get(key) ?? 0) + 1
        runs.set(key, n)
        return `${key}#${n}`
      }),
  })
  return { definition, runs: (key: string) => runs.get(key) ?? 0 }
}

const setup = (options: object = {}) => {
  const fetch = fetcher()
  const store = new RecordingCacheStore()
  const fig = new FigTree({
    operators: [coreOperators, fetch.definition],
    cache: { store },
    fragments: {
      inner: { expression: { $fetch: 'inner' } },
      outer: { expression: [{ $fetch: 'outer' }, { $inner: {} }] },
      echo: { expression: '$params.x', parameters: { x: { type: 'string' } } },
      shielded: {
        expression: { operator: 'upper', value: '$params.x', noCache: true },
        parameters: { x: { type: 'string' } },
      },
    },
    ...options,
  })
  /** Evaluate twice, returning the second result. */
  const twice = async (expression: unknown, data?: Record<string, unknown>) => {
    await fig.evaluate(expression, data === undefined ? {} : { data })
    return fig.evaluate(expression, data === undefined ? {} : { data })
  }
  return { fig, store, twice, runs: fetch.runs }
}

describe('noCache reaches the whole subtree', () => {
  it('without it, a caching operator is served from the cache', async () => {
    const { twice, runs } = setup()
    expect(await twice({ $fetch: 'a' })).toBe('a#1')
    expect(runs('a')).toBe(1)
  })

  it('the node itself', async () => {
    const { twice, runs } = setup()
    expect(await twice({ $fetch: 'a', noCache: true })).toBe('a#2')
    expect(runs('a')).toBe(1 + 1)
  })

  it("the node's parameters", async () => {
    const { twice, runs } = setup()
    expect(await twice({ operator: 'upper', value: { $fetch: 'a' }, noCache: true })).toBe('A#2')
    expect(runs('a')).toBe(2)
  })

  it("the node's own vars and its fallback", async () => {
    const { twice, runs } = setup()
    await twice({
      operator: 'upper',
      value: '$vars.v',
      vars: { v: { $fetch: 'v' } },
      noCache: true,
    })
    expect(runs('v')).toBe(2)
    // `value` fails its type check at runtime, so the fallback answers
    await twice(
      { operator: 'upper', value: '$data.n', fallback: { $fetch: 'f' }, noCache: true },
      { n: 1 }
    )
    expect(runs('f')).toBe(2)
  })

  it('every element of an iterator', async () => {
    const { twice } = setup()
    expect(
      await twice({
        operator: 'map',
        input: ['a', 'b'],
        each: { $fetch: '$element' },
        noCache: true,
      })
    ).toEqual(['a#2', 'b#2'])
  })

  it("a call's body, and every call inside it", async () => {
    const { twice, runs } = setup()
    expect(await twice({ $outer: {}, noCache: true })).toEqual(['outer#2', 'inner#2'])
    expect(runs('outer')).toBe(2)
    expect(runs('inner')).toBe(2)
  })

  it("a call's arguments, in both modes", async () => {
    const { twice, runs } = setup()
    await twice({ fragment: 'echo', parameters: { x: { $fetch: 'static' } }, noCache: true })
    expect(runs('static')).toBe(2)
    await twice({
      fragment: 'echo',
      parameters: {
        operator: 'buildObject',
        entries: [{ key: 'x', value: { $fetch: 'dynamic' } }],
      },
      noCache: true,
    })
    expect(runs('dynamic')).toBe(2)
  })

  it('stops at the edge of the subtree', async () => {
    const { twice, runs } = setup()
    expect(await twice([{ $fetch: 'in', noCache: true }, { $fetch: 'out' }])).toEqual([
      'in#2',
      'out#1',
    ])
    expect(runs('in')).toBe(2)
    expect(runs('out')).toBe(1)
  })
})

describe('noCache is lexical', () => {
  it('a var declared above the node still caches when read beneath it', async () => {
    const { twice, runs } = setup()
    const expression = {
      operator: 'upper',
      value: { operator: 'upper', value: '$vars.x', noCache: true },
      vars: { x: { $fetch: 'outside' } },
    }
    expect(await twice(expression)).toBe('OUTSIDE#1')
    expect(runs('outside')).toBe(1)
  })

  it("an argument still caches when only the fragment's body carries noCache", async () => {
    const { twice, runs } = setup()
    expect(await twice({ $shielded: { x: { $fetch: 'arg' } } })).toBe('ARG#1')
    expect(runs('arg')).toBe(1)
  })
})

describe("the host's noCache", () => {
  it('turns the operator off for the instance', async () => {
    const { twice, runs, store } = setup({ operatorDefaults: { fetch: { noCache: true } } })
    expect(await twice({ $fetch: 'a' })).toBe('a#2')
    expect(runs('a')).toBe(2)
    expect(store.log).toHaveLength(0)
  })
})

describe('noCache neither reads nor writes', () => {
  it('an existing entry is not served, and the fresh result is not stored', async () => {
    const { fig, store } = setup()
    expect(await fig.evaluate({ $fetch: 'a' })).toBe('a#1')
    const logged = store.log.length
    expect(await fig.evaluate({ $fetch: 'a', noCache: true })).toBe('a#2')
    expect(store.log).toHaveLength(logged)
    // The entry the first evaluation wrote is still the one served
    expect(await fig.evaluate({ $fetch: 'a' })).toBe('a#1')
  })
})

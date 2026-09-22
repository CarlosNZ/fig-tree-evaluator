/**
 * Chunk 9.1 — the result cache ("Caching" in
 * docs-dev/v3-specs/v3-operator-contract.md; the `cache` option in the
 * Options area of docs-dev/v3-specs/v3-api.md; `clearCache()` in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * Hand-migrated in spirit from test/v2-working/24_cache.test.ts, whose
 * assertions reached into `cache.getCache()` and `cache['queue']` — gone
 * with `getCache`/`setCache`. What survives is the behaviour those tests
 * were reaching for: eviction order, expiry, and the recency refresh. Here
 * it is asserted the way the worked examples ask for — body-run counts for
 * what was SERVED, and the recording store's log for which keys were
 * touched.
 *
 * The distinction matters and is easy to get wrong: `store.hits` counts
 * keys present at read time, which is not the same as entries the engine
 * served. A generation-stale or expired envelope is present, counts as a
 * hit in the log, and is correctly ignored by the engine.
 */
import { FigTree, defineOperator, FigTreeError } from '../src'
import type { CacheStore, SettlementStream } from '../src'
import { RecordingCacheStore } from './helpers'
import { rejection } from './helpers/rejection'

/** A cacheable pure operator: metadata default on, `'auto'` by default. */
const countedOp = (name = 'cached') => {
  let runs = 0
  const definition = defineOperator({
    name,
    category: 'other',
    description: 'Count the runs the cache did not save',
    parameters: { value: { type: 'any', nullPolicy: 'value', default: null } },
    positionalParams: ['value'],
    useCache: true,
    evaluate: ({ value }) => {
      runs += 1
      return `${name}:${String(value)}:${runs}`
    },
  })
  return { definition, runs: () => runs }
}

/** The same, but keying its own units — the I/O operators' shape. */
const manualOp = (name = 'manual') => {
  let runs = 0
  const definition = defineOperator({
    name,
    category: 'other',
    description: 'Key its own unit of work',
    parameters: {
      key: { type: 'any', nullPolicy: 'value', default: null },
      shape: { type: 'string', default: '' },
    },
    positionalParams: ['key', 'shape'],
    useCache: true,
    cache: 'manual',
    evaluate: async ({ key, shape }, context) => {
      // `shape` sits OUTSIDE the key deliberately — the `returnPath`
      // arrangement the I/O operators use
      const value = await context.cache.memo(key, async (): Promise<Record<string, unknown>> => {
        runs += 1
        return { body: `run-${runs}` }
      })
      return shape === '' ? value : value[shape]
    },
  })
  return { definition, runs: () => runs }
}

const fig = (options: object = {}) => new FigTree(options)

/** A promise the test settles by hand, for in-flight assertions. */
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => (resolve = settle))
  return { promise, resolve }
}

describe('the useCache chain gates the cache, not just a helper', () => {
  it('a metadata default of false never touches the store', async () => {
    const store = new RecordingCacheStore()
    const pure = defineOperator({
      name: 'pure',
      category: 'other',
      description: 'metadata default off',
      parameters: {},
      evaluate: () => 'ok',
    })
    const f = fig({ operators: [pure], cache: { store } })
    await f.evaluate({ $pure: {} })
    await f.evaluate({ $pure: {} })
    expect(store.log).toHaveLength(0)
  })

  it('the blanket option turns a pure operator on', async () => {
    const store = new RecordingCacheStore()
    let runs = 0
    const pure = defineOperator({
      name: 'pure',
      category: 'other',
      description: 'metadata default off',
      parameters: {},
      evaluate: () => {
        runs += 1
        return runs
      },
    })
    const f = fig({ operators: [pure], cache: { store }, useCache: true })
    expect(await f.evaluate({ $pure: {} })).toBe(1)
    expect(await f.evaluate({ $pure: {} })).toBe(1)
    expect(runs).toBe(1)
  })

  it('a node key of false beats a metadata default of true', async () => {
    const store = new RecordingCacheStore()
    const counted = countedOp()
    const f = fig({ operators: [counted.definition], cache: { store } })
    await f.evaluate({ operator: 'cached', value: 1, useCache: false })
    await f.evaluate({ operator: 'cached', value: 1, useCache: false })
    expect(counted.runs()).toBe(2)
    expect(store.log).toHaveLength(0)
  })

  it('operatorDefaults beats the blanket option', async () => {
    const counted = countedOp()
    const f = fig({
      operators: [counted.definition],
      useCache: false,
      operatorDefaults: { cached: { useCache: true } },
    })
    await f.evaluate({ $cached: 1 })
    await f.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(1)
  })
})

describe("the 'auto' layer's key", () => {
  it('serves one entry to two spellings of the same call', async () => {
    const store = new RecordingCacheStore()
    const counted = countedOp()
    const f = fig({ operators: [counted.definition], cache: { store } })
    await f.evaluate({ $cached: 7 })
    await f.evaluate({ operator: 'cached', value: 7 })
    expect(counted.runs()).toBe(1)
    expect(new Set(store.keysSet()).size).toBe(1)
  })

  it('keys on resolved values, so different data forks entries naturally', async () => {
    const counted = countedOp()
    const f = fig({ operators: [counted.definition] })
    const expression = { $cached: '$data.n' }
    expect(await f.evaluate(expression, { data: { n: 1 } })).toBe('cached:1:1')
    expect(await f.evaluate(expression, { data: { n: 2 } })).toBe('cached:2:2')
    expect(await f.evaluate(expression, { data: { n: 1 } })).toBe('cached:1:1')
    expect(counted.runs()).toBe(2)
  })

  it('namespaces by operator, so two operators cannot collide', async () => {
    const a = countedOp('alpha')
    const b = countedOp('beta')
    const f = fig({ operators: [a.definition, b.definition] })
    expect(await f.evaluate({ $alpha: 1 })).toBe('alpha:1:1')
    expect(await f.evaluate({ $beta: 1 })).toBe('beta:1:1')
  })

  it('leaves options out of the key — the accepted trade, stated', async () => {
    const reader = defineOperator({
      name: 'reader',
      category: 'other',
      description: 'read an option',
      parameters: {},
      useCache: true,
      evaluate: (_params, context) => context.options.http?.baseEndpoint ?? 'none',
    })
    const f = fig({ operators: [reader], http: { baseEndpoint: 'https://one.test' } })
    expect(await f.evaluate({ $reader: {} })).toBe('https://one.test')
    f.updateOptions({ http: { baseEndpoint: 'https://two.test' } })
    // Stale, deliberately: an operator whose result depends on an option it
    // reads takes `cache: 'manual'` and folds that into its own key
    expect(await f.evaluate({ $reader: {} })).toBe('https://one.test')
  })
})

describe("what the 'auto' layer refuses to key", () => {
  it('skips an operator that delivers any parameter lazily', async () => {
    const store = new RecordingCacheStore()
    let runs = 0
    const lazyish = defineOperator({
      name: 'lazyish',
      category: 'other',
      description: 'eager condition, lazy branch',
      parameters: {
        condition: { type: 'any', truthiness: true },
        then: { type: 'any', evaluation: 'lazy' },
      },
      positionalParams: ['condition', 'then'],
      useCache: true,
      evaluate: async ({ condition, then }) => {
        runs += 1
        return condition ? await then.evaluate() : null
      },
    })
    const f = fig({ operators: [lazyish], cache: { store } })
    // Same eager parameter, different lazy one: keying on the eager
    // parameters alone would serve the first answer to the second node
    expect(await f.evaluate({ $lazyish: [true, 'first'] })).toBe('first')
    expect(await f.evaluate({ $lazyish: [true, 'second'] })).toBe('second')
    expect(runs).toBe(2)
    expect(store.log).toHaveLength(0)
  })

  it('never lets a settlement stream reach the serializer', async () => {
    const store = new RecordingCacheStore()
    const raced = defineOperator({
      name: 'raced',
      category: 'other',
      description: 'consume a settlement stream',
      parameters: { values: { type: 'array', evaluation: 'race' } },
      positionalParams: ['...values'],
      useCache: true,
      evaluate: async ({ values }) => {
        const out: unknown[] = []
        for await (const settled of values as SettlementStream) out[settled.index] = settled.value
        return out.join('')
      },
    })
    const f = fig({ operators: [raced], cache: { store } })
    // A stream is a plain-prototype object whose only own string key is
    // `length`, so the serializer would ACCEPT it and these two would
    // share a key — `deliversLazily` is the guard that keeps it out
    expect(await f.evaluate({ $raced: ['a', 'b', 'c'] })).toBe('abc')
    expect(await f.evaluate({ $raced: ['x', 'y', 'z'] })).toBe('xyz')
    expect(store.log).toHaveLength(0)
  })

  it('runs uncached rather than mis-keying an unserializable parameter', async () => {
    const store = new RecordingCacheStore()
    const counted = countedOp()
    const f = fig({ operators: [counted.definition], cache: { store } })
    const opaque = new Map([['a', 1]])
    await f.evaluate({ $cached: '$data.thing' }, { data: { thing: opaque } })
    await f.evaluate({ $cached: '$data.thing' }, { data: { thing: opaque } })
    expect(counted.runs()).toBe(2)
    expect(store.log).toHaveLength(0)
  })
})

describe('failures are never cached', () => {
  const flaky = () => {
    let runs = 0
    return defineOperator({
      name: 'flaky',
      category: 'other',
      description: 'fail once, then succeed',
      parameters: {},
      useCache: true,
      evaluate: () => {
        runs += 1
        if (runs === 1) throw new Error('first attempt fails')
        return `ok after ${runs}`
      },
    })
  }

  it('a body throw leaves nothing behind', async () => {
    const store = new RecordingCacheStore()
    const f = fig({ operators: [flaky()], cache: { store } })
    await rejection<FigTreeError>(f.evaluate({ $flaky: {} }))
    expect(store.keysSet()).toHaveLength(0)
    expect(await f.evaluate({ $flaky: {} })).toBe('ok after 2')
    expect(store.keysSet()).toHaveLength(1)
  })

  it("a node's fallback value is not written under the node's key", async () => {
    const store = new RecordingCacheStore()
    const f = fig({ operators: [flaky()], cache: { store } })
    expect(await f.evaluate({ operator: 'flaky', fallback: 'caught' })).toBe('caught')
    expect(store.keysSet()).toHaveLength(0)
    // The next attempt is a real attempt, not a cached placeholder
    expect(await f.evaluate({ operator: 'flaky', fallback: 'caught' })).toBe('ok after 2')
  })

  it('the boundary guards throw inside the unit, so they are not cached either', async () => {
    const store = new RecordingCacheStore()
    let runs = 0
    const nonFinite = defineOperator({
      name: 'nonFinite',
      category: 'other',
      description: 'produce a non-finite number, then a finite one',
      parameters: {},
      useCache: true,
      evaluate: () => {
        runs += 1
        return runs === 1 ? Infinity : runs
      },
    })
    const f = fig({ operators: [nonFinite], cache: { store } })
    const error = await rejection<FigTreeError>(f.evaluate({ $nonFinite: {} }))
    expect(error.code).toBe('non-finite-result')
    expect(store.keysSet()).toHaveLength(0)
    expect(await f.evaluate({ $nonFinite: {} })).toBe(2)
  })

  it('a propagated null never reaches the cache, because no body ran', async () => {
    const store = new RecordingCacheStore()
    const propagating = defineOperator({
      name: 'propagating',
      category: 'other',
      description: 'propagate a null operand',
      parameters: { value: { type: ['string', 'null'] } },
      positionalParams: ['value'],
      useCache: true,
      evaluate: ({ value }) => `saw ${String(value)}`,
    })
    const f = fig({ operators: [propagating], cache: { store } })
    expect(await f.evaluate({ $propagating: '$data.missing' })).toBeNull()
    expect(store.log).toHaveLength(0)
  })
})

describe("the 'manual' layer", () => {
  it('keys what the body says, and shaping sits outside that key', async () => {
    const store = new RecordingCacheStore()
    const manual = manualOp()
    const f = fig({ operators: [manual.definition], cache: { store } })
    expect(await f.evaluate({ $manual: ['req-1'] })).toEqual({ body: 'run-1' })
    // Same unit, different post-cache shaping: one run, one entry
    expect(await f.evaluate({ $manual: ['req-1', 'body'] })).toBe('run-1')
    expect(manual.runs()).toBe(1)
    expect(new Set(store.keysSet()).size).toBe(1)
  })

  it('namespaces body keys, so one spelling cannot cross operators', async () => {
    const one = manualOp('one')
    const two = manualOp('two')
    const f = fig({ operators: [one.definition, two.definition] })
    expect(await f.evaluate({ $one: ['same'] })).toEqual({ body: 'run-1' })
    expect(await f.evaluate({ $two: ['same'] })).toEqual({ body: 'run-1' })
    expect(one.runs()).toBe(1)
    expect(two.runs()).toBe(1)
  })

  it('is an identity passthrough when the node is not caching', async () => {
    const store = new RecordingCacheStore()
    const manual = manualOp()
    const f = fig({ operators: [manual.definition], cache: { store } })
    await f.evaluate({ operator: 'manual', key: 'k', useCache: false })
    await f.evaluate({ operator: 'manual', key: 'k', useCache: false })
    expect(manual.runs()).toBe(2)
    expect(store.log).toHaveLength(0)
  })

  it('runs the unit uncached when the body key cannot be serialized', async () => {
    const store = new RecordingCacheStore()
    const manual = manualOp()
    const f = fig({ operators: [manual.definition], cache: { store } })
    const opaque = new Map()
    await f.evaluate({ $manual: '$data.k' }, { data: { k: opaque } })
    await f.evaluate({ $manual: '$data.k' }, { data: { k: opaque } })
    expect(manual.runs()).toBe(2)
    expect(store.log).toHaveLength(0)
  })
})

describe('expiry', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('serves within maxTime and recomputes past it', async () => {
    const counted = countedOp()
    const f = fig({ operators: [counted.definition], cache: { maxTime: 60 } })
    await f.evaluate({ $cached: 1 })
    jest.advanceTimersByTime(59_000)
    await f.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(1)
    jest.advanceTimersByTime(2_000)
    await f.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(2)
  })

  it('measures from the WRITE, not the last read — the window does not slide', async () => {
    const counted = countedOp()
    const f = fig({ operators: [counted.definition], cache: { maxTime: 60 } })
    await f.evaluate({ $cached: 1 })
    // Read repeatedly inside the window; under v2's sliding window each of
    // these would push the expiry out and the entry would never die
    for (let read = 0; read < 5; read += 1) {
      jest.advanceTimersByTime(10_000)
      await f.evaluate({ $cached: 1 })
    }
    expect(counted.runs()).toBe(1) // 50s elapsed, five reads, still one run
    jest.advanceTimersByTime(11_000) // 61s from the WRITE, not from the last read
    await f.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(2)
  })

  it('never expires under maxTime: Infinity', async () => {
    const counted = countedOp()
    const f = fig({ operators: [counted.definition], cache: { maxTime: Infinity } })
    await f.evaluate({ $cached: 1 })
    jest.advanceTimersByTime(10 * 365 * 24 * 3600 * 1000)
    await f.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(1)
  })
})

describe('maxSize', () => {
  it('evicts the least recently used entry from the built-in store', async () => {
    const counted = countedOp()
    const f = fig({ operators: [counted.definition], cache: { maxSize: 2 } })
    await f.evaluate({ $cached: 1 })
    await f.evaluate({ $cached: 2 })
    await f.evaluate({ $cached: 3 })
    // 1 was evicted, so it recomputes; 3 is still held
    await f.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(4)
    await f.evaluate({ $cached: 3 })
    expect(counted.runs()).toBe(4)
  })

  it('does not reach a host-supplied store, which keeps its own bound', async () => {
    // A host wiring Redis or lru-cache has already chosen how much to hold;
    // an engine deleting their entries past fifty would override that with
    // no way to switch it off
    const store = new RecordingCacheStore()
    const counted = countedOp()
    const f = fig({ operators: [counted.definition], cache: { store, maxSize: 2 } })
    await f.evaluate({ $cached: 1 })
    await f.evaluate({ $cached: 2 })
    await f.evaluate({ $cached: 3 })
    expect(store.size).toBe(3)
    expect(store.log.filter((entry) => entry.op === 'delete')).toHaveLength(0)
    await f.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(3)
  })

  it('a read promotes, so the next eviction takes someone else', async () => {
    const counted = countedOp()
    const f = fig({ operators: [counted.definition], cache: { maxSize: 2 } })
    await f.evaluate({ $cached: 1 })
    await f.evaluate({ $cached: 2 })
    await f.evaluate({ $cached: 1 }) // promotes 1, so 2 is now oldest
    await f.evaluate({ $cached: 3 }) // evicts 2
    expect(counted.runs()).toBe(3)
    await f.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(3)
    await f.evaluate({ $cached: 2 })
    expect(counted.runs()).toBe(4)
  })

  it('an updateOptions resize keeps the entries it is entitled to keep', async () => {
    const counted = countedOp()
    const f = fig({ operators: [counted.definition], cache: { maxSize: 4 } })
    await f.evaluate({ $cached: 1 })
    await f.evaluate({ $cached: 2 })
    await f.evaluate({ $cached: 3 })
    f.updateOptions({ cache: { maxSize: 2 } })
    // The two most recent survive; the oldest was evicted by the shrink
    await f.evaluate({ $cached: 3 })
    await f.evaluate({ $cached: 2 })
    expect(counted.runs()).toBe(3)
    await f.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(4)
  })
})

describe('clearCache()', () => {
  it('empties the result store and leaves the compile cache alone', async () => {
    const counted = countedOp()
    const f = fig({ operators: [counted.definition] })
    const expression = { $cached: 1 }
    await f.evaluate(expression)
    await f.evaluate(expression)
    expect(counted.runs()).toBe(1)
    f.clearCache()
    await f.evaluate(expression)
    expect(counted.runs()).toBe(2)
  })

  it('is total even where the store has not finished emptying', async () => {
    // A store whose `clear` only completes on a later tick — which a
    // remote store's would. `clearCache()` is specified sync, so the
    // generation is what makes the guarantee hold in the gap
    const held = new Map<string, unknown>()
    let pendingClear: (() => void) | undefined
    const laggy: CacheStore = {
      get: (key) => held.get(key),
      set: (key, value) => void held.set(key, value),
      delete: (key) => void held.delete(key),
      clear: () => {
        pendingClear = () => held.clear()
      },
    }
    const counted = countedOp()
    const f = fig({ operators: [counted.definition], cache: { store: laggy } })
    await f.evaluate({ $cached: 1 })
    expect(held.size).toBe(1)

    f.clearCache()
    expect(held.size).toBe(1) // the store has not caught up
    await f.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(2) // and the engine served nothing from it
    pendingClear?.()
  })

  it('discards a result computed before the clear but written after it', async () => {
    let body = deferred<string>()
    let started = deferred<void>()
    const slow = defineOperator({
      name: 'slow',
      category: 'other',
      description: 'settle when the test says so',
      parameters: {},
      useCache: true,
      evaluate: () => {
        started.resolve()
        return body.promise
      },
    })
    const f = fig({ operators: [slow] })

    const inFlight = f.evaluate({ $slow: {} })
    await started.promise
    f.clearCache()
    body.resolve('run-1')
    expect(await inFlight).toBe('run-1')

    // The caller still gets its answer — but the entry describes a world
    // they already discarded, so it was not kept
    body = deferred<string>()
    started = deferred<void>()
    const second = f.evaluate({ $slow: {} })
    await started.promise
    body.resolve('run-2')
    expect(await second).toBe('run-2')
  })
})

describe('the two invalidation stories', () => {
  /** Counts compiles and runs separately, and answers with a tag. */
  const twoCounters = (tag: string) => {
    const counts = { compiles: 0, runs: 0 }
    const definition = defineOperator({
      name: 'counted',
      category: 'other',
      description: 'count compiles and runs separately',
      parameters: { value: { type: 'any', required: false, default: 'a' } },
      positionalParams: ['value'],
      useCache: true,
      validate: () => {
        counts.compiles += 1
        return []
      },
      evaluate: ({ value }) => {
        counts.runs += 1
        return `${tag}:${String(value)}`
      },
    })
    return { definition, counts }
  }

  it('a registry-affecting update recompiles AND moves the result generation on', async () => {
    const { definition, counts } = twoCounters('v1')
    const f = fig({ operators: [definition] })
    const expression = { $counted: {} }
    await f.evaluate(expression)
    await f.evaluate(expression)
    expect(counts).toEqual({ compiles: 1, runs: 1 })

    // A result key names the operator and its resolved parameters, nothing
    // of the definition, so the store cannot tell the old definition's
    // result from one the new definition would give
    f.updateOptions({ operatorDefaults: { counted: { value: 'a' } } })
    await f.evaluate(expression)
    expect(counts).toEqual({ compiles: 2, runs: 2 })
  })

  it('clearCache() runs the body again without recompiling', async () => {
    const { definition, counts } = twoCounters('v1')
    const f = fig({ operators: [definition] })
    const expression = { $counted: {} }
    await f.evaluate(expression)
    f.clearCache()
    await f.evaluate(expression)
    expect(counts).toEqual({ compiles: 1, runs: 2 })
  })

  it('a result the old definition computed is never served to a new one under the same name', async () => {
    const before = twoCounters('v1')
    const after = twoCounters('v2')
    const f = fig({ operators: [before.definition] })
    expect(await f.evaluate({ $counted: 'x' })).toBe('v1:x')
    f.updateOptions({ operators: [after.definition] })
    expect(await f.evaluate({ $counted: 'x' })).toBe('v2:x')
    expect([before.counts.runs, after.counts.runs]).toEqual([1, 1])
  })

  it('an update touching no registry key keeps the cached result', async () => {
    const { definition, counts } = twoCounters('v1')
    const f = fig({ operators: [definition] })
    await f.evaluate({ $counted: 'x' })
    f.updateOptions({ maxNodes: 500 })
    f.updateOptions({ data: { a: 1 } })
    await f.evaluate({ $counted: 'x' })
    expect(counts).toEqual({ compiles: 1, runs: 1 })
  })
})

describe('a store is never allowed to fail an evaluation', () => {
  const counted = () => countedOp()

  it('an asynchronous store behaves identically', async () => {
    const held = new Map<string, unknown>()
    const async_: CacheStore = {
      get: async (key) => held.get(key),
      set: async (key, value) => void held.set(key, value),
      delete: async (key) => void held.delete(key),
      clear: async () => held.clear(),
    }
    const op = counted()
    const f = fig({ operators: [op.definition], cache: { store: async_ } })
    await f.evaluate({ $cached: 1 })
    await f.evaluate({ $cached: 1 })
    expect(op.runs()).toBe(1)
  })

  it('a rejecting get degrades to a miss', async () => {
    const hostile: CacheStore = {
      get: () => {
        throw new Error('store is down')
      },
      set: () => {},
      delete: () => {},
      clear: () => {},
    }
    const op = counted()
    const f = fig({ operators: [op.definition], cache: { store: hostile } })
    expect(await f.evaluate({ $cached: 1 })).toBe('cached:1:1')
    expect(await f.evaluate({ $cached: 1 })).toBe('cached:1:2')
  })

  it('a rejecting set still returns the right value', async () => {
    const hostile: CacheStore = {
      get: () => undefined,
      set: () => {
        throw new Error('store is full')
      },
      delete: () => {},
      clear: () => {},
    }
    const op = counted()
    const f = fig({ operators: [op.definition], cache: { store: hostile } })
    expect(await f.evaluate({ $cached: 1 })).toBe('cached:1:1')
  })

  it('ignores an entry the host wrote itself', async () => {
    const store = new RecordingCacheStore()
    const op = counted()
    const f = fig({ operators: [op.definition], cache: { store } })
    await f.evaluate({ $cached: 1 })
    const [key] = store.keysSet()
    // A bare value where the engine expects its own envelope
    store.set(key, 'something the host put there')
    expect(await f.evaluate({ $cached: 1 })).toBe('cached:1:2')
  })
})

describe('configuration is validated loudly', () => {
  it.each([
    ['a store missing delete and clear', { store: { get: () => undefined, set: () => {} } }],
    ['a zero maxSize', { maxSize: 0 }],
    ['a fractional maxSize', { maxSize: 2.5 }],
    ['a zero maxTime', { maxTime: 0 }],
    ['a negative maxTime', { maxTime: -1 }],
    ['a non-object block', 'always'],
  ])('%s is refused at construction', (_label, cache) => {
    expect(() => fig({ cache })).toThrow(FigTreeError)
    try {
      fig({ cache })
    } catch (error) {
      expect((error as FigTreeError).code).toBe('invalid-options')
    }
  })

  it('a refused updateOptions leaves the instance exactly as it was', async () => {
    const counted = countedOp()
    const f = fig({ operators: [counted.definition], cache: { maxSize: 2 } })
    await f.evaluate({ $cached: 1 })
    expect(() => f.updateOptions({ cache: { maxSize: 0 } })).toThrow(FigTreeError)
    expect(f.getOptions().cache?.maxSize).toBe(2)
    // And the entry it already held is still there
    await f.evaluate({ $cached: 1 })
    expect(counted.runs()).toBe(1)
  })
})

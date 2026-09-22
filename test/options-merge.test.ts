/**
 * How options combine ("Merge semantics" and "Per-call options" in the
 * Options area of docs-dev/v3-specs/v3-api.md), and the promise that
 * replaced the per-evaluation freeze (ruled September 2026): an
 * evaluation never mutates the instance and never mutates the caller's
 * objects. That promise is pinned HERE, by test, rather than enforced by
 * a per-call walk that could only ever reach one level.
 *
 * Two regimes. Instance options — construction and `updateOptions()` —
 * merge by the two-level rule, with `data` the one block that replaces.
 * Per-call options are the five request-scoped keys laid flat over the
 * instance's: no merging inside a value, `data` replacing by reference,
 * and anything else refused as method misuse.
 *
 * Hand-migrated from test/v2-working/18_optionHandling.test.ts, whose two
 * live cases (`objects` and `functions` merged a level down) died with the
 * merge of `data`; its five `excludeOperators` cases died with that option,
 * and its `getOptions` case moved to options-instance.test.ts.
 *
 * The effective options are asserted through what a body actually
 * receives on `context.options`, not by reaching into the engine.
 */
import { FigTree, type CallOptions } from '../src'
import { signalProbeOp, spyOp } from './fixtures/evalOperators'
import { rejection } from './helpers/rejection'

/** An instance whose one operator records the options each call saw. */
const withSpy = (instance: object = {}) => {
  const spy = spyOp('peek', {})
  const fig = new FigTree({ operators: [spy.definition], ...instance })
  const seen = async (call?: CallOptions) => {
    await fig.evaluate({ $peek: {} }, call)
    return spy.contexts[spy.contexts.length - 1].options
  }
  return { fig, spy, seen }
}

describe('instance options merge by the two-level rule (the consequence table)', () => {
  it('row 1 — http merges; baseEndpoint survives, headers replace as a unit', async () => {
    const { fig, seen } = withSpy({
      http: { baseEndpoint: 'https://x.test', headers: { a: '1', b: '2' } },
    })
    fig.updateOptions({ http: { headers: { c: '3' } } })
    expect((await seen()).http).toEqual({ baseEndpoint: 'https://x.test', headers: { c: '3' } })
  })

  it('row 2 — graphQL endpoint keeps the existing headers', async () => {
    const { fig, seen } = withSpy({ graphQL: { endpoint: 'https://g.test', headers: { a: '1' } } })
    fig.updateOptions({ graphQL: { endpoint: 'https://other.test' } })
    expect((await seen()).graphQL).toEqual({ endpoint: 'https://other.test', headers: { a: '1' } })
  })

  it('row 3 — cache maxSize keeps store and maxTime, and the store is shared', async () => {
    const store = new Map<string, unknown>()
    const { fig, seen } = withSpy({ cache: { store, maxSize: 10, maxTime: 60 } })
    fig.updateOptions({ cache: { maxSize: 99 } })
    const options = await seen()
    expect(options.cache?.maxSize).toBe(99)
    expect(options.cache?.maxTime).toBe(60)
    // A store is not ours to clone — identity, not equality
    expect(options.cache?.store).toBe(store)
  })

  it('row 5 — data is the exception: it replaces, and by reference', async () => {
    const fig = new FigTree({ data: { user: { name: 'Ada', age: 36 }, org: 'Acme' } })
    const next = { user: { name: 'Grace' } }
    fig.updateOptions({ data: next })
    // Nothing survives from the previous block: `org` is gone with it
    expect(await fig.evaluate('$data')).toBe(next)
    expect(await fig.evaluate('$data.org')).toBe(null)
  })

  it('operatorDefaults merges per operator name; other operators survive', async () => {
    const fig = new FigTree({
      operatorDefaults: { join: { delimiter: ' | ' }, buildString: { trim: true } },
    })
    fig.updateOptions({ operatorDefaults: { join: { delimiter: ' / ' } } })
    expect(await fig.evaluate({ $join: ['a', 'b'] })).toBe('a / b')
    expect(fig.getOptions().operatorDefaults?.buildString).toEqual({ trim: true })
  })

  it('ignores undefined at both levels, keeping the stored value', async () => {
    const { fig, seen } = withSpy({ http: { baseEndpoint: 'https://x.test' }, maxNodes: 40 })
    fig.updateOptions({ maxNodes: undefined, http: { baseEndpoint: undefined } })
    const options = await seen()
    expect(options.maxNodes).toBe(40)
    expect(options.http?.baseEndpoint).toBe('https://x.test')
  })

  it('replaces anything deeper than two levels wholesale', async () => {
    const { fig, seen } = withSpy({ http: { headers: { a: '1', b: '2' } } })
    fig.updateOptions({ http: { headers: { c: '3' } } })
    expect((await seen()).http?.headers).toEqual({ c: '3' })
  })
})

describe('per-call options: five request-scoped keys, laid flat over the instance', () => {
  it('data replaces the instance block — no merge — and is the caller’s own object', async () => {
    const instanceData = { org: 'Acme', user: { name: 'Ada' } }
    const { seen } = withSpy({ data: instanceData })
    const callData = { user: { name: 'Grace' } }
    const options = await seen({ data: callData })
    expect(options.data).toBe(callData)
    // Instance keys do not show through
    expect(options.data).not.toHaveProperty('org')
    // And the instance's block is untouched and back on the next call
    expect((await seen()).data).toBe(instanceData)
  })

  it('mode, trace, timeout and signal override the instance value for the one call', async () => {
    const controller = new AbortController()
    const { seen } = withSpy({ mode: 'throw', timeout: 5000 })
    const options = await seen({ mode: 'report', timeout: 60000, signal: controller.signal })
    expect(options.mode).toBe('report')
    expect(options.timeout).toBe(60000)
    expect(options.signal).toBe(controller.signal)
    const again = await seen()
    expect(again.mode).toBe('throw')
    expect(again.timeout).toBe(5000)
    expect(again.signal).toBeUndefined()
  })

  it('ignores an undefined value, so an unset variable falls back to the instance', async () => {
    const instanceData = { a: 1 }
    const { seen } = withSpy({ data: instanceData, mode: 'throw' })
    const options = await seen({ data: undefined, mode: undefined })
    expect(options.data).toBe(instanceData)
    expect(options.mode).toBe('throw')
  })

  it('a call with no options, or only undefined ones, runs under the instance object itself', async () => {
    const { seen } = withSpy({ data: { a: 1 } })
    const bare = await seen()
    expect(await seen({})).toBe(bare)
    expect(await seen({ data: undefined })).toBe(bare)
    // A real override is a fresh object, never the instance's
    expect(await seen({ data: { b: 2 } })).not.toBe(bare)
  })

  it.each([
    ['operators', { operators: [] }],
    ['fragments', { fragments: {} }],
    ['cache', { cache: { maxTime: 5 } }],
    ['http', { http: { baseEndpoint: 'https://call.test' } }],
    ['strictDataPaths', { strictDataPaths: true }],
    ['maxDepth', { maxDepth: 3 }],
  ])('refuses %s per call — configuration, not request state', async (_key, misuse) => {
    const { fig } = withSpy()
    const error = await rejection<{ code: string; message: string }>(
      // Widened past the signature, as a JS host would reach it
      fig.evaluate({ $peek: {} }, misuse as CallOptions)
    )
    expect(error.code).toBe('invalid-options')
    expect(error.message).toMatch(/not a per-call option/)
    expect(error.message).toMatch(/data, signal, timeout, mode and trace/)
  })

  // An AbortSignal has no own enumerable properties, so merging it key by
  // key would yield an object that is no longer a signal. Per-call values
  // never merge, so a signal arrives intact by construction; this pins it
  it('keeps an AbortSignal intact when both levels supply one', async () => {
    const instance = new AbortController()
    const call = new AbortController()
    const { seen } = withSpy({ signal: instance.signal })
    const options = await seen({ signal: call.signal })
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.signal).toBe(call.signal)
  })

  it('threads an instance-level signal through when no call signal is given', async () => {
    const controller = new AbortController()
    const probe = signalProbeOp()
    const fig = new FigTree({ operators: [probe.definition], signal: controller.signal })
    const running = fig.evaluate({ $probe: {} })
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    expect((await rejection<{ code: string }>(running)).code).toBe('aborted')
    expect(probe.seen).toEqual([false, true])
  })
})

describe('the instance is never written back to', () => {
  it('a per-call override lasts exactly one evaluation', async () => {
    const { seen } = withSpy({ mode: 'throw' })
    expect((await seen({ mode: 'report' })).mode).toBe('report')
    expect((await seen()).mode).toBe('throw')
  })

  it('does not capture the caller’s options object, to the merge rule’s depth', async () => {
    const supplied: { http: { baseEndpoint: string; headers: Record<string, string> } } = {
      http: { baseEndpoint: 'https://x.test', headers: { a: '1' } },
    }
    const spy = spyOp('peek', {})
    const fig = new FigTree({ operators: [spy.definition], ...supplied })
    supplied.http = { baseEndpoint: 'https://replaced.test', headers: {} }
    await fig.evaluate({ $peek: {} })
    expect(spy.contexts[0].options.http?.baseEndpoint).toBe('https://x.test')
  })

  it('protects a configuration block’s own keys, but shares what sits below them', async () => {
    const supplied = { http: { baseEndpoint: 'https://x.test', headers: { a: '1' } } }
    const spy = spyOp('peek', {})
    const fig = new FigTree({ operators: [spy.definition], ...supplied })
    supplied.http.baseEndpoint = 'https://mutated.test'
    supplied.http.headers.a = 'mutated'
    await fig.evaluate({ $peek: {} })
    // Copying stops at the merge rule's depth: the block is ours, so its own
    // keys are safe, while `headers` is a level deeper and stays the
    // caller's object. A store or signal cannot be cloned at all, so one
    // uniform depth is the only honest rule
    expect(spy.contexts[0].options.http?.baseEndpoint).toBe('https://x.test')
    expect(spy.contexts[0].options.http?.headers).toEqual({ a: 'mutated' })
  })

  it('holds instance data by reference, so the host’s later edits are seen', async () => {
    // Data is the one block that is not copied in: it is the host's state,
    // and the host keeps owning it
    const data: Record<string, unknown> = { count: 1 }
    const fig = new FigTree({ data })
    expect(await fig.evaluate('$data.count')).toBe(1)
    data.count = 2
    expect(await fig.evaluate('$data.count')).toBe(2)
  })
})

describe('the caller’s objects are never mutated — the promise the freeze used to stand in for', () => {
  /** A deep snapshot to compare against after the evaluation. */
  const snapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

  it('per-call data: same object afterwards, deep-equal to its snapshot', async () => {
    const data = {
      user: { name: 'Ada', tags: ['x', 'y'] },
      orders: [{ total: 1 }, { total: 2 }],
      nested: { a: { b: { c: 1 } } },
    }
    const before = snapshot(data)
    const fig = new FigTree()
    // Reads at every depth, a projection, and a result that IS a sub-object
    const result = await fig.evaluate(
      {
        name: '$data.user.name',
        tags: '$data.user.tags',
        totals: '$data.orders[*].total',
        deep: '$data.nested.a',
        whole: '$data',
      },
      { data }
    )
    expect(result).toEqual({
      name: 'Ada',
      tags: ['x', 'y'],
      totals: [1, 2],
      deep: { b: { c: 1 } },
      whole: before,
    })
    expect(data).toEqual(before)
    // Results share structure with the data rather than copying it
    expect((result as { whole: unknown }).whole).toBe(data)
  })

  it('instance data, and the other passed-in blocks, likewise', async () => {
    const data = { org: 'Acme', members: [{ name: 'Ada' }] }
    const http = { baseEndpoint: 'https://x.test', headers: { a: '1' } }
    const operatorDefaults = { join: { delimiter: ' | ' } }
    const before = {
      data: snapshot(data),
      http: snapshot(http),
      defaults: snapshot(operatorDefaults),
    }
    const fig = new FigTree({ data, http, operatorDefaults })
    expect(await fig.evaluate({ $join: ['$data.org', '$data.members[0].name'] })).toBe('Acme | Ada')
    expect(data).toEqual(before.data)
    expect(http).toEqual(before.http)
    expect(operatorDefaults).toEqual(before.defaults)
    // And the same objects, not replacements
    expect(fig.getOptions().data).toEqual(before.data)
  })

  it('a custom operator handed the data reads it without the engine copying or freezing it', async () => {
    const spy = spyOp('peek', {})
    const data = { user: { name: 'Ada' } }
    const before = snapshot(data)
    await new FigTree({ operators: [spy.definition] }).evaluate({ $peek: {} }, { data })
    const seen = spy.contexts[0].options.data
    expect(seen).toBe(data)
    expect(Object.isFrozen(seen)).toBe(false)
    expect(Object.isFrozen(seen?.user)).toBe(false)
    expect(data).toEqual(before)
  })

  it('nothing in the options a body receives is frozen', async () => {
    const perCall = { data: { a: 1 } }
    const { seen } = withSpy({ http: { baseEndpoint: 'https://x.test' } })
    const options = await seen(perCall)
    expect(Object.isFrozen(options)).toBe(false)
    expect(Object.isFrozen(options.http)).toBe(false)
    expect(Object.isFrozen(options.data)).toBe(false)
    // The caller's own object is still theirs to edit
    expect(() => {
      perCall.data.a = 2
    }).not.toThrow()
  })
})

describe('validate() and evaluate() see the same data', () => {
  it('both read the per-call data in place of the instance’s', async () => {
    const fig = new FigTree({ data: { org: 'Acme' } })
    const expression = { $buildString: ['%1', '$data.team'] }
    const { issues } = fig.validate(expression, { data: { team: 'Platform' } })
    expect(issues).toEqual([])
    expect(await fig.evaluate(expression, { data: { team: 'Platform' } })).toBe('Platform')
  })

  it('both report a path the per-call data lacks, even where the instance has it', () => {
    const fig = new FigTree({ data: { org: 'Acme' } })
    const { issues } = fig.validate({ $buildString: ['%1', '$data.org'] }, { data: {} })
    expect(issues.map((issue) => issue.severity)).toEqual(['warning'])
  })

  it('both fall back to the instance data when the call supplies none', async () => {
    const fig = new FigTree({ data: { org: 'Acme' } })
    const expression = { $buildString: ['%1', '$data.org'] }
    expect(fig.validate(expression).issues).toEqual([])
    expect(await fig.evaluate(expression)).toBe('Acme')
  })
})

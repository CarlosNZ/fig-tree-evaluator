/**
 * Chunk 8.1 — the two-level merge rule, every consequence-table row
 * ("Merge semantics" in the Options area of docs-dev/v3-specs/v3-api.md).
 *
 * Hand-migrated from test/v2-working/18_optionHandling.test.ts, whose two
 * live cases (`objects` and `functions` merged a level down) become the
 * `data` rows here; its five `excludeOperators` cases die with that option,
 * and its `getOptions` case moves to options-instance.test.ts.
 *
 * The merged options are asserted through what a body actually receives on
 * `context.options`, not by reaching into the engine.
 */
import { FigTree } from '../src'
import { signalProbeOp, spyOp } from './fixtures/evalOperators'
import { rejection } from './helpers/rejection'

/** An instance whose one operator records the options each call saw. */
const withSpy = (instance: object = {}) => {
  const spy = spyOp('peek', {})
  const fig = new FigTree({ operators: [spy.definition], ...instance })
  const seen = async (call: object = {}) => {
    await fig.evaluate({ $peek: {} }, call)
    return spy.contexts[spy.contexts.length - 1].options
  }
  return { fig, spy, seen }
}

describe('the consequence table', () => {
  it('row 1 — http merges; baseEndpoint survives, headers replace as a unit', async () => {
    const { seen } = withSpy({
      http: { baseEndpoint: 'https://x.test', headers: { a: '1', b: '2' } },
    })
    const options = await seen({ http: { headers: { c: '3' } } })
    expect(options.http).toEqual({ baseEndpoint: 'https://x.test', headers: { c: '3' } })
  })

  it('row 2 — graphQL endpoint keeps the existing headers', async () => {
    const { seen } = withSpy({ graphQL: { endpoint: 'https://g.test', headers: { a: '1' } } })
    const options = await seen({ graphQL: { endpoint: 'https://other.test' } })
    expect(options.graphQL).toEqual({ endpoint: 'https://other.test', headers: { a: '1' } })
  })

  // Reached through `updateOptions` rather than a per-call block: `cache`
  // is constructor/updateOptions-only (Phase 9.1), since the store is
  // instance-lived and a per-call block could only have been ignored
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

  it('row 3, the other half — a per-call cache block is refused, not ignored', async () => {
    const { fig } = withSpy({ cache: { maxTime: 60 } })
    await expect(fig.evaluate({ $peek: {} }, { cache: { maxTime: 5 } })).rejects.toThrow(
      /not a per-call option/
    )
  })

  it('row 5 — data merges at top-level keys; a supplied key replaces its value', async () => {
    const fig = new FigTree({ data: { user: { name: 'Ada', age: 36 }, org: 'Acme' } })
    const result = await fig.evaluate(
      { $buildString: ['%1/%2/%3', '$data.org', '$data.user.name', '$data.user.age'] },
      { data: { user: { name: 'Grace' } } }
    )
    // `org` survives the merge; the whole `user` value is replaced, so `age`
    // is gone
    expect(result).toBe('Acme/Grace/')
  })

  it('operatorDefaults merges per operator name; other operators survive', async () => {
    const fig = new FigTree({
      operatorDefaults: { join: { delimiter: ' | ' }, buildString: { trim: true } },
    })
    fig.updateOptions({ operatorDefaults: { join: { delimiter: ' / ' } } })
    expect(await fig.evaluate({ $join: ['a', 'b'] })).toBe('a / b')
    expect(fig.getOptions().operatorDefaults?.buildString).toEqual({ trim: true })
  })
})

describe('what does not merge', () => {
  it('ignores undefined at both levels, falling back to the instance value', async () => {
    const { seen } = withSpy({ http: { baseEndpoint: 'https://x.test' }, maxNodes: 40 })
    const options = await seen({ maxNodes: undefined, http: { baseEndpoint: undefined } })
    expect(options.maxNodes).toBe(40)
    expect(options.http?.baseEndpoint).toBe('https://x.test')
  })

  it('replaces arrays wholesale, at both levels', async () => {
    const fig = new FigTree({ data: { list: [1, 2, 3] } })
    expect(await fig.evaluate('$data.list', { data: { list: [9] } })).toEqual([9])
  })

  it('replaces anything deeper than two levels wholesale', async () => {
    const fig = new FigTree({ data: { a: { b: { c: 1, d: 2 } } } })
    const result = await fig.evaluate('$data.a.b', { data: { a: { b: { c: 9 } } } })
    expect(result).toEqual({ c: 9 })
  })

  it('replaces a non-plain value wholesale rather than spreading it', async () => {
    class Holder {
      constructor(readonly tag: string) {}
    }
    const { seen } = withSpy({ data: { held: new Holder('first') } })
    const options = await seen({ data: { held: new Holder('second') } })
    expect(options.data?.held).toBeInstanceOf(Holder)
    expect((options.data?.held as Holder).tag).toBe('second')
  })

  // An AbortSignal has no own enumerable properties, so merging it key by
  // key yields an object that is no longer a signal and throws at the first
  // node boundary. It is a plain object to a loose test, which is why the
  // merge tests for a plain DATA object.
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
    const { seen } = withSpy({ http: { baseEndpoint: 'https://instance.test' } })
    expect((await seen({ http: { baseEndpoint: 'https://call.test' } })).http?.baseEndpoint).toBe(
      'https://call.test'
    )
    expect((await seen()).http?.baseEndpoint).toBe('https://instance.test')
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

  it('protects a block’s own keys, but shares what sits below them', async () => {
    const supplied = { http: { baseEndpoint: 'https://x.test', headers: { a: '1' } } }
    const spy = spyOp('peek', {})
    const fig = new FigTree({ operators: [spy.definition], ...supplied })
    supplied.http.baseEndpoint = 'https://mutated.test'
    supplied.http.headers.a = 'mutated'
    await fig.evaluate({ $peek: {} })
    // Copying stops at the merge rule's depth: the block is ours, so its own
    // keys are safe, while `headers` is a level deeper and stays the
    // caller's object. Level 3 is shared by design — a caller's `data`
    // values must keep their identity, and a store or signal cannot be
    // cloned at all, so one uniform depth is the only honest rule.
    expect(spy.contexts[0].options.http?.baseEndpoint).toBe('https://x.test')
    expect(spy.contexts[0].options.http?.headers).toEqual({ a: 'mutated' })
  })

  it('does not freeze a block the caller still holds', async () => {
    const perCall = { http: { baseEndpoint: 'https://call.test' } }
    const { fig } = withSpy()
    await fig.evaluate({ $peek: {} }, perCall)
    expect(() => {
      perCall.http.baseEndpoint = 'https://after.test'
    }).not.toThrow()
  })
})

describe('validate() and evaluate() merge identically', () => {
  it('both see instance data merged under per-call data', async () => {
    const fig = new FigTree({ data: { org: 'Acme' } })
    const expression = { $buildString: ['%1/%2', '$data.org', '$data.team'] }
    // The sample-data check walks the merged data: `org` is present from the
    // instance, so only the genuinely absent path warns
    const { issues } = fig.validate(expression, { data: { team: 'Platform' } })
    expect(issues).toEqual([])
    expect(await fig.evaluate(expression, { data: { team: 'Platform' } })).toBe('Acme/Platform')
  })

  it('both report a path absent from the merged data', () => {
    const fig = new FigTree({ data: { org: 'Acme' } })
    const { issues } = fig.validate({ $buildString: ['%1', '$data.missing'] }, { data: {} })
    expect(issues.map((issue) => issue.severity)).toEqual(['warning'])
  })
})

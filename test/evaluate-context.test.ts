/**
 * Chunk 4.1 — `OperatorContext` in final shape with stubs behind it
 * ("The runtime interface" in docs-dev/v3-specs/v3-operator-contract.md;
 * working rule 3): signal passthrough, options delivery, identity
 * `cache.memo`, no-op `trace.note`.
 *
 * The spy operator's metadata `useCache` default is false, so its `memo`
 * is the passthrough branch — the cache proper has its own suite in
 * test/result-cache.test.ts.
 */
import { FigTree, defineOperator } from '../src'
import { signalProbeOp, spyOp } from './fixtures/evalOperators'
import { rejection } from './helpers/rejection'

test('context.signal follows the caller signal', async () => {
  const probe = signalProbeOp()
  const fig = new FigTree({ operators: [probe.definition] })
  const controller = new AbortController()
  const running = fig.evaluate({ $probe: {} }, { signal: controller.signal })
  await new Promise((resolve) => setTimeout(resolve, 10))
  controller.abort()
  expect((await rejection<{ code: string }>(running)).code).toBe('aborted')
  expect(probe.seen).toEqual([false, true])
})

test('without a caller signal there is still a live, unaborted signal', async () => {
  const spy = spyOp('sig', {})
  const seen: boolean[] = []
  const live = defineOperator({
    name: 'live',
    category: 'other',
    description: 'Record whether the signal is live on entry',
    parameters: {},
    evaluate: (_params, context) => {
      seen.push(context.signal instanceof AbortSignal, context.signal.aborted)
      return 'ok'
    },
  })
  await new FigTree({ operators: [spy.definition, live] }).evaluate({ $live: {} })
  expect(seen).toEqual([true, false])
})

test('the signal a body received is settled once the evaluation has returned', async () => {
  // The root scope settles like any node scope: nothing is waiting on this
  // evaluation any more, so anything still holding its signal is told so
  const spy = spyOp('sig', {})
  await new FigTree({ operators: [spy.definition] }).evaluate({ $sig: {} })
  expect(spy.contexts[0].signal.aborted).toBe(true)
})

test('context.options is the whole option set: instance configuration with the call laid over', async () => {
  const spy = spyOp('opts', {})
  const fig = new FigTree({
    operators: [spy.definition],
    http: { baseEndpoint: 'https://x.test', headers: { a: '1' } },
    graphQL: { endpoint: 'https://g.test' },
    data: { instance: true },
  })
  const data = { call: true }
  await fig.evaluate({ $opts: {} }, { data, mode: 'throw' })
  const { options } = spy.contexts[0]
  // Blocks the body never declared an interest in are there all the same
  expect(options.http).toEqual({ baseEndpoint: 'https://x.test', headers: { a: '1' } })
  expect(options.graphQL).toEqual({ endpoint: 'https://g.test' })
  expect(options.mode).toBe('throw')
  // Per-call data is the caller's object, not a merge and not a copy
  expect(options.data).toBe(data)
})

test('a per-call option never writes back to the instance', async () => {
  const spy = spyOp('writeback', {})
  const fig = new FigTree({ operators: [spy.definition], data: { from: 'instance' } })
  await fig.evaluate({ $writeback: {} }, { data: { from: 'call' } })
  await fig.evaluate({ $writeback: {} })
  expect(spy.contexts[0].options.data).toEqual({ from: 'call' })
  expect(spy.contexts[1].options.data).toEqual({ from: 'instance' })
})

test('every body in one evaluation shares the one options object', async () => {
  const outer = spyOp('outer', { value: { type: 'any' } })
  const inner = spyOp('inner', {})
  await new FigTree({ operators: [outer.definition, inner.definition] }).evaluate({
    $outer: { value: { $inner: {} } },
  })
  expect(outer.contexts[0].options).toBe(inner.contexts[0].options)
})

test('a call with no options runs under the instance’s own prepared object, unfrozen', async () => {
  const spy = spyOp('prepared', {})
  const data = { user: { name: 'Ada' } }
  const fig = new FigTree({
    operators: [spy.definition],
    http: { baseEndpoint: 'https://x.test' },
    data,
  })
  await fig.evaluate({ $prepared: {} })
  await fig.evaluate({ $prepared: {} })
  const { options } = spy.contexts[0]
  // One object for every call that supplies nothing: no merge, no copy
  expect(spy.contexts[1].options).toBe(options)
  // Nothing is frozen — the no-mutation promise is pinned by test
  // (options-merge.test.ts), not enforced by a per-call walk
  expect(Object.isFrozen(options)).toBe(false)
  expect(Object.isFrozen(options.http)).toBe(false)
  // Instance data is the host's object by reference, like per-call data
  expect(options.data).toBe(data)
})

test('cache.memo is an identity passthrough when the node is not caching', async () => {
  const spy = spyOp('memo', {})
  await new FigTree({ operators: [spy.definition] }).evaluate({ $memo: {} })
  let runs = 0
  const fn = async () => ++runs
  expect(await spy.contexts[0].cache.memo('key', fn)).toBe(1)
  expect(await spy.contexts[0].cache.memo('key', fn)).toBe(2)
})

test('trace.note discards when trace is off, so a body emits unconditionally', async () => {
  const spy = spyOp('note', {})
  await new FigTree({ operators: [spy.definition] }).evaluate({ $note: {} })
  expect(() => spy.contexts[0].trace.note({ type: 'cache', hit: true })).not.toThrow()
})

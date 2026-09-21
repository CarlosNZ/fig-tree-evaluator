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

test('context.options is the whole merged option set, frozen, merged per call', async () => {
  const spy = spyOp('opts', {})
  const fig = new FigTree({
    operators: [spy.definition],
    http: { baseEndpoint: 'https://x.test', headers: { a: '1' } },
    graphQL: { endpoint: 'https://g.test' },
  })
  await fig.evaluate({ $opts: {} }, { http: { headers: { b: '2' } } })
  const { options } = spy.contexts[0]
  // Blocks the body never declared an interest in are there all the same
  expect(options.http).toEqual({ baseEndpoint: 'https://x.test', headers: { b: '2' } })
  expect(options.graphQL).toEqual({ endpoint: 'https://g.test' })
  expect(Object.isFrozen(options)).toBe(true)
})

test('the per-call merge never writes back to the instance', async () => {
  const spy = spyOp('writeback', {})
  const fig = new FigTree({ operators: [spy.definition], http: { baseEndpoint: 'https://x.test' } })
  await fig.evaluate({ $writeback: {} }, { http: { baseEndpoint: 'https://call.test' } })
  await fig.evaluate({ $writeback: {} })
  expect(spy.contexts[0].options.http?.baseEndpoint).toBe('https://call.test')
  expect(spy.contexts[1].options.http?.baseEndpoint).toBe('https://x.test')
})

test('every body in one evaluation shares the one frozen options object', async () => {
  const outer = spyOp('outer', { value: { type: 'any' } })
  const inner = spyOp('inner', {})
  await new FigTree({ operators: [outer.definition, inner.definition] }).evaluate({
    $outer: { value: { $inner: {} } },
  })
  expect(outer.contexts[0].options).toBe(inner.contexts[0].options)
})

test('options are frozen at the block level too, but not below it', async () => {
  const user = { name: 'Ada' }
  const spy = spyOp('frozen', {})
  await new FigTree({
    operators: [spy.definition],
    http: { baseEndpoint: 'https://x.test' },
    data: { user },
  }).evaluate({ $frozen: {} })
  const { options } = spy.contexts[0]
  expect(Object.isFrozen(options)).toBe(true)
  expect(Object.isFrozen(options.http)).toBe(true)
  // A level deeper is the caller's own object — freezing it would reach
  // outside the library, so results may share it and it stays writable
  expect(Object.isFrozen(options.data?.user)).toBe(false)
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

/**
 * Chunk 4.1 — `OperatorContext` in final shape with stubs behind it
 * ("The runtime interface" in docs-dev/v3-specs/v3-operator-contract.md;
 * working rule 3): signal passthrough, `readsOptions` delivery, identity
 * `cache.memo`, no-op `trace.note`.
 */
import { FigTree } from '../src'
import { spyOp } from './fixtures/evalOperators'

test('context.signal follows the caller signal', async () => {
  const spy = spyOp('sig', {})
  const fig = new FigTree({ operators: [spy.definition] })
  const controller = new AbortController()
  await fig.evaluate({ $sig: {} }, { signal: controller.signal })
  const { signal } = spy.contexts[0]
  expect(signal.aborted).toBe(false)
  controller.abort()
  expect(signal.aborted).toBe(true)
})

test('without a caller signal there is still a live, unaborted signal', async () => {
  const spy = spyOp('sig', {})
  await new FigTree({ operators: [spy.definition] }).evaluate({ $sig: {} })
  expect(spy.contexts[0].signal).toBeInstanceOf(AbortSignal)
  expect(spy.contexts[0].signal.aborted).toBe(false)
})

test('context.options is exactly the readsOptions blocks, frozen, merged per call', async () => {
  const spy = spyOp('opts', {}, { readsOptions: ['http'] })
  const fig = new FigTree({
    operators: [spy.definition],
    http: { baseEndpoint: 'https://x.test', headers: { a: '1' } },
    graphQL: { endpoint: 'https://g.test' },
  })
  await fig.evaluate({ $opts: {} }, { http: { headers: { b: '2' } } })
  const { options } = spy.contexts[0]
  expect(Object.keys(options)).toEqual(['http'])
  expect(options.http).toEqual({ baseEndpoint: 'https://x.test', headers: { b: '2' } })
  expect(Object.isFrozen(options)).toBe(true)
})

test('an operator declaring no readsOptions sees an empty, frozen options object', async () => {
  const spy = spyOp('none', {})
  await new FigTree({ operators: [spy.definition], http: { baseEndpoint: 'x' } }).evaluate({
    $none: {},
  })
  expect(spy.contexts[0].options).toEqual({})
  expect(Object.isFrozen(spy.contexts[0].options)).toBe(true)
})

test('cache.memo is an identity passthrough until Phase 9', async () => {
  const spy = spyOp('memo', {})
  await new FigTree({ operators: [spy.definition] }).evaluate({ $memo: {} })
  let runs = 0
  const fn = async () => ++runs
  expect(await spy.contexts[0].cache.memo('key', fn)).toBe(1)
  expect(await spy.contexts[0].cache.memo('key', fn)).toBe(2)
})

test('trace.note is a no-op until Phase 12', async () => {
  const spy = spyOp('note', {})
  await new FigTree({ operators: [spy.definition] }).evaluate({ $note: {} })
  expect(() => spy.contexts[0].trace.note({ type: 'cache', hit: true })).not.toThrow()
})

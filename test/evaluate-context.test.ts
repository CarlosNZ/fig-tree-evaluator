/**
 * Chunk 4.1 — `OperatorContext` in final shape with stubs behind it
 * ("The runtime interface" in docs-dev/v3-specs/v3-operator-contract.md;
 * working rule 3): signal passthrough, options delivery, identity
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

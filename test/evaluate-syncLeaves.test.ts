/**
 * Synchronous leaves (#170, item F stage 2a).
 *
 * A node evaluation hands back a value OR a promise of one. A leaf that
 * already has its value — a constant, a `$data` read — answers without a
 * promise, so a config full of data reads costs no promise per read; a
 * leaf that must wait (`$vars`, `$params`) or any operator node hands back
 * a promise as before. `await` accepts either, so callers never branch on
 * the shape; the resolver and the skeleton merely skip a wait that has
 * nothing to wait for.
 *
 * What this pins is the part that must NOT change: a leaf that fails
 * synchronously still arrives as a rejection, never a throw, so every
 * sibling is still started before a failure is observed, and every error
 * a caller sees is the one it saw before.
 */
import { FigTree, coreOperators } from '../src'
import { buildRegistry } from '../src/registry'
import { parseExpression } from '../src/parse'
import { DeferredScope } from '../src/evaluate/abort'
import { createEvaluationContext } from '../src/evaluate/context'
import { evaluateNode } from '../src/evaluate/evaluate'
import { ResultCache, readCacheConfig } from '../src/resultCache'
import { isThenable } from '../src/utils'
import { spyOp } from './fixtures/evalOperators'

/** An evaluation context over `data`, as run.ts would build it. */
const contextOver = (data: Record<string, unknown>) =>
  createEvaluationContext(
    { data },
    new ResultCache(readCacheConfig(undefined)),
    new DeferredScope(undefined)
  )
const registry = buildRegistry({ operators: [coreOperators] })
const compiled = (expression: unknown) => parseExpression(expression, registry).root

describe('a leaf that already has its value answers without a promise', () => {
  test('a constant', () => {
    const outcome = evaluateNode(compiled(42), contextOver({}))
    expect(isThenable(outcome)).toBe(false)
    expect(outcome).toBe(42)
  })

  test('a $data read, whole and drilled', () => {
    const user = { name: 'Ada' }
    const ctx = contextOver({ user })
    expect(evaluateNode(compiled('$data.user'), ctx)).toBe(user)
    expect(evaluateNode(compiled('$data.user.name'), ctx)).toBe('Ada')
    expect(evaluateNode(compiled('$data.missing'), ctx)).toBe(null)
  })

  test('an operator node is a promise, as before', () => {
    const outcome = evaluateNode(compiled({ $plus: [1, 2] }), contextOver({}))
    expect(isThenable(outcome)).toBe(true)
    return expect(outcome).resolves.toBe(3)
  })
})

describe('a leaf that fails synchronously still arrives as a rejection', () => {
  test('a strict data miss is a rejected promise at the leaf, never a throw', async () => {
    const ctx = { ...contextOver({}), strictDataPaths: true }
    let outcome: unknown
    expect(() => {
      outcome = evaluateNode(compiled('$data.missing'), ctx)
    }).not.toThrow()
    expect(isThenable(outcome)).toBe(true)
    await expect(outcome).rejects.toMatchObject({ code: 'missing-data-path' })
  })

  test('so every sibling is still started before the failure is observed', async () => {
    const probe = spyOp('probe', {}, { result: 1 })
    const fig = new FigTree({ operators: [coreOperators, probe.definition], strictDataPaths: true })
    await expect(fig.evaluate({ $plus: ['$data.missing', { $probe: {} }] })).rejects.toMatchObject({
      code: 'missing-data-path',
    })
    // The failing leaf sits first; the probe after it ran all the same
    expect(probe.calls).toHaveLength(1)
  })

  test('and the error a caller sees is unchanged, path included', async () => {
    const fig = new FigTree({ strictDataPaths: true })
    const error = await fig.evaluate({ a: 1, b: '$data.nope' }).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'missing-data-path', path: ['b'] })
  })
})

describe('the results are what they were', () => {
  test('a config of data reads splices the values it read', async () => {
    const fig = new FigTree()
    const data = { user: { name: 'Ada', tags: ['x'] }, n: 3 }
    expect(
      await fig.evaluate(
        {
          title: 'Report',
          name: '$data.user.name',
          tags: '$data.user.tags',
          total: { $plus: ['$data.n', 1] },
        },
        { data }
      )
    ).toEqual({ title: 'Report', name: 'Ada', tags: ['x'], total: 4 })
  })

  test('a var read still waits on its definition', async () => {
    const fig = new FigTree()
    expect(
      await fig.evaluate({ vars: { n: { $plus: [1, 2] } }, value: { $plus: ['$vars.n', 1] } })
    ).toEqual({ value: 4 })
  })
})

/**
 * Chunk 10.1 — the kill switch and timeout shielding (fallback rule 3 in
 * "fallback semantics", docs-dev/v3-specs/v3-api.md; "Kill-switch shapes"
 * in docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * The whole-evaluation `timeout` and the caller's `signal` cut through
 * every fallback, dynamic fallbacks included: no expression work runs past
 * the deadline. The one exception is a statically shielded expression,
 * which returns its assembly — real values where holes finished, the
 * precomputed static fallbacks where they did not — instead of throwing.
 * `signal` is never shaped by anything: the caller cancelled, and nobody
 * is waiting. Report mode's rows of the shapes table are Phase 12.
 *
 * Timings are real: budgets in the tens of milliseconds against bodies in
 * the hundreds, the margin io-timeout.test.ts already relies on.
 */
import { FigTree, FigTreeError, coreOperators } from '../src'
import type { ValidatedOperatorDefinition } from '../src'
import { boomOp, latencyOp, sleepOp, spyOp } from './fixtures/evalOperators'
import { rejection } from './helpers/rejection'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((clear) => clear())
})

/**
 * `operators` states the registry exhaustively, so the core set is named
 * alongside the sleeper and whatever else a case brings.
 */
const setup = (extra: ValidatedOperatorDefinition[] = [], options: object = {}) => {
  const sleep = sleepOp()
  cleanups.push(sleep.cleanup)
  const fig = new FigTree({ operators: [coreOperators, sleep.definition, ...extra], ...options })
  return { fig, sleep }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A deaf sleep long enough that only the kill switch can end the wait. */
const DEAF = { operator: 'sleep', ms: 2000, deaf: true }

describe('the whole-evaluation timeout, unshielded', () => {
  it('throws with its own code, tagged at the root, naming the budget', async () => {
    const { fig } = setup()
    const error = await rejection<FigTreeError>(fig.evaluate({ $sleep: [300] }, { timeout: 30 }))
    expect(error).toBeInstanceOf(FigTreeError)
    expect(error.code).toBe('timeout')
    expect(error.path).toEqual([])
    expect(error.message).toMatch(/30ms/)
  })

  it('cuts through a dynamic fallback, which never runs', async () => {
    const caught = spyOp('caught', {})
    const { fig } = setup([caught.definition])
    const error = await rejection<FigTreeError>(
      fig.evaluate({ operator: 'sleep', ms: 300, fallback: { $caught: {} } }, { timeout: 30 })
    )
    expect(error.code).toBe('timeout')
    await pause(50)
    expect(caught.calls).toHaveLength(0)
  })

  it('ends the call on time even when the driver ignores the signal', async () => {
    // The Phase-9 open case: no per-request timeout, a body that cannot be
    // interrupted. The evaluation is abandoned at the deadline regardless
    const { fig } = setup()
    const started = Date.now()
    const error = await rejection<FigTreeError>(fig.evaluate(DEAF, { timeout: 30 }))
    expect(error.code).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('bounds the whole call: the deadline includes fallback evaluation', async () => {
    const { fig, sleep } = setup([boomOp()])
    const error = await rejection<FigTreeError>(
      fig.evaluate({ $boom: 1, fallback: { $sleep: [300] } }, { timeout: 30 })
    )
    expect(error.code).toBe('timeout')
    // The fallback began — and was cut off like anything else
    expect(sleep.started).toEqual([300])
  })

  it('starts no new node after the deadline', async () => {
    // The condition is a deaf sleep that resolves AFTER the deadline; the
    // branch it would then demand is refused at its node boundary
    const mark = spyOp('mark', {})
    const { fig } = setup([mark.definition])
    const error = await rejection<FigTreeError>(
      fig.evaluate(
        { $if: [{ operator: 'sleep', ms: 100, deaf: true }, { $mark: {} }, 'no'] },
        { timeout: 30 }
      )
    )
    expect(error.code).toBe('timeout')
    await pause(200)
    expect(mark.calls).toHaveLength(0)
  })

  it('discards the holes that did finish: shielding is all-or-nothing', async () => {
    const { fig } = setup()
    const error = await rejection<FigTreeError>(
      fig.evaluate({ a: { $plus: [1, 2] }, b: { $sleep: [300] } }, { timeout: 30 })
    )
    expect(error.code).toBe('timeout')
  })
})

describe('timeout shielding', () => {
  it('a node root returns its static fallback, on time', async () => {
    const { fig } = setup()
    const started = Date.now()
    expect(
      await fig.evaluate({ operator: 'sleep', ms: 300, fallback: 'degraded' }, { timeout: 30 })
    ).toBe('degraded')
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('a constant null fallback is a value, not an absence', async () => {
    const { fig } = setup()
    expect(
      await fig.evaluate({ operator: 'sleep', ms: 300, fallback: null }, { timeout: 30 })
    ).toBe(null)
  })

  it('an operatorDefaults modifier fallback shields', async () => {
    const { fig } = setup([], { operatorDefaults: { sleep: { fallback: 'offline' } } })
    expect(await fig.evaluate({ $sleep: [300] }, { timeout: 30 })).toBe('offline')
  })

  it('a literal root assembles: finished holes real, unfinished ones their static fallbacks', async () => {
    const { fig } = setup()
    const input = {
      title: 'Report',
      fast: { $plus: [1, 2], fallback: 0 },
      slow: { operator: 'sleep', ms: 300, fallback: 'pending' },
      meta: { tags: ['a', 'b'] },
    }
    const snapshot = JSON.parse(JSON.stringify(input))
    const result = (await fig.evaluate(input, { timeout: 30 })) as Record<string, unknown>
    expect(result).toEqual({
      title: 'Report',
      fast: 3,
      slow: 'pending',
      meta: { tags: ['a', 'b'] },
    })
    // Constant subtrees off the splice paths stay shared with the input,
    // and the input itself is untouched — the results-are-read-only contract
    expect(result.meta).toBe(input.meta)
    expect(input).toEqual(snapshot)
  })

  it('a vars block on the literal root still assembles', async () => {
    const { fig } = setup()
    expect(
      await fig.evaluate(
        {
          vars: { n: 2 },
          fast: { $plus: ['$vars.n', 1], fallback: 0 },
          slow: { operator: 'sleep', ms: 300, fallback: 'pending' },
        },
        { timeout: 30 }
      )
    ).toEqual({ fast: 3, slow: 'pending' })
  })

  it('cancels the in-flight work through the threaded signal', async () => {
    const latency = latencyOp()
    const { fig } = setup([latency.definition])
    expect(
      await fig.evaluate(
        { operator: 'slow', value: 'x', ms: 300, fallback: 'none' },
        { timeout: 30 }
      )
    ).toBe('none')
    await pause(20)
    expect(latency.aborted).toEqual(['x'])
    expect(latency.finished).toEqual([])
  })

  it('a shielded expression with nothing to evaluate takes the plain path', async () => {
    // Not inert (the comment key), yet it compiles to a constant with no
    // holes — vacuously shielded, and nothing in it can time out
    const { fig } = setup()
    expect(await fig.evaluate({ '//': 'note', a: 1 }, { timeout: 30 })).toEqual({ a: 1 })
  })

  it('a static fallback still catches ordinary failures the ordinary way', async () => {
    const { fig } = setup([boomOp()])
    expect(await fig.evaluate({ $boom: 1, fallback: 'fb' }, { timeout: 500 })).toBe('fb')
  })

  it('returns the real values when everything finishes inside the budget', async () => {
    const { fig } = setup()
    expect(
      await fig.evaluate(
        { a: { $sleep: [5], fallback: 'no' }, b: { $plus: [1, 1], fallback: 0 } },
        { timeout: 500 }
      )
    ).toEqual({ a: 'slept 5', b: 2 })
  })
})

describe("the caller's signal", () => {
  it('cuts through a shielded expression: nobody is waiting', async () => {
    const { fig } = setup()
    const controller = new AbortController()
    const running = fig.evaluate(
      { operator: 'sleep', ms: 300, fallback: 'degraded' },
      { signal: controller.signal, timeout: 5000 }
    )
    await pause(10)
    controller.abort()
    const error = await rejection<FigTreeError>(running)
    expect(error.code).toBe('aborted')
    expect(error.path).toEqual([])
  })

  it('is not delayed by a driver that cannot be interrupted, with no timeout anywhere', async () => {
    const { fig } = setup()
    const controller = new AbortController()
    const started = Date.now()
    const running = fig.evaluate(DEAF, { signal: controller.signal })
    controller.abort()
    const error = await rejection<FigTreeError>(running)
    expect(error.code).toBe('aborted')
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('without a timeout there is no clock: a body completes normally under a signal alone', async () => {
    const { fig } = setup()
    const controller = new AbortController()
    expect(await fig.evaluate({ $sleep: [50] }, { signal: controller.signal })).toBe('slept 50')
  })

  it('already aborted at entry: rejects at once and runs nothing', async () => {
    const mark = spyOp('mark', {})
    const { fig } = setup([mark.definition])
    const controller = new AbortController()
    controller.abort()
    const plain = await rejection<FigTreeError>(
      fig.evaluate({ $mark: {} }, { signal: controller.signal })
    )
    expect(plain.code).toBe('aborted')
    // The shielded path too — a listener on an already-aborted signal never
    // fires, so this would hang without the guard at registration
    const shielded = await rejection<FigTreeError>(
      fig.evaluate({ $mark: {}, fallback: 'x' }, { signal: controller.signal, timeout: 500 })
    )
    expect(shielded.code).toBe('aborted')
    expect(mark.calls).toHaveLength(0)
  })

  it('an instance-level signal is the default for every evaluation', async () => {
    const controller = new AbortController()
    const { fig } = setup([], { signal: controller.signal })
    const running = fig.evaluate({ $sleep: [300] })
    controller.abort()
    expect((await rejection<FigTreeError>(running)).code).toBe('aborted')
  })
})

describe('composition with per-request timeouts', () => {
  it('a request deadline inside the evaluation budget is an ordinary, catchable failure', async () => {
    const { fig } = setup()
    expect(
      await fig.evaluate(
        { operator: 'sleep', ms: 300, timeout: 30, fallback: 'slow' },
        { timeout: 500 }
      )
    ).toBe('slow')
  })

  it('the evaluation deadline inside a request budget cuts through', async () => {
    const caught = spyOp('caught', {})
    const { fig } = setup([caught.definition])
    const error = await rejection<FigTreeError>(
      fig.evaluate(
        { operator: 'sleep', ms: 300, timeout: 500, fallback: { $caught: {} } },
        { timeout: 30 }
      )
    )
    expect(error.code).toBe('timeout')
    expect(caught.calls).toHaveLength(0)
  })
})

describe('the root scope', () => {
  it('settles with the evaluation: an uncaught failure cancels sibling work, kill switch or not', async () => {
    const latency = latencyOp()
    const { fig } = setup([latency.definition, boomOp()])
    const error = await rejection<FigTreeError>(
      fig.evaluate({ a: { $boom: 1 }, b: { operator: 'slow', value: 'b', ms: 500 } })
    )
    expect(error.code).toBe('operator-failure')
    expect(error.message).toMatch(/boom/)
    await pause(20)
    expect(latency.aborted).toEqual(['b'])
  })

  it('a fast evaluation leaves no timer behind', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] })
    try {
      const fig = new FigTree()
      expect(await fig.evaluate({ $plus: [1, 2] }, { timeout: 60000 })).toBe(3)
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('the options', () => {
  it('an instance-level timeout is the default; a per-call one overrides it', async () => {
    const { fig } = setup([], { timeout: 30 })
    expect((await rejection<FigTreeError>(fig.evaluate({ $sleep: [100] }))).code).toBe('timeout')
    expect(await fig.evaluate({ $sleep: [100] }, { timeout: 1000 })).toBe('slept 100')
    // An undefined per-call value means "not supplied", as for every option
    expect(
      (await rejection<FigTreeError>(fig.evaluate({ $sleep: [100] }, { timeout: undefined }))).code
    ).toBe('timeout')
  })

  it.each([0, -1, NaN, Infinity, '50'])(
    'refuses timeout %p at construction and per call',
    async (bad) => {
      const timeout = bad as number
      expect(() => new FigTree({ timeout })).toThrow(FigTreeError)
      expect(() => new FigTree({ timeout })).toThrow(/timeout/)
      const error = await rejection<FigTreeError>(
        new FigTree().evaluate({ $plus: [1] }, { timeout })
      )
      expect(error.code).toBe('invalid-options')
    }
  )

  it('refuses a signal that is not an AbortSignal', async () => {
    const signal = {} as AbortSignal
    expect(() => new FigTree({ signal })).toThrow(/signal/)
    const error = await rejection<FigTreeError>(new FigTree().evaluate({ $plus: [1] }, { signal }))
    expect(error.code).toBe('invalid-options')
  })
})

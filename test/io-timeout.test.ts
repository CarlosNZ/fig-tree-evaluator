/**
 * Chunk 9.3 — per-request abort composition (ledger #15 in
 * docs-dev/v3-specs/v3-operator-parameters.md; "Signals and timeouts" in
 * Batch 8 of docs-dev/v3-specs/v3-operator-parameters-2.md).
 *
 * The whole feature is a three-way distinction the node wrapper makes, and
 * a body cannot: a node's own `timeout` expiring is an ORDINARY failure
 * its `fallback` catches; an enclosing scope aborting is silent
 * cancellation that reaches no fallback; the caller's signal cuts through
 * everything. These are asserted against a throwaway sleeping operator
 * rather than `http`, so the engine's half stands on its own.
 */
import { FigTree, FigTreeError, coreOperators } from '../src'
import { sleepOp, spyOp } from './fixtures/evalOperators'
import { rejection } from './helpers/rejection'

/**
 * `operators` states the registry exhaustively, so the core set has to be
 * named alongside the fixture — the races below need `or`.
 */
const withSleeper = (extra: object = {}) => {
  const sleep = sleepOp()
  const fig = new FigTree({ operators: [coreOperators, sleep.definition], ...extra })
  cleanups.push(sleep.cleanup)
  return { fig, sleep }
}

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((clear) => clear())
})

describe("a node's own timeout", () => {
  it('expires as an ordinary failure, with its own code', async () => {
    const { fig } = withSleeper()
    const error = await rejection<FigTreeError>(fig.evaluate({ $sleep: [200, 20] }))
    expect(error.code).toBe('request-timeout')
    expect(error.operator).toBe('sleep')
    expect(error.message).toMatch(/20ms/)
  })

  it("is caught by the node's own fallback — that is what it is for", async () => {
    const { fig } = withSleeper()
    expect(
      await fig.evaluate({ operator: 'sleep', ms: 200, timeout: 20, fallback: 'degraded' })
    ).toBe('degraded')
  })

  it('does not fire when the work finishes in time', async () => {
    const { fig } = withSleeper()
    expect(await fig.evaluate({ $sleep: [5, 500] })).toBe('slept 5')
  })

  it('is unset when the node supplies no value, so only the caller bounds it', async () => {
    const { fig } = withSleeper()
    expect(await fig.evaluate({ $sleep: [5] })).toBe('slept 5')
  })

  it('still fails the node when the driver cannot be interrupted', async () => {
    // SQLite's synchronous API: the signal reaches nobody, so the signal
    // alone would leave the node waiting out the full delay. The race
    // against the deadline is what makes the guarantee real
    const { fig } = withSleeper()
    const started = Date.now()
    const error = await rejection<FigTreeError>(
      fig.evaluate({ operator: 'sleep', ms: 2000, timeout: 20, deaf: true })
    )
    expect(error.code).toBe('request-timeout')
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('comes host-wide through operatorDefaults', async () => {
    const { fig } = withSleeper({ operatorDefaults: { sleep: { timeout: 20 } } })
    const error = await rejection<FigTreeError>(fig.evaluate({ $sleep: [200] }))
    expect(error.code).toBe('request-timeout')
  })
})

describe("the caller's signal is not the same thing", () => {
  it('cuts through, with the aborted code', async () => {
    const { fig } = withSleeper()
    const controller = new AbortController()
    const running = fig.evaluate({ $sleep: [200] }, { signal: controller.signal })
    controller.abort()
    const error = await rejection<FigTreeError>(running)
    expect(error.code).toBe('aborted')
  })

  it('ends the wait at once, even for a driver that cannot be interrupted', async () => {
    // A deaf driver under a caller's abort must not wait out its own
    // timeout: the race is against every abort of the composed signal,
    // not only the timer
    const { fig } = withSleeper()
    const controller = new AbortController()
    const started = Date.now()
    const running = fig.evaluate(
      { operator: 'sleep', ms: 2000, timeout: 1500, deaf: true },
      { signal: controller.signal }
    )
    controller.abort()
    const error = await rejection<FigTreeError>(running)
    expect(error.code).toBe('aborted')
    expect(Date.now() - started).toBeLessThan(500)
  })

  it("is not caught by the node's fallback — it is the caller's decision", async () => {
    const { fig } = withSleeper()
    const controller = new AbortController()
    const running = fig.evaluate(
      { operator: 'sleep', ms: 200, fallback: 'degraded' },
      { signal: controller.signal }
    )
    controller.abort()
    const error = await rejection<FigTreeError>(running)
    expect(error.code).toBe('aborted')
  })
})

describe('an enclosing scope resolving early', () => {
  it('cancels the loser silently — cancellation is not failure', async () => {
    const sleep = sleepOp()
    cleanups.push(sleep.cleanup)
    // The fallback is a spy node, so "did the fallback run?" is a count
    const caught = spyOp('caught', {})
    const fig = new FigTree({
      operators: [coreOperators, sleep.definition, caught.definition],
    })

    expect(
      await fig.evaluate({
        $or: [true, { operator: 'sleep', ms: 200, fallback: { $caught: {} } }],
      })
    ).toBe(true)

    // It started — and was abandoned without its failure reaching anything
    expect(sleep.started).toEqual([200])
    expect(caught.calls).toHaveLength(0)
  })

  it('still lets a real per-request timeout inside a race reach its fallback', async () => {
    const { fig } = withSleeper()
    // `false` decides nothing, so the slow operand's own deadline governs.
    // `or` answers with a boolean, so the fallback VALUE is what to vary:
    // a falsy one proves the fallback fired rather than the node failing
    expect(
      await fig.evaluate({
        $or: [false, { operator: 'sleep', ms: 200, timeout: 20, fallback: false }],
      })
    ).toBe(false)
    expect(
      await fig.evaluate({
        $or: [false, { operator: 'sleep', ms: 200, timeout: 20, fallback: true }],
      })
    ).toBe(true)
  })
})

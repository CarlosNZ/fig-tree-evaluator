/**
 * Chunk 5.3 — the `race` delivery and the node abort scopes ("and / or
 * early resolution: a race with error parking" in
 * docs-dev/v3-specs/v3-implementation-notes.md; worked example 5 in
 * docs-dev/v3-specs/v3-worked-examples.md).
 *
 * The claim under test is that the OUTCOME does not depend on completion
 * order — only on what is true. So every case that could be order-sensitive
 * is run in both orders, with the latencies scripted to force them.
 */
import { coreOperators, FigTree, FigTreeError } from '../src'
import { rejection } from './helpers/rejection'
import { latencyOp } from './fixtures/evalOperators'

const build = () => {
  const slow = latencyOp('slow')
  return { slow, fig: new FigTree({ operators: [coreOperators, slow.definition] }) }
}

// ── parallelism and early resolution ────────────────────────────────

describe('operands run in parallel, and a decider ends the node', () => {
  test('every operand starts — this is not a sequential short-circuit', async () => {
    const { slow, fig } = build()
    await fig.evaluate({ $and: [{ $slow: [true, 5] }, { $slow: [true, 5] }, { $slow: [true, 5] }] })
    expect(slow.started).toEqual([true, true, true])
  })

  test('a decider resolves the node without waiting for the rest', async () => {
    const { slow, fig } = build()
    // The truthy operand lands at 5ms; the slow one would take 200
    expect(await fig.evaluate({ $or: [{ $slow: [false, 200] }, { $slow: ['yes', 5] }] })).toBe(true)
    expect(slow.finished).toEqual(['yes'])
  })

  test('and is the mirror: the first falsy decides', async () => {
    const { slow, fig } = build()
    expect(await fig.evaluate({ $and: [{ $slow: ['x', 200] }, { $slow: [0, 5] }] })).toBe(false)
    expect(slow.finished).toEqual([0])
  })

  test('the in-flight remainder is cancelled, not left running', async () => {
    const { slow, fig } = build()
    await fig.evaluate({ $or: [{ $slow: [false, 200] }, { $slow: ['yes', 1] }] })
    // Give the abort a turn to land
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(slow.aborted).toEqual([false])
    expect(slow.finished).toEqual(['yes'])
  })
})

// ── Kleene parking ──────────────────────────────────────────────────

describe('a failure matters only when the result depends on it', () => {
  test('or(failure, truthy) is true — whichever settles first', async () => {
    const fast = build()
    expect(
      await fast.fig.evaluate({ $or: [{ $slow: ['x', 1, true] }, { $slow: ['yes', 40] }] })
    ).toBe(true)

    const slowFirst = build()
    expect(
      await slowFirst.fig.evaluate({ $or: [{ $slow: ['x', 40, true] }, { $slow: ['yes', 1] }] })
    ).toBe(true)
  })

  test('and(failure, falsy) is false — whichever settles first', async () => {
    const fast = build()
    expect(
      await fast.fig.evaluate({ $and: [{ $slow: ['x', 1, true] }, { $slow: [0, 40] }] })
    ).toBe(false)

    const slowFirst = build()
    expect(
      await slowFirst.fig.evaluate({ $and: [{ $slow: ['x', 40, true] }, { $slow: [0, 1] }] })
    ).toBe(false)
  })

  test('with no decider, the failure does fail the node', async () => {
    const { fig } = build()
    const error = await rejection<FigTreeError>(
      fig.evaluate({ $or: [{ $slow: ['x', 1, true] }, { $slow: [false, 5] }] })
    )
    expect(error).toBeInstanceOf(FigTreeError)
    expect(error.message).toContain('scripted failure')
  })

  test('a discarded failure is caught by no fallback — nothing failed', async () => {
    const { fig } = build()
    expect(
      await fig.evaluate({
        operator: 'or',
        values: [{ $slow: ['x', 1, true] }, { $slow: ['yes', 5] }],
        fallback: 'FB',
      })
    ).toBe(true)
  })
})

describe('the raised failure is the lowest index, not the first to arrive', () => {
  test('when the later operand fails first', async () => {
    const { fig } = build()
    // Index 1 fails at 1ms, index 0 at 40ms — index 0 must be raised
    const error = await rejection<FigTreeError>(
      fig.evaluate({ $or: [{ $slow: ['first', 40, true] }, { $slow: ['second', 1, true] }] })
    )
    expect(error.message).toContain('first')
  })

  test('and when it fails second — the same answer', async () => {
    const { fig } = build()
    const error = await rejection<FigTreeError>(
      fig.evaluate({ $or: [{ $slow: ['first', 1, true] }, { $slow: ['second', 40, true] }] })
    )
    expect(error.message).toContain('first')
  })
})

// ── worked example 5 ────────────────────────────────────────────────

describe('worked example 5: the same failure, mattering and not mattering', () => {
  const permissions = (data: Record<string, unknown>) => {
    const { slow, fig } = build()
    const expression = { $or: ['$data.isAdmin', { $slow: ['permissions-api', 5, true] }] }
    return { slow, run: () => fig.evaluate(expression, { data }) }
  }

  test('run 1: isAdmin decides, and the failed request is discarded', async () => {
    const { run } = permissions({ isAdmin: true })
    expect(await run()).toBe(true)
  })

  test('run 2: no decider, so the result depends on the failure', async () => {
    const { run } = permissions({ isAdmin: false })
    const error = await rejection<FigTreeError>(run())
    expect(error.message).toContain('scripted failure')
  })
})

// ── degeneration and identities ─────────────────────────────────────

describe('degeneration and the vacuous identities', () => {
  const fig = new FigTree()

  test('a dynamically-supplied list behaves identically', async () => {
    expect(await fig.evaluate({ $or: '$data.flags' }, { data: { flags: [0, '', 'x'] } })).toBe(true)
    expect(await fig.evaluate({ $and: '$data.flags' }, { data: { flags: [1, 'x', true] } })).toBe(
      true
    )
    expect(await fig.evaluate({ $and: '$data.flags' }, { data: { flags: [1, null] } })).toBe(false)
  })

  test('empty input is the identity (register row 4)', async () => {
    expect(await fig.evaluate({ operator: 'and', values: [] })).toBe(true)
    expect(await fig.evaluate({ operator: 'or', values: [] })).toBe(false)
    expect(await fig.evaluate({ $and: '$data.none' }, { data: { none: [] } })).toBe(true)
    expect(await fig.evaluate({ $or: '$data.none' }, { data: { none: [] } })).toBe(false)
  })

  test('a literal empty list warns as a dead expression', () => {
    expect(
      fig.validate({ operator: 'and', values: [] }).issues.map((issue) => issue.severity)
    ).toContain('warning')
  })

  test('a null list is a type error, not an identity', async () => {
    expect((await rejection<FigTreeError>(fig.evaluate({ $or: '$data.nope' }))).code).toBe(
      'type-check'
    )
  })
})

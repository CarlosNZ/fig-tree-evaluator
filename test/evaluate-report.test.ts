/**
 * Chunk 12.1 — `mode: 'report'` ("mode: 'report' — the process" and
 * "Kill-switch shapes" in docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * Report mode is the same evaluation with one thing changed: an uncaught
 * failure degrades its HOLE to `null` and is collected, instead of
 * rejecting the call. So the assertions here are mostly about what
 * survives — sibling holes, fallback-caught failures, the null gradient —
 * and about the two paths on every collected error: `path` names the
 * failing node, `holePath` the unit that degraded.
 *
 * The throw/report invariant has its own block at the end. It is the
 * anchor that makes `errors` well-defined, so it is asserted over a table
 * of expressions run both ways rather than case by case.
 */
import { FigTree, FigTreeError, ErrorCodes, coreOperators } from '../src'
import type { EvaluationResult, ValidatedOperatorDefinition } from '../src'
import { boomOp, failOp, latencyOp, sleepOp, spyOp } from './fixtures/evalOperators'
import { rejection } from './helpers/rejection'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((clear) => clear())
})

const setup = (extra: ValidatedOperatorDefinition[] = [], options: object = {}) =>
  new FigTree({ operators: [coreOperators, boomOp(), failOp(), ...extra], ...options })

/** Report mode's envelope, for the many cases that only read it. */
const report = async (
  fig: FigTree,
  expression: unknown,
  options: object = {}
): Promise<EvaluationResult> =>
  (await fig.evaluate(expression, { ...options, mode: 'report' })) as EvaluationResult

// ── Degradation is per hole ─────────────────────────────────────────

describe('an uncaught failure degrades its hole, and nothing else', () => {
  it('resolves the hole to null and keeps every sibling', async () => {
    const fig = setup()
    const { result, errors } = await report(fig, {
      good: { $plus: [1, 2] },
      bad: { $boom: 'x' },
      alsoGood: 'plain',
    })
    expect(result).toEqual({ good: 3, bad: null, alsoGood: 'plain' })
    expect(errors).toHaveLength(1)
  })

  it('tags the failing node with `path` and the degraded hole with `holePath`', async () => {
    const fig = setup()
    // The failure is two levels below the hole root, with no fallback
    // anywhere between — so the two paths differ, which is the point
    const { result, errors } = await report(fig, {
      stats: { summary: { $buildString: ['ratio: %1', { $boom: 'deep' }] } },
    })
    expect(result).toEqual({ stats: { summary: null } })
    expect(errors[0].path).toEqual(['stats', 'summary', '$buildString', 1])
    expect(errors[0].holePath).toEqual(['stats', 'summary'])
  })

  it('names the same path twice where the failing node IS the hole root', async () => {
    const fig = setup()
    const { errors } = await report(fig, { activity: { $boom: 'x' } })
    expect(errors[0].path).toEqual(['activity'])
    expect(errors[0].holePath).toEqual(['activity'])
  })

  it('degrades the whole expression where the root is the only hole', async () => {
    const fig = setup()
    const { result, errors } = await report(fig, { $boom: 'x' })
    expect(result).toBeNull()
    expect(errors[0].holePath).toEqual([])
  })

  it('leaves a sibling hole inside the same literal untouched', async () => {
    const fig = setup()
    // `stats` is plain structure, not a hole — the holes are independent
    const { result } = await report(fig, {
      stats: { total: { $plus: [10, 0] }, summary: { $boom: 'x' } },
    })
    expect(result).toEqual({ stats: { total: 10, summary: null } })
  })
})

describe('what is NOT an error of the evaluation', () => {
  it('a fallback that catches is designed degradation: success, nothing collected', async () => {
    const fig = setup()
    const { result, errors } = await report(fig, {
      avatar: { operator: 'boom', value: 'x', fallback: 'default.png' },
    })
    expect(result).toEqual({ avatar: 'default.png' })
    expect(errors).toEqual([])
  })

  it('a propagated null is success, and is exactly what `errors` tells apart', async () => {
    const fig = setup()
    const { result, errors } = await report(
      fig,
      { propagated: { $plus: ['$data.missing', 1] }, degraded: { $boom: 'x' } },
      { data: {} }
    )
    // Both read `null` in the result; only the degraded hole has an entry
    expect(result).toEqual({ propagated: null, degraded: null })
    expect(errors).toHaveLength(1)
    expect(errors[0].holePath).toEqual(['degraded'])
  })

  it('the null gradient still renders rather than failing', async () => {
    const fig = setup()
    const { result, errors } = await report(
      fig,
      { name: { $buildString: ['%1 %2', '$data.first', '$data.last'] } },
      { data: { first: 'Ada' } }
    )
    expect(result).toEqual({ name: 'Ada ' })
    expect(errors).toEqual([])
  })
})

describe('a failing fallback (rule 4) degrades the hole and keeps the cause', () => {
  it('fails with the fallback’s error, the original attached as `cause`', async () => {
    const fig = setup()
    const { result, errors } = await report(fig, {
      activity: { operator: 'fail', message: 'primary', fallback: { $boom: 'backup' } },
    })
    expect(result).toEqual({ activity: null })
    expect(errors[0].message).toMatch(/backup/)
    expect((errors[0].cause as FigTreeError).message).toMatch(/primary/)
    expect(errors[0].holePath).toEqual(['activity'])
  })
})

describe('one error object degrading two holes', () => {
  // A vars thunk memoizes its REJECTION (fallback rule 5), so two holes
  // demanding one failed var both catch the identical instance. Tagging
  // in place would put that object in `errors` twice under a single
  // `holePath`, and the second entry would name a hole it did not degrade
  const shared = {
    vars: { x: { $boom: 'once' } },
    a: '$vars.x',
    b: '$vars.x',
  }

  it('degrades both, and gives each entry its own holePath', async () => {
    const fig = setup()
    const { result, errors } = await report(fig, shared)
    expect(result).toEqual({ a: null, b: null })
    expect(errors).toHaveLength(2)
    expect(errors.map((error) => error.holePath)).toEqual([['a'], ['b']])
  })

  it('keeps one failing node: both entries name the var’s own path', async () => {
    const fig = setup()
    const { errors } = await report(fig, shared)
    expect(errors[0].path).toEqual(['vars', 'x'])
    expect(errors[1].path).toEqual(['vars', 'x'])
    expect(errors[0].message).toBe(errors[1].message)
  })

  it('the second entry is a copy, so neither holePath is a lie', async () => {
    const fig = setup()
    const { errors } = await report(fig, shared)
    expect(errors[0]).not.toBe(errors[1])
    expect(errors[1]).toBeInstanceOf(FigTreeError)
  })

  it('the var was evaluated once, for all that two holes failed', async () => {
    const counted = latencyOp('countedFail')
    const fig = setup([counted.definition])
    const { errors } = await report(fig, {
      vars: { x: { operator: 'countedFail', value: 'v', ms: 0, fail: true } },
      a: '$vars.x',
      b: '$vars.x',
    })
    expect(errors).toHaveLength(2)
    // Two degraded holes, one evaluation: the rejection is memoized, which
    // is exactly why the two holes can meet the same error object
    expect(counted.started).toEqual(['v'])
  })
})

// ── Ordering ────────────────────────────────────────────────────────

describe('`errors` is in tree order, never completion order', () => {
  it('orders by position in the input even when the later hole fails first', async () => {
    const slow = latencyOp('slow')
    const fig = setup([slow.definition])
    // `first` fails after 40ms, `second` immediately — so completion order
    // is the reverse of document order, and document order must win
    const { errors } = await report(fig, {
      first: { operator: 'slow', value: 'a', ms: 40, fail: true },
      second: { $boom: 'b' },
    })
    expect(errors).toHaveLength(2)
    expect(errors.map((error) => error.holePath)).toEqual([['first'], ['second']])
  })

  it('siblings run to completion rather than being cancelled by the first failure', async () => {
    const spy = spyOp('watch', {})
    const fig = setup([spy.definition])
    const { errors } = await report(fig, { a: { $boom: 'x' }, b: { $watch: {} } })
    expect(errors).toHaveLength(1)
    // Throw mode would have aborted this through the root scope
    expect(spy.calls).toHaveLength(1)
  })
})

// ── Static errors ───────────────────────────────────────────────────

describe('static errors are reported, not thrown', () => {
  it('returns every error-severity issue, with a null result', async () => {
    const fig = setup()
    const { result, errors } = await report(fig, {
      a: { operator: 'flibble' },
      b: { $if: [true] },
    })
    expect(result).toBeNull()
    expect(errors.length).toBeGreaterThanOrEqual(2)
    expect(errors.map((error) => error.code)).toContain(ErrorCodes.unknownOperator)
    expect(errors.map((error) => error.code)).toContain(ErrorCodes.missingRequired)
  })

  it('attaches no `issues` array — under report, `errors` IS the stream', async () => {
    const fig = setup()
    const { errors } = await report(fig, { a: { operator: 'flibble' } })
    expect(errors[0].issues).toBeUndefined()
  })

  it('still throws the first issue, with the stream attached, under throw mode', async () => {
    const fig = setup()
    const error = await rejection<FigTreeError>(fig.evaluate({ a: { operator: 'flibble' } }))
    expect(error.code).toBe(ErrorCodes.unknownOperator)
    expect(error.issues?.length).toBeGreaterThanOrEqual(1)
  })

  it('reports a limit breach rather than throwing it', async () => {
    const fig = setup([], { maxDepth: 1 })
    const { result, errors } = await report(fig, { $plus: [{ $plus: [1, 2] }, 3] })
    expect(result).toBeNull()
    expect(errors[0].code).toBe(ErrorCodes.maxDepthExceeded)
  })
})

// ── The envelope, including the paths that never evaluate ───────────

describe('the envelope rule', () => {
  it('wraps an inert input, which never reaches the evaluator at all', async () => {
    const fig = setup()
    const input = { a: 1, b: [2, 3] }
    const { result, errors } = await report(fig, input)
    // Identity is preserved through the envelope: the probe still skipped
    expect(result).toBe(input)
    expect(errors).toEqual([])
  })

  it('reports an inert input’s depth breach instead of throwing it', async () => {
    const fig = setup([], { maxDepth: 1 })
    const { result, errors } = await report(fig, { a: { b: { c: 1 } } })
    expect(result).toBeNull()
    expect(errors[0].code).toBe(ErrorCodes.maxDepthExceeded)
  })

  it('returns the bare value under throw mode, and the envelope under report', async () => {
    const fig = setup()
    expect(await fig.evaluate({ $plus: [1, 2] })).toBe(3)
    expect(await fig.evaluate({ $plus: [1, 2] }, { mode: 'report' })).toEqual({
      result: 3,
      errors: [],
    })
  })

  it('an instance-level mode applies without a per-call one, and a per-call one overrides', async () => {
    const fig = new FigTree({ operators: [coreOperators, boomOp()], mode: 'report' })
    expect(await fig.evaluate({ $boom: 'x' })).toMatchObject({ result: null })
    await expect(fig.evaluate({ $boom: 'x' }, { mode: 'throw' })).rejects.toBeInstanceOf(
      FigTreeError
    )
  })
})

// ── The kill switch under report ────────────────────────────────────

describe('the kill-switch rows of the shapes table', () => {
  it('unshielded: a null result beside the pre-deadline errors and the timeout', async () => {
    const sleep = sleepOp()
    cleanups.push(sleep.cleanup)
    const fig = setup([sleep.definition])
    const { result, errors } = await report(
      fig,
      { early: { $boom: 'x' }, slow: { operator: 'sleep', ms: 300, deaf: true } },
      { timeout: 40 }
    )
    expect(result).toBeNull()
    expect(errors.map((error) => error.code)).toEqual([
      ErrorCodes.operatorFailure,
      ErrorCodes.timeout,
    ])
  })

  it('shielded: the assembly beside exactly [timeoutError]', async () => {
    const sleep = sleepOp()
    cleanups.push(sleep.cleanup)
    const fig = setup([sleep.definition])
    const { result, errors } = await report(
      fig,
      {
        greeting: { $buildString: ['Hi %1', '$data.name'], fallback: 'Hi there' },
        offers: { operator: 'sleep', ms: 300, deaf: true, fallback: [] },
      },
      { data: { name: 'Ada' }, timeout: 40 }
    )
    expect(result).toEqual({ greeting: 'Hi Ada', offers: [] })
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe(ErrorCodes.timeout)
  })

  it('shielded and in time: the real values, and no timeout row at all', async () => {
    const fig = setup()
    const { result, errors } = await report(
      fig,
      { greeting: { $buildString: ['Hi %1', '$data.name'], fallback: 'Hi there' } },
      { data: { name: 'Ada' }, timeout: 500 }
    )
    expect(result).toEqual({ greeting: 'Hi Ada' })
    expect(errors).toEqual([])
  })

  it('a caller’s signal rejects even under report — the one exception', async () => {
    const sleep = sleepOp()
    cleanups.push(sleep.cleanup)
    const fig = setup([sleep.definition])
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 20)
    const error = await rejection<FigTreeError>(
      fig.evaluate(
        { slow: { operator: 'sleep', ms: 300, deaf: true } },
        { mode: 'report', signal: controller.signal }
      )
    )
    expect(error.code).toBe(ErrorCodes.aborted)
  })
})

// ── `related`: the parked failures that did not get raised ──────────

describe('sibling parked failures ride the raised error as `related`', () => {
  const twoFailures = { $or: [{ $fail: ['first'] }, { $fail: ['second'] }] }

  it('contributes one entry, with the others attached', async () => {
    const fig = setup()
    const { errors } = await report(fig, twoFailures)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/first/)
    expect(errors[0].related?.map((error) => error.message)).toEqual([
      expect.stringMatching(/second/),
    ])
  })

  it('attaches in throw mode too — `related` is the error’s, not the mode’s', async () => {
    const fig = setup()
    const error = await rejection<FigTreeError>(fig.evaluate(twoFailures))
    expect(error.related).toHaveLength(1)
  })

  it('covers the quantifiers, which are the same machinery', async () => {
    const fig = setup()
    const { errors } = await report(fig, {
      $some: { input: ['a', 'b'], each: { $fail: ['{{el}}'] } },
    })
    expect(errors).toHaveLength(1)
    expect(errors[0].related).toHaveLength(1)
  })

  it('is absent where a decider resolved: a discarded failure never surfaces', async () => {
    const fig = setup()
    const { result, errors } = await report(fig, { $or: [true, { $fail: ['ignored'] }] })
    expect(result).toBe(true)
    expect(errors).toEqual([])
  })
})

// ── The invariant ───────────────────────────────────────────────────

describe('the throw/report invariant', () => {
  const fig = setup()
  const cases: [string, unknown, object][] = [
    ['a clean expression', { $plus: [1, 2] }, {}],
    ['a caught failure', { operator: 'boom', value: 'x', fallback: 1 }, {}],
    ['a propagated null', { $plus: ['$data.nope', 1] }, { data: {} }],
    ['an inert input', { a: 1 }, {}],
    ['one uncaught failure', { a: { $boom: 'x' } }, {}],
    ['two uncaught failures', { a: { $boom: 'x' }, b: { $boom: 'y' } }, {}],
    ['a static error', { a: { operator: 'flibble' } }, {}],
    ['a failing fallback', { operator: 'fail', message: 'p', fallback: { $boom: 'q' } }, {}],
    ['a decider that fails', { $or: [{ $fail: ['a'] }, { $fail: ['b'] }] }, {}],
  ]

  it.each(cases)('throws iff report collects: %s', async (_name, expression, options) => {
    let threw: FigTreeError | undefined
    try {
      await fig.evaluate(expression, options)
    } catch (error) {
      threw = error as FigTreeError
    }
    const { errors } = await report(fig, expression, options)
    expect(threw !== undefined).toBe(errors.length > 0)
    // And the thrown error is always a MEMBER of the reported set — with
    // several holes failing concurrently, which one is timing-dependent,
    // so membership is the assertion rather than identity with errors[0]
    if (threw !== undefined) expect(errors.some((error) => error.code === threw?.code)).toBe(true)
  })
})

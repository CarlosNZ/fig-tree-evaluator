/**
 * Deferred abort scopes (#170, item A; the mechanism half of "Resolution
 * is cancellation" in docs-dev/v3-specs/v3-operator-contract.md).
 *
 * A node's scope answers "am I cancelled?" at the node boundary without a
 * real signal, and materialises an `AbortController` only when something
 * asks for `context.signal` — an I/O client, a per-request deadline, a
 * body that listens. The promises this pins: a pure CPU evaluation builds
 * no controller at all; a body that does hold a signal is still told when
 * an enclosing race settles, however deep it sits; and the chain
 * materialises correctly from the middle, with unmaterialised ancestors
 * above and below the node that asked.
 *
 * The cancellation semantics themselves are pinned by evaluate-race,
 * evaluate-timeout and io-timeout; this file is about what the mechanism
 * costs and where it materialises.
 */
import { FigTree, coreOperators, defineOperator, type LazyValue } from '../src'
import { latencyOp, spyOp } from './fixtures/evalOperators'

/** A body that reads its signal while running, as an I/O client would. */
const readsSignal = (name = 'reads') => {
  const seen: AbortSignal[] = []
  const definition = defineOperator({
    name,
    category: 'other',
    description: 'Read the signal during the body',
    parameters: {},
    evaluate: (_params, context) => {
      seen.push(context.signal)
      return 1
    },
  })
  return { definition, seen }
}

/**
 * Count `AbortController` constructions for the duration of `run`. The
 * engine reaches the global by name, so swapping it for the test's
 * duration observes exactly what the evaluation built.
 */
const countingControllers = async (run: () => Promise<unknown>): Promise<number> => {
  const Real = globalThis.AbortController
  let constructed = 0
  class Counting extends Real {
    constructor() {
      super()
      constructed += 1
    }
  }
  globalThis.AbortController = Counting
  try {
    await run()
  } finally {
    globalThis.AbortController = Real
  }
  return constructed
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('a pure CPU evaluation materialises nothing', () => {
  test('no controller at all: not at the root, not at any of 22 lazily-delivering nodes', async () => {
    const fig = new FigTree()
    // Every `plus` delivers lazily (a lazy null default), so each of these
    // nodes carries a deferred scope; none of them asks for a signal
    const expression = { $plus: Array.from({ length: 21 }, (_, i) => ({ $plus: [i, 1] })) }
    expect(await countingControllers(() => fig.evaluate(expression))).toBe(0)
    expect(await fig.evaluate(expression)).toBe(231)
  })

  test('nor for a fragment call over pure computation', async () => {
    const fig = new FigTree({
      fragments: {
        twice: { expression: { $plus: ['$params.n', '$params.n'] }, parameters: { n: {} } },
      },
    })
    expect(
      await countingControllers(() => fig.evaluate({ $twice: { n: { $plus: [2, 3] } } }))
    ).toBe(0)
  })

  test('nor for a whole config with several holes', async () => {
    const fig = new FigTree()
    const config = {
      title: 'Report',
      total: { $plus: ['$data.a', '$data.b'] },
      label: { $buildString: ['%1 items', '$data.a'] },
      ok: { $and: [{ $greaterThan: ['$data.a', 0] }, true] },
    }
    const built = await countingControllers(() => fig.evaluate(config, { data: { a: 2, b: 3 } }))
    expect(built).toBe(0)
  })
})

describe('a body that asks for the signal materialises its chain, once', () => {
  test('one controller per scope on the path from the asking node to the root', async () => {
    const reads = readsSignal()
    const fig = new FigTree({ operators: [coreOperators, reads.definition] })
    // root (deferred) → plus (deferred) → plus (deferred) → reads: the
    // reader has no lazy parameter, so it holds no scope of its own and
    // asks its parent's. Three scopes materialise: two `plus`, one root
    const built = await countingControllers(() =>
      fig.evaluate({ $plus: [{ $plus: [1, { $reads: {} }] }, 1] })
    )
    expect(built).toBe(3)
  })

  test('a second reader under the same ancestors adds only its own', async () => {
    const reads = readsSignal()
    const fig = new FigTree({ operators: [coreOperators, reads.definition] })
    // Both readers sit under one `plus`: plus and root materialise once,
    // and the readers hold no scope of their own — two controllers, not
    // four
    const built = await countingControllers(() =>
      fig.evaluate({ $plus: [{ $reads: {} }, { $reads: {} }] })
    )
    expect(built).toBe(2)
    expect(reads.seen[0]).toBe(reads.seen[1])
  })

  test('the materialised signal is a real one, settled once the evaluation has returned', async () => {
    const reads = readsSignal()
    const fig = new FigTree({ operators: [coreOperators, reads.definition] })
    await fig.evaluate({ $plus: [{ $reads: {} }, 1] })
    const [signal] = reads.seen
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(true)
  })

  test('a read after the scope has settled builds one aborted controller and chains nothing', async () => {
    const probe = spyOp('probe', {}, { result: 1 })
    const fig = new FigTree({ operators: [coreOperators, probe.definition] })
    const built = await countingControllers(async () => {
      await fig.evaluate({ $plus: [{ $plus: [1, { $probe: {} }] }, 1] })
      // Nothing was built during the run; this late read materialises the
      // one scope it names, already settled, with no parent to listen to
      expect(probe.contexts[0].signal.aborted).toBe(true)
    })
    expect(built).toBe(1)
  })
})

describe('cancellation still reaches a listener through unmaterialised ancestors', () => {
  test('two levels under a racing `or`, with a pure node in between', async () => {
    const slow = latencyOp('slow')
    const fig = new FigTree({ operators: [coreOperators, slow.definition] })
    // `or` decides on its second operand; the first is a `plus` (deferred,
    // never asked) over a slow body that holds the signal. The slow body
    // materialises plus → or → root; when `or` settles, the abort must
    // travel down through the chain it built
    const result = await fig.evaluate({
      $or: [{ $plus: [{ $slow: [0, 200] }, 1] }, { $slow: ['yes', 1] }],
    })
    expect(result).toBe(true)
    await pause(20)
    expect(slow.aborted).toEqual([0])
    expect(slow.finished).toEqual(['yes'])
  })

  test('a fragment body under a racing `or` is cancelled with the race', async () => {
    const slow = latencyOp('slow')
    const fig = new FigTree({
      operators: [coreOperators, slow.definition],
      fragments: { wait: { expression: { $slow: ['$params.v', 200] }, parameters: { v: {} } } },
    })
    const result = await fig.evaluate({ $or: [{ $wait: { v: 'a' } }, { $slow: ['yes', 1] }] })
    expect(result).toBe(true)
    await pause(20)
    expect(slow.aborted).toEqual(['a'])
  })

  test('a scope settled before anything asked answers `aborted` without a signal', async () => {
    // A body that starts a child evaluation after its own node has settled
    // is refused at the child's boundary — the settled flag alone answers,
    // no controller having been built
    let late: Promise<unknown> | undefined
    const escapes = defineOperator({
      name: 'escapes',
      category: 'other',
      description: 'Start work after returning',
      parameters: { child: { type: 'any', evaluation: 'lazy' } },
      evaluate: ({ child }) => {
        late = new Promise((resolve) => setTimeout(resolve, 5)).then(() =>
          (child as LazyValue).evaluate()
        )
        return 'returned'
      },
    })
    const fig = new FigTree({ operators: [coreOperators, escapes] })
    const built = await countingControllers(async () => {
      expect(await fig.evaluate({ $escapes: { child: { $plus: [1, 2] } } })).toBe('returned')
    })
    expect(built).toBe(0)
    // A scope abort is silent cancellation, not an error anyone reports
    await expect(late).rejects.toThrow(/cancelled/)
  })
})

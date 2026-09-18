/**
 * Chunk 6.1 — the `perElement` delivery ("Evaluation modes" and "The
 * runtime interface" in docs-dev/v3-specs/v3-operator-contract.md; ledger
 * #12). The five real iterators are tested against their semantics in
 * test/operators-iterators.test.ts; this file tests the DELIVERY, through
 * minimal operators whose bodies do one thing each.
 *
 * The claims are about work: that each index runs once and only once, that
 * each runs in its own scope, that they all start together, and that the
 * ones nobody needs stop. So the assertions are counts and call logs.
 */
import { coreOperators, defineOperator, FigTree } from '../src'
import type { PerElement, Settlement, ValidatedOperatorDefinition } from '../src'
import { latencyOp } from './fixtures/evalOperators'

const figWith = (operators: ValidatedOperatorDefinition[]) =>
  new FigTree({ operators: [coreOperators, ...operators] })

/** The iterator shape, with a body the test supplies. */
const iterator = (
  name: string,
  body: (each: PerElement, input: unknown[]) => Promise<unknown>,
  truthiness = false
) =>
  defineOperator({
    name,
    description: 'Test iterator',
    parameters: {
      input: { type: 'array' },
      each: { type: 'any', evaluation: 'perElement', over: 'input', truthiness },
      as: { type: 'string', required: false, evaluation: 'structural' },
    },
    positionalParams: ['input', 'each'],
    evaluate: ({ input, each }) => body(each as PerElement, input as unknown[]),
  })

/** Demands every index, in order, and answers with the results. */
const mapish = (name = 'mapish') =>
  iterator(name, (each, input) => Promise.all(input.map((_, i) => each.evaluate(i))))

/** Counts how many times its own body ran, per value seen. */
const counter = () => {
  const calls: unknown[] = []
  const definition = defineOperator({
    name: 'count',
    description: 'Record that it ran, then answer',
    parameters: { value: { type: 'any', nullPolicy: 'value' } },
    positionalParams: ['value'],
    evaluate: ({ value }) => {
      calls.push(value)
      return value
    },
  })
  return { calls, definition }
}

// ── per-index evaluation and memoization ────────────────────────────

test('each index evaluates once, with its own element bound', async () => {
  const spy = counter()
  const fig = figWith([mapish(), spy.definition])
  const result = await fig.evaluate(
    { $mapish: ['$data.xs', { $count: '$element' }] },
    {
      data: { xs: ['a', 'b', 'c'] },
    }
  )
  expect(result).toEqual(['a', 'b', 'c'])
  expect(spy.calls).toEqual(['a', 'b', 'c'])
})

test('a repeated demand for one index is memoized, not re-run', async () => {
  const spy = counter()
  const twice = iterator('twice', async (each) => {
    const first = await each.evaluate(0)
    const second = await each.evaluate(0)
    return [first, second]
  })
  const fig = figWith([twice, spy.definition])
  expect(await fig.evaluate({ $twice: [['x'], { $count: '$element' }] })).toEqual(['x', 'x'])
  expect(spy.calls).toEqual(['x']) // one run, two demands
})

test('an index nobody demands never evaluates', async () => {
  const spy = counter()
  const first = iterator('firstOnly', (each) => each.evaluate(0))
  const fig = figWith([first, spy.definition])
  expect(await fig.evaluate({ $firstOnly: [['a', 'b', 'c'], { $count: '$element' }] })).toBe('a')
  expect(spy.calls).toEqual(['a'])
})

test('$index is the zero-based position', async () => {
  const fig = figWith([mapish()])
  expect(await fig.evaluate({ $mapish: [['a', 'b', 'c'], '$index'] })).toEqual([0, 1, 2])
})

// ── a fresh scope per index ─────────────────────────────────────────

test('a vars block inside `each` memoizes per element, not once per iteration', async () => {
  // The scope instance is per index, so the var is a different var each
  // time round — three runs, not one (ledger #12 over #1)
  const spy = counter()
  const fig = figWith([mapish(), spy.definition])
  const real = await fig.evaluate({
    $mapish: [
      ['a', 'b', 'c'],
      {
        operator: 'if',
        vars: { seen: { $count: '$element' } },
        condition: true,
        then: '$vars.seen',
      },
    ],
  })
  expect(real).toEqual(['a', 'b', 'c'])
  expect(spy.calls).toEqual(['a', 'b', 'c'])
})

test('two references to one per-element var still share a single evaluation', async () => {
  const spy = counter()
  const fig = figWith([mapish(), spy.definition])
  const result = await fig.evaluate({
    $mapish: [
      ['a', 'b'],
      {
        operator: 'if',
        vars: { seen: { $count: '$element' } },
        condition: { $equal: ['$vars.seen', '$vars.seen'] },
        then: '$vars.seen',
      },
    ],
  })
  expect(result).toEqual(['a', 'b'])
  expect(spy.calls).toEqual(['a', 'b']) // once per element, not twice
})

// ── concurrency, settlement streams and cancellation ────────────────

test('settle() starts every index at once and yields in completion order', async () => {
  const order = iterator('order', async (each) => {
    const seen: number[] = []
    for await (const s of each.settle()) seen.push(s.index)
    return seen
  })
  const slow = latencyOp('slow')
  const fig = figWith([order, slow.definition])
  // element 0 is the slowest, so completion order reverses index order
  const result = await fig.evaluate({
    $order: [[30, 15, 0], { $slow: ['$element', '$element'] }],
  })
  expect(result).toEqual([2, 1, 0])
  expect(slow.started).toEqual([30, 15, 0]) // all three began together
})

test('settle() parks a failure rather than throwing it', async () => {
  const parked = iterator('parked', async (each) => {
    const out: Settlement[] = []
    for await (const s of each.settle()) out.push(s)
    return out.sort((a, b) => a.index - b.index).map((s) => (s.ok ? s.value : 'FAILED'))
  })
  const slow = latencyOp('slow')
  const fig = figWith([parked, slow.definition])
  expect(
    await fig.evaluate({
      $parked: [[false, true, false], { $slow: ['ok', 0, '$element'] }],
    })
  ).toEqual(['ok', 'FAILED', 'ok'])
})

test('settle() and evaluate() share one per-index memo', async () => {
  const spy = counter()
  const both = iterator('both', async (each) => {
    const direct = await each.evaluate(0)
    for await (const settled of each.settle()) void settled.index
    return direct
  })
  const fig = figWith([both, spy.definition])
  expect(await fig.evaluate({ $both: [['a', 'b'], { $count: '$element' }] })).toBe('a')
  expect(spy.calls).toEqual(['a', 'b']) // 'a' ran once despite two demands
})

test('a second settle() is iterable too — streams are built fresh', async () => {
  const twice = iterator('twiceStream', async (each) => {
    const drain = async () => {
      let n = 0
      for await (const settled of each.settle()) n += settled.ok ? 1 : 1
      return n
    }
    return [await drain(), await drain()]
  })
  expect(await figWith([twice]).evaluate({ $twiceStream: [['a', 'b'], '$element'] })).toEqual([
    2, 2,
  ])
})

test('resolving early cancels the indexes still in flight', async () => {
  const first = iterator('firstOf2', async (each) => {
    for await (const s of each.settle()) if (s.ok) return s.value
    return null
  })
  const slow = latencyOp('slow')
  const fig = figWith([first, slow.definition])
  const result = await fig.evaluate({ $firstOf2: [[0, 50], { $slow: ['$element', '$element'] }] })
  expect(result).toBe(0)
  await new Promise((resolve) => setTimeout(resolve, 15))
  expect(slow.aborted).toEqual([50])
})

// ── the layers, per index ───────────────────────────────────────────

test('truthiness is applied per element, at the moment of demand', async () => {
  const fig = figWith([mapish('judge')])
  const judge = iterator(
    'judged',
    (each, input) => Promise.all(input.map((_, i) => each.evaluate(i))),
    true
  )
  const withTruthiness = figWith([judge])
  expect(await withTruthiness.evaluate({ $judged: [[1, 2, 3], '$element'] })).toEqual([
    true,
    true,
    true,
  ])
  expect(await withTruthiness.evaluate({ $judged: [[0, '', null], '$element'] })).toEqual([
    false,
    false,
    false,
  ])
  expect(await fig.evaluate({ $judge: [[0, ''], '$element'] })).toEqual([0, ''])
})

test('a per-element type miss fails when that index is demanded', async () => {
  const typed = defineOperator({
    name: 'typed',
    description: 'perElement with a declared element type',
    parameters: {
      input: { type: 'array' },
      each: { type: 'number', evaluation: 'perElement', over: 'input' },
    },
    positionalParams: ['input', 'each'],
    evaluate: ({ each }) => (each as PerElement).evaluate(0),
  })
  const fig = figWith([typed])
  expect(await fig.evaluate({ $typed: [[1], '$element'] })).toBe(1)
  await expect(fig.evaluate({ $typed: [['nope'], '$element'] })).rejects.toMatchObject({
    code: 'type-check',
  })
})

test('an empty input demands nothing and drains immediately', async () => {
  const spy = counter()
  const drained = iterator('drained', async (each) => {
    let n = 0
    for await (const settled of each.settle()) n += settled.ok ? 1 : 1
    return n
  })
  const fig = figWith([drained, spy.definition])
  expect(await fig.evaluate({ $drained: [[], { $count: '$element' }] })).toBe(0)
  expect(spy.calls).toEqual([])
})

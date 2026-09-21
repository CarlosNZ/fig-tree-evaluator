/**
 * Chunk 5.2 — the lazy delivery modes at the engine level ("Evaluation
 * modes" and "The runtime interface" in
 * docs-dev/v3-specs/v3-operator-contract.md).
 *
 * The operators' own semantics live in test/operators-logic.test.ts; this
 * suite is about what the ENGINE hands a body and when: handles rather than
 * values, the layers moving to the moment of demand, and the degeneration
 * rule making a dynamically-supplied container indistinguishable to the
 * body from an authored one.
 */
import { coreOperators, defineOperator, FigTree, FigTreeError } from '../src'
import type { LazyValue, ValidatedOperatorDefinition } from '../src'
import { rejection } from './helpers/rejection'
import { spyOp } from './fixtures/evalOperators'

/** `operators` REPLACES the core set, so carry it along. */
const figWith = (operators: ValidatedOperatorDefinition[]) =>
  new FigTree({ operators: [coreOperators, ...operators] })

/** Counts its own evaluations — the instrument for "never ran". */
const counter = () => {
  const calls: unknown[] = []
  const definition = defineOperator({
    name: 'count',
    category: 'other',
    description: 'Record an evaluation',
    parameters: { value: { type: 'any', nullPolicy: 'value', required: false } },
    positionalParams: ['value'],
    evaluate: ({ value }) => {
      calls.push(value)
      return value ?? 'ran'
    },
  })
  return { calls, definition }
}

/** An operator that demands the named handles, in order. */
const demander = (name: string, demands: string[], parameters: Record<string, unknown>) =>
  defineOperator({
    name,
    category: 'other',
    description: `demand ${demands.join(',')}`,
    parameters: parameters as never,
    positionalParams: Object.keys(parameters),
    evaluate: async (params) => {
      const out: unknown[] = []
      for (const key of demands)
        out.push(await (params as Record<string, LazyValue>)[key].evaluate())
      return out
    },
  })

// ── lazy: one handle ────────────────────────────────────────────────

describe('a lazy parameter', () => {
  test('is not evaluated unless the body demands it', async () => {
    const { calls, definition } = counter()
    const never = defineOperator({
      name: 'never',
      category: 'other',
      description: 'Take a handle and ignore it',
      parameters: { branch: { type: 'any', evaluation: 'lazy' } },
      positionalParams: ['branch'],
      evaluate: () => 'ignored',
    })
    expect(await figWith([never, definition]).evaluate({ $never: { $count: 1 } })).toBe('ignored')
    expect(calls).toHaveLength(0)
  })

  test('evaluates at most once however often it is demanded', async () => {
    const { calls, definition } = counter()
    const twice = demander('twice', ['branch', 'branch'], {
      branch: { type: 'any', evaluation: 'lazy' },
    })
    expect(await figWith([twice, definition]).evaluate({ $twice: { $count: 'x' } })).toEqual([
      'x',
      'x',
    ])
    expect(calls).toEqual(['x'])
  })

  test('memoizes its rejection — a second demand does not retry', async () => {
    let attempts = 0
    const flaky = defineOperator({
      name: 'flaky',
      category: 'other',
      description: 'Fail, counting attempts',
      parameters: {},
      evaluate: () => {
        attempts += 1
        throw new Error('nope')
      },
    })
    const retry = defineOperator({
      name: 'retry',
      category: 'other',
      description: 'Demand twice, swallowing the first failure',
      parameters: { branch: { type: 'any', evaluation: 'lazy' } },
      positionalParams: ['branch'],
      evaluate: async ({ branch }) => {
        try {
          await branch.evaluate()
        } catch {
          /* first demand */
        }
        try {
          await branch.evaluate()
        } catch {
          /* second demand */
        }
        return attempts
      },
    })
    expect(await figWith([retry, flaky]).evaluate({ $retry: { $flaky: {} } })).toBe(1)
  })
})

describe('the default chain reaches a lazy parameter', () => {
  const declare = (extra: Record<string, unknown>) => ({
    branch: { type: 'any', evaluation: 'lazy', required: false, ...extra },
  })

  test('a declared default arrives as a pre-resolved handle', async () => {
    const spy = spyOp('withDefault', declare({ default: 'fallen back' }) as never)
    await figWith([spy.definition]).evaluate({ $withDefault: {} })
    const branch = spy.calls[0].branch as LazyValue
    expect(await branch.evaluate()).toBe('fallen back')
  })

  test('no default at all leaves the key absent, not null', async () => {
    // The distinction `match.default` depends on: an unset default must be
    // distinguishable from one explicitly set to null
    const spy = spyOp('noDefault', declare({}) as never)
    await figWith([spy.definition]).evaluate({ $noDefault: {} })
    expect('branch' in spy.calls[0]).toBe(false)
  })

  test('an operatorDefaults value supplies it', async () => {
    const spy = spyOp('fromDefaults', declare({}) as never)
    const fig = new FigTree({
      operators: [spy.definition],
      operatorDefaults: { fromDefaults: { branch: 'from the instance' } },
    })
    await fig.evaluate({ $fromDefaults: {} })
    expect(await (spy.calls[0].branch as LazyValue).evaluate()).toBe('from the instance')
  })
})

describe('the layers move to the moment of demand', () => {
  const typed = () =>
    demander('typed', ['branch'], { branch: { type: 'string', evaluation: 'lazy' } })

  test('a wrong-typed value fails when demanded', async () => {
    const error = await rejection<FigTreeError>(
      figWith([typed()]).evaluate({ $typed: { $plus: [1, 2] } })
    )
    expect(error.code).toBe('type-check')
  })

  test('and does not fail at all if it is never demanded', async () => {
    const ignoring = defineOperator({
      name: 'ignoring',
      category: 'other',
      description: 'Never demand the handle',
      parameters: { branch: { type: 'string', evaluation: 'lazy' } },
      positionalParams: ['branch'],
      evaluate: () => 'fine' as const,
    })
    expect(await figWith([ignoring]).evaluate({ $ignoring: { $plus: [1, 2] } })).toBe('fine')
  })

  test('truthiness is applied to the demanded value', async () => {
    const judge = () =>
      demander('judge', ['branch'], {
        branch: { type: 'any', evaluation: 'lazy', truthiness: true },
      })
    expect(await figWith([judge()]).evaluate({ $judge: '' })).toEqual([false])
    expect(await figWith([judge()]).evaluate({ $judge: 'x' })).toEqual([true])
  })
})

// ── lazyElements and lazyEntries ────────────────────────────────────

describe('lazyElements', () => {
  const firstTwo = () =>
    defineOperator({
      name: 'firstTwo',
      category: 'other',
      description: 'Demand elements 0 and 1 only',
      parameters: { values: { type: 'array', evaluation: 'lazyElements' } },
      positionalParams: ['...values'],
      evaluate: async ({ values }) => [
        await values[0].evaluate(),
        await values[1].evaluate(),
        values.length,
      ],
    })

  test('delivers one handle per element, and undemanded ones never run', async () => {
    const { calls, definition } = counter()
    expect(
      await figWith([firstTwo(), definition]).evaluate({
        $firstTwo: [{ $count: 'a' }, { $count: 'b' }, { $count: 'c' }],
      })
    ).toEqual(['a', 'b', 3])
    expect(calls).toEqual(['a', 'b'])
  })

  test('a partly-constant element is still one element', async () => {
    expect(
      await figWith([firstTwo()]).evaluate({ $firstTwo: ['a', { n: '$data.x' }, 'c'] }, { data: { x: 9 } })
    ).toEqual(['a', { n: 9 }, 3])
  })

  test('degeneration: a dynamic array delivers pre-resolved handles', async () => {
    expect(
      await figWith([firstTwo()]).evaluate({ $firstTwo: '$data.list' }, { data: { list: [1, 2, 3] } })
    ).toEqual([1, 2, 3])
  })

  test('an unsupplied parameter with a default delivers handles over the default', async () => {
    const defaulted = defineOperator({
      name: 'firstTwoOr',
      category: 'other',
      description: 'firstTwo, with a fallback list',
      parameters: {
        values: { type: 'array', evaluation: 'lazyElements', default: [7, 8, 9] },
      },
      evaluate: async ({ values }) => [
        await values[0].evaluate(),
        await values[1].evaluate(),
        values.length,
      ],
    })
    expect(await figWith([defaulted]).evaluate({ $firstTwoOr: {} })).toEqual([7, 8, 3])
  })

  test('degeneration still applies the whole-value layers first', async () => {
    const error = await rejection<FigTreeError>(
      figWith([firstTwo()]).evaluate({ $firstTwo: '$data.nope' })
    )
    expect(error.code).toBe('type-check')
  })
})

describe('lazyEntries', () => {
  const pick = () =>
    defineOperator({
      name: 'pick',
      category: 'other',
      description: 'Demand one named entry',
      parameters: {
        key: { type: 'string' },
        entries: { type: 'object', evaluation: 'lazyEntries' },
      },
      positionalParams: ['key', 'entries'],
      evaluate: ({ key, entries }) =>
        Object.hasOwn(entries, key) ? entries[key].evaluate() : 'no such entry',
    })

  test('delivers one handle per entry, and the rest never run', async () => {
    const { calls, definition } = counter()
    expect(
      await figWith([pick(), definition]).evaluate({
        $pick: ['b', { a: { $count: 'a' }, b: { $count: 'b' } }],
      })
    ).toBe('b')
    expect(calls).toEqual(['b'])
  })

  test('a vars block on the map scopes its entries', async () => {
    expect(
      await figWith([pick()]).evaluate({
        $pick: ['greeting', { vars: { who: 'world' }, greeting: '$vars.who' }],
      })
    ).toBe('world')
  })

  test('degeneration: a dynamic map delivers pre-resolved handles', async () => {
    expect(
      await figWith([pick()]).evaluate({ $pick: ['b', '$data.map'] }, { data: { map: { a: 1, b: 2 } } })
    ).toBe(2)
  })

  test('degeneration still applies the whole-value layers first', async () => {
    const error = await rejection<FigTreeError>(
      figWith([pick()]).evaluate({ $pick: ['b', '$data.nope'] })
    )
    expect(error.code).toBe('type-check')
  })
})

test('a body that returns a handle instead of demanding it fails loudly', async () => {
  const leaky = defineOperator({
    name: 'leaky',
    category: 'other',
    description: 'Hand the handle back',
    parameters: { branch: { type: 'any', evaluation: 'lazy' } },
    positionalParams: ['branch'],
    evaluate: ({ branch }) => branch as never,
  })
  const error = await rejection<FigTreeError>(figWith([leaky]).evaluate({ $leaky: 1 }))
  expect(error.code).toBe('escaped-handle')
})

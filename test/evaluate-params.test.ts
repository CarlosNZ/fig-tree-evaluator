/**
 * Chunk 4.1 — the engine layers every operator body relies on ("Engine
 * guarantees" in docs-dev/v3-specs/v3-operator-contract.md; "Null policy"
 * in docs-dev/v3-specs/v3-api.md). Observed through spy bodies: what
 * reached the body, whether it ran at all, and what the node produced.
 */
import { FigTree, FigTreeError, EvaluationData } from '../src'
import type { FigTreeOptions, PerElement } from '../src'
import { boomOp, echoOp, spyOp, type Spy } from './fixtures/evalOperators'

const rejection = async (promise: Promise<unknown>): Promise<FigTreeError> => {
  try {
    await promise
  } catch (error) {
    return error as FigTreeError
  }
  throw new Error('expected a rejection')
}

const figWith = (spies: Spy[], options: FigTreeOptions = {}) =>
  new FigTree({ ...options, operators: [echoOp(), boomOp(), ...spies.map((s) => s.definition)] })

describe('whole-value null policy', () => {
  test('propagate: the node resolves null and the body never runs', async () => {
    const spy = spyOp('prop', { p: { type: ['number', 'null'] } })
    const fig = figWith([spy])
    expect(await fig.evaluate({ $prop: { p: null } })).toBe(null)
    expect(spy.calls).toHaveLength(0)
    expect(await fig.evaluate({ $prop: { p: 1 } })).toBe('ok')
  })

  test('value: null is delivered to the body', async () => {
    const spy = spyOp('val', { p: { type: ['number', 'null'], nullPolicy: 'value' } })
    await figWith([spy]).evaluate({ $val: { p: null } })
    expect(spy.calls).toEqual([{ p: null }])
  })

  test('reject (type excludes null): a runtime type error tagged with the node', async () => {
    const spy = spyOp('rej', { p: { type: 'number' } })
    const error = await rejection(
      figWith([spy]).evaluate({ box: { $rej: { p: '$data.missing' } } })
    )
    expect(error.code).toBe('type-check')
    expect(error.path).toEqual(['box'])
    expect(error.operator).toBe('rej')
    expect(error.message).toContain("'p'")
    expect(spy.calls).toHaveLength(0)
  })

  test('failure beats propagation: a failing sibling operand wins over a null one', async () => {
    const spy = spyOp('two', { a: { type: ['number', 'null'] }, b: { type: ['number', 'null'] } })
    const error = await rejection(figWith([spy]).evaluate({ $two: { a: null, b: { $boom: 1 } } }))
    expect(error.code).toBe('operator-failure')
    expect(error.operator).toBe('boom')
  })
})

describe('unset detection and the layered default chain', () => {
  const declaration = { p: { type: 'number' as const, default: 7 } }

  test('omitted → the metadata default', async () => {
    const spy = spyOp('dflt', declaration)
    await figWith([spy]).evaluate({ $dflt: {} })
    expect(spy.calls).toEqual([{ p: 7 }])
  })

  test('null at an optional parameter whose type excludes null means unset', async () => {
    const spy = spyOp('dflt', declaration)
    await figWith([spy]).evaluate({ $dflt: { p: '$data.missing' } })
    expect(spy.calls).toEqual([{ p: 7 }])
  })

  test('operatorDefaults sits between the node and the metadata default', async () => {
    const spy = spyOp('dflt', declaration)
    const fig = figWith([spy], { operatorDefaults: { dflt: { p: 9 } } })
    await fig.evaluate({ $dflt: {} })
    await fig.evaluate({ $dflt: { p: 3 } })
    expect(spy.calls).toEqual([{ p: 9 }, { p: 3 }])
  })

  test('optional without a default: unset is an ABSENT key, not null', async () => {
    const spy = spyOp('opt', { p: { type: 'number', required: false } })
    const fig = figWith([spy])
    await fig.evaluate({ $opt: {} })
    await fig.evaluate({ $opt: { p: null } })
    expect('p' in spy.calls[0]).toBe(false)
    expect('p' in spy.calls[1]).toBe(false)
  })

  test('an optional parameter whose type names null receives an explicit null as a value', async () => {
    const spy = spyOp('optnull', {
      p: { type: ['number', 'null'], required: false, nullPolicy: 'value' },
    })
    const fig = figWith([spy])
    await fig.evaluate({ $optnull: { p: null } })
    await fig.evaluate({ $optnull: {} })
    expect(spy.calls[0]).toEqual({ p: null })
    expect('p' in spy.calls[1]).toBe(false)
  })

  test('the EvaluationData sentinel delivers the evaluation data: the call’s object, by reference', async () => {
    const spy = spyOp('ctx', { from: { type: ['object', 'array'], default: EvaluationData } })
    const instanceData = { org: 'Acme' }
    const fig = figWith([spy], { data: instanceData })
    const callData = { user: 'Ada' }
    await fig.evaluate({ $ctx: {} }, { data: callData })
    // Per-call data replaces rather than merging, and nothing is copied
    expect(spy.calls[0].from).toBe(callData)
    await fig.evaluate({ $ctx: {} })
    expect(spy.calls[1].from).toBe(instanceData)
  })
})

describe('the conditional null policy (ledger #14)', () => {
  const make = () =>
    spyOp(
      'conv',
      {
        value: { type: 'any', nullPolicy: (to: string) => (to === 'b' ? 'value' : 'propagate') },
        to: { type: { literal: ['a', 'b'] } },
      },
      { positionalParams: ['value', 'to'] }
    )

  test('the compiled table is consulted through the resolved selector', async () => {
    const spy = make()
    const fig = figWith([spy])
    expect(await fig.evaluate({ $conv: [null, 'a'] })).toBe(null)
    expect(spy.calls).toHaveLength(0)
    expect(await fig.evaluate({ $conv: [null, 'b'] })).toBe('ok')
    expect(spy.calls).toEqual([{ value: null, to: 'b' }])
  })

  test('a dynamic selector works the same way', async () => {
    const spy = make()
    const fig = figWith([spy])
    expect(await fig.evaluate({ $conv: [null, '$data.to'] }, { data: { to: 'a' } })).toBe(null)
    expect(await fig.evaluate({ $conv: [null, '$data.to'] }, { data: { to: 'b' } })).toBe('ok')
  })

  test('a selector outside the union is a type error before any policy lookup', async () => {
    const spy = make()
    const error = await rejection(
      figWith([spy]).evaluate({ $conv: [null, '$data.to'] }, { data: { to: 'zzz' } })
    )
    expect(error.code).toBe('type-check')
    expect(error.message).toContain("'to'")
  })

  test('an unsupplied selector is read through the same default chain as any parameter', async () => {
    const defaulted = () =>
      spyOp(
        'conv',
        {
          value: { type: 'any', nullPolicy: (to: string) => (to === 'b' ? 'value' : 'propagate') },
          to: { type: { literal: ['a', 'b'] }, default: 'b' },
        },
        { positionalParams: ['value', 'to'] }
      )
    const spy = defaulted()
    expect(await figWith([spy]).evaluate({ $conv: [null] })).toBe('ok')
    expect(spy.calls).toEqual([{ value: null, to: 'b' }])
    // operatorDefaults outranks the metadata default here too
    const overridden = defaulted()
    const fig = figWith([overridden], { operatorDefaults: { conv: { to: 'a' } } })
    expect(await fig.evaluate({ $conv: [null] })).toBe(null)
    expect(overridden.calls).toHaveLength(0)
  })
})

describe('replacesNullAt — the engine-side null replacement (ledger #18)', () => {
  test('whole-value replacement, before the policy and the type check', async () => {
    const spy = spyOp('repl', {
      target: { type: ['number', 'null'] },
      nullValueDefault: {
        type: 'number',
        required: false,
        evaluation: 'lazy',
        replacesNullAt: ['target'],
      },
    })
    const fig = figWith([spy])
    await fig.evaluate({ $repl: { target: null, nullValueDefault: 5 } })
    expect(spy.calls).toEqual([{ target: 5 }])
    expect(await fig.evaluate({ $repl: { target: null } })).toBe(null)
  })

  test('per-element replacement where the target declares an element policy; the holder evaluates once', async () => {
    const counter = spyOp('seven', {}, { result: 7 })
    const spy = spyOp('agg', {
      values: { type: 'array', elementNullPolicy: 'propagate' },
      nullValueDefault: {
        type: 'number',
        required: false,
        evaluation: 'lazy',
        replacesNullAt: ['values'],
      },
    })
    const fig = figWith([spy, counter])
    await fig.evaluate({ $agg: { values: [1, null, null], nullValueDefault: { $seven: {} } } })
    expect(spy.calls).toEqual([{ values: [1, 7, 7] }])
    expect(counter.calls).toHaveLength(1)
  })

  test('the holder never evaluates when nothing is null', async () => {
    const counter = spyOp('seven', {}, { result: 7 })
    const spy = spyOp('agg', {
      values: { type: 'array', elementNullPolicy: 'propagate' },
      nullValueDefault: {
        type: 'number',
        required: false,
        evaluation: 'lazy',
        replacesNullAt: ['values'],
      },
    })
    await figWith([spy, counter]).evaluate({
      $agg: { values: [1, 2], nullValueDefault: { $seven: {} } },
    })
    expect(counter.calls).toHaveLength(0)
    expect(spy.calls).toEqual([{ values: [1, 2] }])
  })
})

describe('element-wise null policy (ledger #8)', () => {
  test('propagate per element resolves the node null', async () => {
    const spy = spyOp('elp', { values: { type: 'array', elementNullPolicy: 'propagate' } })
    const fig = figWith([spy])
    expect(await fig.evaluate({ $elp: { values: [1, null] } })).toBe(null)
    expect(spy.calls).toHaveLength(0)
  })

  test('value per element delivers the nulls', async () => {
    const spy = spyOp('elv', { values: { type: 'array', elementNullPolicy: 'value' } })
    await figWith([spy]).evaluate({ $elv: { values: [1, null] } })
    expect(spy.calls).toEqual([{ values: [1, null] }])
  })

  test('per value on object-valued parameters', async () => {
    const spy = spyOp('elo', { map: { type: 'object', elementNullPolicy: 'propagate' } })
    expect(await figWith([spy]).evaluate({ $elo: { map: { a: 1, b: null } } })).toBe(null)
  })

  test('a whole-null container is the type error, not an element case', async () => {
    const spy = spyOp('elp', { values: { type: 'array', elementNullPolicy: 'propagate' } })
    const error = await rejection(figWith([spy]).evaluate({ $elp: { values: '$data.missing' } }))
    expect(error.code).toBe('type-check')
  })
})

describe('the runtime type check', () => {
  test('basic types, literal unions and constraints', async () => {
    const spy = spyOp('typed', {
      s: { type: 'string', required: false },
      mode: { type: { literal: ['x', 'y'] }, required: false },
      pair: {
        type: 'array',
        required: false,
        constraints: { length: 2, homogeneous: ['number', 'string'] },
      },
    })
    const fig = figWith([spy])
    const data = { n: 5, m: 'z', p: [1, 'a'], q: [1, 2, 3] }
    expect((await rejection(fig.evaluate({ $typed: { s: '$data.n' } }, { data }))).code).toBe(
      'type-check'
    )
    expect((await rejection(fig.evaluate({ $typed: { mode: '$data.m' } }, { data }))).code).toBe(
      'type-check'
    )
    expect((await rejection(fig.evaluate({ $typed: { pair: '$data.p' } }, { data }))).code).toBe(
      'type-check'
    )
    expect((await rejection(fig.evaluate({ $typed: { pair: '$data.q' } }, { data }))).code).toBe(
      'type-check'
    )
    expect(await fig.evaluate({ $typed: { s: 'ok', mode: 'x', pair: [1, 2] } })).toBe('ok')
  })

  test('constraints skip null elements under a declared element policy', async () => {
    const spy = spyOp('pair', {
      values: {
        type: 'array',
        elementNullPolicy: 'value',
        constraints: { length: 2, homogeneous: ['number'] },
      },
    })
    await figWith([spy]).evaluate({ $pair: { values: [1, '$data.missing'] } })
    expect(spy.calls).toEqual([{ values: [1, null] }])
  })

  test('runtimeTypeCheck: false removes the type layer only', async () => {
    const spy = spyOp('loose', {
      s: { type: 'string' },
      flag: { type: 'any', truthiness: true, required: false },
      p: { type: ['number', 'null'], required: false },
    })
    // Instance configuration, not a per-call option
    const fig = figWith([spy], { runtimeTypeCheck: false })
    // literal mismatches are static errors; these arrive dynamically
    const data = { n: 5 }
    await fig.evaluate({ $loose: { s: '$data.n', flag: 0 } }, { data })
    expect(spy.calls[0]).toEqual({ s: 5, flag: false })
    // null policy is semantics: propagate still propagates
    expect(await fig.evaluate({ $loose: { s: 'x', p: null } })).toBe(null)
    // the derived reject is part of the type layer, so a null is delivered
    await fig.evaluate({ $loose: { s: '$data.missing' } })
    expect(spy.calls[1]).toEqual({ s: null })
  })
})

describe('truthiness delivery (ledger #4)', () => {
  test('a truthiness position receives a boolean', async () => {
    const spy = spyOp('cond', { c: { type: 'any', truthiness: true } })
    const fig = figWith([spy])
    for (const input of [0, '', null, false]) await fig.evaluate({ $cond: { c: input } })
    for (const input of [1, 'x', [], {}, true]) await fig.evaluate({ $cond: { c: input } })
    expect(spy.calls.map((call) => call.c)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
    ])
  })

  test('an array-typed truthiness position receives booleans per element', async () => {
    const spy = spyOp('all', { values: { type: 'array', truthiness: true } })
    await figWith([spy]).evaluate({ $all: { values: [1, 0, 'x', '', null, []] } })
    expect(spy.calls).toEqual([{ values: [true, false, true, false, false, true] }])
  })
})

describe('delivery modes', () => {
  test('structural parameters arrive as their literal value', async () => {
    const spy = spyOp('struct', {
      input: { type: 'array' },
      as: { type: 'string', required: false, evaluation: 'structural' },
    })
    await figWith([spy]).evaluate({ $struct: { input: [1], as: 'row' } })
    expect(spy.calls).toEqual([{ input: [1], as: 'row' }])
  })

  test('a plain lazy parameter arrives as a handle, not a value', async () => {
    const spy = spyOp('lazyish', { branch: { type: 'any', evaluation: 'lazy' } })
    await figWith([spy]).evaluate({ $lazyish: { branch: 1 } })
    const branch = spy.calls[0].branch as { evaluate: () => Promise<unknown> }
    expect(typeof branch.evaluate).toBe('function')
  })

  test('a handle demanded after its body returned is refused, not honoured', async () => {
    // The node's abort scope closes when the body settles, so a handle kept
    // past that point evaluates nothing — the runtime half of the rule the
    // escaped-handle guard enforces at the boundary
    const spy = spyOp('lazyish', { branch: { type: 'any', evaluation: 'lazy' } })
    await figWith([spy]).evaluate({ $lazyish: { branch: 1 } })
    const branch = spy.calls[0].branch as { evaluate: () => Promise<unknown> }
    await expect(branch.evaluate()).rejects.toThrow(/cancelled/)
  })

  test('perElement delivers a handle over the vetted `over` sibling', async () => {
    // Every delivery mode now ships, so there is no unbuilt mode left to
    // assert a loud failure for — the switch in src/evaluate/params.ts is
    // exhaustive by `satisfies never`, which makes an eighth mode a BUILD
    // error rather than something a test could reach
    const spy = spyOp('iterish', {
      input: { type: 'array' },
      each: { type: 'any', evaluation: 'perElement', over: 'input' },
    })
    await figWith([spy]).evaluate({ $iterish: { input: ['a', 'b'], each: 1 } })
    const each = spy.calls[0].each as PerElement
    expect(typeof each.evaluate).toBe('function')
    expect(typeof each.settle).toBe('function')
    // Demanded after the body returned, so the node's abort scope has
    // closed — the same rule as the lazy handle above
    await expect(each.evaluate(1)).rejects.toThrow(/cancelled/)
  })
})

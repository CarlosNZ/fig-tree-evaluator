/**
 * Chunk 4.2 — body-parameter type inference ("TypeScript ergonomics" in
 * docs-dev/v3-specs/v3-operator-contract.md; src/inference.ts). These are
 * compile-time assertions: ts-jest type-checks this file, so a wrong
 * inferred type fails the suite. The one runtime assertion just keeps jest
 * happy.
 */
import { defineOperator, EvaluationData } from '../src'
import type { LazyValue, PerElement, ResolvedParams, SettlementStream } from '../src'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const assertType = <T extends true>(): T | undefined => undefined

const op = defineOperator({
  name: 'inferred',
  description: 'types derived from declarations',
  parameters: {
    value: { type: ['number', 'null'] },
    kept: { type: ['number', 'null'], nullPolicy: 'value' },
    min: { type: 'number', default: 0 },
    opt: { type: 'string', required: false },
    flag: { type: 'any', truthiness: true },
    all: { type: 'array', truthiness: true },
    mode: { type: { literal: ['a', 'b'] } },
    count: { type: 'integer' },
    anything: { type: 'any' },
    untyped: {},
    shape: { type: 'object' },
    list: { type: 'array' },
    branch: { type: 'any', evaluation: 'lazy' },
    each: { type: 'string', evaluation: 'perElement', over: 'list' },
    candidates: { type: 'array', evaluation: 'lazyElements' },
    branches: { type: 'object', evaluation: 'lazyEntries' },
    racers: { type: 'array', evaluation: 'race' },
    as: { type: 'string', required: false, evaluation: 'structural' },
    from: { type: ['object', 'array'], default: EvaluationData },
    nullValueDefault: {
      type: 'number',
      required: false,
      evaluation: 'lazy',
      replacesNullAt: ['value'],
    },
    conditional: { type: 'any', nullPolicy: (mode) => (mode === 'a' ? 'value' : 'propagate') },
  },
  evaluate: (params) => {
    assertType<Equal<typeof params.value, number>>()
    assertType<Equal<typeof params.kept, number | null>>()
    assertType<Equal<typeof params.min, number>>()
    assertType<Equal<typeof params.opt, string | undefined>>()
    assertType<Equal<typeof params.flag, boolean>>()
    assertType<Equal<typeof params.all, boolean[]>>()
    assertType<Equal<typeof params.mode, 'a' | 'b'>>()
    assertType<Equal<typeof params.count, number>>()
    assertType<Equal<typeof params.anything, unknown>>()
    assertType<Equal<typeof params.untyped, unknown>>()
    assertType<Equal<typeof params.shape, Record<string, unknown>>>()
    assertType<Equal<typeof params.list, unknown[]>>()
    assertType<Equal<typeof params.branch, LazyValue<unknown>>>()
    assertType<Equal<typeof params.each, PerElement<string>>>()
    // The container modes deliver `LazyValue<unknown>`: the declared type
    // describes the CONTAINER, and there is no element-type declaration to
    // do better with (the Phase-5 ruling)
    assertType<Equal<typeof params.candidates, LazyValue<unknown>[]>>()
    assertType<Equal<typeof params.branches, Record<string, LazyValue<unknown>>>>()
    assertType<Equal<typeof params.racers, SettlementStream>>()
    assertType<Equal<typeof params.as, string | undefined>>()
    assertType<Equal<typeof params.from, Record<string, unknown> | unknown[]>>()
    assertType<Equal<typeof params.conditional, unknown>>()
    // @ts-expect-error — a replacesNullAt holder never reaches the body
    params.nullValueDefault.toFixed()
    // @ts-expect-error — propagate removed null, so this is a number
    params.value.toUpperCase()
    return params.min + params.count
  },
})

// A dynamically-built declarations map falls through to an open record
const dynamic: Record<string, { type: 'string' }> = { a: { type: 'string' } }
defineOperator({
  name: 'dynamic',
  description: 'open record',
  parameters: dynamic,
  evaluate: (params) => {
    // Open, but not opaque: every declaration here says `string`, so the
    // mapped type still resolves the value type
    assertType<Equal<typeof params, Record<string, string>>>()
    return params
  },
})

// ResolvedParams is exported for authors who annotate bodies separately
type Declared = { a: { type: 'number' }; b: { type: 'string'; required: false } }
assertType<Equal<ResolvedParams<Declared>, { a: number; b?: string }>>()

/**
 * Regression (Phase 9.2): `defineOperator` used to take one parameter
 * typed `OperatorDefinition<P> | ValidatedOperatorDefinition`, and a
 * literal carrying enough of the validated shape's fields stopped being
 * contextually typed — silently, with every body parameter becoming
 * `any`. `useCache` and `cache` together were enough, which is the pair
 * every I/O operator declares. Overloads replaced the union; this is the
 * combination that caught it.
 */
const cachingOp = defineOperator({
  name: 'caching',
  description: 'declares both caching fields',
  parameters: { key: { type: 'string' }, count: { type: 'integer', default: 1 } },
  useCache: true,
  cache: 'manual',
  evaluate: (params) => {
    assertType<Equal<typeof params.key, string>>()
    assertType<Equal<typeof params.count, number>>()
    return `${params.key}:${params.count}`
  },
})

test('the inferred definition is a valid, registrable definition', () => {
  expect(cachingOp.cache).toBe('manual')

  expect(op.name).toBe('inferred')
  expect(op.parameters.value.nullPolicy).toBe('propagate')
})

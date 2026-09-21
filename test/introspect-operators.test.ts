/**
 * Chunk 13.1 — `fig.getOperators()` ("Introspection: `getOperators()`" and
 * "The snapshot shape" in docs-dev/v3-specs/v3-operator-contract.md).
 *
 * The snapshot is a read, so most of what is asserted here is what does
 * and does not travel: the declarative half verbatim and total, function
 * -valued fields as flags, nothing branded or invocable, and every
 * `operatorDefaults` override reported BESIDE the authored value rather
 * than merged over it.
 */
import { EvaluationData, FigTree, coreOperators, defineOperator, isValidatedOperator } from '../src'
import type { OperatorInfo } from '../src'

const bag = { hint: 'a host-owned bag', render: () => 'not clonable' }
const seed = { deep: { value: 1 } }

const custom = defineOperator({
  name: 'custom',
  alias: '&',
  category: 'other',
  description: 'A host operator, to show the snapshot is total',
  metadata: bag,
  parameters: {
    value: { type: 'any', required: false, default: seed },
    ms: { type: 'integer', required: false },
  },
  positionalParams: ['value'],
  useCache: true,
  cache: 'manual',
  timeoutParam: 'ms',
  returns: 'string',
  evaluate: ({ value }) => String(value),
})

const build = (options: object = {}) =>
  new FigTree({ operators: [coreOperators, custom], ...options })

const find = (snapshot: OperatorInfo[], name: string): OperatorInfo => {
  const info = snapshot.find((entry) => entry.name === name)
  if (info === undefined) throw new Error(`no snapshot entry for '${name}'`)
  return info
}

describe('what the snapshot contains', () => {
  const snapshot = build().getOperators()

  test('one entry per registered operator, custom included, in registration order', () => {
    expect(snapshot).toHaveLength(coreOperators.length + 1)
    expect(snapshot.map((entry) => entry.name)).toEqual([
      ...coreOperators.map((definition) => definition.name),
      'custom',
    ])
  })

  test('the declarative half travels verbatim', () => {
    expect(find(snapshot, 'custom')).toMatchObject({
      name: 'custom',
      alias: '&',
      category: 'other',
      description: 'A host operator, to show the snapshot is total',
      positionalParams: ['value'],
      restParam: null,
      timeoutParam: 'ms',
      useCache: true,
      cache: 'manual',
      returns: 'string',
    })
  })

  test('every operator declares a category, from the closed set', () => {
    const vocabulary = ['logic', 'comparison', 'math', 'string', 'array', 'data', 'io', 'other']
    for (const entry of snapshot) expect(vocabulary).toContain(entry.category)
    expect(find(snapshot, 'plus').category).toBe('math')
    expect(find(snapshot, 'convert').category).toBe('other')
    expect(find(snapshot, 'length').category).toBe('array')
  })

  test('declarations are the EFFECTIVE ones, not the authored sparseness', () => {
    expect(find(snapshot, 'round').parameters.decimals).toMatchObject({
      type: 'integer',
      required: false, // computed from the presence of `default`
      default: 0,
      evaluation: 'eager', // never authored
      truthiness: false,
      nullPolicy: 'propagate',
    })
  })

  test('a compiled conditional null-policy table is reported, never the function', () => {
    const policy = find(snapshot, 'convert').parameters.value.nullPolicy
    expect(typeof policy).toBe('object')
    expect(policy).toMatchObject({ selector: 'to' })
  })

  test('derived fields a tool needs to write a call are present', () => {
    expect(find(snapshot, 'plus').restParam).toBe('values')
    expect(find(snapshot, 'round').restParam).toBe(null)
  })

  test('function-valued fields are flags', () => {
    expect(find(snapshot, 'regex').hasValidate).toBe(true)
    expect(find(snapshot, 'round').hasValidate).toBe(false)
    expect(find(snapshot, 'custom').cache).toBe('manual')
  })
})

describe('what the snapshot withholds', () => {
  const info = find(build().getOperators(), 'custom')

  test('nothing invocable, and no engine bookkeeping', () => {
    expect('evaluate' in info).toBe(false)
    expect('validate' in info).toBe(false)
    expect('deliversLazily' in info).toBe(false)
  })

  test('the brand does not travel — a snapshot must not pass the guard', () => {
    expect(isValidatedOperator(info)).toBe(false)
  })

  test('the one symbol that does travel: EvaluationData as a default', () => {
    // A deliberate carve-out, on record: the sentinel is a public export
    // and identity comparison is what it is for — but JSON drops it, so a
    // serializing consumer has to translate first
    const from = find(build().getOperators(), 'get').parameters.from
    expect(Object.hasOwn(from, 'default')).toBe(true)
    expect(from.default).toBe(EvaluationData)
    expect('default' in JSON.parse(JSON.stringify(from))).toBe(false)
  })
})

describe('operatorDefaults — reported beside, never merged over', () => {
  const fig = build({
    operatorDefaults: {
      round: { decimals: 2, useCache: true },
      regex: { noMatchDefault: null, fallback: null },
    },
  })
  const snapshot = fig.getOperators()

  test('a parameter override sits beside the authored default', () => {
    const decimals = find(snapshot, 'round').parameters.decimals
    expect(decimals.default).toBe(0) // what the operator declares
    expect(decimals.instanceDefault).toBe(2) // what this host set
  })

  test('the modifier overrides get their own keys', () => {
    expect(find(snapshot, 'round').instanceUseCache).toBe(true)
    expect(find(snapshot, 'regex').instanceFallback).toBe(null)
  })

  test('presence, not value — an override OF null is distinguishable', () => {
    const regex = find(snapshot, 'regex')
    expect(Object.hasOwn(regex.parameters.noMatchDefault, 'instanceDefault')).toBe(true)
    expect(regex.parameters.noMatchDefault.instanceDefault).toBe(null)
    expect(Object.hasOwn(regex, 'instanceFallback')).toBe(true)
    // ...and an operator with no entry carries no override keys at all
    const plus = find(snapshot, 'plus')
    expect(Object.hasOwn(plus, 'instanceUseCache')).toBe(false)
    expect(Object.hasOwn(plus, 'instanceFallback')).toBe(false)
    expect(Object.hasOwn(plus.parameters.values, 'instanceDefault')).toBe(false)
  })

  test('the blanket useCache option is not folded into instanceUseCache', () => {
    const blanket = build({ useCache: true }).getOperators()
    expect(Object.hasOwn(find(blanket, 'round'), 'instanceUseCache')).toBe(false)
    expect(find(blanket, 'round').useCache).toBe(false) // still the definition's
  })
})

describe('copy posture', () => {
  const fig = build()

  test('a fresh array and fresh objects every call', () => {
    const first = fig.getOperators()
    const second = fig.getOperators()
    expect(first).not.toBe(second)
    expect(find(first, 'plus')).not.toBe(find(second, 'plus'))
    expect(find(first, 'plus').parameters.values).not.toBe(find(second, 'plus').parameters.values)
  })

  test('reassigning a snapshot field cannot reach the registry', () => {
    const info = find(fig.getOperators(), 'plus')
    info.description = 'clobbered'
    info.parameters.values.required = false
    delete info.alias
    expect(find(fig.getOperators(), 'plus').description).not.toBe('clobbered')
    expect(find(fig.getOperators(), 'plus').parameters.values.required).toBe(true)
    expect(find(fig.getOperators(), 'plus').alias).toBe('+')
  })

  test('metadata bags and default values keep their identity — host-owned', () => {
    const info = find(fig.getOperators(), 'custom')
    expect(info.metadata).toBe(bag)
    expect(info.parameters.value.default).toBe(seed)
  })

  test('the snapshot itself is not frozen, matching getOptions()', () => {
    expect(Object.isFrozen(fig.getOperators())).toBe(false)
    expect(Object.isFrozen(find(fig.getOperators(), 'plus'))).toBe(false)
  })
})

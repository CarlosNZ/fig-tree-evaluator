/**
 * Batch 3 — arithmetic & math (docs-dev/v3-specs/v3-operator-parameters.md).
 * Operands are numbers, with two deliberate exceptions: `plus`'s mode
 * polymorphism and `min`/`max`'s string ordering. Every scalar parameter
 * propagates null; the aggregates propagate per element with
 * `nullValueDefault` as the declared per-site opt-out (ledger #18). No body
 * polices NaN or Infinity — the engine's finite guard turns any non-finite
 * result into a runtime failure (ledger #10).
 */
import { declareOperator } from '../buildOperator'
import { compareValues, roundDecimal } from '../primitives'
import { describeType } from '../typeCheck'
import {
  emptyAggregateError,
  emptyAggregateFailure,
  emptyAggregateWarning,
  operandTypeFailure,
} from './shared'

type PlusMode = 'number' | 'string' | 'array' | 'object'

const PLUS_IDENTITY: Record<PlusMode, () => unknown> = {
  number: () => 0,
  string: () => '',
  array: () => [],
  object: () => ({}),
}

export const plus = declareOperator({
  name: 'plus',
  alias: '+',
  category: 'math',
  parameters: {
    values: {
      type: 'array',
      elementNullPolicy: 'propagate',
      constraints: { homogeneous: ['number', 'string', 'array', 'object'] },
    },
    expect: {
      type: { literal: ['number', 'string', 'array', 'object'] },
      required: false,
    },
    nullValueDefault: {
      type: ['number', 'string', 'array', 'object'],
      required: false,
      evaluation: 'lazy',
      replacesNullAt: ['values'],
    },
  },
  positionalParams: ['...values'],
  returns: ['number', 'string', 'array', 'object'],
  validate: ({ values, expect }) =>
    expect !== undefined ? emptyAggregateWarning({ values }) : emptyAggregateError({ values }),
  evaluate: ({ values, expect }) => {
    if (values.length === 0) {
      if (expect === undefined)
        throw emptyAggregateFailure('the sum', "pin the mode with 'expect' to get its identity")
      return PLUS_IDENTITY[expect]()
    }
    // The declared `homogeneous` constraint, checked after any null
    // replacement, has made the operands all one of the four kinds; `expect`
    // pins which, and the constraint knows nothing of it
    const mode = describeType(values[0]) as PlusMode
    if (expect !== undefined && mode !== expect)
      throw operandTypeFailure(`all operands must be ${expect}s — received ${mode}`)
    switch (mode) {
      case 'number':
        return (values as number[]).reduce((sum, value) => sum + value, 0)
      case 'string':
        return (values as string[]).join('')
      case 'array':
        return (values as unknown[][]).flat(1)
      case 'object':
        return Object.assign({}, ...(values as Record<string, unknown>[]))
    }
  },
})

export const subtract = declareOperator({
  name: 'subtract',
  alias: '-',
  category: 'math',
  parameters: {
    value: { type: ['number', 'null'] },
    minus: { type: ['number', 'null'] },
  },
  positionalParams: ['value', 'minus'],
  returns: 'number',
  evaluate: ({ value, minus }) => value - minus,
})

export const divide = declareOperator({
  name: 'divide',
  alias: '/',
  category: 'math',
  parameters: {
    value: { type: ['number', 'null'] },
    by: { type: ['number', 'null'] },
  },
  positionalParams: ['value', 'by'],
  returns: 'number',
  evaluate: ({ value, by }) => value / by,
})

export const modulo = declareOperator({
  name: 'modulo',
  category: 'math',
  parameters: {
    value: { type: ['number', 'null'] },
    mod: { type: ['number', 'null'] },
  },
  positionalParams: ['value', 'mod'],
  returns: 'number',
  evaluate: ({ value, mod }) => ((value % mod) + mod) % mod,
})

export const multiply = declareOperator({
  name: 'multiply',
  alias: '*',
  category: 'math',
  parameters: {
    values: {
      type: 'array',
      elementNullPolicy: 'propagate',
      constraints: { homogeneous: ['number'] },
    },
    nullValueDefault: {
      type: 'number',
      required: false,
      evaluation: 'lazy',
      replacesNullAt: ['values'],
    },
  },
  positionalParams: ['...values'],
  returns: 'number',
  validate: emptyAggregateWarning,
  evaluate: ({ values }) => (values as number[]).reduce((product, value) => product * value, 1),
})

export const power = declareOperator({
  name: 'power',
  alias: '^',
  category: 'math',
  parameters: {
    base: { type: ['number', 'null'] },
    exponent: { type: ['number', 'null'] },
  },
  positionalParams: ['base', 'exponent'],
  returns: 'number',
  evaluate: ({ base, exponent }) => base ** exponent,
})

export const round = declareOperator({
  name: 'round',
  category: 'math',
  parameters: {
    value: { type: ['number', 'null'] },
    decimals: {
      type: 'integer',
      default: 0,
    },
  },
  positionalParams: ['value', 'decimals'],
  returns: 'number',
  evaluate: ({ value, decimals }) => roundDecimal(value, decimals),
})

const unary = (
  name: string,
  compute: (value: number) => number,
  returns: 'number' | 'integer' = 'number'
) =>
  declareOperator({
    name,
    category: 'math',
    parameters: { value: { type: ['number', 'null'] } },
    positionalParams: ['value'],
    returns,
    evaluate: ({ value }) => compute(value),
  })

// A finite number rounds to an integer, and a non-finite one never passes
// the result boundary
export const floor = unary('floor', Math.floor, 'integer')
export const ceil = unary('ceil', Math.ceil, 'integer')
export const abs = unary('abs', Math.abs)

const extremum = (name: string, label: string, wins: (comparison: number) => boolean) =>
  declareOperator({
    name,
    category: 'math',
    parameters: {
      values: {
        type: 'array',
        elementNullPolicy: 'propagate',
        constraints: { homogeneous: ['number', 'string'] },
      },
      nullValueDefault: {
        type: ['number', 'string'],
        required: false,
        evaluation: 'lazy',
        replacesNullAt: ['values'],
      },
    },
    positionalParams: ['...values'],
    returns: ['number', 'string'],
    validate: emptyAggregateError,
    evaluate: ({ values }) => {
      const candidates = values as (number | string)[]
      if (candidates.length === 0) throw emptyAggregateFailure(label)
      return candidates.reduce((best, value) => (wins(compareValues(value, best)) ? value : best))
    },
  })

export const min = extremum('min', 'the minimum', (comparison) => comparison < 0)
export const max = extremum('max', 'the maximum', (comparison) => comparison > 0)

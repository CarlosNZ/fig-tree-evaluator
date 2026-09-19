/**
 * Batch 3 — arithmetic & math (docs-dev/v3-specs/v3-operator-parameters.md).
 * Operands are numbers, with two deliberate exceptions: `plus`'s mode
 * polymorphism and `min`/`max`'s string ordering. Every scalar parameter
 * propagates null; the aggregates propagate per element with
 * `nullValueDefault` as the declared per-site opt-out (ledger #18). No body
 * polices NaN or Infinity — the engine's finite guard turns any non-finite
 * result into a runtime failure (ledger #10).
 */
import { defineOperator } from '../defineOperator'
import { compareValues, roundDecimal } from '../primitives'
import { describeType } from '../typeCheck'
import { isPlainObject } from '../utils'
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

/** The operand kind `plus` dispatches on; anything else is out of domain. */
const plusKind = (value: unknown): PlusMode | undefined => {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') return 'string'
  if (Array.isArray(value)) return 'array'
  if (isPlainObject(value)) return 'object'
  return undefined
}

export const plus = defineOperator({
  name: 'plus',
  alias: '+',
  description:
    'Add numbers, concatenate strings or arrays, or shallow-merge objects — all operands must share one type',
  parameters: {
    values: {
      type: 'array',
      elementNullPolicy: 'propagate',
      description: 'The operands; homogeneous: all numbers, strings, arrays or objects',
    },
    expect: {
      type: { literal: ['number', 'string', 'array', 'object'] },
      required: false,
      description:
        'Pin the mode: every operand must be this type, and an empty input yields its identity',
    },
    nullValueDefault: {
      type: ['number', 'string', 'array', 'object'],
      required: false,
      evaluation: 'lazy',
      replacesNullAt: ['values'],
      description: 'Replaces any null operand before the addition',
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
    const mode = expect ?? plusKind(values[0])
    if (mode === undefined)
      throw operandTypeFailure(
        `operands must be numbers, strings, arrays or objects — received ${describeType(values[0])}`
      )
    const offender = values.find((value) => plusKind(value) !== mode)
    if (offender !== undefined)
      throw operandTypeFailure(
        `all operands must be ${mode}s — received ${describeType(offender)}${
          expect === undefined ? ' beside ' + mode + 's' : ''
        }`
      )
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

export const subtract = defineOperator({
  name: 'subtract',
  alias: '-',
  description: 'Subtract one number from another',
  parameters: {
    value: { type: ['number', 'null'], description: 'The main operand' },
    minus: { type: ['number', 'null'], description: 'The amount subtracted from value' },
  },
  positionalParams: ['value', 'minus'],
  returns: 'number',
  evaluate: ({ value, minus }) => value - minus,
})

export const divide = defineOperator({
  name: 'divide',
  alias: '/',
  description: 'Divide one number by another — true division; zero divisors fail',
  parameters: {
    value: { type: ['number', 'null'], description: 'The main operand' },
    by: { type: ['number', 'null'], description: 'The divisor' },
  },
  positionalParams: ['value', 'by'],
  returns: 'number',
  evaluate: ({ value, by }) => value / by,
})

export const modulo = defineOperator({
  name: 'modulo',
  description: 'The floored remainder: the result takes the sign of mod, so modulo(-7, 3) is 2',
  parameters: {
    value: { type: ['number', 'null'], description: 'The main operand' },
    mod: { type: ['number', 'null'], description: 'The modulus' },
  },
  positionalParams: ['value', 'mod'],
  returns: 'number',
  evaluate: ({ value, mod }) => ((value % mod) + mod) % mod,
})

export const multiply = defineOperator({
  name: 'multiply',
  alias: '*',
  description: 'Multiply numbers together — an empty input is 1, the empty product',
  parameters: {
    values: {
      type: 'array',
      elementNullPolicy: 'propagate',
      constraints: { homogeneous: ['number'] },
      description: 'The factors',
    },
    nullValueDefault: {
      type: 'number',
      required: false,
      evaluation: 'lazy',
      replacesNullAt: ['values'],
      description: 'Replaces any null factor before multiplying',
    },
  },
  positionalParams: ['...values'],
  returns: 'number',
  validate: emptyAggregateWarning,
  evaluate: ({ values }) => (values as number[]).reduce((product, value) => product * value, 1),
})

export const power = defineOperator({
  name: 'power',
  alias: '^',
  description: 'Raise a base to an exponent — overflow and complex results fail',
  parameters: {
    base: { type: ['number', 'null'] },
    exponent: { type: ['number', 'null'] },
  },
  positionalParams: ['base', 'exponent'],
  returns: 'number',
  evaluate: ({ base, exponent }) => base ** exponent,
})

export const round = defineOperator({
  name: 'round',
  description:
    'Round to a number of decimal places — ties go half away from zero; negative decimals round to tens, hundreds, …',
  parameters: {
    value: { type: ['number', 'null'] },
    decimals: {
      type: 'integer',
      default: 0,
      description: 'Decimal places to keep; negative values round to powers of ten',
    },
  },
  positionalParams: ['value', 'decimals'],
  returns: 'number',
  evaluate: ({ value, decimals }) => roundDecimal(value, decimals),
})

const unary = (name: string, description: string, compute: (value: number) => number) =>
  defineOperator({
    name,
    description,
    parameters: { value: { type: ['number', 'null'] } },
    positionalParams: ['value'],
    returns: 'number',
    evaluate: ({ value }) => compute(value),
  })

export const floor = unary('floor', 'Round down toward negative infinity', Math.floor)
export const ceil = unary('ceil', 'Round up toward positive infinity', Math.ceil)
export const abs = unary('abs', 'The absolute value', Math.abs)

const extremum = (name: string, description: string, wins: (comparison: number) => boolean) =>
  defineOperator({
    name,
    description,
    parameters: {
      values: {
        type: 'array',
        elementNullPolicy: 'propagate',
        constraints: { homogeneous: ['number', 'string'] },
        description: 'The candidates: all numbers, or all strings (codepoint order)',
      },
      nullValueDefault: {
        type: ['number', 'string'],
        required: false,
        evaluation: 'lazy',
        replacesNullAt: ['values'],
        description: 'Replaces any null candidate before comparing',
      },
    },
    positionalParams: ['...values'],
    returns: ['number', 'string'],
    validate: emptyAggregateError,
    evaluate: ({ values }) => {
      const candidates = values as (number | string)[]
      if (candidates.length === 0) throw emptyAggregateFailure(`the ${name}imum`)
      return candidates.reduce((best, value) => (wins(compareValues(value, best)) ? value : best))
    },
  })

export const min = extremum(
  'min',
  'The smallest of the values — numbers numerically, strings in codepoint order',
  (comparison) => comparison < 0
)
export const max = extremum(
  'max',
  'The largest of the values — numbers numerically, strings in codepoint order',
  (comparison) => comparison > 0
)

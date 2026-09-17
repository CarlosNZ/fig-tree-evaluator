/**
 * Stand-in operators for the dev playground. Core operators arrive with
 * Phase 4 (`DEFAULT_OPERATORS` in src/FigTree.ts is the swap point) — until
 * then an instance has an empty registry, so there is nothing for the
 * parser to recognize. These model the shapes the parser cares about:
 * aliases, positional payloads, lazy and perElement delivery, the `as`
 * renaming hook, the `EvaluationData` sentinel, a `timeoutParam`, and a
 * `validate` hook. Canonical names match the real core set where a real
 * operator is being modelled; the bodies are all no-ops (nothing evaluates
 * until Phase 4).
 *
 * Delete this file when `coreOperators` lands.
 */
import { defineOperator, EvaluationData } from '../index'
import type { ValidateFinding, ValidatedOperatorDefinition } from '../index'

const noop = async () => null

/** Alias, truthiness, lazy branches, three positional slots. */
const ifOp = defineOperator({
  name: 'if',
  alias: '?',
  description: 'Conditional branching',
  parameters: {
    condition: { type: 'any', truthiness: true },
    then: { type: 'any', evaluation: 'lazy' },
    else: { type: 'any', evaluation: 'lazy', default: null },
  },
  positionalParams: ['condition', 'then', 'else'],
  evaluate: noop,
})

/** A single positional slot, and a narrow `returns` for the feeding check. */
const notOp = defineOperator({
  name: 'not',
  alias: '!',
  description: 'Boolean negation',
  parameters: { value: { type: 'any', truthiness: true } },
  positionalParams: ['value'],
  returns: 'boolean',
  evaluate: noop,
})

/** Rest-only positional mapping — the variadic aggregate shape. */
const plusOp = defineOperator({
  name: 'plus',
  alias: '+',
  description: 'Add things together',
  parameters: {
    values: { type: 'array' },
    expect: { type: { literal: ['number', 'string', 'array'] }, required: false },
  },
  positionalParams: ['...values'],
  returns: ['number', 'string', 'array', 'object', 'null'],
  evaluate: noop,
})

/** Leading slot plus rest — the buildString shape. */
const formatOp = defineOperator({
  name: 'format',
  description: 'Render a template with substitutions',
  parameters: {
    template: { type: 'string' },
    substitutions: { type: 'array', required: false },
  },
  positionalParams: ['template', '...substitutions'],
  returns: 'string',
  evaluate: noop,
})

/** Optional trailing slots carrying defaults, and a `number` receiver. */
const clampOp = defineOperator({
  name: 'clamp',
  description: 'Constrain a number to a range',
  parameters: {
    value: { type: ['number', 'null'] },
    min: { type: 'number', default: 0 },
    max: { type: 'number', default: 1 },
  },
  positionalParams: ['value', 'min', 'max'],
  returns: 'number',
  evaluate: noop,
})

/** The `EvaluationData` sentinel in `default` position. */
const getOp = defineOperator({
  name: 'get',
  alias: 'getData',
  description: 'Read a path out of the evaluation data',
  parameters: {
    path: { type: 'string' },
    from: { type: ['object', 'array'], default: EvaluationData },
  },
  positionalParams: ['path'],
  evaluate: noop,
})

/** I/O: one positional slot, `timeoutParam`, caching on by metadata. */
const httpOp = defineOperator({
  name: 'http',
  description: 'HTTP request',
  parameters: {
    url: { type: 'string' },
    query: { type: 'object', required: false },
    requestTimeout: { type: 'integer', required: false },
  },
  positionalParams: ['url'],
  timeoutParam: 'requestTimeout',
  useCache: true,
  evaluate: noop,
})

/** The iterator shape: perElement `each` over `input`, structural `as`. */
const mapOp = defineOperator({
  name: 'map',
  description: 'Transform each element of an array',
  parameters: {
    input: { type: 'array' },
    each: { type: 'any', evaluation: 'perElement', over: 'input' },
    as: { type: 'string', required: false, evaluation: 'structural' },
  },
  positionalParams: ['input', 'each'],
  returns: 'array',
  evaluate: noop,
})

/** A `validate` hook — operator-specific linting of literal parameters. */
const regexOp = defineOperator({
  name: 'regex',
  description: 'Test a string against a pattern',
  parameters: {
    pattern: { type: 'string' },
    flags: { type: 'string', required: false },
  },
  positionalParams: ['pattern', 'flags'],
  returns: 'boolean',
  validate: ({ pattern, flags }) => {
    const findings: ValidateFinding[] = []
    if (typeof pattern === 'string') {
      try {
        new RegExp(pattern, typeof flags === 'string' ? flags : '')
      } catch (error) {
        findings.push({
          severity: 'error',
          parameter: 'pattern',
          message: `Pattern does not compile: ${(error as Error).message}`,
        })
      }
    }
    if (typeof flags === 'string') {
      const bad = [...flags].filter((flag) => !'dgimsuvy'.includes(flag))
      if (bad.length > 0)
        findings.push({
          severity: 'error',
          parameter: 'flags',
          message: `Unknown regex flag${bad.length === 1 ? '' : 's'}: ${bad.join(', ')}`,
        })
    }
    return findings
  },
  evaluate: noop,
})

export const demoOperators = (): ValidatedOperatorDefinition[] => [
  ifOp,
  notOp,
  plusOp,
  formatOp,
  clampOp,
  getOp,
  httpOp,
  mapOp,
  regexOp,
]

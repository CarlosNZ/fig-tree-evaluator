/**
 * A ready registry of realistic stand-in operators for the Phase-3 parser
 * suites. Core operators don't exist until Phase 4, so these fixtures model
 * the shapes the parser must handle — canonical names match the real core
 * set where a real operator is being modelled, but the definitions are
 * test-local and deliberately minimal.
 */
import { defineOperator, EvaluationData } from '../../src'
import { buildRegistry, type OperatorRegistry } from '../../src/registry'
import type { ValidatedOperatorDefinition } from '../../src'

const noop = () => null

/** `if` — alias, truthiness, lazy branches, three-position mapping. */
export const ifOp = () =>
  defineOperator({
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

/** `not` — single-value positional list (the surplus-argument trap). */
export const notOp = () =>
  defineOperator({
    name: 'not',
    alias: '!',
    description: 'Boolean negation',
    parameters: { value: { type: 'any', truthiness: true } },
    positionalParams: ['value'],
    returns: 'boolean',
    evaluate: noop,
  })

/** `plus` — rest-only positional mapping (variadic aggregate). */
export const plusOp = () =>
  defineOperator({
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

/** `format` — leading position + rest (the buildString shape). */
export const formatOp = () =>
  defineOperator({
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

/** `clamp` — optional trailing positions with defaults. */
export const clampOp = () =>
  defineOperator({
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

/** `http` — I/O shape: single-position mapping, modifiers, timeoutParam. */
export const httpOp = () =>
  defineOperator({
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

/** `map` — the iterator shape: perElement `each`, structural `as`. */
export const mapOp = () =>
  defineOperator({
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

/**
 * `greaterThan` — constraints (length + homogeneous), element-wise
 * propagate, boolean returns.
 */
export const greaterThanOp = () =>
  defineOperator({
    name: 'greaterThan',
    alias: '>',
    description: 'Strict ordering comparison',
    parameters: {
      values: {
        type: 'array',
        elementNullPolicy: 'propagate',
        constraints: { length: 2, homogeneous: ['number', 'string'] },
      },
    },
    positionalParams: ['...values'],
    returns: 'boolean',
    evaluate: noop,
  })

/** `strictNumbers` — a homogeneity constraint with NO element null policy. */
export const strictNumbersOp = () =>
  defineOperator({
    name: 'strictNumbers',
    description: 'Homogeneous numbers, nulls not admitted per element',
    parameters: {
      values: { type: 'array', constraints: { homogeneous: ['number'] } },
    },
    positionalParams: ['...values'],
    returns: 'number',
    evaluate: noop,
  })

/**
 * `pattern` — the validate-hook holder (regex-shaped, per the contract's
 * worked hook). The probe faces make hook plumbing observable: severities,
 * the helpers toolbox, literal-only delivery.
 */
export const hookOp = () =>
  defineOperator({
    name: 'pattern',
    description: 'Validate-hook holder',
    parameters: {
      pattern: { type: 'string' },
      flags: { type: 'string', required: false },
    },
    positionalParams: ['pattern', 'flags'],
    validate: ({ pattern, flags }, helpers) => {
      const issues = []
      if (pattern === 'probe-helpers')
        issues.push({
          severity: 'hint' as const,
          message: `helpers:${Object.keys(helpers as object)
            .sort()
            .join(',')}`,
        })
      if (pattern === 'warn-me')
        issues.push({ severity: 'warning' as const, message: 'lint stand-in' })
      if (typeof pattern === 'string' && !['probe-helpers', 'warn-me'].includes(pattern)) {
        try {
          new RegExp(pattern, typeof flags === 'string' ? flags : '')
        } catch (error) {
          issues.push({
            severity: 'error' as const,
            parameter: 'pattern',
            message: `Pattern does not compile: ${(error as Error).message}`,
          })
        }
      }
      return issues
    },
    evaluate: noop,
  })

/** `or` — the `race` delivery: element-addressable, truthiness per element. */
export const orOp = () =>
  defineOperator({
    name: 'or',
    description: 'Boolean disjunction, resolved as operands settle',
    parameters: { values: { type: 'array', truthiness: true, evaluation: 'race' } },
    positionalParams: ['...values'],
    returns: 'boolean',
    evaluate: noop,
  })

/** `firstOf` — `lazyElements`: one demandable handle per element. */
export const firstOfOp = () =>
  defineOperator({
    name: 'firstOf',
    description: 'The first candidate that is not null',
    parameters: { values: { type: 'array', evaluation: 'lazyElements' } },
    positionalParams: ['...values'],
    evaluate: noop,
  })

/** `pick` — a leading position before a `race` rest slice (the index trap). */
export const pickOp = () =>
  defineOperator({
    name: 'pick',
    description: 'A leading position ahead of an element-addressable rest slice',
    parameters: {
      label: { type: 'string' },
      values: { type: 'array', evaluation: 'lazyElements' },
    },
    positionalParams: ['label', '...values'],
    evaluate: noop,
  })

/** `match` — the `lazyEntries` delivery, and its two-mode `branches`. */
export const matchOp = () =>
  defineOperator({
    name: 'match',
    description: 'Dispatch on a value',
    parameters: {
      value: { type: ['string', 'number', 'boolean', 'null'], nullPolicy: 'value' },
      branches: { type: 'object', evaluation: 'lazyEntries' },
      default: { type: 'any', required: false, evaluation: 'lazy' },
    },
    positionalParams: ['value', 'branches', 'default'],
    evaluate: noop,
  })

/** `get` — the parser records its literal paths as data dependencies. */
export const getOp = () =>
  defineOperator({
    name: 'get',
    description: 'Read a path out of the evaluation data',
    parameters: {
      path: { type: ['string', 'array', 'null'] },
      from: { type: 'any', nullPolicy: 'value', default: EvaluationData },
      missingPathDefault: { type: 'any', required: false, evaluation: 'lazy' },
    },
    positionalParams: ['path', 'missingPathDefault'],
    evaluate: noop,
  })

export const parseOps = (): ValidatedOperatorDefinition[] => [
  orOp(),
  firstOfOp(),
  pickOp(),
  matchOp(),
  ifOp(),
  notOp(),
  plusOp(),
  formatOp(),
  clampOp(),
  httpOp(),
  mapOp(),
  greaterThanOp(),
  strictNumbersOp(),
  hookOp(),
  getOp(),
]

/** A fresh registry over the stand-in set, optional operatorDefaults. */
export const makeParseRegistry = (
  operatorDefaults?: Record<string, Record<string, unknown>>
): OperatorRegistry =>
  buildRegistry({
    operators: [parseOps()],
    ...(operatorDefaults !== undefined ? { operatorDefaults } : {}),
  })

/** Phase 3 has no registrable fragments — the empty lookup. */
export const noFragments: ReadonlyMap<string, unknown> = new Map()

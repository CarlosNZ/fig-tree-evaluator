/**
 * Rule 5 of the coverage walk ("Operator rules" in
 * docs-dev/v3-specs/v3-fallback-coverage.md): an operator's own failures,
 * read from its failure rules and tested against what its parameters
 * receive. Everything else that can make an operator throw is a type
 * check, a null refusal or a constraint, which rule 2 reads from the
 * definition.
 *
 * The core operators' rules are a table here, keyed by the built
 * definitions themselves, so a host operator reusing a core name never
 * inherits them, and the root never carries them. A host operator's come
 * from the `failures` hook of its analysis (./helpers.ts). An operator with
 * neither, the I/O operators included, is external: it may fail whatever
 * its inputs.
 */
import { coreOperators } from '../operators'
import { isPlainObject } from '../utils'
import type { FailureEntry, OperatorAnalysis } from '../authoringTypes'
import type { FallbackErrorCode } from '../errorCodes'
import type { OperatorNode } from '../compile/artifact'
import type { ValidatedOperatorDefinition } from '../operatorDefinition'
import type { ExpectedType } from '../typeCheck'
import { hostEntries, presence, refused } from './helpers'
import type { Hooked } from './helpers'
import { ANY, any, combine, fits, isBelow, isEmpty, isValue, mayBeInfinite, not } from './known'
import type { Answer, Known, Member } from './known'
import type { Inputs } from './inputs'
import type { Failure } from './findings'

/**
 * One way a core operator's body can fail: the code its error carries, and
 * the conditions on what its parameters receive under which it does.
 */
export interface FailureRule {
  code: FallbackErrorCode
  /** The parameter the failure is about, which its finding names */
  parameter?: string
  /** Tests on parameters, by name; every one must hold. Absent: always holds */
  when?: Record<string, FailureTest>
  /** Options the rule needs, such as { strictDataPaths: true } */
  options?: Record<string, unknown>
  /** Holding makes the failure possible, not certain */
  may?: true
  /** A failure only extreme numbers reach: counted under strictNumbers only */
  overflow?: true
}

/** A test on what one parameter receives. */
export type FailureTest =
  /** Equals this value */
  | string
  | number
  | boolean
  | null
  /** Has this type */
  | { type: ExpectedType }
  /** A number less than this */
  | { below: number }
  /** An empty array, string or object */
  | { empty: true }
  /** The parameter has a value, supplied or defaulted, or has none */
  | { supplied: boolean }
  /** The operator's `validate` hook refuses it */
  | { invalid: true }
  /** Some element of an array, or value of an object, passes */
  | { some: FailureTest }
  | { not: FailureTest }

const NON_FINITE = 'non-finite-result'
const EMPTY = 'empty-aggregate'
const TYPE_CHECK = 'type-check'
const OPERATOR = 'operator-failure'

const OVERFLOW: FailureRule = { code: NON_FINITE, overflow: true }

/** `plus` given an `expect` its operands are not. */
const expectRule = (kind: 'number' | 'string' | 'array' | 'object'): FailureRule => ({
  code: TYPE_CHECK,
  parameter: 'values',
  when: { expect: kind, values: { some: { not: { type: kind } } } },
})

/** The core rules, by operator name; an operator not listed has none. */
export const CORE_RULES: Record<string, FailureRule[]> = {
  plus: [
    {
      code: EMPTY,
      parameter: 'values',
      when: { values: { empty: true }, expect: { supplied: false } },
    },
    expectRule('number'),
    expectRule('string'),
    expectRule('array'),
    expectRule('object'),
    OVERFLOW,
  ],
  subtract: [OVERFLOW],
  multiply: [OVERFLOW],
  divide: [{ code: NON_FINITE, parameter: 'by', when: { by: 0 } }, OVERFLOW],
  modulo: [{ code: NON_FINITE, parameter: 'mod', when: { mod: 0 } }, OVERFLOW],
  power: [
    { code: NON_FINITE, parameter: 'base', when: { base: 0, exponent: { below: 0 } } },
    // Not certain: an infinite base or exponent can make it 0 instead
    {
      code: NON_FINITE,
      parameter: 'base',
      may: true,
      when: { base: { below: 0 }, exponent: { not: { type: 'integer' } } },
    },
    {
      code: NON_FINITE,
      parameter: 'exponent',
      may: true,
      when: { exponent: { not: { below: 100 } } },
    },
    OVERFLOW,
  ],
  round: [
    // 10^decimals is infinite from about 309, so the shift overflows on an
    // ordinary value well before; below 300 it takes an extreme one
    {
      code: NON_FINITE,
      parameter: 'decimals',
      may: true,
      when: { decimals: { not: { below: 300 } } },
    },
    OVERFLOW,
  ],
  min: [{ code: EMPTY, parameter: 'values', when: { values: { empty: true } } }],
  max: [{ code: EMPTY, parameter: 'values', when: { values: { empty: true } } }],
  match: [{ code: OPERATOR, may: true, when: { default: { supplied: false } } }],
  regex: [
    { code: OPERATOR, parameter: 'flags', when: { flags: { invalid: true } } },
    { code: OPERATOR, parameter: 'pattern', when: { pattern: { invalid: true } } },
  ],
  get: [
    { code: OPERATOR, parameter: 'path', when: { path: { invalid: true } } },
    {
      code: 'missing-data-path',
      may: true,
      options: { strictDataPaths: true },
      when: { default: { supplied: false } },
    },
  ],
  convert: [
    { code: OPERATOR, when: { to: 'number', value: { type: ['array', 'object'] } } },
    { code: OPERATOR, may: true, when: { to: 'number', value: { type: 'string' } } },
    { code: NON_FINITE, may: true, when: { to: 'number', value: { type: 'string' } } },
    { code: OPERATOR, when: { to: 'string', value: { type: ['array', 'object'] } } },
  ],
}

let core: Map<ValidatedOperatorDefinition, FailureRule[]> | undefined

const coreRules = () =>
  (core ??= new Map(coreOperators.map((built) => [built, CORE_RULES[built.name] ?? []])))

/**
 * Where an operator's analysis comes from: the host's declaration, the
 * core table, or nowhere, which makes it external.
 */
export const analysisOf = (
  definition: ValidatedOperatorDefinition,
  analyses: ReadonlyMap<ValidatedOperatorDefinition, OperatorAnalysis>
): OperatorAnalysis | 'core' | 'external' =>
  analyses.get(definition) ?? (coreRules().has(definition) ? 'core' : 'external')

/** A core operator's failure rules. */
export const rulesOf = (definition: ValidatedOperatorDefinition): FailureRule[] =>
  coreRules().get(definition) ?? []

// ── The tests ───────────────────────────────────────────────────────

/** A test against one member of what a parameter receives. */
const testMember = (test: FailureTest, member: Member): Answer => {
  if (test === null || typeof test !== 'object') return isValue([member], test)
  if ('type' in test) return fits([member], test.type)
  if ('not' in test) return not(testMember(test.not, member))
  if ('below' in test) return isBelow([member], test.below)
  if ('empty' in test) return isEmpty([member])
  if ('some' in test) {
    if ('exact' in member) {
      const { exact } = member
      const values = Array.isArray(exact)
        ? Array.from(exact)
        : isPlainObject(exact)
          ? Object.values(exact)
          : []
      return any(values.map((value) => testMember(test.some, { exact: value ?? null })))
    }
    if (member.type === 'array') {
      if (member.length === 0) return 'no'
      const element = testKnown(test.some, member.element ?? ANY)
      return element === 'yes' && (member.length !== undefined || member.minLength)
        ? 'yes'
        : element === 'no'
          ? 'no'
          : 'maybe'
    }
    if (member.type === 'object')
      return member.keys === undefined
        ? 'maybe'
        : any(
            Object.values(member.keys).map((value) =>
              testKnown(test.some, value) === 'no' ? 'no' : 'maybe'
            )
          )
    return 'no'
  }
  // `supplied` and `invalid` are about the parameter, not its value
  return 'maybe'
}

/** A test against everything a parameter may receive. */
export const testKnown = (test: FailureTest, known: Known): Answer =>
  known.length === 0 ? 'no' : combine(known.map((member) => testMember(test, member)))

const testParameter = (
  node: OperatorNode,
  name: string,
  test: FailureTest,
  inputs: Inputs
): Answer => {
  const present = presence(inputs, name)
  if (test !== null && typeof test === 'object' && 'supplied' in test)
    return test.supplied ? present : not(present)
  if (present === 'no') return 'no'
  if (test !== null && typeof test === 'object' && 'invalid' in test)
    return refused(node, name, inputs)
  return testKnown(test, inputs.received[name])
}

// ── Messages ────────────────────────────────────────────────────────

const phrase = (test: FailureTest): string => {
  if (test === null || typeof test !== 'object') return JSON.stringify(test)
  if ('type' in test)
    return typeof test.type === 'string' ? `a ${test.type}` : `of type ${JSON.stringify(test.type)}`
  if ('not' in test) return `not ${phrase(test.not)}`
  if ('below' in test) return `below ${test.below}`
  if ('empty' in test) return 'empty'
  if ('supplied' in test) return test.supplied ? 'supplied' : 'not supplied'
  if ('invalid' in test) return 'refused by its validation'
  return `with some element ${phrase(test.some)}`
}

/** A rule's conditions, as a finding's message gives them. */
const conditionsOf = (rule: FailureRule): string | undefined => {
  const conditions = Object.entries(rule.when ?? {}).map(([name, test]) =>
    test !== null && typeof test === 'object' && 'some' in test
      ? `some element of '${name}' is ${phrase(test.some)}`
      : `'${name}' is ${phrase(test)}`
  )
  return conditions.length > 0 ? conditions.join(' and ') : undefined
}

const describe = (operator: string, entry: FailureEntry): string =>
  `${operator} – ${entry.code}${entry.may ? ' possible' : ''}${
    entry.message !== undefined
      ? ` when ${entry.message}`
      : entry.overflow
        ? ' on extreme numbers'
        : ''
  }`

// ── Rule 5 ──────────────────────────────────────────────────────────

export interface RuleOptions {
  /** Whether overflow and non-finite numbers from the data count */
  strictNumbers: boolean
  /** The evaluation options in force, which a rule's `options` must match */
  evaluation: Record<string, unknown>
}

const infiniteOperand = (inputs: Inputs, strictNumbers: boolean): boolean =>
  Object.values(inputs.received).some((known) => mayBeInfinite(known, strictNumbers))

/**
 * Whether a failure counts here at all: one that needs an option only under
 * it, and an overflow only under `strictNumbers`, or where an operand is an
 * infinity known exactly, since arithmetic on one can make NaN
 * (Infinity - Infinity).
 */
const counts = (
  failure: { overflow?: true; options?: Record<string, unknown> },
  inputs: Inputs,
  options: RuleOptions
): boolean =>
  !(failure.overflow && !options.strictNumbers && !infiniteOperand(inputs, false)) &&
  Object.entries(failure.options ?? {}).every(
    ([key, value]) => (options.evaluation[key] ?? false) === value
  )

/** One rule's answer for a node, or `no` where its gates shut it. */
export const answerRule = (
  node: OperatorNode,
  rule: FailureRule,
  inputs: Inputs,
  options: RuleOptions
): Answer => {
  if (!counts(rule, inputs, options)) return 'no'
  const answers = Object.entries(rule.when ?? {}).map(([name, test]) =>
    testParameter(node, name, test, inputs)
  )
  if (answers.includes('no')) return 'no'
  return answers.every((answer) => answer === 'yes') ? 'yes' : 'maybe'
}

/**
 * The node's own failures, by its rules or its analysis's entries: one
 * finding for each that can happen, `always` where it must and no null can
 * end the node first. An overflow takes extreme numbers, which nothing can
 * ask for, so it is never certain; nor is a non-finite result where an
 * operand may be an infinity, which the body carries through instead of
 * failing (`Infinity / 0`). An external operator may fail whatever its
 * inputs, with whatever code its own code throws, which the one
 * `operator-failure` finding stands for.
 */
export const ownFailures = (
  node: OperatorNode,
  inputs: Inputs,
  options: RuleOptions,
  analysis: Hooked | 'core' | 'external'
): Failure[] => {
  const at = { path: node.path, operator: node.name, order: [node.order] }
  const entries =
    analysis === 'core'
      ? rulesOf(node.entry.definition).map((rule) => {
          const message = conditionsOf(rule)
          return {
            ...rule,
            occurs: answerRule(node, rule, inputs, options),
            ...(message !== undefined ? { message } : {}),
          }
        })
      : analysis === 'external'
        ? analysis
        : hostEntries(analysis)
  if (entries === 'external')
    return [
      {
        ...at,
        code: OPERATOR,
        message: `${node.name} – may fail whatever its inputs: nothing describes what it fails on`,
        certainty: 'may',
      },
    ]
  const failures: Failure[] = []
  const carried = infiniteOperand(inputs, options.strictNumbers)
  for (const entry of entries) {
    const answer = entry.occurs ?? 'maybe'
    if (answer === 'no' || !counts(entry, inputs, options)) continue
    failures.push({
      ...at,
      code: entry.code,
      message: describe(node.name, entry),
      certainty:
        answer === 'yes' &&
        !entry.may &&
        !entry.overflow &&
        !(entry.code === NON_FINITE && carried) &&
        inputs.propagates === 'no'
          ? 'always'
          : 'may',
      ...(entry.parameter !== undefined ? { parameter: entry.parameter } : {}),
    })
  }
  return failures
}

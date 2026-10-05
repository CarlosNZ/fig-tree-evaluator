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
 * inherits them, and the root never carries them. A host operator declares
 * its own in the definition's `coverage` field. An operator with neither,
 * the I/O operators included, is external: it may fail whatever its inputs.
 */
import { validateHelpers } from '../compile/helpers'
import { coreOperators } from '../operators'
import type { CoverageTest, FailureRule } from '../authoringTypes'
import type { OperatorNode } from '../compile/artifact'
import type { ValidatedOperatorDefinition } from '../operatorDefinition'
import type { ExpectedType } from '../typeCheck'
import { ANY, combine, fits } from './known'
import type { Answer, Known, Member } from './known'
import type { Inputs } from './inputs'
import type { Failure } from './findings'

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
    {
      code: NON_FINITE,
      parameter: 'base',
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

/**
 * An operator's own failure rules, or `external` for one that may fail
 * whatever its inputs.
 */
export const rulesOf = (definition: ValidatedOperatorDefinition): FailureRule[] | 'external' => {
  const declared = definition.coverage
  if (declared !== undefined) return declared.external ? 'external' : (declared.failures ?? [])
  core ??= new Map(coreOperators.map((built) => [built, CORE_RULES[built.name] ?? []]))
  return core.get(definition) ?? 'external'
}

// ── The tests ───────────────────────────────────────────────────────

const invert = (answer: Answer): Answer =>
  answer === 'yes' ? 'no' : answer === 'no' ? 'yes' : 'maybe'

/** Whether any of several conditions holds. */
const any = (answers: Answer[]): Answer =>
  answers.includes('yes') ? 'yes' : answers.includes('maybe') ? 'maybe' : 'no'

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A test against one member of what a parameter receives. */
const testMember = (test: CoverageTest, member: Member): Answer => {
  if (test === null || typeof test !== 'object') {
    if ('exact' in member) return member.exact === test ? 'yes' : 'no'
    const type: ExpectedType = test === null ? 'null' : { literal: [test] }
    return fits([member], type) === 'no' ? 'no' : 'maybe'
  }
  if ('type' in test) return fits([member], test.type)
  if ('not' in test) return invert(testMember(test.not, member))
  if ('below' in test) {
    if ('exact' in member)
      return typeof member.exact === 'number' && member.exact < test.below ? 'yes' : 'no'
    return member.type === 'number' || member.type === 'integer' ? 'maybe' : 'no'
  }
  if ('empty' in test) {
    if ('exact' in member) {
      const { exact } = member
      if (typeof exact === 'string' || Array.isArray(exact))
        return exact.length === 0 ? 'yes' : 'no'
      return isPlain(exact) && Object.keys(exact).length === 0 ? 'yes' : 'no'
    }
    switch (member.type) {
      case 'array':
        return member.length === undefined ? 'maybe' : member.length === 0 ? 'yes' : 'no'
      case 'object':
        return member.keys === undefined
          ? 'maybe'
          : Object.keys(member.keys).length === 0
            ? 'yes'
            : 'no'
      case 'string':
        return 'maybe'
      default:
        return 'no'
    }
  }
  if ('some' in test) {
    if ('exact' in member) {
      const { exact } = member
      const values = Array.isArray(exact)
        ? Array.from(exact)
        : isPlain(exact)
          ? Object.values(exact)
          : []
      return any(values.map((value) => testMember(test.some, { exact: value ?? null })))
    }
    if (member.type === 'array') {
      if (member.length === 0) return 'no'
      const element = testKnown(test.some, member.element ?? ANY)
      return element === 'yes' && member.length !== undefined
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
const testKnown = (test: CoverageTest, known: Known): Answer =>
  known.length === 0 ? 'no' : combine(known.map((member) => testMember(test, member)))

const exactValue = (known: Known | undefined): { value: unknown } | undefined =>
  known !== undefined && known.length === 1 && 'exact' in known[0]
    ? { value: known[0].exact }
    : undefined

/**
 * Whether the operator's `validate` hook refuses a parameter's value, once
 * it is known exactly. The hook is given every parameter known exactly and
 * none of the others, as the static check gives it the literal ones only.
 */
const refused = (node: OperatorNode, name: string, inputs: Inputs): Answer => {
  const { validate } = node.entry.definition
  if (validate === undefined) return 'no'
  if (exactValue(inputs.received[name]) === undefined) return 'maybe'
  const literals: Record<string, unknown> = {}
  for (const [parameter, known] of Object.entries(inputs.received)) {
    const exact = exactValue(known)
    if (exact !== undefined && !inputs.absent.has(parameter)) literals[parameter] = exact.value
  }
  const findings = validate(literals, validateHelpers)
  return findings.some((finding) => finding.severity === 'error' && finding.parameter === name)
    ? 'yes'
    : 'no'
}

const testParameter = (
  node: OperatorNode,
  name: string,
  test: CoverageTest,
  inputs: Inputs
): Answer => {
  const known = inputs.received[name]
  const present: Answer = known === undefined ? 'no' : inputs.absent.has(name) ? 'maybe' : 'yes'
  if (test !== null && typeof test === 'object' && 'supplied' in test)
    return test.supplied ? present : invert(present)
  if (present === 'no') return 'no'
  if (test !== null && typeof test === 'object' && 'invalid' in test)
    return refused(node, name, inputs)
  return testKnown(test, known)
}

// ── Messages ────────────────────────────────────────────────────────

const phrase = (test: CoverageTest): string => {
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

const describeRule = (operator: string, rule: FailureRule): string => {
  const conditions = Object.entries(rule.when ?? {}).map(([name, test]) =>
    test !== null && typeof test === 'object' && 'some' in test
      ? `some element of '${name}' is ${phrase(test.some)}`
      : `'${name}' is ${phrase(test)}`
  )
  const when =
    conditions.length > 0
      ? `when ${conditions.join(' and ')}`
      : rule.overflow
        ? 'on extreme numbers'
        : 'whatever its inputs'
  return `${operator} – ${rule.code} ${rule.may ? 'possible ' : ''}${when}`
}

// ── Rule 5 ──────────────────────────────────────────────────────────

export interface RuleOptions {
  numbers: 'ordinary' | 'strict'
  /** The evaluation options in force, which a rule's `options` must match */
  evaluation: Record<string, unknown>
}

/** One rule's answer for a node, or `no` where its gates shut it. */
export const answerRule = (
  node: OperatorNode,
  rule: FailureRule,
  inputs: Inputs,
  options: RuleOptions
): Answer => {
  if (rule.overflow && options.numbers !== 'strict') return 'no'
  for (const [key, value] of Object.entries(rule.options ?? {}))
    if ((options.evaluation[key] ?? false) !== value) return 'no'
  const answers = Object.entries(rule.when ?? {}).map(([name, test]) =>
    testParameter(node, name, test, inputs)
  )
  if (answers.includes('no')) return 'no'
  return answers.every((answer) => answer === 'yes') ? 'yes' : 'maybe'
}

/**
 * The node's own failures, by its rules: one finding for each rule that can
 * hold, `always` where it must and no null can end the node first. An
 * external operator may fail whatever its inputs, with whatever code its
 * own code throws, which the one `operator-failure` finding stands for.
 */
export const ownFailures = (
  node: OperatorNode,
  inputs: Inputs,
  options: RuleOptions
): Failure[] => {
  const rules = rulesOf(node.entry.definition)
  const at = { path: node.path, operator: node.name, order: [node.order] }
  if (rules === 'external')
    return [
      {
        ...at,
        code: OPERATOR,
        message: `${node.name} – may fail whatever its inputs: nothing describes what it fails on`,
        certainty: 'may',
      },
    ]
  const failures: Failure[] = []
  for (const rule of rules) {
    const answer = answerRule(node, rule, inputs, options)
    if (answer === 'no') continue
    failures.push({
      ...at,
      code: rule.code,
      message: describeRule(node.name, rule),
      certainty: answer === 'yes' && !rule.may && inputs.propagates === 'no' ? 'always' : 'may',
      ...(rule.parameter !== undefined ? { parameter: rule.parameter } : {}),
    })
  }
  return failures
}

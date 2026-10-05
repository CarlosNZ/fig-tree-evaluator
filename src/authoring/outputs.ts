/**
 * Rule 7 of the coverage walk ("Output declarations" in
 * docs-dev/v3-specs/v3-fallback-coverage.md): what an operator node
 * returns. An operator whose `returns` is wider than what a node can return
 * declares how its inputs narrow it, in a table here for the core operators
 * and in a host's `coverage.output`; any other returns its `returns`.
 *
 * Then the result boundary: the engine refuses a NaN or infinite result at
 * every operator node. Under `numbers: 'strict'`, where a number from the
 * data may be one, a node that may return one may fail there, and what
 * passes the boundary is finite either way.
 */
import { coreOperators } from '../operators'
import type { CoverageOutput } from '../authoringTypes'
import type { OperatorNode } from '../compile/artifact'
import type { ValidatedOperatorDefinition } from '../operatorDefinition'
import type { ExpectedType } from '../typeCheck'
import {
  ANY,
  NOTHING,
  admitsNull,
  arrayOf,
  elementsOf,
  exactly,
  finite,
  fits,
  kindOf,
  mayBeNonFinite,
  ofType,
  union,
  valuesOf,
  withoutNull,
} from './known'
import type { Known, Member } from './known'
import type { Inputs } from './inputs'
import type { Failure } from './findings'

/** The core output declarations, by operator name. */
export const CORE_OUTPUTS: Record<string, CoverageOutput> = {
  if: { oneOf: [{ param: 'then' }, { param: 'else' }] },
  match: { oneOf: [{ param: 'branches' }, { param: 'default' }] },
  firstOf: { firstNonNull: 'values' },
  find: { oneOf: [{ elementOf: 'input' }, { param: 'noMatchDefault' }] },
  plus: { oneOf: [{ kindOf: 'values' }, { typeNamedBy: 'expect' }] },
  min: { elementOf: 'values' },
  max: { elementOf: 'values' },
  filter: { arrayOf: { elementOf: 'input' } },
  map: { arrayOf: { param: 'each' } },
  split: { arrayOf: 'string' },
  convert: { typeNamedBy: 'to' },
  regex: {
    byParam: 'mode',
    cases: {
      test: 'boolean',
      extract: { oneOf: ['string', { param: 'noMatchDefault' }] },
      match: { arrayOf: 'string' },
    },
  },
  floor: 'integer',
  ceil: 'integer',
}

let core: Map<ValidatedOperatorDefinition, CoverageOutput> | undefined

const outputOf = (definition: ValidatedOperatorDefinition): CoverageOutput | undefined => {
  if (definition.coverage !== undefined) return definition.coverage.output
  core ??= new Map(
    coreOperators
      .filter((built) => Object.hasOwn(CORE_OUTPUTS, built.name))
      .map((built) => [built, CORE_OUTPUTS[built.name]])
  )
  return core.get(definition)
}

const CONTAINER_LAZY = new Set(['lazyElements', 'lazyEntries', 'race'])

/** What the node's parameters are known to be, for its declaration. */
interface Received {
  definition: ValidatedOperatorDefinition
  inputs: Inputs
  /** Each `perElement` parameter's result for one element */
  elements: Record<string, Known>
}

/** The values a parameter is known to be exactly, if it is. */
const exactValues = (known: Known): unknown[] | undefined =>
  known.length > 0 && known.every((member) => 'exact' in member)
    ? known.map((member) => (member as { exact: unknown }).exact)
    : undefined

/** The members of a parameter's declared literal union, if it is one. */
const literalsOf = (received: Received, name: string): unknown[] | undefined => {
  const type = received.definition.parameters[name]?.type
  return typeof type === 'object' && 'literal' in type ? [...type.literal] : undefined
}

/** firstOf's answer: each candidate's non-null value, up to one never null. */
const firstNonNull = (known: Known): Known =>
  union(
    ...known.map((member: Member): Known => {
      const items =
        'exact' in member
          ? Array.isArray(member.exact)
            ? Array.from(member.exact, (value) => exactly(value))
            : undefined
          : member.type === 'array'
            ? member.items
            : undefined
      if (items === undefined) return union(withoutNull(elementsOf([member])), exactly(null))
      const found: Known[] = []
      for (const item of items) {
        found.push(withoutNull(item))
        if (!admitsNull(item)) return union(...found)
      }
      return union(...found, exactly(null))
    })
  )

const isType = (declared: CoverageOutput): declared is ExpectedType =>
  typeof declared === 'string' || Array.isArray(declared) || 'literal' in declared

const evaluate = (declared: CoverageOutput, received: Received): Known => {
  const { inputs } = received
  if (isType(declared)) return ofType(declared)
  if ('param' in declared) {
    const name = declared.param
    if (Object.hasOwn(received.elements, name)) return received.elements[name]
    const known = inputs.received[name] ?? NOTHING
    const evaluation = received.definition.parameters[name]?.evaluation ?? 'eager'
    return CONTAINER_LAZY.has(evaluation) ? union(elementsOf(known), valuesOf(known)) : known
  }
  if ('elementOf' in declared) return elementsOf(inputs.received[declared.elementOf] ?? NOTHING)
  if ('kindOf' in declared) return kindOf(elementsOf(inputs.received[declared.kindOf] ?? NOTHING))
  if ('arrayOf' in declared) return arrayOf([evaluate(declared.arrayOf, received)])
  if ('oneOf' in declared)
    return union(...declared.oneOf.map((option) => evaluate(option, received)))
  if ('typeNamedBy' in declared) {
    const name = declared.typeNamedBy
    const known = inputs.received[name]
    if (known === undefined) return NOTHING
    const names = exactValues(known) ?? literalsOf(received, name)
    return names === undefined
      ? ANY
      : union(
          ...names
            .filter((type) => typeof type === 'string')
            .map((type) => ofType(type as ExpectedType))
        )
  }
  if ('byParam' in declared) {
    const known = inputs.received[declared.byParam]
    const chosen = known === undefined ? undefined : exactValues(known)
    const cases = chosen ?? Object.keys(declared.cases)
    return union(
      ...cases
        .filter(
          (value): value is string =>
            typeof value === 'string' && Object.hasOwn(declared.cases, value)
        )
        .map((value) => evaluate(declared.cases[value], received))
    )
  }
  return firstNonNull(inputs.received[declared.firstNonNull] ?? NOTHING)
}

const NON_FINITE: Known = [{ type: 'nonFinite' }]

/**
 * The node's output, and its failure at the result boundary if it can have
 * one. Without a run, a null that must propagate is all the node returns.
 */
export const operatorOutput = (
  node: OperatorNode,
  inputs: Inputs,
  elements: Record<string, Known>,
  numbers: 'ordinary' | 'strict'
): { output: Known; boundary?: Failure } => {
  if (inputs.propagates === 'yes') return { output: exactly(null) }
  const { definition } = node.entry
  const declared = outputOf(definition)
  let output =
    declared !== undefined
      ? evaluate(declared, { definition, inputs, elements })
      : ofType(definition.returns)
  // A number computed from NaN or an infinity is one too: floor, round, a
  // conversion
  const fromNonFinite = Object.values(inputs.received).some(
    (known) => mayBeNonFinite(known) !== 'no'
  )
  if (fromNonFinite && fits(output, 'number') !== 'no') output = union(output, NON_FINITE)
  if (inputs.propagates === 'maybe') output = union(output, exactly(null))

  const nonFinite = mayBeNonFinite(output)
  const counted = numbers === 'strict' ? nonFinite : mayBeNonFinite(finiteExcept(output))
  const passed = finite(output)
  if (counted === 'no') return { output: passed }
  return {
    output: passed,
    boundary: {
      path: node.path,
      code: 'non-finite-result',
      message: `${node.name} – non-finite-result possible: a NaN or infinite number may reach its result`,
      certainty: passed.length === 0 && inputs.propagates === 'no' ? 'always' : 'may',
      operator: node.name,
      order: [node.order],
    },
  }
}

/**
 * Only the non-finite numbers known exactly, a constant passed through,
 * count at the ordinary level: there the data carries none.
 */
const finiteExcept = (known: Known): Known =>
  known.filter((member) => !('type' in member && member.type === 'nonFinite'))

/**
 * Rule 7 of the coverage walk ("Output declarations" in
 * docs-dev/v3-specs/v3-fallback-coverage.md): what an operator node
 * returns. An operator whose `returns` is wider than what a node can return
 * declares how its inputs narrow it, in a table here for the core operators
 * and in a host's `analysis.output`; any other returns its `returns`. A
 * declaration can bound what it returns ("Value ranges"): the arithmetic
 * itself is in ./known.ts, so a declaration names only its operation.
 *
 * Then the result boundary: the engine refuses a NaN or infinite result at
 * every operator node. Under `strictNumbers`, where a number from the data
 * may be one, a node that may return one may fail there, and what
 * passes the boundary is finite either way.
 */
import { coreOperators } from '../operators'
import type { DeclaredOutput } from '../authoringTypes'
import type { OperatorNode } from '../compile/artifact'
import type { ValidatedOperatorDefinition } from '../operatorDefinition'
import type { ExpectedType } from '../typeCheck'
import {
  ANY,
  NOTHING,
  absOf,
  admitsNull,
  arrayOf,
  bounded,
  differenceOf,
  elementsOf,
  exactValues,
  exactly,
  extremeOf,
  finite,
  fits,
  kindOf,
  mayBeNonFinite,
  ofType,
  productOf,
  sumOf,
  tupleOf,
  union,
  unionOf,
  valuesOf,
  withoutNull,
} from './known'
import type { Known, Member } from './known'
import type { Inputs } from './inputs'
import type { Failure } from './findings'

/** The core output declarations, by operator name. */
export const CORE_OUTPUTS: Record<string, DeclaredOutput> = {
  if: { oneOf: [{ param: 'then' }, { param: 'else' }] },
  match: { oneOf: [{ param: 'branches' }, { param: 'default' }] },
  firstOf: { firstNonNull: 'values' },
  find: { oneOf: [{ elementOf: 'input' }, { param: 'noMatchDefault' }] },
  plus: { oneOf: [{ sum: 'values' }, { typeNamedBy: 'expect' }] },
  subtract: { difference: ['value', 'minus'] },
  multiply: { product: 'values' },
  abs: { abs: 'value' },
  min: { min: 'values' },
  max: { max: 'values' },
  length: { type: 'integer', min: 0 },
  filter: { arrayOf: { elementOf: 'input' } },
  map: { arrayOf: { param: 'each' } },
  // An empty delimiter splits into code points, so '' gives no piece at all
  split: {
    byParam: 'delimiter',
    cases: { '': { arrayOf: 'string' } },
    otherwise: { arrayOf: 'string', minLength: 1 },
  },
  convert: { typeNamedBy: 'to' },
  regex: {
    byParam: 'mode',
    cases: {
      test: 'boolean',
      extract: { oneOf: ['string', { param: 'noMatchDefault' }] },
      match: { arrayOf: 'string' },
    },
  },
}

let core: Map<ValidatedOperatorDefinition, DeclaredOutput> | undefined

const outputOf = (definition: ValidatedOperatorDefinition): DeclaredOutput | undefined => {
  if (definition.analysis !== undefined) return definition.analysis.output
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
  /** Each one walked per element: its result for each, in order */
  items: Record<string, Known[]>
}

/** The members of a parameter's declared literal union, if it is one. */
const literalsOf = (received: Received, name: string): unknown[] | undefined => {
  const type = received.definition.parameters[name]?.type
  return typeof type === 'object' && 'literal' in type ? [...type.literal] : undefined
}

/** firstOf's answer: each candidate's non-null value, up to one never null. */
const firstNonNull = (known: Known): Known =>
  unionOf(
    known.map((member: Member): Known => {
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
        if (!admitsNull(item)) return unionOf(found)
      }
      return unionOf([...found, exactly(null)])
    })
  )

const isType = (declared: DeclaredOutput): declared is ExpectedType =>
  typeof declared === 'string' || Array.isArray(declared) || 'literal' in declared

const evaluate = (declared: DeclaredOutput, received: Received): Known => {
  const { inputs } = received
  const at = (name: string) => inputs.received[name] ?? NOTHING
  if (isType(declared)) return ofType(declared)
  if ('type' in declared) return bounded(declared)
  if ('sum' in declared) return sumOf(at(declared.sum))
  if ('product' in declared) return productOf(at(declared.product))
  if ('difference' in declared)
    return differenceOf(...(declared.difference.map(at) as [Known, Known]))
  if ('abs' in declared) return absOf(at(declared.abs))
  if ('min' in declared) return extremeOf(at(declared.min), 'min')
  if ('max' in declared) return extremeOf(at(declared.max), 'max')
  if ('param' in declared) {
    const name = declared.param
    if (Object.hasOwn(received.elements, name)) return received.elements[name]
    const known = at(name)
    const evaluation = received.definition.parameters[name]?.evaluation ?? 'eager'
    return CONTAINER_LAZY.has(evaluation) ? union(elementsOf(known), valuesOf(known)) : known
  }
  if ('elementOf' in declared) return elementsOf(at(declared.elementOf))
  if ('kindOf' in declared) return kindOf(elementsOf(at(declared.kindOf)))
  if ('arrayOf' in declared) {
    const { arrayOf: of, minLength } = declared
    // What each element gave, in order, where each was walked on its own
    const items = typeof of === 'object' && 'param' in of ? received.items[of.param] : undefined
    return items !== undefined
      ? tupleOf(items)
      : arrayOf([evaluate(of, received)], minLength ? { minLength } : {})
  }
  if ('oneOf' in declared)
    return unionOf(declared.oneOf.map((option) => evaluate(option, received)))
  if ('typeNamedBy' in declared) {
    const name = declared.typeNamedBy
    const known = inputs.received[name]
    if (known === undefined) return NOTHING
    const names = exactValues(known) ?? literalsOf(received, name)
    return names === undefined
      ? ANY
      : unionOf(
          names
            .filter((type) => typeof type === 'string')
            .map((type) => ofType(type as ExpectedType))
        )
  }
  if ('byParam' in declared) {
    const { cases, otherwise } = declared
    const known = inputs.received[declared.byParam]
    const chosen = known === undefined ? undefined : exactValues(known)
    const options = chosen?.map((value) =>
      typeof value === 'string' && Object.hasOwn(cases, value) ? cases[value] : otherwise
    ) ?? [...Object.values(cases), otherwise]
    return unionOf(
      options.map((option) => (option === undefined ? NOTHING : evaluate(option, received)))
    )
  }
  return firstNonNull(at(declared.firstNonNull))
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
  strictNumbers: boolean,
  items: Record<string, Known[]> = {}
): { output: Known; boundary?: Failure } => {
  if (inputs.propagates === 'yes') return { output: exactly(null) }
  const { definition } = node.entry
  const declared = outputOf(definition)
  let output =
    declared !== undefined
      ? evaluate(declared, { definition, inputs, elements, items })
      : ofType(definition.returns)
  // A number computed from NaN or an infinity is one too: floor, round, a
  // conversion
  const fromNonFinite = Object.values(inputs.received).some(
    (known) => mayBeNonFinite(known) !== 'no'
  )
  if (fromNonFinite && fits(output, 'number') !== 'no') output = union(output, NON_FINITE)
  if (inputs.propagates === 'maybe') output = union(output, exactly(null))
  return atBoundary(node, output, strictNumbers, inputs.propagates === 'no')
}

/**
 * What passes the result boundary, and the failure there if a non-finite
 * number can reach it: certain where nothing else can, and `certain` allows.
 */
export const atBoundary = (
  node: OperatorNode,
  output: Known,
  strictNumbers: boolean,
  certain: boolean
): { output: Known; boundary?: Failure } => {
  const nonFinite = mayBeNonFinite(output)
  const counted = strictNumbers ? nonFinite : mayBeNonFinite(finiteExcept(output))
  const passed = finite(output)
  if (counted === 'no') return { output: passed }
  return {
    output: passed,
    boundary: {
      path: node.path,
      code: 'non-finite-result',
      message: `${node.name} – non-finite-result possible: a NaN or infinite number may reach its result`,
      certainty: passed.length === 0 && certain ? 'always' : 'may',
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

/**
 * Rule 7 of the coverage walk ("Output declarations" in
 * docs-dev/v3-specs/v3-fallback-coverage.md): what an operator node
 * returns. An operator whose `returns` is wider than what a node can return
 * declares how its inputs narrow it, in a table here for the core operators
 * and in the `gamut` hook of a host's analysis (./helpers.ts); any other
 * returns its `returns`. A declaration can bound what it returns ("Value
 * ranges"): the arithmetic itself is in ./known.ts, so a declaration names
 * only its operation.
 *
 * Then the result boundary: the engine refuses a NaN result from an operator
 * declared to return a number, and nothing else. Under `strictNumbers`,
 * where a number from the data may be NaN, such a node that may return one
 * may fail there, and what passes its boundary is never NaN. An infinity
 * passes every boundary.
 */
import { coreOperators } from '../operators'
import type { OperatorNode } from '../compile/artifact'
import type { ValidatedOperatorDefinition } from '../operatorDefinition'
import { typeNamesNumber } from '../typeCheck'
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
  fits,
  kindOf,
  mayBeNaN,
  mayBeNonFinite,
  ofType,
  productOf,
  sumOf,
  tupleOf,
  union,
  unionOf,
  valuesOf,
  withoutNaN,
  withoutNull,
} from './known'
import type { Known, Member } from './known'
import type { Inputs } from './inputs'
import type { Failure } from './findings'
import { hostGamut } from './helpers'
import type { Hooked } from './helpers'

/**
 * What a core operator node returns, in terms of what its parameters
 * receive ("Output declarations" in
 * docs-dev/v3-specs/v3-fallback-coverage.md).
 */
export type DeclaredOutput =
  /** A fixed type */
  | ExpectedType
  /** A number between `min` and `max`, inclusive, where they are given */
  | { type: 'number' | 'integer'; min?: number; max?: number }
  /** A string or array at least `minLength` long (a string in code points) */
  | { type: 'string' | 'array'; minLength?: number }
  /** What that parameter receives: each element or entry of a lazy container */
  | { param: string }
  /** An element of an array parameter */
  | { elementOf: string }
  /** The types of an array parameter's elements, as a sum of them is */
  | { kindOf: string }
  | { arrayOf: DeclaredOutput; minLength?: number }
  | { oneOf: DeclaredOutput[] }
  /** The type a literal parameter names */
  | { typeNamedBy: string }
  /**
   * Chosen by a literal parameter: the case it names, else `otherwise`; all
   * of them where it is not known
   */
  | { byParam: string; cases: Record<string, DeclaredOutput>; otherwise?: DeclaredOutput }
  /** The first of an array parameter's elements that is not null */
  | { firstNonNull: string }
  /**
   * The sum of an array parameter's elements, from 0 and in order: a range
   * for numbers, the kind of anything else
   */
  | { sum: string }
  /** The product of an array parameter's numbers, from 1 and in order */
  | { product: string }
  /** One number parameter less another */
  | { difference: [string, string] }
  /** A number parameter's absolute value */
  | { abs: string }
  /** The least of an array parameter's elements: numbers by value */
  | { min: string }
  /** The greatest of an array parameter's elements: numbers by value */
  | { max: string }

/** The core output declarations, by operator name. */
export const CORE_OUTPUTS: Record<string, DeclaredOutput> = {
  if: { oneOf: [{ param: 'then' }, { param: 'else' }] },
  match: { oneOf: [{ param: 'branches' }, { param: 'default' }] },
  firstNonNull: { firstNonNull: 'values' },
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
      replace: 'string',
    },
  },
}

let core: Map<ValidatedOperatorDefinition, DeclaredOutput> | undefined

const outputOf = (definition: ValidatedOperatorDefinition): DeclaredOutput | undefined => {
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

/** Each candidate's non-null value, up to the first one never null. */
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
    const mode = received.definition.parameters[name]?.evaluationMode ?? 'eager'
    return CONTAINER_LAZY.has(mode) ? union(elementsOf(known), valuesOf(known)) : known
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

const INFINITE: Known = [{ type: 'infinite' }]
const NAN: Known = [{ type: 'nan' }]

/** The NaN or infinity a value is exactly: an infinity of either sign. */
const constantNonFinite = (known: Known): Known =>
  unionOf(
    known.map((member): Known => {
      if (!('exact' in member) || typeof member.exact !== 'number' || Number.isFinite(member.exact))
        return NOTHING
      return Number.isNaN(member.exact) ? [member] : [{ exact: Infinity }, { exact: -Infinity }]
    })
  )

/**
 * The node's output, and its failure at the result boundary if it can have
 * one: a host operator's by its `gamut` hook, where it has one. Without a
 * run, a null that must propagate is all the node returns.
 */
export const operatorOutput = (
  node: OperatorNode,
  inputs: Inputs,
  elements: Record<string, Known>,
  strictNumbers: boolean,
  items: Record<string, Known[]> = {},
  host?: Hooked
): { output: Known; boundary?: Failure } => {
  if (inputs.propagates === 'yes') return { output: exactly(null) }
  const { definition } = node.entry
  const declared = host === undefined ? outputOf(definition) : undefined
  let output =
    (host !== undefined ? hostGamut(host) : undefined) ??
    (declared !== undefined
      ? evaluate(declared, { definition, inputs, elements, items })
      : ofType(definition.returns))
  // A number computed from an infinity may be one too (floor, a sum), and
  // one from NaN is NaN, which only an `any` parameter can have received (a
  // conversion). A constant one stays a constant, of either sign for an
  // infinity, since only a constant counts at the ordinary level. NaN made
  // from infinities (Infinity - Infinity) is the overflow rules' to report
  if (fits(output, 'number') !== 'no') {
    const received = Object.values(inputs.received)
    if (received.some((known) => mayBeNonFinite(known) !== 'no')) output = union(output, INFINITE)
    if (received.some((known) => mayBeNaN(known) !== 'no')) output = union(output, NAN)
    output = unionOf([output, ...received.map(constantNonFinite)])
  }
  if (inputs.propagates === 'maybe') output = union(output, exactly(null))
  return atBoundary(node, output, strictNumbers, inputs.propagates === 'no')
}

/**
 * What passes the result boundary, and the failure there if a NaN can reach
 * it: certain where nothing else can, and `certain` allows. Only an
 * operator declared to return a number refuses one; any other hands it on.
 */
export const atBoundary = (
  node: OperatorNode,
  output: Known,
  strictNumbers: boolean,
  certain: boolean
): { output: Known; boundary?: Failure } => {
  if (!typeNamesNumber(node.entry.definition.returns)) return { output }
  const counted = mayBeNaN(strictNumbers ? output : exactOnly(output))
  const passed = withoutNaN(output)
  if (counted === 'no') return { output: passed }
  return {
    output: passed,
    boundary: {
      path: node.path,
      code: 'non-finite-result',
      message: `${node.name} – non-finite-result possible: NaN may reach its result`,
      certainty: passed.length === 0 && certain ? 'always' : 'may',
      operator: node.name,
      order: [node.order],
    },
  }
}

/**
 * Only a NaN known exactly, a constant passed through, counts at the
 * ordinary level: there the data carries none.
 */
const exactOnly = (known: Known): Known => known.filter((member) => 'exact' in member)

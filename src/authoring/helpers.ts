/**
 * What a host operator's analysis hooks are given for one node, and their
 * answers checked on the way back ("The helpers" in
 * docs-dev/v3-specs/v3-operator-coverage.md). A gamut is the walk's own
 * list under a type-only brand, so nothing is wrapped or converted: the
 * hooks receive the lists the walk holds, and what they return is checked
 * to be one before the walk reads it.
 */
import { authoredNames, toNodePath } from '../compile/artifact'
import { validateHelpers } from '../compile/helpers'
import { FigTreeError } from '../FigTreeError'
import { ErrorCodes } from '../errorCodes'
import { isPlainObject } from '../utils'
import type { FailureEntry, GamutHelpers, OperatorAnalysis } from '../authoringTypes'
import type { OperatorNode } from '../compile/artifact'
import type { ExpectedType } from '../typeCheck'
import type { Inputs } from './inputs'
import {
  NOTHING,
  any,
  arrayOf,
  elementsOf,
  exactValues,
  exactly,
  fits,
  isBelow,
  isEmpty,
  isValue,
  not,
  ofSpan,
  ofType,
  spanOf,
  tupleOf,
  unionOf,
  valuesOf,
} from './known'
import type { Answer, Known } from './known'

/** A host operator's analysis, with what its hooks are given for a node. */
export interface Hooked {
  analysis: OperatorAnalysis
  node: OperatorNode
  /** What each declared parameter receives */
  params: Record<string, Known>
  helpers: GamutHelpers
}

/** `no` if any is, `yes` if all are. */
export const all = (answers: Answer[]): Answer =>
  answers.includes('no') ? 'no' : answers.every((answer) => answer === 'yes') ? 'yes' : 'maybe'

/** Whether a parameter received anything, given or by default. */
export const presence = (inputs: Inputs, name: string): Answer =>
  inputs.received[name] === undefined ? 'no' : inputs.absent.has(name) ? 'maybe' : 'yes'

const exactValue = (known: Known | undefined): { value: unknown } | undefined =>
  known !== undefined && known.length === 1 && 'exact' in known[0]
    ? { value: known[0].exact }
    : undefined

/**
 * Whether the operator's `validate` hook refuses a parameter's value, once
 * it is known exactly. The hook is given every parameter known exactly and
 * none of the others, as the static check gives it the values known before
 * evaluation. A parameter that received nothing is never refused.
 */
export const refused = (node: OperatorNode, name: string, inputs: Inputs): Answer => {
  const { validate } = node.entry.definition
  if (validate === undefined || presence(inputs, name) === 'no') return 'no'
  if (exactValue(inputs.received[name]) === undefined) return 'maybe'
  const literals: Record<string, unknown> = {}
  for (const [parameter, known] of Object.entries(inputs.received)) {
    const exact = exactValue(known)
    if (exact !== undefined && !inputs.absent.has(parameter)) literals[parameter] = exact.value
  }
  const findings = validate(literals, validateHelpers, authoredNames(node))
  return findings.some((finding) => finding.severity === 'error' && finding.parameter === name)
    ? 'yes'
    : 'no'
}

/** Any length: an integer from 0. */
const LENGTH: Known = [{ type: 'integer', min: 0 }]

/**
 * The hooks' arguments for one node. A parameter walked once per element
 * gets a list of its own, so `arrayOf` can tell it from any other and give
 * the elements' results in order.
 */
export const hooked = (
  node: OperatorNode,
  analysis: OperatorAnalysis,
  inputs: Inputs,
  elements: Record<string, Known>,
  items: Record<string, Known[]>
): Hooked => {
  const params: Record<string, Known> = {}
  const walked = new Map<Known, Known[]>()
  for (const name of Object.keys(node.entry.definition.parameters))
    if (Object.hasOwn(items, name)) {
      const own = [...elements[name]]
      walked.set(own, items[name])
      params[name] = own
    } else
      params[name] = Object.hasOwn(elements, name)
        ? elements[name]
        : (inputs.received[name] ?? NOTHING)

  const declared = (name: string): string => {
    if (!Object.hasOwn(params, name)) throw new Error(`'${name}' is not a declared parameter`)
    return name
  }
  const helpers = {
    is: (gamut: Known, value: unknown) => {
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value))
        throw new Error('is() compares with a string, number, boolean or null')
      return isValue(gamut, value)
    },
    isType: (gamut: Known, type: ExpectedType) => (gamut.length === 0 ? 'no' : fits(gamut, type)),
    isBelow,
    isEmpty,
    refused: (name: string) => refused(node, declared(name), inputs),
    isSupplied: (name: string) => presence(inputs, declared(name)),
    all: (...answers: Answer[]) => all(answers),
    any: (...answers: Answer[]) => any(answers),
    not,
    span: spanOf,
    exactValues,
    elementOf: elementsOf,
    valueOf: valuesOf,
    lengthOf: () => LENGTH,
    type: ofType,
    exactly,
    range: ({ min = -Infinity, max = Infinity, integer = false }) => ofSpan({ min, max, integer }),
    union: (...gamuts: Known[]) => unionOf(gamuts),
    arrayOf: (of: Known, lengths?: { length?: number; minLength?: number }) => {
      const results = walked.get(of)
      return results !== undefined ? tupleOf(results) : arrayOf([of], lengths)
    },
    nothing: () => NOTHING,
  }
  return { analysis, node, params, helpers: helpers as unknown as GamutHelpers }
}

const failed = (node: OperatorNode, what: string, cause?: unknown): FigTreeError =>
  new FigTreeError({
    code: ErrorCodes.invalidDefinition,
    message: `the analysis of '${node.name}' ${what}`,
    path: toNodePath(node.path),
    operator: node.name,
    ...(cause !== undefined ? { cause } : {}),
  })

/** A hook's call: a throw is the author's bug, never a guess. */
const call = <T>(node: OperatorNode, hook: string, run: () => T): T => {
  try {
    return run()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw failed(node, `threw in its '${hook}' hook: ${reason}`, error)
  }
}

const MEMBER_TYPES = new Set<unknown>([
  'number',
  'integer',
  'string',
  'boolean',
  'null',
  'opaque',
  'nan',
  'infinite',
  'array',
  'object',
])

const isGamut = (value: unknown): value is Known =>
  Array.isArray(value) &&
  value.every(
    (member) => isPlainObject(member) && ('exact' in member || MEMBER_TYPES.has(member.type))
  )

/** What the body returns, by the `gamut` hook; `undefined` without one. */
export const hostGamut = ({ analysis, node, params, helpers }: Hooked): Known | undefined => {
  const { gamut } = analysis
  if (gamut === undefined) return undefined
  const result: unknown = call(node, 'gamut', () => gamut(params as never, helpers))
  if (!isGamut(result)) throw failed(node, "returned something other than a gamut from 'gamut'")
  return result
}

const ANSWERS = new Set<unknown>(['no', 'maybe', 'yes'])

/**
 * The body's own failures, by the `failures` hook or list; `external`
 * without one.
 */
export const hostEntries = ({
  analysis,
  node,
  params,
  helpers,
}: Hooked): readonly FailureEntry[] | 'external' => {
  const { failures } = analysis
  if (failures === undefined) return 'external'
  const entries: unknown =
    typeof failures === 'function'
      ? call(node, 'failures', () => failures(params as never, helpers))
      : failures
  if (
    !Array.isArray(entries) ||
    !entries.every(
      (entry) =>
        isPlainObject(entry) &&
        typeof entry.code === 'string' &&
        entry.code !== '' &&
        (entry.occurs === undefined || ANSWERS.has(entry.occurs)) &&
        (entry.parameter === undefined || Object.hasOwn(params, entry.parameter as string))
    )
  )
    throw failed(
      node,
      "gave 'failures' that are not a list of entries, each with a code, an answer and a declared parameter"
    )
  return entries
}

/**
 * Reading an object the way the compiler does ("What the walk visits" in
 * docs-dev/v3-specs/v3-format.md), into one neutral shape whichever form it
 * was written in, so each writer turns that shape into its own form.
 *
 * The decision order is the compiler's own (`classifyObject`), and each
 * malformation the compiler reports as an error is thrown here, with the
 * compiler's code: a node the compiler can't read has no form to convert
 * to. Problems that don't touch the form (types, missing parameters, scope)
 * are `validate()`'s to report.
 */
import {
  SHORTHAND_SIBLINGS,
  classifyObject,
  positionalToNamed,
  singlePositionalTarget,
  type PositionalShape,
} from '../compile/grammar'
import { recognizeReference } from '../compile/references'
import { ErrorCodes } from '../errorCodes'
import { RESERVED_NODE_KEYS } from '../names'
import { isPlainDataObject } from '../utils'
import type { Registry } from '../formatTypes'

/** What the conversions know of an operator: its names and positions. */
export interface OperatorShape extends PositionalShape {
  name: string
  alias?: string
}

/** A registry's names, gathered once per conversion, before the walk. */
export interface Lookup {
  /** Canonical names and aliases alike: they share one namespace. */
  operators: Map<string, OperatorShape>
  fragments: Set<string>
  /** Does a `$name` key invoke `literal`, an operator or a fragment? */
  recognizes: (name: string) => boolean
}

export const buildLookup = (fig: Registry): Lookup => {
  const operators = new Map<string, OperatorShape>()
  for (const { name, alias, positionalParams, restParam } of fig.getOperators()) {
    const shape: OperatorShape = { name, alias, positionalParams, restParam }
    operators.set(name, shape)
    if (alias !== undefined) operators.set(alias, shape)
  }
  const fragments = new Set(fig.getFragments().map(({ name }) => name))
  return {
    operators,
    fragments,
    recognizes: (name) => name === 'literal' || operators.has(name) || fragments.has(name),
  }
}

/** Would this value classify as a node? The compiler's test, over a Lookup. */
export const classifiesAsNode = (lookup: Lookup, value: unknown): boolean => {
  if (!isPlainDataObject(value)) return false
  if ('operator' in value || 'fragment' in value) return true
  for (const key in value) if (key.startsWith('$') && lookup.recognizes(key.slice(1))) return true
  return false
}

/**
 * A node's own keys, in the order they were written. `invocation` is the
 * `operator`, `fragment` or `$name` key. A `param` is a key the canonical
 * form writes in place: a parameter, a call's `parameters`, a literal's
 * `value`. A `keep` is a modifier or `//`, which every form keeps in place.
 */
export type Slot =
  | { kind: 'invocation' }
  | { kind: 'param'; name: string; value: unknown }
  | { kind: 'keep'; key: string; value: unknown }

export type KeepSlot = Extract<Slot, { kind: 'keep' }>

export interface OperatorRead {
  kind: 'operator'
  operator: OperatorShape
  /** The name as written: a canonical name or an alias. */
  spelling: string
  slots: Slot[]
  /**
   * Every parameter, in the order written: a canonical node's keys, or a
   * payload's order. A named payload's `//` rides here as `['//', comment]`,
   * since the payload is the node's own parameter list.
   */
  params: [string, unknown][]
  /** The parameters came from a shorthand payload, not from `param` slots. */
  fromPayload: boolean
}

export interface FragmentRead {
  kind: 'fragment'
  name: string
  slots: Slot[]
  /** `undefined` when the call has none: a zero-argument call. */
  parameters: unknown
  fromPayload: boolean
}

export interface LiteralRead {
  kind: 'literal'
  content: unknown
  slots: Slot[]
  fromPayload: boolean
}

export type NodeRead = OperatorRead | FragmentRead | LiteralRead | { kind: 'plain' }

/** Stops the conversion at a malformed node, with the compiler's code. */
export type Fail = (code: string, message: string) => never

/** The modifiers every node form carries beside its invocation. */
const MODIFIERS = new Set(['fallback', 'useCache', 'vars'])

export const readNode = (raw: Record<string, unknown>, lookup: Lookup, fail: Fail): NodeRead => {
  const classified = classifyObject(raw, lookup.recognizes)
  switch (classified.kind) {
    case 'malformed':
      return fail(classified.code, classified.message)
    case 'plain':
      return classified
    case 'operator':
      return readCanonicalOperator(raw, lookup, fail)
    case 'fragment':
      return readCanonicalFragment(raw, lookup, fail)
    case 'shorthand':
      return readShorthand(raw, classified.key, lookup, fail)
  }
}

const readCanonicalOperator = (
  raw: Record<string, unknown>,
  lookup: Lookup,
  fail: Fail
): OperatorRead | LiteralRead => {
  const spelling = raw.operator
  if (typeof spelling !== 'string')
    return fail(ErrorCodes.malformedNode, "the 'operator' value must be a literal string")
  if (spelling === 'literal') return readCanonicalLiteral(raw, fail)
  const operator = lookup.operators.get(spelling)
  if (operator === undefined)
    return fail(ErrorCodes.unknownOperator, `'${spelling}' names no registered operator`)

  const slots: Slot[] = []
  const params: [string, unknown][] = []
  for (const key in raw) {
    const value = raw[key]
    if (value === undefined) continue
    if (key === 'operator') slots.push({ kind: 'invocation' })
    else if (key === '//' || MODIFIERS.has(key)) slots.push({ kind: 'keep', key, value })
    else if (key === 'parameters')
      return fail(ErrorCodes.malformedNode, "'parameters' is reserved and unused on operator nodes")
    else {
      // An unknown key is carried as a parameter: the named form reads it
      // exactly as the canonical node does
      slots.push({ kind: 'param', name: key, value })
      params.push([key, value])
    }
  }
  return { kind: 'operator', operator, spelling, slots, params, fromPayload: false }
}

const readCanonicalLiteral = (raw: Record<string, unknown>, fail: Fail): LiteralRead => {
  if (!('value' in raw))
    return fail(ErrorCodes.malformedNode, "'literal' requires its content in 'value'")
  const slots: Slot[] = []
  for (const key in raw) {
    const value = raw[key]
    if (key === 'operator') slots.push({ kind: 'invocation' })
    else if (key === 'value') slots.push({ kind: 'param', name: 'value', value })
    else if (value === undefined) continue
    else if (key === '//' || MODIFIERS.has(key)) slots.push({ kind: 'keep', key, value })
    else
      return fail(
        ErrorCodes.unknownNodeKey,
        `'${key}' is not a key of 'literal' — content goes in 'value'`
      )
  }
  return { kind: 'literal', content: raw.value, slots, fromPayload: false }
}

const readCanonicalFragment = (
  raw: Record<string, unknown>,
  lookup: Lookup,
  fail: Fail
): FragmentRead => {
  const name = raw.fragment
  if (typeof name !== 'string')
    return fail(ErrorCodes.malformedNode, "the 'fragment' value must be a literal string")
  if (!lookup.fragments.has(name))
    return fail(ErrorCodes.unknownFragment, `'${name}' names no registered fragment`)

  const slots: Slot[] = []
  for (const key in raw) {
    const value = raw[key]
    if (value === undefined) continue
    if (key === 'fragment') slots.push({ kind: 'invocation' })
    else if (key === 'parameters') {
      checkFragmentParameters(value, lookup, fail)
      slots.push({ kind: 'param', name: key, value })
    } else if (key === '//' || key === 'fallback' || key === 'vars')
      slots.push({ kind: 'keep', key, value })
    else if (key === 'useCache')
      return fail(
        ErrorCodes.malformedNode,
        "'useCache' is not available on fragment calls — caching stays operator-level"
      )
    else
      return fail(
        ErrorCodes.unknownNodeKey,
        `'${key}' is not a key of a fragment call — arguments live only in 'parameters'`
      )
  }
  const parameters = raw.parameters
  return { kind: 'fragment', name, slots, parameters, fromPayload: false }
}

/**
 * A call's `parameters`: a named-arguments object, or a node or reference
 * computing one.
 */
const checkFragmentParameters = (value: unknown, lookup: Lookup, fail: Fail) => {
  if (isPlainDataObject(value) || classifiesAsNode(lookup, value)) return
  if (typeof value === 'string' && recognizeReference(value).kind === 'reference') return
  fail(
    ErrorCodes.malformedNode,
    "a fragment's 'parameters' must be a named-arguments object or a node computing one"
  )
}

const readShorthand = (
  raw: Record<string, unknown>,
  shorthandKey: string,
  lookup: Lookup,
  fail: Fail
): NodeRead => {
  const name = shorthandKey.slice(1)
  const isLiteral = name === 'literal'
  const isFragment = !isLiteral && lookup.fragments.has(name)

  const slots: Slot[] = []
  for (const key in raw) {
    const value = raw[key]
    if (key === shorthandKey) {
      slots.push({ kind: 'invocation' })
      continue
    }
    // The sibling rule: reserved modifiers only
    if (!SHORTHAND_SIBLINGS.has(key) || (isFragment && key === 'useCache'))
      return fail(
        ErrorCodes.malformedNode,
        `'${key}' may not sit beside the shorthand key '${shorthandKey}' — reserved modifiers only`
      )
    if (value !== undefined) slots.push({ kind: 'keep', key, value })
  }

  const payload = raw[shorthandKey]
  if (isLiteral) return { kind: 'literal', content: payload, slots, fromPayload: true }
  if (isFragment) {
    if (!isPlainDataObject(payload))
      return fail(
        ErrorCodes.malformedNode,
        `fragments have no single-value or positional form — '${shorthandKey}' takes a named-arguments object`
      )
    return { kind: 'fragment', name, slots, parameters: payload, fromPayload: true }
  }

  const operator = lookup.operators.get(name)!
  const params = readPayload(operator, payload, lookup, fail)
  return { kind: 'operator', operator, spelling: name, slots, params, fromPayload: true }
}

/** A shorthand payload, disambiguated by JSON type as the compiler does. */
const readPayload = (
  operator: OperatorShape,
  payload: unknown,
  lookup: Lookup,
  fail: Fail
): [string, unknown][] => {
  const noPositional = () =>
    fail(
      ErrorCodes.positionalArity,
      `'${operator.name}' takes no positional arguments — use the named form`
    )

  if (Array.isArray(payload)) {
    const named = positionalToNamed(operator, payload)
    if (named !== null) return named
    if (operator.positionalParams === undefined) return noPositional()
    const positional = operator.positionalParams
    return fail(
      ErrorCodes.positionalArity,
      `'${operator.name}' takes at most ${positional.length} positional argument${
        positional.length === 1 ? '' : 's'
      } (${positional.join(', ')}), got ${payload.length}`
    )
  }

  // A plain object that isn't a node is named arguments; parameter names
  // can't start with `$`, and `operator` / `fragment` are reserved
  if (isPlainDataObject(payload) && !classifiesAsNode(lookup, payload)) {
    const params: [string, unknown][] = []
    for (const key in payload) {
      const value = payload[key]
      if (value === undefined) continue
      // A reserved key spread onto the canonical node would become a live
      // modifier, where the compiler reads it here as an unknown parameter
      if (key !== '//' && RESERVED_NODE_KEYS.has(key))
        return fail(ErrorCodes.unknownNodeKey, `'${key}' is not a parameter of '${operator.name}'`)
      params.push([key, value])
    }
    return params
  }

  const target = singlePositionalTarget(operator)
  if (target === null) return noPositional()
  return [[target, payload]]
}

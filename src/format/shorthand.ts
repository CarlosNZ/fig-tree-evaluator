/**
 * The shorthand writer ("`toShorthand`" and "Choosing the payload" in
 * docs-dev/v3-specs/v3-format.md): every node as `{ $name: payload }`, with
 * its modifiers beside it. A node already in shorthand is re-rendered from
 * its parameters, so the result depends only on what the node means, which
 * is what makes the conversion idempotent.
 */
import { isPlainDataObject } from '../utils'
import type { ShorthandOptions } from '../formatTypes'
import { classifiesAsNode } from '../compile/grammar'
import type { Lookup, OperatorRead, OperatorShape } from './read'
import { paramsToReference, respell } from './references'
import {
  hasNodeComment,
  mergeComments,
  payloadComment,
  spellOperator,
  type Walk,
  type Writer,
} from './walk'

type Payload =
  { kind: 'named' } | { kind: 'array'; value: unknown[] } | { kind: 'single'; value: unknown }

const NAMED: Payload = { kind: 'named' }

/**
 * Can this value stand alone as a payload and read back as one value? An
 * array would read as positional arguments, and a plain object that isn't
 * a node as named ones.
 */
const standsAlone = (value: unknown, lookup: Lookup): boolean =>
  !Array.isArray(value) &&
  !(isPlainDataObject(value) && !classifiesAsNode(value, lookup.recognizes))

/**
 * The positional form wherever it reads back as the same parameters, and
 * the named form otherwise. `params` are the converted values, comment
 * excluded.
 */
const choosePayload = (
  operator: OperatorShape,
  params: [string, unknown][],
  lookup: Lookup
): Payload => {
  const positional = operator.positionalParams
  // No parameters takes the named form: an empty array binds an empty rest
  if (positional === undefined || params.length === 0) return NAMED
  const rest = operator.restParam
  const leading = rest === null ? positional : positional.slice(0, -1)
  const supplied = new Map(params)

  // Every supplied parameter has a position
  for (const name of supplied.keys()) if (name !== rest && !leading.includes(name)) return NAMED
  // The leading ones form an unbroken prefix: a gap can't be filled, since
  // `null` isn't "not supplied"
  let bound = 0
  while (bound < leading.length && supplied.has(leading[bound])) bound++
  for (let i = bound; i < leading.length; i++) if (supplied.has(leading[i])) return NAMED
  // An array payload that fills the leading positions always binds the
  // rest, and one that doesn't never does
  const restBound = rest !== null && supplied.has(rest)
  if (rest !== null && restBound !== (bound === leading.length)) return NAMED

  const lead = leading.slice(0, bound).map((name) => supplied.get(name))
  if (restBound) {
    const value = supplied.get(rest!)
    // A spread rest is never collapsed: `{ $plus: 5 }` would bind values: 5
    if (Array.isArray(value)) return { kind: 'array', value: [...lead, ...value] }
    // A computed rest binds unchanged as the single value
    if (leading.length === 0 && standsAlone(value, lookup)) return { kind: 'single', value }
    return NAMED
  }
  if (bound === 1 && standsAlone(lead[0], lookup)) return { kind: 'single', value: lead[0] }
  return { kind: 'array', value: lead }
}

export const shorthandWriter = (options: ShorthandOptions = {}): Writer => {
  const operatorNames = options.operatorNames ?? 'preserve'
  const referenceNames = options.referenceNames ?? 'preserve'
  const named = options.arguments === 'named'
  const getAsReference = options.getAsReference ?? true

  const operator = (read: OperatorRead, walk: Walk): unknown => {
    const converted: [string, unknown][] = read.params.map(([name, value]) => [
      name,
      name === '//' ? value : walk.child(value, name),
    ])
    const params = converted.filter(([name]) => name !== '//')

    // A get becomes its reference wherever a string can carry it: no
    // modifier beside it, though a comment is dropped
    if (getAsReference && read.operator.name === 'get') {
      const modified = read.slots.some((slot) => slot.kind === 'keep' && slot.key !== '//')
      const reference = modified ? null : paramsToReference(new Map(params), referenceNames)
      if (reference !== null) return reference
    }

    const payload = named ? NAMED : choosePayload(read.operator, params, walk.lookup)
    // A payload comment stays in a named payload, and otherwise moves to
    // the node, just before the invocation, or joins the node's own
    const moved = payload.kind === 'named' ? undefined : payloadComment(read)
    const joins = moved !== undefined && hasNodeComment(read)
    const node: Record<string, unknown> = {}
    for (const slot of read.slots) {
      if (slot.kind === 'invocation') {
        if (moved !== undefined && !joins) node['//'] = moved
        node[`$${spellOperator(read, operatorNames)}`] =
          payload.kind === 'named' ? Object.fromEntries(converted) : payload.value
      } else if (slot.kind === 'keep')
        node[slot.key] =
          slot.key === '//' && joins ? mergeComments(slot.value, moved) : walk.keep(slot)
    }
    return node
  }

  return {
    operator,

    fragment: (read, walk) => {
      const parameters = read.parameters === undefined ? {} : walk.parameters(read.parameters)
      // The shorthand payload has to be an object, so a call whose arguments
      // are a reference, as written or as converted, stays canonical
      const canonical = typeof parameters === 'string'
      const node: Record<string, unknown> = {}
      for (const slot of read.slots) {
        if (slot.kind === 'invocation') {
          if (!canonical) node[`$${read.name}`] = parameters
          else {
            node.fragment = read.name
            if (read.fromPayload) node.parameters = parameters
          }
        } else if (slot.kind === 'param') {
          if (canonical) node.parameters = parameters
        } else node[slot.key] = walk.keep(slot)
      }
      return node
    },

    literal: (read, walk) => {
      const node: Record<string, unknown> = {}
      for (const slot of read.slots) {
        if (slot.kind === 'invocation') node.$literal = read.content
        else if (slot.kind === 'keep') node[slot.key] = walk.keep(slot)
      }
      return node
    },

    string: (value) => respell(value, referenceNames),
  }
}

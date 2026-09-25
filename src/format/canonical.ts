/**
 * The canonical writer ("`toCanonical`" in docs-dev/v3-specs/v3-format.md):
 * every node as `operator` / `fragment` with named parameters, and nothing
 * else changed. A node already canonical keeps its keys where they are; a
 * shorthand node's parameters follow `operator` directly, in the payload's
 * order. "Full" is a form, not a completion: only what was written appears.
 */
import type { CanonicalOptions } from '../formatTypes'
import { referenceToGet, respell } from './references'
import type { FragmentRead, LiteralRead, OperatorRead } from './read'
import {
  hasNodeComment,
  mergeComments,
  payloadComment,
  spellOperator,
  type Walk,
  type Writer,
} from './walk'

export const canonicalWriter = (options: CanonicalOptions = {}): Writer => {
  const operatorNames = options.operatorNames ?? 'preserve'
  const referenceNames = options.referenceNames ?? 'preserve'
  const referencesAsGet = options.referencesAsGet ?? false

  return {
    operator: (read: OperatorRead, walk: Walk) => {
      const node: Record<string, unknown> = {}
      // A comment in a named payload has no payload to stay in: it moves to
      // the node, just before the invocation, or joins the node's own
      const moved = read.fromPayload ? payloadComment(read) : undefined
      const joins = moved !== undefined && hasNodeComment(read)
      for (const slot of read.slots) {
        if (slot.kind === 'invocation') {
          if (moved !== undefined && !joins) node['//'] = moved
          node.operator = spellOperator(read, operatorNames)
          if (read.fromPayload)
            for (const [name, value] of read.params)
              if (name !== '//') node[name] = walk.child(value, name)
        } else if (slot.kind === 'param') node[slot.name] = walk.child(slot.value, slot.name)
        else if (slot.key === '//' && joins) node['//'] = mergeComments(slot.value, moved)
        else node[slot.key] = walk.keep(slot)
      }
      return node
    },

    fragment: (read: FragmentRead, walk: Walk) => {
      const node: Record<string, unknown> = {}
      for (const slot of read.slots) {
        if (slot.kind === 'invocation') {
          node.fragment = read.name
          // `{ $frag: {} }` keeps its empty map: a place to add arguments
          if (read.fromPayload) node.parameters = walk.parameters(read.parameters)
        } else if (slot.kind === 'param') node.parameters = walk.parameters(slot.value)
        else node[slot.key] = walk.keep(slot)
      }
      return node
    },

    literal: (read: LiteralRead, walk: Walk) => {
      const node: Record<string, unknown> = {}
      for (const slot of read.slots) {
        if (slot.kind === 'invocation') {
          node.operator = 'literal'
          if (read.fromPayload) node.value = read.content
        } else if (slot.kind === 'param') node.value = read.content
        else node[slot.key] = walk.keep(slot)
      }
      return node
    },

    string: (value: string) => {
      if (referencesAsGet) {
        const get = referenceToGet(value, referenceNames)
        if (get !== null) return get
      }
      return respell(value, referenceNames)
    },
  }
}

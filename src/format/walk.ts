/**
 * The recursion both conversions share ("What the walk visits" in
 * docs-dev/v3-specs/v3-format.md): it visits exactly what the compiler
 * walks, reads each object into its neutral shape, and hands every node to
 * a writer, which decides the node's form and converts its children back
 * through here.
 *
 * Nothing passes back up but the converted value. A comment that leaves a
 * named payload is part of its own node's read (src/format/read.ts), so the
 * node's writer places it.
 *
 * The walk never mutates: every container it passes through is rebuilt.
 */
import { DEPTH_CEILING } from '../compile/grammar'
import { ErrorCodes } from '../errorCodes'
import { FigTreeError } from '../FigTreeError'
import { isPlainDataObject } from '../utils'
import {
  classifiesAsNode,
  readNode,
  type FragmentRead,
  type KeepSlot,
  type LiteralRead,
  type Lookup,
  type OperatorRead,
  type Slot,
} from './read'
import type { Spelling } from '../formatTypes'

export interface Writer {
  operator(read: OperatorRead, walk: Walk): unknown
  fragment(read: FragmentRead, walk: Walk): unknown
  literal(read: LiteralRead, walk: Walk): unknown
  string(value: string): unknown
}

/** Where the walk is, as its parent's location plus a key: O(1) to extend. */
type Path = { readonly parent: Path; readonly key: string | number } | null

const toArray = (path: Path): (string | number)[] => {
  const keys: (string | number)[] = []
  for (let link = path; link !== null; link = link.parent) keys.push(link.key)
  return keys.reverse()
}

export class Walk {
  private path: Path = null
  private depth = 0

  constructor(
    readonly lookup: Lookup,
    private readonly writer: Writer
  ) {}

  /** Stops the conversion at the current node, with the compiler's code. */
  readonly fail = (code: string, message: string): never => {
    throw new FigTreeError({ code, message, path: toArray(this.path) })
  }

  /** Convert a value one level below the current one, at `key`. */
  child(value: unknown, key: string | number): unknown {
    return this.within(key, () => this.value(value))
  }

  /** Run `convert` one level below the current location, at `key`. */
  private within<T>(key: string | number, convert: () => T): T {
    const { path, depth } = this
    this.path = { parent: path, key }
    this.depth = depth + 1
    const converted = convert()
    this.path = path
    this.depth = depth
    return converted
  }

  /** Convert a value at the current location. */
  value(value: unknown): unknown {
    if (this.depth > DEPTH_CEILING)
      this.fail(
        ErrorCodes.depthCeiling,
        `the expression nests deeper than the engine's ceiling of ${DEPTH_CEILING} levels`
      )
    if (typeof value === 'string') return this.writer.string(value)
    if (Array.isArray(value)) return value.map((element, i) => this.child(element, i))
    if (!isPlainDataObject(value)) return value

    const read = readNode(value, this.lookup, this.fail)
    switch (read.kind) {
      case 'plain':
        return this.entries(value, true)
      case 'operator':
        return this.writer.operator(read, this)
      case 'fragment':
        return this.writer.fragment(read, this)
      case 'literal':
        return this.writer.literal(read, this)
    }
  }

  /** A modifier or comment, which every form keeps where it was written. */
  keep({ key, value }: KeepSlot): unknown {
    if (key === 'fallback') return this.child(value, key)
    if (key === 'vars') return this.vars(value)
    return value
  }

  /**
   * A fragment call's `parameters`: a named-arguments map walks its values,
   * and a node or reference computing one is walked whole.
   */
  parameters(value: unknown): unknown {
    if (!isPlainDataObject(value) || classifiesAsNode(this.lookup, value))
      return this.child(value, 'parameters')
    return this.within('parameters', () => this.entries(value, false))
  }

  /**
   * An object's values walked, `//` copied untouched. On a plain object a
   * `vars` key is a vars block; in a vars block or an arguments map, every
   * key is an ordinary name.
   */
  private entries(raw: Record<string, unknown>, varsBlock: boolean): Record<string, unknown> {
    const converted: Record<string, unknown> = {}
    for (const key in raw) {
      const value = raw[key]
      if (key === '//') converted[key] = value
      else if (varsBlock && key === 'vars') converted[key] = this.vars(value)
      else converted[key] = this.child(value, key)
    }
    return converted
  }

  /**
   * A `vars` block: names mapping to expressions. The block itself is never
   * classified, so a `$name` key in it stays a (misspelled) var name rather
   * than becoming an invocation.
   */
  private vars(value: unknown): unknown {
    if (!isPlainDataObject(value)) return value
    return this.within('vars', () => this.entries(value, false))
  }
}

/** An operator's name in the requested spelling; `preserve` keeps it. */
export const spellOperator = (read: OperatorRead, spelling: Spelling): string => {
  if (spelling === 'canonical') return read.operator.name
  if (spelling === 'alias') return read.operator.alias ?? read.operator.name
  return read.spelling
}

const asArray = (comment: unknown): unknown[] => (Array.isArray(comment) ? comment : [comment])

/**
 * A node's own comment joined by one that left its payload. Either may
 * already be an array, and a comment is never more than one level deep.
 */
export const mergeComments = (node: unknown, payload: unknown): unknown[] => [
  ...asArray(node),
  ...asArray(payload),
]

/** The comment a named payload carried, which leaves it in most forms. */
export const payloadComment = (read: OperatorRead): unknown =>
  read.params.find(([name]) => name === '//')?.[1]

/** Does the node carry a comment of its own, beside its invocation? */
export const hasNodeComment = (read: { slots: Slot[] }): boolean =>
  read.slots.some((slot) => slot.kind === 'keep' && slot.key === '//')

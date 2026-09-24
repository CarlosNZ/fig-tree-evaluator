/**
 * v2's positional form, `children`, as the named parameters it became
 * ("`children.ts`" in docs-dev/v3-specs/v3-converter.md). v2 did it with a
 * `parseChildren` function per operator, 13 distinct ones; they are
 * restated as data, with functions only for the five whose shape is
 * irregular. test/migrate-table.test.ts holds each mapping to the v2
 * package's own function.
 *
 * A mapping gives exactly the parameters v2's function set, including those
 * it set to `undefined` for a missing child, since v2 spread them over the
 * node and so overrode any parameter of the same name the node gave. Where
 * v2's function threw, on a shape v2 could never evaluate, a mapping pairs
 * what it can and never throws.
 */
import type { V2Operator } from './operators.generated'

export type ChildrenMapping =
  /** Every child into one parameter, so a computed `children` converts too */
  | { into: string }
  | {
      /** Set from the children in order, `undefined` where there is none */
      positions: readonly string[]
      /** The children after the positions */
      rest?: string
      /** What a position takes when its child is missing */
      defaults?: Readonly<Record<string, unknown>>
      /** One more position, set only when its child is given */
      ifGiven?: string
    }
  | ((children: readonly unknown[]) => Record<string, unknown>)

const isPlainObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * MATCH: the value to match, then alternating branch keys and values. v2
 * threw on an odd count or a key that was not a string, number or boolean;
 * here such a pair is skipped.
 */
const matchChildren = (children: readonly unknown[]) => {
  const [matchExpression, ...elements] = children
  const branches: Record<string, unknown> = {}
  for (let i = 0; i + 1 < elements.length; i += 2) {
    const key = elements[i]
    if (typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean')
      branches[String(key)] = elements[i + 1]
  }
  return { matchExpression, branches }
}

/**
 * BUILD_OBJECT: all objects are the properties as they are; otherwise the
 * children alternate keys and values. v2 threw on an odd count; here the
 * last key gets an entry with no `value`, which v2 would have skipped.
 */
const buildObjectChildren = (children: readonly unknown[]) => {
  if (children.every(isPlainObject)) return { properties: children }
  const properties: { key: unknown; value?: unknown }[] = []
  for (let i = 0; i < children.length; i += 2)
    properties.push(
      i + 1 < children.length ? { key: children[i], value: children[i + 1] } : { key: children[i] }
    )
  return { properties }
}

/**
 * GET, POST and GRAPHQL: leading positions, then an array of field names (a
 * single name standing for one), then that many values zipped into an
 * object, then an optional last value for the return property. A missing
 * `url` is `''`, in all three.
 */
const fieldsChildren =
  (positions: readonly string[], fields: string, returned: string) =>
  (children: readonly unknown[]) => {
    const output: Record<string, unknown> = {}
    positions.forEach((name, index) => {
      const child = children[index]
      output[name] = child === undefined && name === 'url' ? '' : child
    })
    const fieldNames = children[positions.length]
    const rest = children.slice(positions.length + 1)
    const keys = Array.isArray(fieldNames) ? fieldNames : [fieldNames]
    output[fields] = Object.fromEntries(keys.map((key, index) => [key, rest[index]]))
    if (rest.length > keys.length) output[returned] = rest[rest.length - 1]
    return output
  }

/** PASSTHRU: one child is the value; several, or none, are an array. */
const passThruChildren = (children: readonly unknown[]) => ({
  value: children.length === 1 ? children[0] : [...children],
})

export const V2_CHILDREN: Record<V2Operator, ChildrenMapping> = {
  AND: { into: 'values' },
  OR: { into: 'values' },
  EQUAL: { into: 'values' },
  NOT_EQUAL: { into: 'values' },
  PLUS: { into: 'values' },
  SUBTRACT: { into: 'values' },
  MULTIPLY: { into: 'values' },
  DIVIDE: { into: 'values' },
  GREATER_THAN: { into: 'values' },
  LESS_THAN: { into: 'values' },
  COUNT: { into: 'values' },
  CONDITIONAL: { positions: ['condition', 'valueIfTrue', 'valueIfFalse'] },
  REGEX: { positions: ['testString', 'pattern'] },
  SPLIT: { positions: ['value', 'delimiter'], defaults: { delimiter: ' ' } },
  // The second child is the node's fallback
  OBJECT_PROPERTIES: { positions: ['property'], ifGiven: 'fallback' },
  STRING_SUBSTITUTION: { positions: ['string'], rest: 'substitutions' },
  SQL: { positions: ['query'], rest: 'values' },
  CUSTOM_FUNCTIONS: { positions: ['functionName'], rest: 'args' },
  MATCH: matchChildren,
  BUILD_OBJECT: buildObjectChildren,
  GET: fieldsChildren(['url'], 'parameters', 'returnProperty'),
  POST: fieldsChildren(['url'], 'parameters', 'returnProperty'),
  GRAPHQL: fieldsChildren(['query', 'url'], 'variables', 'returnNode'),
  PASSTHRU: passThruChildren,
}

/**
 * The named parameters a literal `children` array gives an operator. A key
 * whose value is `undefined` is one v2 set to `undefined`, overriding the
 * node's own parameter of that name.
 */
export const mapChildren = (
  operator: V2Operator,
  children: readonly unknown[]
): Record<string, unknown> => {
  const mapping = V2_CHILDREN[operator]
  if (typeof mapping === 'function') return mapping(children)
  if ('into' in mapping) return { [mapping.into]: children }

  const { positions, rest, defaults = {}, ifGiven } = mapping
  const output: Record<string, unknown> = {}
  positions.forEach((name, index) => {
    const child = children[index]
    output[name] = child === undefined && Object.hasOwn(defaults, name) ? defaults[name] : child
  })
  if (rest !== undefined) output[rest] = children.slice(positions.length)
  if (ifGiven !== undefined && children[positions.length] !== undefined)
    output[ifGiven] = children[positions.length]
  return output
}

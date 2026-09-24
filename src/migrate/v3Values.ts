/**
 * The v3 values the converter writes, and reads back from the parts it has
 * already converted: nodes, references and quoted constants. The converter
 * imports nothing from the engine at runtime, so it restates what it needs
 * of v3's grammar ("Node grammar & reserved keys" and "References &
 * scoping" in docs-dev/v3-specs/v3-api.md).
 */

export type PlainObject = Record<string, unknown>

export const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// v3's reference token rule: a namespace, whole or followed by `.` or `[`
export const V3_REFERENCE = /^\$(?:data|d|vars|v|params|p|element|e|index|i)(?:$|[.[])/

// The references that can be drilled further: all but `$index`
export const DRILLABLE = /^\$(?:data|d|vars|v|params|p|element|e)(?:$|[.[])/

// A `$data` reference, whole or drilled
export const DATA_REFERENCE = /^\$(?:data|d)(?:$|[.[])/

export const literal = (value: unknown, note?: string) => ({
  ...(note !== undefined && { '//': note }),
  operator: 'literal',
  value,
})

export const isLiteral = (value: unknown): value is { operator: 'literal'; value: unknown } =>
  isPlainObject(value) && value.operator === 'literal'

/** A quoted constant's value, or the value itself */
export const unquote = (value: unknown): unknown => (isLiteral(value) ? value.value : value)

// The keys that may sit beside a shorthand node's `$` key
const MODIFIER_KEYS = ['//', 'fallback', 'useCache', 'vars']

/**
 * A v3 node: an operator node, a fragment call, or a call on a custom
 * operator in shorthand, which is the one place the converter writes a `$`
 * key. As in v3, shorthand is one `$` key with only modifiers beside it.
 */
export const isNode = (value: unknown): boolean => {
  if (!isPlainObject(value)) return false
  if (Object.hasOwn(value, 'operator') || Object.hasOwn(value, 'fragment')) return true
  const keys = Object.keys(value).filter((key) => !MODIFIER_KEYS.includes(key))
  return keys.length === 1 && keys[0].startsWith('$')
}

/**
 * Whether v3 works a value out at evaluation: a node or a reference. A
 * `literal` quotes a constant.
 */
export const isComputed = (value: unknown): boolean =>
  typeof value === 'string' ? V3_REFERENCE.test(value) : isNode(value) && !isLiteral(value)

/** Whether anything inside a value is computed */
export const hasComputed = (value: unknown): boolean => {
  if (isComputed(value)) return true
  if (Array.isArray(value)) return value.some(hasComputed)
  return isPlainObject(value) && !isLiteral(value) && Object.values(value).some(hasComputed)
}

/**
 * Whether v3 would read a value v2 took as data differently: it holds a node,
 * a `$` key, a `vars` or `//` key, or a reference ("The `literal` wrap")
 */
export const needsQuote = (value: unknown): boolean => {
  if (typeof value === 'string') return V3_REFERENCE.test(value)
  if (Array.isArray(value)) return value.some(needsQuote)
  if (!isPlainObject(value)) return false
  return Object.entries(value).some(
    ([key, element]) =>
      key === 'operator' ||
      key === 'fragment' ||
      key.startsWith('$') ||
      key === 'vars' ||
      key === '//' ||
      needsQuote(element)
  )
}

/** A value v2 took as data, quoted where v3 would read it differently */
export const quoted = (value: unknown) => (needsQuote(value) ? literal(value) : value)

/** A value as a message shows it: `'text'`, `[1,2]` */
export const render = (value: unknown): string => {
  const constant = unquote(value)
  const text = typeof constant === 'string' ? `'${constant}'` : JSON.stringify(constant)
  return text.length > 60 ? `${text.slice(0, 57)}...` : text
}

/** The reference to a path in `data` */
export const dataReference = (path: string) =>
  path === '' ? '$data' : path.startsWith('[') ? `$data${path}` : `$data.${path}`

/**
 * Whether v3's path grammar reads a path: keys, `[n]`, `[*]` and quoted keys
 * (`parsePath` in src/primitives/path.ts, which a test holds this to)
 */
export const isV3Path = (path: string) =>
  /^(?:[^[]|\[(?:\d+|\*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\])*$/.test(path)

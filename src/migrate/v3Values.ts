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

/**
 * A constant as v3 holds it where nothing evaluates it, such as a fragment
 * parameter's `default`: what each `literal` inside quotes
 */
export const constantOf = (value: unknown): unknown => {
  if (isLiteral(value)) return value.value
  if (Array.isArray(value)) return value.map(constantOf)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, constantOf(v)]))
}

// The keys no parameter may take ("The reserved-key set" in
// docs-dev/v3-specs/v3-api.md; src/names.ts, which a test holds these to)
export const RESERVED_NODE_KEYS: ReadonlySet<string> = new Set([
  'operator',
  'fragment',
  'parameters',
  'fallback',
  'useCache',
  'vars',
  '//',
])

// The names no operator or fragment may register under
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  ...RESERVED_NODE_KEYS,
  'data',
  'params',
  'element',
  'index',
  'd',
  'v',
  'p',
  'e',
  'i',
  'literal',
])

// v3's basic types (src/typeCheck.ts, which a test holds these to)
export const V3_TYPES: ReadonlySet<string> = new Set([
  'any',
  'string',
  'number',
  'boolean',
  'array',
  'object',
  'null',
  'integer',
])

const fitsBasic = (value: unknown, type: unknown) => {
  switch (type) {
    case 'any':
      return true
    case 'integer':
      return Number.isInteger(value)
    case 'array':
      return Array.isArray(value)
    case 'object':
      return isPlainObject(value)
    case 'null':
      return value === null
    default:
      return typeof value === type
  }
}

/** Whether v3 admits a value as a declared type: a basic type, union or set */
export const fitsType = (value: unknown, type: unknown): boolean => {
  if (Array.isArray(type)) return type.some((t) => fitsBasic(value, t))
  if (isPlainObject(type) && Array.isArray(type.literal)) return type.literal.includes(value)
  return fitsBasic(value, type)
}

// A `$data` reference to a path, which can be missing
const DATA_READ = /^\$(?:data|d)[.[]/

/**
 * Whether a converted value reads data that v2 failed on when it was
 * missing, with no `fallback` beneath to answer: a `$data` path, a `get`
 * with no default, an `http` or `graphQL` node's `returnPath`, or a
 * fragment whose body reads one, which `bodyReads` says by its name
 * ("Fallbacks that caught missing data"). A node's `fallback` answers for
 * everything beneath it except itself and its alias definitions, which v2
 * evaluated outside the node's own `try`, and a fragment call's arguments
 * were alias definitions of the node it became.
 */
export const uncaughtRead = (value: unknown, bodyReads: (name: string) => boolean): boolean => {
  const reads = (v: unknown) => uncaughtRead(v, bodyReads)
  if (typeof value === 'string') return DATA_READ.test(value)
  if (Array.isArray(value)) return value.some(reads)
  if (!isPlainObject(value) || isLiteral(value)) return false
  if (Object.hasOwn(value, 'fragment')) {
    const beneath = Object.hasOwn(value, 'fallback')
      ? reads(value.fallback)
      : bodyReads(String(value.fragment))
    return beneath || reads(value.parameters)
  }
  if (isNode(value) && Object.hasOwn(value, 'fallback'))
    return reads(value.fallback) || reads(value.vars)
  const { operator } = value
  if (operator === 'get' && !Object.hasOwn(value, 'missingPathDefault')) return true
  if ((operator === 'http' || operator === 'graphQL') && Object.hasOwn(value, 'returnPath'))
    return true
  return Object.entries(value).some(([key, element]) => key !== '//' && reads(element))
}

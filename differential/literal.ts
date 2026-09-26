/**
 * A value as the source that evaluates to it, for the modules the
 * differential writes: the corpus (differential/extract/) and the Postgres
 * recordings (differential/recordSql.ts).
 *
 * Each value keeps its type: a `Date` is written as `new Date('…')`, a
 * `Buffer` as `Buffer.from('…', 'base64')`, `undefined` as itself, plain
 * data as literals, and, where asked, a function as its source. Anything
 * else throws, naming where it sits, so nothing is written as something it
 * was not. A `Date` is written as its instant, so reading it back does not
 * depend on the zone it was written in.
 */
export interface LiteralOptions {
  /** Write functions as their source, which the corpus's options hold */
  functions?: boolean
}

export const literal = (value: unknown, options: LiteralOptions = {}, at = ''): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value)
  if (value === undefined) return 'undefined'
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value)
  if (Array.isArray(value))
    return `[${value.map((item, index) => literal(item, options, `${at}[${index}]`)).join(', ')}]`
  if (Buffer.isBuffer(value)) return `Buffer.from('${value.toString('base64')}', 'base64')`
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return `new Date('${value.toISOString()}')`
  if (typeof value === 'function' && options.functions) return functionSource(String(value), at)
  if (isPlainObject(value)) {
    const entries = Object.entries(value).map(
      ([key, v]) => `${JSON.stringify(key)}: ${literal(v, options, `${at}.${key}`)}`
    )
    return `{ ${entries.join(', ')} }`
  }
  const kind =
    typeof value === 'object' ? (value.constructor?.name ?? 'object') : `${typeof value} value`
  throw new Error(
    `holds a ${kind} at ${at.slice(1) || 'the top'}, which cannot be written as what it is: ${String(value)}`
  )
}

/**
 * A function's source, as an expression: a method written in shorthand
 * (`name(a) { … }`) gains `function`, which keeps it callable
 */
const functionSource = (source: string, at: string): string => {
  if (source.includes('[native code]') || source.startsWith('class'))
    throw new Error(`holds a native function or class at ${at.slice(1) || 'the top'}`)
  if (/^(async\s+)?(function\b|\(|[\w$]+\s*=>)/.test(source)) return source
  return source.startsWith('async ')
    ? `async function ${source.slice('async '.length)}`
    : `function ${source}`
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || Object.getPrototypeOf(prototype) === null
}

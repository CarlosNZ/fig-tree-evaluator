/**
 * Authored values as the report prints them ("Converting authored values"
 * in docs-dev/v3-specs/v3-inspect.md). JSON passes through; anything else
 * prints as a marker string naming its type, carrying the value's own
 * `toJSON` string where it has one — `[Date 2026-09-23T00:00:00.000Z]`,
 * which is what the engine holds: the `Date`, not its text. A marker is a
 * string, and authored data can hold any string; the report is a reading
 * aid, and accepts that rare collision.
 */
import { DEPTH_CEILING } from '../compile'
import { isPlainDataObject } from '../utils'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** A location, as keys and indices. */
export type Path = (string | number)[]

/** Convert one authored value. */
export const toJson = (value: unknown): Json => convert(value, 0, new Set())

const convert = (value: unknown, depth: number, ancestors: Set<object>): Json => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value
  if (typeof value !== 'object') return marker(value)
  if (!Array.isArray(value) && !isPlainDataObject(value)) return objectMarker(value)

  // A cycle, or nesting past the walk's own ceiling, can only arrive
  // through what the compiler never walks — the source itself, a `literal`
  // payload — and would otherwise never finish
  if (ancestors.has(value)) return '[circular]'
  if (depth >= DEPTH_CEILING) return '[too deep]'
  ancestors.add(value)
  const converted = Array.isArray(value)
    ? // Every index: `Array.from` visits an unassigned slot as `undefined`
      Array.from(value, (element) => convert(element, depth + 1, ancestors))
    : Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, convert(child, depth + 1, ancestors)])
      )
  ancestors.delete(value)
  return converted
}

/**
 * A value outside JSON that is not an object. Never `String(value)`, which
 * is a function's whole source text.
 */
const marker = (value: unknown): string => {
  switch (typeof value) {
    case 'function':
      return value.name === '' ? '[function]' : `[function ${value.name}]`
    case 'symbol':
      return `[${String(value)}]`
    case 'bigint':
      return `[bigint ${value}]`
    case 'number':
      // `-0` is here although it is a number: JSON writes it as `0`
      return Object.is(value, -0) ? '[-0]' : `[${value}]`
    default:
      return '[undefined]'
  }
}

/**
 * A non-plain object: its constructor's name, with its own `toJSON` string
 * where it has one — the object's declared text form, and the one way to
 * read a `Date`, a Luxon or Moment value or a `Decimal` that is neither
 * timezone-dependent nor `[object Object]`. A `toJSON` that throws, or that
 * returns anything but a string, leaves the name alone.
 */
const objectMarker = (value: object): string => {
  const name = constructorName(value)
  try {
    const toJSON = (value as { toJSON?: unknown }).toJSON
    if (typeof toJSON === 'function') {
      const text: unknown = toJSON.call(value)
      if (typeof text === 'string') return `[${name} ${text}]`
    }
  } catch {
    // A throwing `toJSON`, or a throwing getter for it, leaves the name
  }
  return `[${name}]`
}

const constructorName = (value: object): string => {
  try {
    const name: unknown = (value as { constructor?: { name?: unknown } }).constructor?.name
    return typeof name === 'string' && name !== '' ? name : 'Object'
  } catch {
    return 'Object'
  }
}

/**
 * Authored values as the report prints them ("Converting authored values"
 * in docs-dev/v3-specs/v3-inspect.md). JSON passes through; anything else
 * becomes JSON by two rules — its own `toJSON` where it has one, otherwise
 * a marker string — and inside `canonicalForm` every replacement is also
 * recorded out of band, because a marker is a string and authored data can
 * hold any string.
 */
import { DEPTH_CEILING } from '../compile'
import { isPlainDataObject } from '../utils'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** A location relative to the value being converted. */
export type Path = (string | number)[]

/** One authored value replaced during conversion, and where. */
export interface Opaque {
  at: Path
  /** The constructor's name for an object, the `typeof` otherwise. */
  type: string
}

/** What a skeleton's reserved slots print as (see `holes[].at`). */
export const HOLE = '<hole>'

/** A slot's identity in a `holes` set: its path, JSON-encoded. */
export const slotKey = (at: Path): string => JSON.stringify(at)

interface Conversion {
  /** Where replacements are recorded; absent where nothing is kept. */
  opaque: Opaque[] | undefined
  /** Slots to print as `HOLE` rather than as the unassigned slots they are. */
  holes: ReadonlySet<string> | undefined
  /** The containers on the current path — a revisit is a cycle. */
  ancestors: Set<object>
}

/**
 * Convert one authored value. `opaque`, when given, collects a record of
 * each replacement; `holes` names the array slots a skeleton reserves,
 * which would otherwise read as unassigned slots and so as `undefined`.
 */
export const toJson = (value: unknown, opaque?: Opaque[], holes?: ReadonlySet<string>): Json =>
  convert(value, [], 0, { opaque, holes, ancestors: new Set() })

const convert = (value: unknown, at: Path, depth: number, conversion: Conversion): Json => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value
  if (!Array.isArray(value) && !isPlainDataObject(value))
    return opaqueValue(value, at, depth, conversion)

  // A cycle, or nesting past the walk's own ceiling, can only arrive
  // through what the compiler never walks — the source itself, a `literal`
  // payload — and would otherwise never finish
  if (conversion.ancestors.has(value)) return replace(value, '[circular]', at, conversion)
  if (depth >= DEPTH_CEILING) return replace(value, '[too deep]', at, conversion)
  conversion.ancestors.add(value)
  const converted = Array.isArray(value)
    ? convertArray(value, at, depth, conversion)
    : Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          convert(child, [...at, key], depth + 1, conversion),
        ])
      )
  conversion.ancestors.delete(value)
  return converted
}

/**
 * Every index, not only the assigned ones: an unassigned slot reads as
 * `undefined` and converts as `undefined` does, unless it is a slot a
 * skeleton reserved for a hole.
 */
const convertArray = (
  value: unknown[],
  at: Path,
  depth: number,
  conversion: Conversion
): Json[] => {
  const converted: Json[] = []
  for (let index = 0; index < value.length; index++) {
    const slot = [...at, index]
    converted.push(
      conversion.holes?.has(slotKey(slot))
        ? HOLE
        : convert(index in value ? value[index] : undefined, slot, depth + 1, conversion)
    )
  }
  return converted
}

/**
 * A value JSON cannot hold. Rule 1: an object's own declared JSON form,
 * converted in turn (a `Date` becomes its ISO string this way, with no
 * special case). Rule 2, and the fallback for a `toJSON` that throws: a
 * marker. Either way the replacement is recorded — for a `toJSON` value
 * the record is the only trace of what the value was.
 */
const opaqueValue = (value: unknown, at: Path, depth: number, conversion: Conversion): Json => {
  if (typeof value === 'object' && value !== null) {
    // The same guards as a container's: a `toJSON` may hand back its own
    // object (`return this`), or something that leads back to it
    if (conversion.ancestors.has(value)) return replace(value, '[circular]', at, conversion)
    if (depth >= DEPTH_CEILING) return replace(value, '[too deep]', at, conversion)
    conversion.ancestors.add(value)
    try {
      const toJSON = (value as { toJSON?: unknown }).toJSON
      if (typeof toJSON === 'function') {
        // What `toJSON` returns is the host's; any replacement inside it is
        // not a separate record, the whole value already being one
        const declared = convert(toJSON.call(value), at, depth + 1, {
          ...conversion,
          opaque: undefined,
          holes: undefined,
        })
        record(value, at, conversion)
        return declared
      }
    } catch {
      // A throwing `toJSON` (or a throwing getter for it) falls through to
      // the marker
    } finally {
      conversion.ancestors.delete(value)
    }
  }
  return replace(value, marker(value), at, conversion)
}

const replace = (value: unknown, text: string, at: Path, conversion: Conversion): string => {
  record(value, at, conversion)
  return text
}

const record = (value: unknown, at: Path, conversion: Conversion) => {
  conversion.opaque?.push({ at, type: typeName(value) })
}

/**
 * Never `String(value)`: that is timezone-dependent for a `Date`,
 * `[object Object]` for most instances, and a function's whole source.
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
    case 'undefined':
      return '[undefined]'
    default:
      return `[${typeName(value)}]`
  }
}

const typeName = (value: unknown): string =>
  typeof value === 'object' && value !== null ? constructorName(value) : typeof value

const constructorName = (value: object): string => {
  try {
    const name: unknown = (value as { constructor?: { name?: unknown } }).constructor?.name
    return typeof name === 'string' && name !== '' ? name : 'Object'
  } catch {
    return 'Object'
  }
}

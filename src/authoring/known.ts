/**
 * What the coverage walk knows about a value ("The walk" in
 * docs-dev/v3-specs/v3-fallback-coverage.md): a union of members, each an
 * exact value, a basic type, or a container with what is known of its
 * contents. Richer than `ExpectedType`, which has no element types, keys
 * or exact values, and internal, so free to change.
 *
 * A Known over-approximates: every value the node can return is admitted
 * by some member. An empty one admits nothing, which is what a node that
 * never returns has. Exact values are judged by the engine's own type
 * checks and path resolution, so a constant is judged as the runtime
 * judges it.
 */
import { checkConstraintsUnderPolicy, checkType } from '../typeCheck'
import type { BasicType, Constraints, ExpectedType, TypeDeclaration } from '../typeCheck'
import { isLiteralType } from '../typeIntersection'
import { WILDCARD, resolvePath } from '../primitives/path'
import type { PathSegment } from '../primitives/path'

export type Member =
  | { exact: unknown }
  /** A finite number, between `min` and `max` inclusive where they are given */
  | { type: 'number' | 'integer'; min?: number; max?: number }
  /** At least `minLength` code points long, where it is given */
  | { type: 'string'; minLength?: number }
  /**
   * `opaque`: a value with no basic type, such as a Date or a function. The
   * engine's `object` admits any non-array object, a Date included
   */
  | { type: 'boolean' | 'null' | 'opaque' }
  /**
   * NaN or an infinity: a number the engine refuses as a node's result.
   * Data can carry one only under `strictNumbers`, the only setting that
   * reports it
   */
  | { type: 'nonFinite' }
  /**
   * `element` absent: anything. `items`: each element in order, where the
   * array is a literal whose length is known. `minLength`: a least length,
   * where the length itself is not known
   */
  | {
      type: 'array'
      element?: Known
      length?: number
      minLength?: number
      items?: readonly Known[]
    }
  /** `keys` absent: any keys, with any values; present: exactly these */
  | { type: 'object'; keys?: Record<string, Known> }

export type Known = readonly Member[]

/** no, maybe, yes: the answer to any question the walk asks of a Known. */
export type Answer = 'no' | 'maybe' | 'yes'

export const NOTHING: Known = []

/** Anything at all, null included. */
export const ANY: Known = [
  { type: 'string' },
  { type: 'number' },
  { type: 'boolean' },
  { type: 'null' },
  { type: 'array' },
  { type: 'object' },
  { type: 'opaque' },
  { type: 'nonFinite' },
]

export const exactly = (value: unknown): Known => [{ exact: value === undefined ? null : value }]

/** The values a known is exactly, if it is one of a few. */
export const exactValues = (known: Known): unknown[] | undefined =>
  known.length > 0 && known.every((member) => 'exact' in member)
    ? known.map((member) => (member as { exact: unknown }).exact)
    : undefined

export const isNull = (member: Member): boolean =>
  'exact' in member ? member.exact === null : member.type === 'null'

/** What a declared type admits. */
export const ofType = (type: ExpectedType): Known => {
  if (isLiteralType(type)) return type.literal.map((value) => ({ exact: value }))
  const basics: readonly BasicType[] = typeof type === 'string' ? [type] : type
  if (basics.includes('any')) return ANY
  return unionOf(basics.map((basic): Known => [{ type: basic as Exclude<BasicType, 'any'> }]))
}

// ── Union ───────────────────────────────────────────────────────────

/** Exact values beyond this many are widened to their types. */
const EXACT_LIMIT = 16

/**
 * An object is told apart by identity: a constant is held by reference, so
 * the same one keys alike, and two that only look alike stay two.
 */
const ids = new WeakMap<object, number>()
let lastId = 0
const identity = (value: object): number => {
  let id = ids.get(value)
  if (id === undefined) ids.set(value, (id = ++lastId))
  return id
}

const exactKey = (value: unknown): string =>
  (typeof value === 'object' && value !== null) || typeof value === 'function'
    ? `=#${identity(value)}`
    : `=${typeof value}:${String(value)}`

const memberKey = (member: Member): string => {
  if ('exact' in member) return exactKey(member.exact)
  if (member.type === 'array')
    return member.items !== undefined
      ? `a[${member.items.map(keyOf).join(';')}]`
      : `a${member.length ?? ''}+${member.minLength ?? ''}(${member.element === undefined ? '*' : keyOf(member.element)})`
  if (member.type === 'object')
    return member.keys === undefined
      ? 'o'
      : `o{${Object.keys(member.keys)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${keyOf(member.keys![key])}`)
          .join(',')}}`
  // A bounded scalar: its bounds, in the order they were made
  const { type, ...bounds } = member
  return `${type}${JSON.stringify(bounds)}`
}

/** A stable rendering, for caching an analysis by what it was given. */
export const keyOf = (known: Known): string => known.map(memberKey).sort().join('|')

/** The member a value belongs to, without its exact value. */
export const typeOfValue = (value: unknown): Member => {
  if (value === null) return { type: 'null' }
  if (Array.isArray(value)) return { type: 'array' }
  switch (typeof value) {
    case 'string':
      return { type: 'string' }
    case 'number':
      return {
        type: Number.isInteger(value) ? 'integer' : Number.isFinite(value) ? 'number' : 'nonFinite',
      }
    case 'boolean':
      return { type: 'boolean' }
    case 'object': {
      const prototype = Object.getPrototypeOf(value)
      return prototype === Object.prototype || prototype === null
        ? { type: 'object' }
        : { type: 'opaque' }
    }
    default:
      return { type: 'opaque' }
  }
}

/**
 * What any of the knowns admits, each member once. A list as long as the
 * expression makes it, such as a literal's elements, is passed whole:
 * spread into arguments, a long one overflows the call stack.
 */
export const unionOf = (knowns: readonly Known[]): Known => {
  const seen = new Set<string>()
  const members: Member[] = []
  for (const known of knowns)
    for (const member of known) {
      const key = memberKey(member)
      if (seen.has(key)) continue
      seen.add(key)
      members.push(member)
    }
  const exacts = members.filter((member) => 'exact' in member).map((member) => member.exact)
  if (exacts.length <= EXACT_LIMIT) return members
  return union(
    members.filter((member) => !('exact' in member)),
    widen(exacts)
  )
}

export const union = (...knowns: Known[]): Known => unionOf(knowns)

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** A string's length as `length` counts it, in code points. */
const codePoints = (value: string): number => Array.from(value).length

/**
 * Exact values past the limit, widened to what they span: the numbers to a
 * range, integers apart, and the strings and arrays to their least length.
 */
const widen = (values: unknown[]): Known => {
  const shortest = (type: 'string' | 'array', lengths: number[]): Known => {
    if (lengths.length === 0) return NOTHING
    const least = lengths.reduce((a, b) => Math.min(a, b))
    return [atLeast({ type }, least)]
  }
  return unionOf([
    ...[true, false].map((integer) =>
      ofSpan(
        hull(
          values.map((value) =>
            isNumber(value) && Number.isInteger(value) === integer ? spanOfValue(value) : undefined
          )
        )
      )
    ),
    shortest(
      'string',
      values.filter((value): value is string => typeof value === 'string').map(codePoints)
    ),
    shortest(
      'array',
      values.filter(Array.isArray).map((value) => value.length)
    ),
    ...values
      .filter((value) => !isNumber(value) && typeof value !== 'string' && !Array.isArray(value))
      .map((value) => [typeOfValue(value)]),
  ])
}

const atLeast = (member: { type: 'string' | 'array' }, minLength: number | undefined): Member =>
  minLength ? { ...member, minLength } : member

// ── Null ────────────────────────────────────────────────────────────

export const admitsNull = (known: Known): boolean => known.some(isNull)

export const onlyNull = (known: Known): boolean => known.length > 0 && known.every(isNull)

export const withoutNull = (known: Known): Known => known.filter((member) => !isNull(member))

/**
 * Whether a container holds a null element, or a null value. Only an exact
 * value says for certain.
 */
export const containsNull = (known: Known): Answer =>
  combine(
    known.map((member): Answer => {
      if ('exact' in member) {
        const { exact } = member
        const values = Array.isArray(exact) ? exact : isPlain(exact) ? Object.values(exact) : []
        return values.includes(null) ? 'yes' : 'no'
      }
      if (member.type === 'array')
        return member.length !== 0 && admitsNull(member.element ?? ANY) ? 'maybe' : 'no'
      return member.type === 'object' ? 'maybe' : 'no'
    })
  )

/**
 * A container's null elements, or null values, replaced by what is known
 * of the replacement: exactly, where both are known exactly. Otherwise an
 * object that may hold a null comes out with its keys unknown.
 */
export const replaceNullElements = (known: Known, replacement: Known): Known =>
  unionOf(
    known.map((member): Known => {
      if (containsNull([member]) === 'no') return [member]
      const exact = 'exact' in member ? member.exact : undefined
      if (replacement.length === 1 && 'exact' in replacement[0] && 'exact' in member) {
        const by = replacement[0].exact
        const swap = (value: unknown) => (value === null ? by : value)
        if (Array.isArray(exact)) return exactly(exact.map(swap))
        const swapped: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(exact as object)) swapped[key] = swap(value)
        return exactly(swapped)
      }
      if (!Array.isArray(exact) && !('type' in member && member.type === 'array'))
        return [{ type: 'object' }]
      const { length, minLength } = member as { length?: number; minLength?: number }
      return arrayOf(
        [withoutNull(elementsOf([member])), replacement],
        Array.isArray(exact) ? { length: exact.length } : { length, minLength }
      )
    })
  )

/**
 * The containers that hold no null element or value: what is left once a
 * null among them has propagated. An exact one holding a null is gone.
 */
export const withoutNullElements = (known: Known): Known =>
  known.flatMap((member): Known => {
    const nulls = containsNull([member])
    if (nulls === 'no') return [member]
    if (nulls === 'yes') return NOTHING
    if (!('type' in member)) return [member]
    if (member.type !== 'array') return [member]
    const { items, ...rest } = member
    if (items === undefined) return [{ ...rest, element: withoutNull(member.element ?? ANY) }]
    // A literal whose every slot is null-free: none can be null alone
    const kept = items.map(withoutNull)
    return kept.some((item) => item.length === 0) ? NOTHING : tupleOf(kept)
  })

// ── Containers ──────────────────────────────────────────────────────

/** The engine's `isPlainObject` (src/utils.ts): any non-array object. */
export const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** What an iterator binds `$element` to: the elements of what is an array. */
export const elementsOf = (known: Known): Known =>
  unionOf(
    known.map((member): Known => {
      if ('exact' in member)
        return Array.isArray(member.exact)
          ? unionOf(Array.from(member.exact, (element) => exactly(element)))
          : NOTHING
      if (member.type === 'array') return member.length === 0 ? NOTHING : (member.element ?? ANY)
      return NOTHING
    })
  )

/** An array of these elements, with its length or least length where known. */
export const arrayOf = (
  elements: Known[],
  lengths: { length?: number; minLength?: number } = {}
): Known => [{ type: 'array', element: unionOf(elements), ...lengths }]

/** A literal array: what each element is, in order. */
export const tupleOf = (items: readonly Known[]): Known => [
  { type: 'array', element: unionOf(items), length: items.length, items },
]

/** What an object's values can be. */
export const valuesOf = (known: Known): Known =>
  unionOf(
    known.map((member): Known => {
      if ('exact' in member)
        return isPlain(member.exact)
          ? unionOf(Object.values(member.exact).map((value) => exactly(value)))
          : NOTHING
      if (member.type !== 'object') return NOTHING
      return member.keys === undefined ? ANY : unionOf(Object.values(member.keys))
    })
  )

/**
 * The kinds of values a known holds: each exact value widened to its type,
 * so an operation over them, such as a sum, is not taken for one of them.
 */
export const kindOf = (known: Known): Known =>
  union(known.map((member) => ('exact' in member ? typeOfValue(member.exact) : member)))

/** Whether a value may be a number the engine refuses as a result. */
export const mayBeNonFinite = (known: Known): Answer =>
  any(
    known.map((member): Answer => {
      if ('exact' in member)
        return typeof member.exact === 'number' && !Number.isFinite(member.exact) ? 'yes' : 'no'
      return member.type === 'nonFinite' ? 'maybe' : 'no'
    })
  )

/** What is left once the engine has refused a non-finite result. */
export const finite = (known: Known): Known =>
  known.filter((member) =>
    'exact' in member
      ? typeof member.exact !== 'number' || Number.isFinite(member.exact)
      : member.type !== 'nonFinite'
  )

export const objectOf = (keys: Record<string, Known>): Known => [{ type: 'object', keys }]

/**
 * The value at a path, and whether it is there: the engine's resolution for
 * an exact value, the known keys or elements otherwise.
 */
export const drill = (
  known: Known,
  segments: readonly PathSegment[]
): { value: Known; found: Answer } => {
  if (segments.length === 0) return { value: known, found: 'yes' }
  const [segment, ...rest] = segments
  // An array, an object and an opaque value can each hold anything, so what
  // is below anything is drilled once a level, not once for each of them,
  // which would multiply with every segment
  let belowAny: { value: Known; found: Answer } | undefined
  const below = (inner: Known) =>
    inner === ANY ? (belowAny ??= drill(ANY, rest)) : drill(inner, rest)
  const values: Known[] = []
  const found = combine(
    known.map((member): Answer => {
      if ('exact' in member) {
        const result = resolvePath(member.exact, segments as PathSegment[])
        if (result.found) values.push(exactly(result.value))
        return result.found ? 'yes' : 'no'
      }
      const step = (inner: Known, here: Answer): Answer => {
        if (here === 'no') return 'no'
        const deeper = below(inner)
        values.push(deeper.value)
        return here === 'yes' ? deeper.found : deeper.found === 'no' ? 'no' : 'maybe'
      }
      if (segment === WILDCARD) {
        // A projection: anything an array holds, with a null for each miss
        if (member.type !== 'array') return 'no'
        values.push(rest.length === 0 ? [member] : [{ type: 'array' }])
        return 'yes'
      }
      switch (member.type) {
        case 'array': {
          const index = typeof segment === 'number' ? segment : Number(segment)
          if (!Number.isInteger(index) || index < 0)
            return typeof segment === 'number' ? 'no' : 'maybe'
          const inRange =
            member.length !== undefined
              ? index < member.length
                ? 'yes'
                : 'no'
              : index < (member.minLength ?? 0)
                ? 'yes'
                : 'maybe'
          if (member.items !== undefined && inRange === 'yes')
            return step(member.items[index], 'yes')
          return step(member.element ?? ANY, inRange)
        }
        case 'object':
          if (member.keys === undefined) return step(ANY, 'maybe')
          return Object.hasOwn(member.keys, String(segment))
            ? step(member.keys[String(segment)], 'yes')
            : 'no'
        case 'opaque':
          return step(ANY, 'maybe')
        default:
          return 'no'
      }
    })
  )
  return { value: unionOf(values), found: known.length === 0 ? 'yes' : found }
}

// ── Ranges ──────────────────────────────────────────────────────────

/**
 * The finite numbers a known can be, as one span: inclusive bounds,
 * infinite where open, and whether every one is an integer. Each operation
 * below computes its bounds with the operation its body performs, in the
 * same order, so what the body returns is within them: rounding never
 * reverses an order, and a bound that overflows is open.
 */
export interface Span {
  min: number
  max: number
  integer: boolean
}

const ZERO: Span = { min: 0, max: 0, integer: true }
const ONE: Span = { min: 1, max: 1, integer: true }

const spanOfValue = (value: number): Span => ({
  min: value,
  max: value,
  integer: Number.isInteger(value),
})

const spanOfMember = (member: Member): Span | undefined => {
  if ('exact' in member) return isNumber(member.exact) ? spanOfValue(member.exact) : undefined
  return member.type === 'number' || member.type === 'integer'
    ? {
        min: member.min ?? -Infinity,
        max: member.max ?? Infinity,
        integer: member.type === 'integer',
      }
    : undefined
}

const hull = (spans: (Span | undefined)[]): Span | undefined =>
  spans.reduce<Span | undefined>(
    (a, b) =>
      a === undefined || b === undefined
        ? (a ?? b)
        : {
            min: Math.min(a.min, b.min),
            max: Math.max(a.max, b.max),
            integer: a.integer && b.integer,
          },
    undefined
  )

export const spanOf = (known: Known): Span | undefined => hull(known.map(spanOfMember))

/**
 * The numbers in a span: none where it holds none, and a bound only where
 * it is finite, so a NaN bound is open too.
 */
export const ofSpan = (span: Span | undefined): Known => {
  if (span === undefined) return NOTHING
  const min = span.integer ? Math.ceil(span.min) : span.min
  const max = span.integer ? Math.floor(span.max) : span.max
  if (min > max) return NOTHING
  return [
    {
      type: span.integer ? 'integer' : 'number',
      ...(min > -Infinity ? { min } : {}),
      ...(max < Infinity ? { max } : {}),
    },
  ]
}

/** A declared type with bounds: `{ type: 'integer', min: 0 }`. */
export const bounded = (declared: {
  type: 'number' | 'integer' | 'string' | 'array'
  min?: number
  max?: number
  minLength?: number
}): Known => {
  const { type, min = -Infinity, max = Infinity } = declared
  return type === 'number' || type === 'integer'
    ? ofSpan({ min, max, integer: type === 'integer' })
    : [atLeast({ type }, declared.minLength)]
}

/** What is not a number, NaN and the infinities included. */
const withoutNumbers = (known: Known): Known =>
  known.filter((member) =>
    'exact' in member
      ? typeof member.exact !== 'number'
      : !['number', 'integer', 'nonFinite'].includes(member.type)
  )

/**
 * An array's elements that are NaN or an infinity, as they are: a sum, a
 * product or an extreme with one among them is one too.
 */
const nonFiniteElements = (known: Known): Known =>
  elementsOf(known).filter((member) => mayBeNonFinite([member]) !== 'no')

/**
 * An operation over an array's elements, member by member: `items` over a
 * literal's elements in order, `some` over an array whose length is not
 * known, given what any one element can be and how many there are at least.
 */
const overElements = (
  known: Known,
  items: (items: readonly Known[]) => Known,
  some: (element: Known, least: number) => Known
): Known =>
  unionOf(
    known.map((member): Known => {
      if ('exact' in member)
        return Array.isArray(member.exact)
          ? items(Array.from(member.exact, (value) => exactly(value)))
          : NOTHING
      if (member.type !== 'array') return NOTHING
      if (member.items !== undefined) return items(member.items)
      if (member.length === 0) return some(NOTHING, 0)
      return some(member.element ?? ANY, member.length ?? member.minLength ?? 0)
    })
  )

/**
 * A literal's elements' spans folded in order. An element with no finite
 * number means the numbers' case never happens.
 */
const fold = (items: readonly Known[], start: Span, step: (a: Span, b: Span) => Span) =>
  items.reduce<Span | undefined>((total, item) => {
    const span = spanOf(item)
    return total && span && step(total, span)
  }, start)

const add = (a: Span, b: Span): Span => ({
  min: a.min + b.min,
  max: a.max + b.max,
  integer: a.integer && b.integer,
})

/** A factor of 0 gives 0, an open bound included. */
const timesBound = (x: number, y: number): number => (x === 0 || y === 0 ? 0 : x * y)

const times = (a: Span, b: Span): Span => {
  const corners = [
    timesBound(a.min, b.min),
    timesBound(a.min, b.max),
    timesBound(a.max, b.min),
    timesBound(a.max, b.max),
  ]
  return { min: Math.min(...corners), max: Math.max(...corners), integer: a.integer && b.integer }
}

/**
 * What adding an array's elements gives (`plus`): the numbers' sum, from 0
 * and in order, and the kind of anything else. Where the count is not
 * known, only the sign of the elements bounds it: past at least one
 * element, a sum of numbers from 0 up is at least any of them.
 */
export const sumOf = (known: Known): Known =>
  union(
    kindOf(withoutNumbers(elementsOf(known))),
    nonFiniteElements(known),
    overElements(
      known,
      (items) => ofSpan(fold(items, ZERO, add)),
      (element, least) => {
        const span = spanOf(element)
        if (span === undefined) return least === 0 ? ofSpan(ZERO) : NOTHING
        const one = least > 0
        return ofSpan({
          min: span.min >= 0 ? (one ? span.min : 0) : -Infinity,
          max: span.max <= 0 ? (one ? span.max : 0) : Infinity,
          integer: span.integer,
        })
      }
    )
  )

/**
 * What multiplying an array's numbers gives (`multiply`), from 1 and in
 * order. Where the count is not known, factors within ±1 keep the product
 * within ±1, and factors from 1 up keep it from 1 up.
 */
export const productOf = (known: Known): Known =>
  union(
    nonFiniteElements(known),
    overElements(
      known,
      (items) => ofSpan(fold(items, ONE, times)),
      (element, least) => {
        const span = spanOf(element)
        if (span === undefined) return least === 0 ? ofSpan(ONE) : NOTHING
        const small = span.min >= -1 && span.max <= 1
        return ofSpan({
          min: span.min >= 1 ? 1 : span.min >= 0 ? 0 : small ? -1 : -Infinity,
          max: small ? 1 : Infinity,
          integer: span.integer,
        })
      }
    )
  )

/** One number less another (`subtract`). */
export const differenceOf = (value: Known, minus: Known): Known => {
  const a = spanOf(value)
  const b = spanOf(minus)
  return ofSpan(
    a && b && { min: a.min - b.max, max: a.max - b.min, integer: a.integer && b.integer }
  )
}

export const absOf = (known: Known): Known => {
  const span = spanOf(known)
  if (span === undefined) return NOTHING
  const { min, max } = span
  if (min >= 0) return ofSpan(span)
  return ofSpan(
    max <= 0 ? { ...span, min: -max, max: -min } : { ...span, min: 0, max: Math.max(-min, max) }
  )
}

/**
 * The least or greatest of an array's elements (`min`, `max`): for numbers,
 * a span between the elements' own, and anything else as it is. NaN
 * compares equal to anything, so where an element may be one, the answer
 * is any of the elements.
 */
export const extremeOf = (known: Known, which: 'min' | 'max'): Known =>
  union(
    withoutNumbers(elementsOf(known)),
    nonFiniteElements(known),
    overElements(
      known,
      (items) => {
        const spans = items.map(spanOf)
        if (items.some((item) => mayBeNonFinite(item) !== 'no')) return ofSpan(hull(spans))
        if (spans.length === 0 || spans.includes(undefined)) return NOTHING
        const pick = which === 'min' ? Math.min : Math.max
        return ofSpan({
          min: spans.map((span) => span!.min).reduce((a, b) => pick(a, b)),
          max: spans.map((span) => span!.max).reduce((a, b) => pick(a, b)),
          integer: spans.every((span) => span!.integer),
        })
      },
      (element) => ofSpan(spanOf(element))
    )
  )

// ── Fitting a declared type ─────────────────────────────────────────

/** Whether any of several conditions holds. */
const any = (answers: Answer[]): Answer =>
  answers.includes('yes') ? 'yes' : answers.includes('maybe') ? 'maybe' : 'no'

/** Every member's answer: yes if all are, no if all are, maybe otherwise. */
export const combine = (answers: Answer[]): Answer => {
  if (answers.every((answer) => answer === 'yes')) return 'yes'
  if (answers.every((answer) => answer === 'no')) return 'no'
  return 'maybe'
}

const both = (a: Answer, b: Answer): Answer =>
  a === 'no' || b === 'no' ? 'no' : a === 'yes' && b === 'yes' ? 'yes' : 'maybe'

/** A type member against a declared type, before any constraint. */
const memberFitsType = (
  member: Exclude<Member, { exact: unknown }>,
  type: ExpectedType
): Answer => {
  if (isLiteralType(type)) {
    const admits = (value: string | number | boolean) => {
      const span = spanOfMember(member)
      if (span !== undefined)
        return (
          typeof value === 'number' &&
          (!span.integer || Number.isInteger(value)) &&
          value >= span.min &&
          value <= span.max
        )
      if (member.type === 'string')
        return typeof value === 'string' && codePoints(value) >= (member.minLength ?? 0)
      return typeof value === member.type
    }
    return type.literal.some(admits) ? 'maybe' : 'no'
  }
  const basics: readonly BasicType[] = typeof type === 'string' ? [type] : type
  if (basics.includes('any')) return 'yes'
  switch (member.type) {
    case 'number':
      return basics.includes('number') ? 'yes' : basics.includes('integer') ? 'maybe' : 'no'
    case 'integer':
      return basics.includes('integer') || basics.includes('number') ? 'yes' : 'no'
    case 'opaque':
      return basics.includes('object') ? 'maybe' : 'no'
    case 'nonFinite':
      // The `number` type admits NaN and the infinities; `integer` does not
      return basics.includes('number') ? 'yes' : 'no'
    default:
      return basics.includes(member.type) ? 'yes' : 'no'
  }
}

/** A container member against `constraints`, which all need an array. */
const memberFitsConstraints = (
  member: Exclude<Member, { exact: unknown }>,
  constraints: Constraints,
  elementPolicy: boolean
): Answer => {
  const declared = Object.keys(constraints).filter(
    (key) => constraints[key as keyof Constraints] !== undefined
  )
  if (declared.length === 0) return 'yes'
  if (member.type !== 'array') return 'no'
  let answer: Answer = 'yes'
  if (constraints.length !== undefined)
    answer = both(
      answer,
      member.length === undefined ? 'maybe' : member.length === constraints.length ? 'yes' : 'no'
    )
  const raw = member.length === 0 ? NOTHING : (member.element ?? ANY)
  const elements = elementPolicy ? withoutNull(raw) : raw
  if (constraints.homogeneous !== undefined)
    answer = both(
      answer,
      elements.length === 0 ||
        constraints.homogeneous.some((basic) => fits(elements, basic) === 'yes')
        ? 'yes'
        : 'maybe'
    )
  if (constraints.elementShape !== undefined)
    answer = both(
      answer,
      elements.every((element) => fitsShape(element, constraints.elementShape!) === 'yes')
        ? 'yes'
        : 'maybe'
    )
  return answer
}

const fitsShape = (member: Member, shape: Record<string, TypeDeclaration>): Answer => {
  if ('exact' in member) return checkConstraints([member.exact], shape)
  if (member.type !== 'object') return 'no'
  if (member.keys === undefined) return 'maybe'
  const keys = member.keys
  return combine(
    Object.entries(shape).map(([key, declared]): Answer => {
      if (!Object.hasOwn(keys, key)) return declared.required === false ? 'yes' : 'no'
      const typed = declared.type === undefined ? 'yes' : fits(keys[key], declared.type)
      return declared.constraints === undefined
        ? typed
        : both(typed, fits(keys[key], 'any', declared.constraints))
    })
  )
}

const checkConstraints = (value: unknown[], shape: Record<string, TypeDeclaration>): Answer =>
  checkConstraintsUnderPolicy(value, { elementShape: shape }, false).ok ? 'yes' : 'no'

/**
 * Whether what a parameter receives passes its type check and constraints
 * (`vet` in src/evaluate/params.ts): yes for every member, no for every
 * member, or maybe. Nothing at all passes, since nothing arrives.
 */
export const fits = (
  known: Known,
  type: ExpectedType,
  constraints?: Constraints,
  elementPolicy = false
): Answer =>
  combine(
    known.map((member): Answer => {
      if ('exact' in member) {
        const value = member.exact
        if (!checkType(value, type).ok) return 'no'
        if (value === null || constraints === undefined) return 'yes'
        return checkConstraintsUnderPolicy(value, constraints, elementPolicy).ok ? 'yes' : 'no'
      }
      const typed = memberFitsType(member, type)
      if (typed === 'no' || constraints === undefined || member.type === 'null') return typed
      return both(typed, memberFitsConstraints(member, constraints, elementPolicy))
    })
  )

/**
 * What passes a type check: the members that can, narrowed to the type
 * where the type is narrower (a number checked as an integer is one, within
 * the same bounds).
 */
export const narrow = (known: Known, type: ExpectedType): Known => {
  if (fits(known, type) === 'yes') return known
  return unionOf(
    known.map((member): Known => {
      if (fits([member], type) === 'no') return NOTHING
      if ('exact' in member) return [member]
      if (isLiteralType(type))
        return type.literal
          .filter((value) => fits([member], { literal: [value] }) !== 'no')
          .map((value) => ({ exact: value }))
      if (member.type === 'number') return ofSpan({ ...spanOfMember(member)!, integer: true })
      return [member]
    })
  )
}

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
  /**
   * `opaque`: a value with no basic type, such as a Date or a function. The
   * engine's `object` admits any non-array object, a Date included
   */
  | { type: 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'opaque' }
  /**
   * NaN or an infinity: a number the engine refuses as a node's result.
   * Data can carry one only under `numbers: 'strict'`, which is the only
   * level that reports it
   */
  | { type: 'nonFinite' }
  /**
   * `element` absent: anything. `items`: each element in order, where the
   * array is a literal whose length is known
   */
  | { type: 'array'; element?: Known; length?: number; items?: readonly Known[] }
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

export const isNull = (member: Member): boolean =>
  'exact' in member ? member.exact === null : member.type === 'null'

/** What a declared type admits. */
export const ofType = (type: ExpectedType): Known => {
  if (isLiteralType(type)) return type.literal.map((value) => ({ exact: value }))
  const basics: readonly BasicType[] = typeof type === 'string' ? [type] : type
  if (basics.includes('any')) return ANY
  return union(...basics.map((basic): Known => [{ type: basic as Exclude<BasicType, 'any'> }]))
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
      : `a${member.length ?? ''}(${member.element === undefined ? '*' : keyOf(member.element)})`
  if (member.type === 'object')
    return member.keys === undefined
      ? 'o'
      : `o{${Object.keys(member.keys)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${keyOf(member.keys![key])}`)
          .join(',')}}`
  return member.type
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

export const union = (...knowns: Known[]): Known => {
  const seen = new Set<string>()
  const members: Member[] = []
  for (const known of knowns)
    for (const member of known) {
      const key = memberKey(member)
      if (seen.has(key)) continue
      seen.add(key)
      members.push(member)
    }
  if (members.filter((member) => 'exact' in member).length <= EXACT_LIMIT) return members
  return union(members.map((member) => ('exact' in member ? typeOfValue(member.exact) : member)))
}

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
 * of the replacement. An object that may hold a null comes out with its
 * keys unknown.
 */
export const replaceNullElements = (known: Known, replacement: Known): Known =>
  union(
    ...known.map((member): Known => {
      if (containsNull([member]) === 'no') return [member]
      const exact = 'exact' in member ? member.exact : undefined
      if (!Array.isArray(exact) && !('type' in member && member.type === 'array'))
        return [{ type: 'object' }]
      const length = Array.isArray(exact) ? exact.length : (member as { length?: number }).length
      return arrayOf([withoutNull(elementsOf([member])), replacement], length)
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
const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** What an iterator binds `$element` to: the elements of what is an array. */
export const elementsOf = (known: Known): Known =>
  union(
    ...known.map((member): Known => {
      if ('exact' in member)
        return Array.isArray(member.exact)
          ? union(...Array.from(member.exact, (element) => exactly(element)))
          : NOTHING
      if (member.type === 'array') return member.length === 0 ? NOTHING : (member.element ?? ANY)
      return NOTHING
    })
  )

/** An array of these elements, `length` long where that is known. */
export const arrayOf = (elements: Known[], length?: number): Known => [
  { type: 'array', element: union(...elements), ...(length !== undefined ? { length } : {}) },
]

/** A literal array: what each element is, in order. */
export const tupleOf = (items: readonly Known[]): Known => [
  { type: 'array', element: union(...items), length: items.length, items },
]

/** What an object's values can be. */
export const valuesOf = (known: Known): Known =>
  union(
    ...known.map((member): Known => {
      if ('exact' in member)
        return isPlain(member.exact)
          ? union(...Object.values(member.exact).map((value) => exactly(value)))
          : NOTHING
      if (member.type !== 'object') return NOTHING
      return member.keys === undefined ? ANY : union(...Object.values(member.keys))
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
  const values: Known[] = []
  const found = combine(
    known.map((member): Answer => {
      if ('exact' in member) {
        const result = resolvePath(member.exact, segments as PathSegment[])
        if (result.found) values.push(exactly(result.value))
        return result.found ? 'yes' : 'no'
      }
      const [segment, ...rest] = segments
      const step = (inner: Known, here: Answer): Answer => {
        if (here === 'no') return 'no'
        const deeper = drill(inner, rest)
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
            member.length === undefined ? 'maybe' : index < member.length ? 'yes' : 'no'
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
  return { value: union(...values), found: known.length === 0 ? 'yes' : found }
}

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
    const admits = (value: string | number | boolean) =>
      member.type === 'integer' ? Number.isInteger(value) : typeof value === member.type
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
 * where the type is narrower (a number checked as an integer is one).
 */
export const narrow = (known: Known, type: ExpectedType): Known => {
  if (fits(known, type) === 'yes') return known
  return union(
    ...known.map((member): Known => {
      if (fits([member], type) === 'no') return NOTHING
      if ('exact' in member) return [member]
      if (isLiteralType(type))
        return type.literal
          .filter((value) => fits([member], { literal: [value] }) !== 'no')
          .map((value) => ({ exact: value }))
      if (member.type === 'number') return [{ type: 'integer' }]
      return [member]
    })
  )
}

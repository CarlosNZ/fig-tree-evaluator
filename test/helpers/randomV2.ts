/**
 * Random v2 input for the converter's contract (Phase 15.1): expressions and
 * options built from the v2 reference table, well-formed and malformed
 * mixed, from a seed, so every run is the same run. No node spells one
 * parameter twice, so no input's meaning depends on its key order.
 */
import type { V2Options } from '../../src/migrationTypes'
import { V2_NAMES, V2_PARAMETERS } from '../../src/migrate/v2/operators.generated'

/** A seeded generator of numbers in [0, 1) (mulberry32) */
export const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

type Random = () => number

const pick = <T>(random: Random, list: readonly T[]): T => list[Math.floor(random() * list.length)]

const NAMES = Object.keys(V2_NAMES)

/** Values that fit some parameter somewhere, or no parameter at all */
export const JUNK: readonly unknown[] = [
  null,
  5,
  0,
  -7,
  'x',
  '',
  true,
  false,
  [],
  {},
  '$a',
  '$b',
  '$country',
  'a.b',
  '%1 and %2',
  '{{x}} {{y.z}}',
  '\\%1',
  'number',
  'array',
  'string',
  'remainder',
  'nope',
  [1, 2, 3],
  ['a', 'b'],
  { x: 1 },
  'getData',
  '$data',
  'https://example.org',
  'fn',
]

// Keys a node may hold that are no parameter of its operator
const OTHER_KEYS = [
  'fallback',
  'outputType',
  'type',
  'useCache',
  '//',
  'children',
  'values',
  'strict',
  'single',
  'flatten',
  'output',
  'numberMapping',
  'substitutionCharacter',
  'functionName',
  'input',
  'branches',
  'excludeTrailing',
]

const value = (random: Random, depth: number): unknown => {
  const r = random()
  if (depth <= 0 || r < 0.35) return pick(random, JUNK)
  if (r < 0.45)
    return Array.from({ length: Math.floor(random() * 4) }, () => value(random, depth - 1))
  if (r < 0.52) return { x: value(random, depth - 1), $y: value(random, depth - 1) }
  return expression(random, depth - 1)
}

/** A random v2 expression: nodes, shorthand, calls and junk, `depth` deep */
export const expression = (random: Random, depth: number): unknown => {
  const r = random()
  if (r < 0.12) return { [`$${pick(random, NAMES)}`]: value(random, depth) }
  if (r < 0.2)
    return {
      fragment: pick(random, ['f', 'g', 'h', 'nope', 5]),
      ...(random() < 0.5
        ? { $a: value(random, depth) }
        : {
            parameters:
              random() < 0.8
                ? { $a: value(random, depth), b: value(random, depth) }
                : value(random, depth),
          }),
    }
  if (r < 0.24) return { $f: random() < 0.7 ? { $a: value(random, depth) } : value(random, depth) }
  if (r < 0.27) return { $fn: value(random, depth) }
  if (r < 0.3)
    return {
      operator: pick(random, ['fn', 'nope', 5, null, { operator: '+' }]),
      input: value(random, depth),
    }
  const name =
    random() < 0.9 ? pick(random, NAMES) : pick(random, [5, null, 'nope', { $getData: 'x' }])
  const node: Record<string, unknown> = { operator: name }
  const parameters = typeof name === 'string' && V2_NAMES[name] ? V2_PARAMETERS[V2_NAMES[name]] : []
  // One spelling of each parameter, since v2 read whichever came later
  const spelled = (key: string) =>
    parameters.some(({ name, aliases }) => {
      const spellings = [name, ...aliases]
      return spellings.includes(key) && spellings.some((spelling) => Object.hasOwn(node, spelling))
    })
  for (let i = Math.floor(random() * 4); i > 0; i--) {
    const parameter =
      parameters.length > 0 && random() < 0.75 ? pick(random, parameters) : undefined
    const key = parameter
      ? random() < 0.7 || parameter.aliases.length === 0
        ? parameter.name
        : pick(random, parameter.aliases)
      : pick(random, OTHER_KEYS)
    if (!spelled(key)) node[key] = value(random, depth)
  }
  if (random() < 0.15) node[pick(random, ['$a', '$b', '$c.d', '$vars'])] = value(random, depth)
  return node
}

const definition = (random: Random): unknown => {
  if (random() < 0.2) return pick(random, JUNK)
  const body = expression(random, 2)
  if (random() >= 0.4 || typeof body !== 'object' || body === null) return body
  const declared = {
    name: pick(random, ['$a', 'b', '$fallback', 5]),
    type: pick(random, ['string', 'undefined', ['number', 'undefined'], 'weird', undefined]),
    default: pick(random, [1, 'x', undefined, { $getData: 'q' }]),
    required: random() < 0.5,
  }
  return { ...body, metadata: { parameters: [declared] } }
}

/** Random v2 options, the fragments' bodies drawn like expressions */
export const options = (random: Random): V2Options => {
  const result: Record<string, unknown> = {}
  if (random() < 0.5)
    result.fragments = Object.fromEntries(
      ['f', 'g', 'h'].filter(() => random() < 0.7).map((key) => [key, definition(random)])
    )
  if (random() < 0.1) result.fragments = pick(random, JUNK)
  if (random() < 0.3) result.functions = random() < 0.5 ? ['fn'] : { fn: () => 1 }
  if (random() < 0.05) result.functions = pick(random, [null, 5, 'fn'])
  if (random() < 0.3) result.evaluateFullObject = random() < 0.9 ? true : 1
  if (random() < 0.15) result.noShorthand = true
  if (random() < 0.2) result.caseInsensitive = true
  if (random() < 0.1) result.useCache = random() < 0.5
  return result as V2Options
}

/** `count` random cases from `seed`, each an expression and its options */
export const randomCases = (seed: number, count: number) => {
  const random = seeded(seed)
  return Array.from({ length: count }, () => ({
    input: expression(random, 4),
    options: options(random),
  }))
}

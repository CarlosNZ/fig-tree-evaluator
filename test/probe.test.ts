/**
 * Chunk 4.0 — the constancy probe ("Skip the compile for inert inputs" in
 * docs-dev/v3-specs/v3-implementation-notes.md): the allocation-free,
 * early-bailing scan `evaluate()` runs before parsing. It is a second
 * answer to "would evaluation be identity?", so its shipping condition is
 * the property test at the bottom: the probe says constant exactly when the
 * compiler would compile the input to a constant node holding the input
 * itself — no normalization (`//`, `vars`, `undefined`), no holes.
 */
import { compileExpression } from '../src/compile'
import { probeConstant } from '../src/compile/probe'
import { makeCompileRegistry } from './fixtures/compileRegistry'

const registry = makeCompileRegistry()
const probe = (value: unknown) => probeConstant(value, registry)
const compile = (input: unknown) => compileExpression(input, registry)

describe('constant inputs', () => {
  test.each([
    ['null', null],
    ['number', 42],
    ['boolean', false],
    ['plain string', 'hello'],
    ['unrecognized $string', '$flibble.x'],
    ['inert $ key', { $flibble: 1 }],
    ['reserved modifier keys on plain data', { fallback: 1, useCache: true }],
    ['nested plain data', { a: [1, { b: 'c', d: [null, true] }] }],
    ['opaque value', new Date(0)],
    ['opaque inside plain data', { when: new Date(0), re: /x/ }],
    ['empty containers', { a: [], b: {} }],
  ])('%s', (_label, value) => {
    expect(probe(value).constant).toBe(true)
  })
})

describe('bail conditions — anything the compiler would evaluate or normalize', () => {
  test.each([
    ['operator key', { operator: 'plus', values: [1, 2] }],
    ['fragment key', { fragment: 'f' }],
    ['recognized shorthand key', { $plus: [1, 2] }],
    ['recognized alias key', { '$+': [1, 2] }],
    ['literal shorthand', { $literal: { anything: 1 } }],
    ['reference string', '$data.x'],
    ['bare $data', '$data'],
    ['alias reference', '$d.x'],
    ['invalid reference (bare $vars)', '$vars'],
    ['vars key on plain data', { vars: { a: 1 }, b: 2 }],
    ['comment key', { '//': 'note', a: 1 }],
    ['undefined value in an object', { a: undefined }],
    ['undefined element in an array', [1, undefined]],
    ['nested deep inside plain data', { a: [1, { b: { c: '$data.deep' } }] }],
    ['nested shorthand inside an array', [1, 2, { $plus: [1, 2] }]],
  ])('%s', (_label, value) => {
    expect(probe(value).constant).toBe(false)
  })
})

describe('depth tracking and the ceiling', () => {
  const nest = (depth: number, leaf: unknown) => {
    let value = leaf
    for (let i = 0; i < depth; i++) value = { k: value }
    return value
  }

  test('reports the measured depth of a constant input', () => {
    expect(probe(1).depth).toBe(0)
    expect(probe({ a: 1 }).depth).toBe(1)
    expect(probe(nest(7, 'leaf')).depth).toBe(7)
  })

  test('a value beyond the ceiling is not constant, and the scan does not overflow', () => {
    let result: ReturnType<typeof probe> | undefined
    expect(() => {
      result = probe(nest(5000, 1))
    }).not.toThrow()
    expect(result!.constant).toBe(false)
  })
})

// ── The property: probe(x) ⇔ the compiler compiles x to a constant node whose
// value IS x ──────────────────────────────────────────────────────────

/** A few dozen expression shapes the v2 corpus and the v3 specs use. */
const corpus: unknown[] = [
  'Just a string',
  true,
  666,
  ['Pharmaceutical', 'Natural Product', 'Other'],
  { one: 1, two: 'two', three: null, five: true, 6: [1, 2, 3] },
  { one: 1, four: undefined },
  { operator: '+', children: [6, 6] },
  { operator: 'Plus', children: [7.5, 25, -0.1, 6] },
  { $plus: [1, 2, 3] },
  { '$+': ['$data.a', 1] },
  { operator: 'if', condition: '$data.ok', then: 'yes', else: 'no' },
  { $if: ['$data.isMember', 'Welcome back', 'Please sign up'] },
  { $not: { '$>': ['$data.age', 18] } },
  { title: { $format: ['Hello %1', '$data.name'] } },
  { title: 'static', count: 3, tags: ['a', 'b'] },
  { meta: { generated: 'v3-example', version: 3 } },
  { greeting: 'hi', '//': 'a comment' },
  { vars: { promotional: true }, label: 'x' },
  { $literal: { operator: 'plus', values: [1, 2] } },
  { $match: { value: 1 }, fallback: null },
  { $typo: [1, 2], fallback: 2 },
  '$dat.user.name',
  'Hello $data.name',
  { a: '$vars.x' },
  { $clamp: [5, null] },
  { options: Array.from({ length: 30 }, (_, i) => ({ label: `L${i}`, value: i })) },
  { deep: { nesting: { here: [1, 2, 3, { $plus: [1, 1] }] } } },
  [[[[['$data.deep']]]]],
  [[[[['plain']]]]],
  new Map([['k', 1]]),
  { when: new Date(0) },
  () => 'fn',
  undefined,
]

/** A seeded generator of JSON-ish values seasoned with FigTree tokens. */
const makeRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

const STRINGS = ['hello', '$data.x', '$d.y[0]', '$flibble', '$vars', 'Hi $data.x', '', '$index']
const KEYS = [
  'a',
  'b',
  'c',
  '//',
  'vars',
  'operator',
  'fragment',
  '$plus',
  '$typo',
  'fallback',
  'as',
]

const randomValue = (rand: () => number, depth: number): unknown => {
  const pick = rand()
  if (depth >= 4 || pick < 0.35) {
    const leaf = rand()
    if (leaf < 0.2) return Math.floor(rand() * 100)
    if (leaf < 0.3) return rand() < 0.5
    if (leaf < 0.4) return null
    if (leaf < 0.45) return undefined
    if (leaf < 0.5) return new Date(Math.floor(rand() * 1e12))
    return STRINGS[Math.floor(rand() * STRINGS.length)]
  }
  const size = Math.floor(rand() * 4)
  if (pick < 0.65) return Array.from({ length: size }, () => randomValue(rand, depth + 1))
  const object: Record<string, unknown> = {}
  for (let i = 0; i < size; i++)
    object[KEYS[Math.floor(rand() * KEYS.length)]] = randomValue(rand, depth + 1)
  return object
}

const isIdentityConstant = (input: unknown) => {
  const artifact = compile(input)
  return artifact.root.kind === 'constant' && artifact.root.value === input
}

test('property: probeConstant(x).constant === (compile(x) is a constant node holding x)', () => {
  const rand = makeRandom(20260918)
  const samples = [...corpus, ...Array.from({ length: 600 }, () => randomValue(rand, 0))]
  const disagreements = samples.filter(
    (sample) => probe(sample).constant !== isIdentityConstant(sample)
  )
  expect(disagreements).toEqual([])
})

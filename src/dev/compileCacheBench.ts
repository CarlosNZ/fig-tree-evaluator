/**
 * Compile-cache content-layer benchmark — `pnpm dev compileCacheBench`.
 *
 * The question: on a content-layer hit the caller pays a serialization of
 * the whole input plus a string-keyed map lookup, where a miss pays the
 * compile instead. Can the first ever cost more than the second?
 *
 * The two sides scale on different things, which is the whole story: the
 * compiler's cost tracks *evaluable nodes* (a constant subtree collapses to
 * one node holding the caller's value by reference), while the key's cost
 * tracks *input bytes* — every one of them serialized, and then every one
 * of them hashed again by the `Map`. So the answer depends on how much
 * static bulk an expression carries per hole, and three sections measure
 * it from three directions.
 *
 * Only registered operators appear in the shapes. An unregistered `$name`
 * earns a did-you-mean warning, whose edit-distance scan over every
 * registered name costs more than the rest of the compile put together —
 * that would measure the suggestion machinery, not the compiler.
 */
import { buildRegistry } from '../registry'
import { coreOperators } from '../operators'
import { CONTENT_LAYER_SIZE, compileExpression, probeConstant, runStaticChecks } from '../compile'
import { serializeInput } from '../compile/contentKey'

const registry = buildRegistry({ operators: [coreOperators] })

const compile = (expression: unknown) => {
  const artifact = compileExpression(expression, registry)
  runStaticChecks(artifact)
  return artifact
}

// ── Timing ──────────────────────────────────────────────────────────────

/**
 * Every measurement is the min of five rounds after a warm-up: the min is
 * the least noise-contaminated estimator, since noise only ever adds.
 * Each call's result is folded into a sink so nothing is optimized away.
 */
let sink = 0
const round = (iterations: number, run: (i: number) => unknown): number => {
  const start = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) sink += run(i) === undefined ? 0 : 1
  return Number(process.hrtime.bigint() - start) / iterations
}

const time = (iterations: number, run: (i: number) => unknown): number => {
  round(Math.min(iterations, 2000), run)
  let best = Infinity
  for (let r = 0; r < 5; r++) best = Math.min(best, round(iterations, run))
  return best
}

const us = (ns: number) => (ns / 1000).toFixed(ns < 1000 ? 3 : 2)
const pad = (text: string, width: number) => text.padStart(width)
const columns = (first: string, rest: [string, number][]) =>
  console.log(first.padEnd(32) + rest.map(([text, width]) => pad(text, width)).join(''))

// ── Section 1: whole shapes ─────────────────────────────────────────────

const bigString = 'lorem ipsum dolor sit amet, consectetur adipiscing. '.repeat(2000) // ~100 KB

/** The Conforma shape: a config of mostly-static sections with few holes. */
const config = (sections: number, holesEvery: number) => ({
  title: 'Application form',
  sections: Array.from({ length: sections }, (_, i) => ({
    code: `section${i}`,
    title: `Section ${i}`,
    index: i,
    enabled: true,
    description: 'Some static descriptive text that sits in the config unchanged.',
    ...(i % holesEvery === 0
      ? { visible: { $and: ['$data.user.isAdmin', { $notEqual: ['$data.stage', 'draft'] }] } }
      : { visible: true }),
  })),
})

const shapes: { name: string; input: unknown; iterations: number }[] = [
  { name: 'tiny expression', input: { $plus: ['$data.a', 1] }, iterations: 200_000 },
  {
    name: 'form-shaped (6 ops, refs)',
    input: {
      $and: [
        { $notEqual: ['$data.applicant.name', ''] },
        { $greaterThan: [{ $get: 'applicant.age' }, 17] },
        { $or: ['$data.applicant.resident', { $equal: ['$data.applicant.visa', 'valid'] }] },
      ],
    },
    iterations: 100_000,
  },
  {
    name: 'all holes, no constants',
    input: Array.from({ length: 40 }, (_, i) => ({
      $plus: [`$data.f${i}`, { $buildString: ['x', `$data.g${i}`] }],
    })),
    iterations: 20_000,
  },
  { name: 'config: 20 sections, hole in 4', input: config(20, 4), iterations: 20_000 },
  { name: 'config: 100 sections, hole in 10', input: config(100, 10), iterations: 5_000 },
  { name: 'config: 500 sections, hole in 50', input: config(500, 50), iterations: 1_000 },
  {
    name: 'one hole + 100 KB string',
    input: { $and: ['$data.ok', bigString] },
    iterations: 20_000,
  },
  {
    name: 'one hole + 200-entry options',
    input: {
      $and: [
        '$data.ok',
        Array.from({ length: 200 }, (_, i) => ({ label: `Option ${i}`, value: i, group: 'x' })),
      ],
    },
    iterations: 5_000,
  },
  {
    name: 'one hole + 2000 static fields',
    input: {
      visible: { $equal: ['$data.stage', 'live'] },
      fields: Object.fromEntries(
        Array.from({ length: 2000 }, (_, i) => [`field${i}`, i % 3 === 0 ? `label ${i}` : i])
      ),
    },
    iterations: 500,
  },
]

const wholeShapes = () => {
  console.log('\n1) WHOLE SHAPES — what a content hit costs against the compile it replaces\n')
  columns('shape', [
    ['probe', 8],
    ['serialize', 11],
    ['hit', 9],
    ['compile', 10],
    ['hit/compile', 13],
    ['key KB', 9],
    ['nodes', 7],
  ])
  console.log('─'.repeat(99))

  for (const { name, input, iterations } of shapes) {
    const key = serializeInput(input)
    if (key === undefined) throw new Error(`${name}: the serializer refused the input`)
    const artifact = compile(input)
    if (artifact.holes.length === 0) throw new Error(`${name}: no holes — not a content input`)
    if (artifact.issues.length > 0)
      throw new Error(`${name}: ${artifact.issues[0].issue.message} — measuring the wrong thing`)

    // Loaded to the layer's bound, so the hit is found among neighbours
    // rather than in a map of one
    const map = new Map<string, unknown>()
    for (let i = 0; i < CONTENT_LAYER_SIZE - 1; i++) map.set(`${key}#filler${i}`, artifact)
    map.set(key, artifact)

    const probe = time(iterations, () => probeConstant(input, registry).constant)
    const serialize = time(iterations, () => serializeInput(input))
    const hit = time(iterations, () => map.get(serializeInput(input) as string))
    const compileNs = time(iterations, () => compile(input))

    columns(name, [
      [us(probe), 8],
      [us(serialize), 11],
      [us(hit), 9],
      [us(compileNs), 10],
      [`${(hit / compileNs).toFixed(2)}×`, 13],
      [(key.length / 1024).toFixed(1), 9],
      [String(artifact.nodeCount), 7],
    ])
  }
}

// ── Section 2: the crossover ────────────────────────────────────────────

const lorem = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do '
const text = (chars: number) => lorem.repeat(Math.ceil(chars / lorem.length)).slice(0, chars)

const sweep = (title: string, build: (chars: number) => unknown, sizes: number[]) => {
  console.log(`\n   ${title}`)
  columns('   static chars', [
    ['serialize', 11],
    ['hit', 9],
    ['compile', 10],
    ['hit/compile', 13],
  ])
  console.log('   ' + '─'.repeat(72))
  for (const chars of sizes) {
    const input = build(chars)
    const key = serializeInput(input) as string
    const artifact = compile(input)
    if (artifact.holes.length === 0 || artifact.issues.length > 0)
      throw new Error(`${title} @ ${chars}: not a clean content-layer shape`)
    const map = new Map<string, unknown>([[key, artifact]])
    const iterations = chars > 100_000 ? 2_000 : chars > 20_000 ? 10_000 : 50_000
    const serialize = time(iterations, () => serializeInput(input))
    const hit = time(iterations, () => map.get(serializeInput(input) as string))
    const compileNs = time(iterations, () => compile(input))
    columns(`   ${chars}`, [
      [us(serialize), 11],
      [us(hit), 9],
      [us(compileNs), 10],
      [`${(hit / compileNs).toFixed(2)}×`, 13],
    ])
  }
}

const SIZES = [0, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 200_000]

const crossover = () => {
  console.log('\n\n2) CROSSOVER — static bulk added to a fixed number of holes\n')
  sweep('one hole + ONE static string of N chars', (n) => ({ $and: ['$data.ok', text(n)] }), SIZES)
  sweep(
    'one hole + N chars spread over 50-char strings',
    (n) => ({
      $and: [
        '$data.ok',
        Array.from({ length: Math.max(1, Math.round(n / 50)) }, (_, i) => text(50) + i),
      ],
    }),
    SIZES
  )
  sweep(
    'six ops + ONE static string of N chars',
    (n) => ({
      $and: [
        { $notEqual: ['$data.applicant.name', ''] },
        { $greaterThan: [{ $get: 'applicant.age' }, 17] },
        { $or: ['$data.applicant.resident', { $equal: ['$data.applicant.visa', 'valid'] }] },
        text(n),
      ],
    }),
    SIZES
  )
}

// ── Section 3: what the Map itself charges ──────────────────────────────

/**
 * The lookup is not the free half of the hit. V8 hashes a string key by
 * content only up to `String::kMaxHashCalcLength` (16383); past that it
 * substitutes a hash derived from the length alone. Both sides of that
 * line matter here — below it every lookup re-hashes the whole key, and
 * above it keys that share a length share a bucket.
 *
 * Keys are rebuilt with `join('')`, the way `serializeInput` builds them,
 * so each one is genuinely new and carries no cached hash; the rebuild is
 * measured on its own and subtracted.
 */
const pieces = (key: string) => [key.slice(0, key.length >> 1), key.slice(key.length >> 1)]

const mapCosts = () => {
  const ROUNDS = 3000

  console.log('\n\n3) THE MAP ITSELF — hashing a fresh key, and what shares a bucket\n')
  columns('   one entry, key of N chars', [
    ['rebuild', 10],
    ['get', 10],
    ['get ns/char', 14],
  ])
  console.log('   ' + '─'.repeat(63))
  for (const n of [1_000, 4_000, 8_000, 12_000, 16_000, 16_380, 16_384, 17_000, 32_000, 64_000]) {
    const key = text(n)
    const parts = pieces(key)
    const map = new Map([[key, 1]])
    const build = time(ROUNDS, () => parts.join(''))
    const both = time(ROUNDS, () => map.get(parts.join('')))
    columns(`   ${n}`, [
      [us(build), 10],
      [us(both - build), 10],
      [((both - build) / n).toFixed(3), 14],
    ])
  }

  console.log(`\n   ${CONTENT_LAYER_SIZE} entries of ~20000 chars, sharing a prefix\n`)
  columns('   key lengths', [
    ['rebuild', 10],
    ['get', 10],
  ])
  console.log('   ' + '─'.repeat(49))
  for (const [label, extra] of [
    ['all identical', () => ''],
    ['all distinct', (i: number) => '.'.repeat(i)],
  ] as [string, (i: number) => string][]) {
    const keys = Array.from(
      { length: CONTENT_LAYER_SIZE },
      (_, i) => `${text(20_000)}|${String(i).padStart(4, '0')}${extra(i)}`
    )
    const map = new Map(keys.map((key, i) => [key, i]))
    const parts = pieces(keys[CONTENT_LAYER_SIZE - 63])
    const build = time(ROUNDS, () => parts.join(''))
    const both = time(ROUNDS, () => map.get(parts.join('')))
    columns(`   ${label}`, [
      [us(build), 10],
      [us(both - build), 10],
    ])
  }
}

console.log(`\nnode ${process.version}  —  all times µs/op unless noted`)
wholeShapes()
crossover()
mapCosts()
console.log(`\n(sink ${sink})\n`)

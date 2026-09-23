/**
 * Phase-3.2 white-box suite: constancy classification, skeleton + hole
 * extraction, shielding precompute, counts, dependency recording and the
 * identity-only flag (obligations A2/A4/B1/B2/B4/B6/C5 in
 * docs-dev/v3-specs/v3-artifact-obligations.md).
 */
import { compileExpression } from '../src/compile'
import type { CompileArtifact } from '../src/compile'
import { makeCompileRegistry } from './fixtures/compileRegistry'

const registry = makeCompileRegistry()
const compile = (input: unknown): CompileArtifact => compileExpression(input, registry)

/** Dependency paths are stored as segments; render them for readability. */
const paths = (artifact: CompileArtifact): string[] => [...artifact.dependencies.dataPaths.keys()]

// ── Constancy and hole extraction ───────────────────────────────────

test('worked example 1 shape: constant shells are not holes, deep holes are', () => {
  const dashboard = {
    meta: { generated: 'v3-example', version: 3 },
    user: {
      displayName: { $format: ['%1 %2', '$data.user.first', '$data.user.last'] },
      avatar: {
        operator: 'http',
        url: 'https://api.example.com/avatar',
        fallback: 'default.png',
      },
    },
    stats: {
      total: { $plus: ['$data.stats.wins', '$data.stats.losses'] },
    },
  }
  const artifact = compile(dashboard)
  expect(artifact.root.kind).toBe('skeleton')
  expect(artifact.holes.map((h) => h.path)).toEqual([
    ['user', 'displayName'],
    ['user', 'avatar'],
    ['stats', 'total'],
  ])
})

test('nested plain literals flatten into the enclosing skeleton', () => {
  const artifact = compile({ a: { b: { c: { $plus: [1, 2] } } } })
  expect(artifact.root.kind).toBe('skeleton')
  expect(artifact.holes).toHaveLength(1)
  expect(artifact.holes[0].path).toEqual(['a', 'b', 'c'])
})

test('a plain literal inside an operator parameter compiles as a skeleton', () => {
  const artifact = compile({
    operator: 'http',
    url: 'https://x.test',
    query: { status: 'open', assignee: '$data.userId' },
  })
  expect(artifact.holes).toHaveLength(1)
  const root = artifact.holes[0].node
  expect(root.kind).toBe('operator')
  const query = (root as { params?: Record<string, { kind: string }> }).params!.query
  expect(query.kind).toBe('skeleton')
})

test('arrays with evaluable elements are skeletons too', () => {
  const artifact = compile([1, { $plus: [1, 2] }, 3])
  expect(artifact.root.kind).toBe('skeleton')
  expect(artifact.holes).toHaveLength(1)
  expect(artifact.holes[0].path).toEqual([1])
})

// ── Shielding precompute ────────────────────────────────────────────

test('static fallbacks shield; a constant null fallback still shields', () => {
  const artifact = compile({
    a: { $http: 'https://x.test', fallback: [] },
    b: { $format: ['Hi %1', '$data.name'], fallback: null },
  })
  expect(artifact.timeoutShielded).toBe(true)
  expect(artifact.holes[0].timeoutFallback).toEqual({ value: [] })
  expect(artifact.holes[1].timeoutFallback).toEqual({ value: null })
})

test('a dynamic fallback never counts toward shielding', () => {
  const artifact = compile({
    a: { $http: 'https://x.test', fallback: [] },
    b: { $http: 'https://y.test', fallback: '$data.cached' },
  })
  expect(artifact.timeoutShielded).toBe(false)
  expect(artifact.holes[1].timeoutFallback).toBeUndefined()
})

test('a hole with no fallback at all unshields the expression', () => {
  const artifact = compile({ a: { $http: 'https://x.test' } })
  expect(artifact.timeoutShielded).toBe(false)
})

test('an operatorDefaults modifier fallback counts as a static fallback', () => {
  const withDefaults = makeCompileRegistry({ http: { fallback: 'offline' } })
  const artifact = compileExpression({ a: { $http: 'https://x.test' } }, withDefaults)
  expect(artifact.timeoutShielded).toBe(true)
  expect(artifact.holes[0].timeoutFallback).toEqual({ value: 'offline' })
})

test('a fully-constant expression is vacuously shielded', () => {
  const artifact = compile({ just: 'data' })
  expect(artifact.holes).toHaveLength(0)
  expect(artifact.timeoutShielded).toBe(true)
})

// ── Counts ──────────────────────────────────────────────────────────

test('nodeCount and maxDepth are measured and stored as numbers', () => {
  // nodeCount counts evaluable nodes (the reference here), not walked values
  const artifact = compile({ a: { b: [1, '$data.x'] } })
  expect(typeof artifact.nodeCount).toBe('number')
  expect(typeof artifact.maxDepth).toBe('number')
  expect(artifact.nodeCount).toBe(1)

  const deeper = compile({ a: { b: { c: { d: { e: 1 } } } } })
  expect(deeper.maxDepth).toBeGreaterThan(artifact.maxDepth)
})

// ── Dependency recording ────────────────────────────────────────────

test('statically-known $data paths are recorded, deduplicated, alias-normalized', () => {
  const artifact = compile({
    a: '$data.user.name',
    b: '$d.user.name',
    c: '$data.orders[0].total',
    d: '$data.orders[*].total',
    e: '$vars.internal',
  })
  expect(paths(artifact).sort()).toEqual(['orders[*].total', 'orders[0].total', 'user.name'])
  expect(artifact.dependencies.dynamic).toBe(false)
})

test('a bare $data reference flips the dynamic flag', () => {
  const artifact = compile({ whole: '$data' })
  expect(artifact.dependencies.dynamic).toBe(true)
})

test('a literal get path joins the list — the sugar equivalence', () => {
  const artifact = compile({
    a: { $get: 'user.name' },
    b: { $get: { path: 'orders[*].total' } },
    c: { $get: ['letters[0]', 'fallback value'] },
  })
  expect(paths(artifact).sort()).toEqual(['letters[0]', 'orders[*].total', 'user.name'])
  expect(artifact.dependencies.dynamic).toBe(false)
})

test('a get path spelled as segments joins the list in the shared grammar', () => {
  const artifact = compile({ a: { $get: { path: ['users', 0, 'name'] } } })
  expect(paths(artifact)).toEqual(['users[0].name'])
})

test('a computed get path flips the dynamic flag instead', () => {
  const artifact = compile({ a: { $get: '$data.chosen' } })
  expect(artifact.dependencies.dynamic).toBe(true)
  // The reference supplying the path is itself a known read
  expect(paths(artifact)).toEqual(['chosen'])
})

test('a get with `from` reads no $data path at all', () => {
  const artifact = compile({ a: { $get: { path: 'name', from: { $plus: [1, 2] } } } })
  expect(paths(artifact)).toEqual([])
  expect(artifact.dependencies.dynamic).toBe(false)
})

test('a malformed literal get path records nothing and does not throw', () => {
  const artifact = compile({ a: { $get: 'a[' } })
  expect(paths(artifact)).toEqual([])
})

test('a dotted key and a two-level path are different reads, and stay so', () => {
  // The defect the segment form closes: both rendered `first.last` when
  // the record held strings, so one deduplicated the other away
  const artifact = compile({
    a: { $get: { path: ['first.last'] } },
    b: '$data.first.last',
  })
  expect(paths(artifact).sort()).toEqual(['["first.last"]', 'first.last'])
})

test('invoked operators and called fragments are recorded by canonical name', () => {
  const artifact = compile({
    a: { '$+': [1, 2] },
    b: { $http: 'https://x.test' },
    c: { fragment: 'summary' },
  })
  expect(artifact.dependencies.operators.sort()).toEqual(['http', 'plus'])
  expect(artifact.dependencies.fragments).toEqual(['summary'])
})

test('a dynamic-arguments fragment call flips the dynamic flag', () => {
  const artifact = compile({ fragment: 'f', parameters: '$data.formValues' })
  expect(artifact.dependencies.dynamic).toBe(true)
})

// ── Identity-only marking ───────────────────────────────────────────

test('opaque constants mark the artifact identity-only', () => {
  expect(compile({ stamp: new Date(0) }).identityOnly).toBe(true)
  expect(compile({ plain: [1, 'two', null] }).identityOnly).toBe(false)
})

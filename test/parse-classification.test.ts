/**
 * Phase-3.2 white-box suite: constancy classification, skeleton + hole
 * extraction, shielding precompute, counts, dependency recording and the
 * identity-only flag (obligations A2/A4/B1/B2/B4/B6/C5 in
 * docs-dev/v3-specs/v3-artifact-obligations.md).
 */
import { parseExpression } from '../src/parse'
import type { ParseArtifact } from '../src/parse'
import { makeParseRegistry, noFragments } from './fixtures/parseRegistry'

const registry = makeParseRegistry()
const parse = (input: unknown): ParseArtifact => parseExpression(input, registry, noFragments)

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
  const artifact = parse(dashboard)
  expect(artifact.root.kind).toBe('template')
  expect(artifact.holes.map((h) => h.path)).toEqual([
    ['user', 'displayName'],
    ['user', 'avatar'],
    ['stats', 'total'],
  ])
})

test('nested plain literals flatten into the enclosing template', () => {
  const artifact = parse({ a: { b: { c: { $plus: [1, 2] } } } })
  expect(artifact.root.kind).toBe('template')
  expect(artifact.holes).toHaveLength(1)
  expect(artifact.holes[0].path).toEqual(['a', 'b', 'c'])
})

test('a plain literal inside an operator parameter compiles as a template', () => {
  const artifact = parse({
    operator: 'http',
    url: 'https://x.test',
    query: { status: 'open', assignee: '$data.userId' },
  })
  expect(artifact.holes).toHaveLength(1)
  const root = artifact.holes[0].node
  expect(root.kind).toBe('operator')
  const query = (root as { params?: Record<string, { kind: string }> }).params!.query
  expect(query.kind).toBe('template')
})

test('arrays with evaluable elements are templates too', () => {
  const artifact = parse([1, { $plus: [1, 2] }, 3])
  expect(artifact.root.kind).toBe('template')
  expect(artifact.holes).toHaveLength(1)
  expect(artifact.holes[0].path).toEqual([1])
})

// ── Shielding precompute ────────────────────────────────────────────

test('static fallbacks shield; a constant null fallback still shields', () => {
  const artifact = parse({
    a: { $http: 'https://x.test', fallback: [] },
    b: { $format: ['Hi %1', '$data.name'], fallback: null },
  })
  expect(artifact.shielded).toBe(true)
  expect(artifact.holes[0].staticFallback).toEqual({ value: [] })
  expect(artifact.holes[1].staticFallback).toEqual({ value: null })
})

test('a dynamic fallback never counts toward shielding', () => {
  const artifact = parse({
    a: { $http: 'https://x.test', fallback: [] },
    b: { $http: 'https://y.test', fallback: '$data.cached' },
  })
  expect(artifact.shielded).toBe(false)
  expect(artifact.holes[1].staticFallback).toBeUndefined()
})

test('a hole with no fallback at all unshields the expression', () => {
  const artifact = parse({ a: { $http: 'https://x.test' } })
  expect(artifact.shielded).toBe(false)
})

test('an operatorDefaults modifier fallback counts as a static fallback', () => {
  const withDefaults = makeParseRegistry({ http: { fallback: 'offline' } })
  const artifact = parseExpression({ a: { $http: 'https://x.test' } }, withDefaults, noFragments)
  expect(artifact.shielded).toBe(true)
  expect(artifact.holes[0].staticFallback).toEqual({ value: 'offline' })
})

test('a fully-constant expression is vacuously shielded', () => {
  const artifact = parse({ just: 'data' })
  expect(artifact.holes).toHaveLength(0)
  expect(artifact.shielded).toBe(true)
})

// ── Counts ──────────────────────────────────────────────────────────

test('nodeCount and maxDepth are measured and stored as numbers', () => {
  const artifact = parse({ a: { b: [1, 2] } })
  expect(typeof artifact.nodeCount).toBe('number')
  expect(typeof artifact.maxDepth).toBe('number')
  expect(artifact.nodeCount).toBeGreaterThan(0)

  const deeper = parse({ a: { b: { c: { d: { e: 1 } } } } })
  expect(deeper.maxDepth).toBeGreaterThan(artifact.maxDepth)
})

// ── Dependency recording ────────────────────────────────────────────

test('statically-known $data paths are recorded, deduplicated, alias-normalized', () => {
  const artifact = parse({
    a: '$data.user.name',
    b: '$d.user.name',
    c: '$data.orders[0].total',
    d: '$data.orders[*].total',
    e: '$vars.internal',
  })
  expect(artifact.dependencies.dataPaths.sort()).toEqual([
    'orders[*].total',
    'orders[0].total',
    'user.name',
  ])
  expect(artifact.dependencies.dynamic).toBe(false)
})

test('a bare $data reference flips the dynamic flag', () => {
  const artifact = parse({ whole: '$data' })
  expect(artifact.dependencies.dynamic).toBe(true)
})

test('invoked operators and called fragments are recorded by canonical name', () => {
  const artifact = parse({
    a: { '$+': [1, 2] },
    b: { $http: 'https://x.test' },
    c: { fragment: 'summary' },
  })
  expect(artifact.dependencies.operators.sort()).toEqual(['http', 'plus'])
  expect(artifact.dependencies.fragments).toEqual(['summary'])
})

test('a dynamic-arguments fragment call flips the dynamic flag', () => {
  const artifact = parse({ fragment: 'f', parameters: '$data.formValues' })
  expect(artifact.dependencies.dynamic).toBe(true)
})

// ── Identity-only marking ───────────────────────────────────────────

test('opaque constants mark the artifact identity-only', () => {
  expect(parse({ stamp: new Date(0) }).identityOnly).toBe(true)
  expect(parse({ plain: [1, 'two', null] }).identityOnly).toBe(false)
})

/**
 * Phase-3.2 white-box suite: node-kind recognition and the malformed-node
 * hard errors ("Node kinds" and "Malformed-node hard errors" in
 * docs-dev/v3-specs/v3-api.md). Asserts internal artifacts + the issue
 * stream; the black-box surface arrives with validate() (3.3).
 */
import { parseExpression } from '../src/parse'
import type { ParseArtifact, OperatorNode, FragmentCallNode } from '../src/parse'
import { makeParseRegistry, noFragments } from './fixtures/parseRegistry'

const registry = makeParseRegistry()
const parse = (input: unknown): ParseArtifact => parseExpression(input, registry, noFragments)

const issueCodes = (artifact: ParseArtifact, severity?: string) =>
  artifact.issues
    .filter((s) => severity === undefined || s.issue.severity === severity)
    .map((s) => s.issue.code)

// ── Node kinds ──────────────────────────────────────────────────────

test('primitive roots are constants with no holes', () => {
  for (const input of [42, 'hello', true, null]) {
    const artifact = parse(input)
    expect(artifact.root.kind).toBe('constant')
    expect(artifact.holes).toHaveLength(0)
    expect(issueCodes(artifact)).toHaveLength(0)
  }
})

test('an operator node root is the single hole at path []', () => {
  const artifact = parse({ operator: 'plus', values: [1, 2] })
  expect(artifact.root.kind).toBe('operator')
  expect(artifact.holes).toHaveLength(1)
  expect(artifact.holes[0].path).toEqual([])
})

test('a plain-literal root with an embedded node compiles to a template', () => {
  const artifact = parse({ a: { $plus: [1, 2] }, b: 'inert' })
  expect(artifact.root.kind).toBe('template')
  expect(artifact.holes).toHaveLength(1)
  expect(artifact.holes[0].path).toEqual(['a'])
  expect(artifact.holes[0].node.kind).toBe('operator')
})

test('a reference-string root is an evaluable hole', () => {
  const artifact = parse('$data.user.name')
  expect(artifact.root.kind).toBe('reference')
  expect(artifact.holes).toHaveLength(1)
  expect(artifact.holes[0].path).toEqual([])
})

test('non-plain objects are opaque constants, never traversed', () => {
  const artifact = parse({ when: new Date(0), fn: () => 1 })
  expect(artifact.root.kind).toBe('constant')
  expect(artifact.holes).toHaveLength(0)
  expect(issueCodes(artifact)).toHaveLength(0)
})

// ── Malformed-node hard errors (the seven) ──────────────────────────

test.each([
  ['operator and fragment together', { operator: 'plus', fragment: 'f', values: [1] }],
  ['non-literal-string operator value', { operator: 5 }],
  ['non-literal-string fragment value', { fragment: ['x'] }],
  ['canonical key beside a recognized $name', { operator: 'plus', $not: true }],
  ['two recognized $name keys', { $plus: [1, 2], $not: true }],
  ['non-reserved sibling on a shorthand node', { $plus: [1, 2], colour: 'red' }],
])('malformed hard error: %s', (_label, input) => {
  const artifact = parse(input)
  expect(issueCodes(artifact, 'error')).toContain('malformed-node')
  expect(artifact.root.kind).toBe('invalid')
})

test('unknown operator: name is a hard error — an operator key is intent', () => {
  const artifact = parse({ operator: 'flibble' })
  expect(issueCodes(artifact, 'error')).toContain('unknown-operator')
  expect(artifact.root.kind).toBe('invalid')
})

test('operator: keys in authored plain data still error (deep evaluation rule)', () => {
  const artifact = parse({ people: [{ operator: 'Alice' }] })
  expect(issueCodes(artifact, 'error')).toContain('unknown-operator')
})

test('unknown fragment: name is a hard error', () => {
  const artifact = parse({ fragment: 'nope' })
  expect(issueCodes(artifact, 'error')).toContain('unknown-fragment')
})

test('unknown key on a node is a hard error (no hoisting — the thn: typo)', () => {
  const artifact = parse({ operator: 'if', condition: true, then: 1, thn: 2 })
  const unknownKey = artifact.issues.find((s) => s.issue.code === 'unknown-node-key')
  expect(unknownKey).toBeDefined()
  expect(unknownKey!.issue.severity).toBe('error')
  expect(unknownKey!.issue.path).toEqual(['thn'])
})

// ── The $typo contrast and the sibling-key rule ─────────────────────

test('an unrecognized $name key is inert data with a warning, not an error', () => {
  const artifact = parse({ $flibble: [1, 2], fallback: 2 })
  expect(issueCodes(artifact, 'error')).toHaveLength(0)
  expect(issueCodes(artifact, 'warning')).toContain('unrecognized-identifier')
  expect(artifact.root.kind).toBe('constant')
})

test('plain-literal contents under an unrecognized key still traverse', () => {
  const artifact = parse({ $typo: { inner: { $plus: [1, 2] } } })
  expect(artifact.holes).toHaveLength(1)
  expect(artifact.holes[0].path).toEqual(['$typo', 'inner'])
})

test('reserved siblings are legal on a shorthand node', () => {
  const artifact = parse({ $http: 'https://x.test/api', fallback: null, useCache: false })
  expect(issueCodes(artifact, 'error')).toHaveLength(0)
  const root = artifact.root as OperatorNode
  expect(root.kind).toBe('operator')
  expect(root.fallback?.kind).toBe('constant')
  expect(root.useCache).toBe(false)
})

test('reserved modifier keys alone do not make an object a node', () => {
  const artifact = parse({ fallback: 1, useCache: true })
  expect(issueCodes(artifact, 'error')).toHaveLength(0)
  expect(artifact.root.kind).toBe('constant')
  expect(artifact.holes).toHaveLength(0)
})

// ── literal: the parse boundary ─────────────────────────────────────

test('literal contents are never walked, validated or counted', () => {
  const quoted = { operator: 'plus', vars: [1, 2], '//': 'kept', $flibble: true }
  const artifact = parse({ $literal: quoted })
  expect(issueCodes(artifact, 'error')).toHaveLength(0)
  expect(issueCodes(artifact, 'warning')).toHaveLength(0)
  expect(artifact.root.kind).toBe('constant')
  const rootValue = (artifact.root as { value?: unknown }).value
  expect(rootValue).toBe(quoted)

  const bare = parse({ deep: { nesting: { here: [1, 2, 3] } } })
  const viaLiteral = parse({ $literal: { deep: { nesting: { here: [1, 2, 3] } } } })
  expect(viaLiteral.nodeCount).toBeLessThan(bare.nodeCount)
})

test('shorthand literal payload is never disambiguated by JSON type', () => {
  const artifact = parse({ $literal: { value: 1 } })
  expect((artifact.root as { value?: unknown }).value).toEqual({ value: 1 })
})

test('canonical literal takes its content from the value key', () => {
  const artifact = parse({ operator: 'literal', value: { $plus: [1, 2] } })
  expect(artifact.root.kind).toBe('constant')
  expect((artifact.root as { value?: unknown }).value).toEqual({ $plus: [1, 2] })
  expect(artifact.holes).toHaveLength(0)
})

// ── Fragment-call grammar (registrable fragments arrive Phase 11) ───

test('fragment parameters: plain object is the static mode', () => {
  const artifact = parse({ fragment: 'f', parameters: { x: 1 } })
  const root = artifact.root as FragmentCallNode
  expect(root.kind).toBe('fragmentCall')
  expect(root.argumentsMode).toBe('static')
  // Unknown fragment still errors — nothing is registrable yet
  expect(issueCodes(artifact, 'error')).toContain('unknown-fragment')
})

test('fragment parameters: a node or reference is the dynamic mode', () => {
  for (const parameters of [{ $plus: [1, 2] }, '$data.formValues']) {
    const artifact = parse({ fragment: 'f', parameters })
    expect((artifact.root as FragmentCallNode).argumentsMode).toBe('dynamic')
  }
})

test('fragment parameters that are neither object nor node are a hard error', () => {
  const artifact = parse({ fragment: 'f', parameters: [1, 2] })
  expect(issueCodes(artifact, 'error')).toContain('malformed-node')
})

test('useCache is banned on fragment calls', () => {
  const artifact = parse({ fragment: 'f', useCache: true })
  expect(issueCodes(artifact, 'error')).toContain('malformed-node')
})

test('parameters is reserved-unused on operator nodes', () => {
  const artifact = parse({ operator: 'plus', values: [1], parameters: { x: 1 } })
  expect(issueCodes(artifact, 'error')).toContain('malformed-node')
})

// ── v2 divergences (hand-migrated from test/v2-working — the idioms the
//    v3 grammar deliberately kills; catalogued for the Phase-15 converter) ──

test('v2 alias-definition keys beside a shorthand key are now hard errors', () => {
  // v2 23_shorthand "with alias fallback": { $plus: [...], $myFallback: … }
  // defined an alias node. v3: an unrecognized $name is a non-reserved
  // sibling on a shorthand node — the sibling-key rule errors loudly.
  const artifact = parse({ $plus: [1, 2], $myFallback: 'EMPIRE' })
  expect(issueCodes(artifact, 'error')).toContain('malformed-node')
})

test('v2 alias references are inert data with a warning', () => {
  // v2 19_aliasNodes: '$myAlias' strings resolved against alias nodes; v3
  // deleted alias nodes (→ vars) and '$myAlias' matches no namespace.
  const artifact = parse({ $not: '$myAlias' })
  expect(issueCodes(artifact, 'error')).toHaveLength(0)
  expect(issueCodes(artifact, 'warning')).toContain('unrecognized-identifier')
})

test('the v2 children key fails as an ordinary unknown key — no tombstone', () => {
  const artifact = parse({ operator: 'plus', children: [1, 2] })
  const codes = issueCodes(artifact, 'error')
  expect(codes).toContain('unknown-node-key')
})

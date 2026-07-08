/**
 * Phase-3.2 white-box suite: shorthand + alias normalization, positional
 * mapping, reserved-key values, comment stripping and undefined
 * normalization ("Shorthand grammar" and "Naming rules" in
 * docs-dev/v3-specs/v3-api.md; "Positional mapping: positionalParams" in
 * docs-dev/v3-specs/v3-operator-parameters.md).
 */
import { parseExpression } from '../src/parse'
import type { ParseArtifact, OperatorNode, ReferenceNode, TemplateNode } from '../src/parse'
import { makeParseRegistry, noFragments } from './fixtures/parseRegistry'

const registry = makeParseRegistry()
const parse = (input: unknown): ParseArtifact => parseExpression(input, registry, noFragments)

const rootOp = (input: unknown): OperatorNode => {
  const artifact = parse(input)
  expect(artifact.root.kind).toBe('operator')
  return artifact.root as OperatorNode
}

const errorCodes = (artifact: ParseArtifact) =>
  artifact.issues.filter((s) => s.issue.severity === 'error').map((s) => s.issue.code)

// ── Shorthand payload forms ─────────────────────────────────────────

test('object payload binds as named parameters', () => {
  const node = rootOp({ $if: { condition: true, then: 1, else: 2 } })
  expect(node.name).toBe('if')
  expect(Object.keys(node.params).sort()).toEqual(['condition', 'else', 'then'])
})

test('array payload maps positionally', () => {
  const node = rootOp({ $if: [true, 'yes', 'no'] })
  expect(node.params.condition.kind).toBe('constant')
  expect(node.params.then.kind).toBe('constant')
  expect(node.params.else.kind).toBe('constant')
})

test('a single non-array payload binds to the first position verbatim', () => {
  const not = rootOp({ $not: '$data.x' })
  expect(not.params.value.kind).toBe('reference')

  const http = rootOp({ $http: 'https://x.test/api' })
  expect(http.params.url.kind).toBe('constant')
})

test('an object payload that classifies as a node is the single argument', () => {
  const node = rootOp({ $not: { $plus: [1, 2] } })
  expect(node.params.value.kind).toBe('operator')
  expect((node.params.value as OperatorNode).name).toBe('plus')
})

// ── Positional mapping rules ────────────────────────────────────────

test('rest-only lists collect every element', () => {
  const node = rootOp({ $plus: [1, 2, 3] })
  expect(node.params.values.kind).toBe('constant')
  expect((node.params.values as { value?: unknown }).value).toEqual([1, 2, 3])
})

test('a single payload on a rest-first operator reads as dynamic supply', () => {
  const node = rootOp({ $plus: '$data.checks' })
  expect(node.params.values.kind).toBe('reference')
})

test('leading position plus rest (the format shape)', () => {
  const node = rootOp({ $format: ['%1 of %2', '$data.count', 100] })
  expect(node.params.template.kind).toBe('constant')
  expect(node.params.substitutions).toBeDefined()
})

test('trailing positional omission is legal when the parameters are optional', () => {
  const clamp = rootOp({ $clamp: [5] })
  expect(clamp.params.value).toBeDefined()
  expect(clamp.params.min).toBeUndefined()
  expect(clamp.params.max).toBeUndefined()

  const iff = rootOp({ $if: [true, 'yes'] })
  expect(iff.params.else).toBeUndefined()
})

test('surplus positional elements are a parse error naming the mapping', () => {
  for (const input of [{ $not: [1, 2] }, { $clamp: [1, 2, 3, 4] }]) {
    expect(errorCodes(parse(input))).toContain('positional-arity')
  }
})

// ── Alias normalization: canonical names only in the compiled AST ───

test('symbol aliases normalize away in both faces', () => {
  expect(rootOp({ '$?': [true, 1, 2] }).name).toBe('if')
  expect(rootOp({ operator: '?', condition: true, then: 1 }).name).toBe('if')
  expect(rootOp({ '$+': [1, 2] }).name).toBe('plus')
  expect(rootOp({ '$!': true }).name).toBe('not')
})

test('canonical names are case-sensitive — no folding', () => {
  for (const input of [{ operator: 'If' }, { operator: 'PLUS' }]) {
    expect(errorCodes(parse(input))).toContain('unknown-operator')
  }
})

test('namespace aliases normalize to canonical namespaces', () => {
  const cases: [string, string][] = [
    ['$d.org', 'data'],
    ['$v.country', 'vars'],
    ['$p.name', 'params'],
    ['$e.id', 'element'],
    ['$i', 'index'],
  ]
  for (const [raw, namespace] of cases) {
    const artifact = parse({ $not: raw })
    const ref = (artifact.root as OperatorNode).params.value as ReferenceNode
    expect(ref.kind).toBe('reference')
    expect(ref.namespace).toBe(namespace)
    expect(ref.raw).toBe(raw)
  }
})

// ── The reference token rule ────────────────────────────────────────

test('the namespace token must end at end-of-string, dot or bracket', () => {
  const artifact = parse('$database')
  expect(artifact.root.kind).toBe('constant')

  const bare = parse('$data')
  expect(bare.root.kind).toBe('reference')
  expect((bare.root as ReferenceNode).segments).toEqual([])
})

test('references are whole-string only — no interpolation', () => {
  const artifact = parse('Hello $data.name')
  expect(artifact.root.kind).toBe('constant')
  expect(artifact.holes).toHaveLength(0)
})

test('references are recognized inside nested plain literals', () => {
  const artifact = parse({ outer: { list: ['$data.a'] } })
  expect(artifact.holes).toHaveLength(1)
  expect(artifact.holes[0].path).toEqual(['outer', 'list', 0])
})

test('bare $vars and $params are errors; drilled $index is an error', () => {
  for (const input of ['$vars', '$params', '$index.x', '$i[0]']) {
    expect(errorCodes(parse({ $not: input }))).toContain('invalid-reference')
  }
})

// ── Reserved-key values ─────────────────────────────────────────────

test('useCache must be a literal boolean', () => {
  const artifact = parse({ $http: 'https://x.test', useCache: 'yes' })
  expect(errorCodes(artifact)).toContain('malformed-node')
})

test('fallback is a full expression, compiled', () => {
  const node = rootOp({ $http: 'https://x.test', fallback: { $plus: [1, 2] } })
  expect(node.fallback?.kind).toBe('operator')
})

// ── Comments ────────────────────────────────────────────────────────

test('// keys are stripped everywhere: nodes, parameter maps, plain data', () => {
  const node = rootOp({
    '//': 'node comment',
    operator: 'if',
    condition: true,
    then: 1,
  })
  expect(node.params['//']).toBeUndefined()

  const named = rootOp({ $if: { '//': 'in the payload', condition: true, then: 1 } })
  expect(named.params['//']).toBeUndefined()

  const artifact = parse({ '//': 'annotation', kept: 1 })
  expect(artifact.root.kind).toBe('constant')
  expect((artifact.root as { value?: unknown }).value).toEqual({ kept: 1 })
})

// ── undefined normalization (JSON semantics) ────────────────────────

test('undefined object values read as absent keys', () => {
  const artifact = parse({ a: undefined, b: 2 })
  expect((artifact.root as { value?: unknown }).value).toEqual({ b: 2 })
})

test('undefined array elements read as null', () => {
  const node = rootOp({ $plus: [1, undefined, 3] })
  expect((node.params.values as { value?: unknown }).value).toEqual([1, null, 3])
})

// ── Skeleton identity ───────────────────────────────────────────────

test('a fully-constant unchanged input is kept by reference', () => {
  const input = { a: [1, 2], b: { c: 'x' } }
  const artifact = parse(input)
  expect((artifact.root as { value?: unknown }).value).toBe(input)
})

test('templates share constant subtrees with the input', () => {
  const constantBranch = { deep: [1, 2, 3] }
  const artifact = parse({ keep: constantBranch, hole: { $plus: [1, 2] } })
  const skeleton = (artifact.root as TemplateNode).skeleton as Record<string, unknown>
  expect(skeleton.keep).toBe(constantBranch)
})

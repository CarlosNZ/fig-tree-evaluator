/**
 * Phase-3.2 white-box suite: vars-block structure — the shape rule, name
 * legality, plain-literal consumption and the structural-map reading
 * ("`vars` on plain object literals" in docs-dev/v3-specs/v3-api.md).
 * Scope resolution (unresolved vars, cycles, shadowing) is chunk 3.3.
 */
import { compileExpression } from '../src/compile'
import type { CompileArtifact, OperatorNode, SkeletonNode } from '../src/compile'
import { makeCompileRegistry } from './fixtures/compileRegistry'

const registry = makeCompileRegistry()
const compile = (input: unknown): CompileArtifact => compileExpression(input, registry)

const errorCodes = (artifact: CompileArtifact) =>
  artifact.issues.filter((s) => s.issue.severity === 'error').map((s) => s.issue.code)

test('the shape rule is loud: a non-object vars value is a hard error', () => {
  for (const vars of [[1, 2], 'high', 42, null]) {
    const artifact = compile({ operator: 'plus', values: [1], vars })
    expect(errorCodes(artifact)).toContain('invalid-vars')
  }
})

test('vars names follow the shared legality rule', () => {
  const artifact = compile({ operator: 'plus', values: [1], vars: { $bad: 1 } })
  expect(errorCodes(artifact)).toContain('invalid-name')

  const dotted = compile({ operator: 'plus', values: [1], vars: { 'a.b': 1 } })
  expect(errorCodes(dotted)).toContain('invalid-name')
})

test('a vars block is structural, never a node', () => {
  // vars: { operator: 'x' } declares a var NAMED operator
  const artifact = compile({
    operator: 'plus',
    values: ['$vars.operator'],
    vars: { operator: 'x' },
  })
  expect(errorCodes(artifact)).toHaveLength(0)
  const root = artifact.root as OperatorNode
  expect(root.vars).toBeDefined()
  expect(Object.keys(root.vars!)).toEqual(['operator'])
  expect(root.vars!.operator.kind).toBe('constant')
})

test('vars values are ordinary expressions, compiled', () => {
  const artifact = compile({
    operator: 'if',
    vars: { country: { $http: 'https://x.test/country' } },
    condition: '$vars.country',
    then: 1,
  })
  const root = artifact.root as OperatorNode
  expect(root.vars!.country.kind).toBe('operator')
})

test('comments are legal inside vars blocks and are consumed', () => {
  const artifact = compile({
    operator: 'plus',
    values: ['$vars.x'],
    vars: { '//': 'a note', x: 1 },
  })
  const root = artifact.root as OperatorNode
  expect(Object.keys(root.vars!)).toEqual(['x'])
})

test('vars on a plain object literal scope the subtree and are consumed', () => {
  const artifact = compile({
    vars: { name: '$data.user.name' },
    title: { $format: ['Hi %1', '$vars.name'] },
    footer: 'constant',
  })
  expect(artifact.root.kind).toBe('skeleton')
  const root = artifact.root as SkeletonNode
  expect(root.vars).toBeDefined()
  const skeleton = root.skeleton as Record<string, unknown>
  expect('vars' in skeleton).toBe(false)
  expect(skeleton.footer).toBe('constant')
})

test('a vars-only object evaluates to {}', () => {
  const artifact = compile({ vars: { x: 1 } })
  // No holes, vars dead — the compiled shape is the empty object
  expect(artifact.holes).toHaveLength(0)
  const value = (artifact.root as { value?: unknown }).value
  expect(value).toEqual({})
})

test('a vars-carrying plain literal with holes stays its own evaluable unit', () => {
  const artifact = compile({
    outer: {
      vars: { x: '$data.a' },
      inner: { $plus: ['$vars.x', 1] },
    },
  })
  // The vars-carrying literal is the maximal evaluable node, not its hole
  expect(artifact.holes).toHaveLength(1)
  expect(artifact.holes[0].path).toEqual(['outer'])
  expect(artifact.holes[0].node.kind).toBe('skeleton')
})

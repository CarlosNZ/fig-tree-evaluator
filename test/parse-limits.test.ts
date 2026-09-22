/**
 * Chunk 4.0 — the structural limits: the built-in depth ceiling inside the
 * walk ("maxDepth cannot currently do its job" in
 * docs-dev/v3-specs/v3-implementation-notes.md) and `nodeCount` narrowed to
 * evaluable nodes (obligation B4, amended September 2026). The ceiling is
 * what keeps `validate()`'s never-throws-on-content invariant true for deep
 * input; the narrowing is what stops inert data tripping `maxNodes`.
 */
import { FigTree } from '../src'
import { parseExpression } from '../src/parse'
import { makeParseRegistry, parseOps } from './fixtures/parseRegistry'

const fig = new FigTree({ operators: [parseOps()] })
/** The limits are instance configuration, so a limit is an instance. */
const withLimits = (limits: { maxDepth?: number; maxNodes?: number }) =>
  new FigTree({ operators: [parseOps()], ...limits })
const registry = makeParseRegistry()
const parse = (input: unknown) => parseExpression(input, registry)

/** `depth` nested single-element arrays around `leaf`. */
const nestArrays = (depth: number, leaf: unknown): unknown => {
  let value = leaf
  for (let i = 0; i < depth; i++) value = [value]
  return value
}

/** `depth` nested single-key objects around `leaf`. */
const nestObjects = (depth: number, leaf: unknown): unknown => {
  let value = leaf
  for (let i = 0; i < depth; i++) value = { k: value }
  return value
}

describe('the built-in depth ceiling', () => {
  test('a 5,000-deep array reports depth-ceiling instead of overflowing the stack', () => {
    const deep = nestArrays(5000, 1)
    let result: ReturnType<FigTree['validate']> | undefined
    expect(() => {
      result = fig.validate(deep)
    }).not.toThrow()
    expect(result!.valid).toBe(false)
    expect(result!.issues.map((issue) => issue.code)).toContain('depth-ceiling')
  })

  test('a 5,000-deep object reports the same, with an operator at the bottom', () => {
    const deep = nestObjects(5000, { $plus: [1, 2] })
    const result = fig.validate(deep)
    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('depth-ceiling')
  })

  test('the ceiling is option-independent — no maxDepth needed, and a larger one is moot', () => {
    const deep = nestArrays(5000, 1)
    const codes = withLimits({ maxDepth: 100_000 })
      .validate(deep)
      .issues.map((issue) => issue.code)
    expect(codes).toContain('depth-ceiling')
    expect(codes).not.toContain('max-depth')
  })

  test('ordinary depth is untouched, and the user maxDepth still compares against it', () => {
    const shallow = nestObjects(40, { $plus: [1, 2] })
    expect(fig.validate(shallow).valid).toBe(true)
    expect(
      withLimits({ maxDepth: 10 })
        .validate(shallow)
        .issues.map((i) => i.code)
    ).toContain('max-depth')
  })

  test('the ceiling issue is tagged with the path where descent stopped', () => {
    const deep = nestArrays(5000, 1)
    const issue = fig.validate(deep).issues.find((i) => i.code === 'depth-ceiling')!
    expect(issue.severity).toBe('error')
    expect(issue.path.length).toBeGreaterThan(400)
    expect(issue.path.every((segment) => segment === 0)).toBe(true)
  })
})

describe('nodeCount counts evaluable nodes only', () => {
  test('a 200-entry options list no longer trips maxNodes: 500', () => {
    const options = Array.from({ length: 200 }, (_, i) => ({
      label: `Option ${i}`,
      value: i,
      enabled: i % 2 === 0,
    }))
    const result = withLimits({ maxNodes: 500 }).validate({ options })
    expect(result.valid).toBe(true)
    expect(result.issues.map((issue) => issue.code)).not.toContain('max-nodes')
  })

  test('an expression with 600 operators does', () => {
    const items = Array.from({ length: 600 }, (_, i) => ({ $plus: [i, 1] }))
    const result = withLimits({ maxNodes: 500 }).validate({ items })
    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('max-nodes')
  })

  test('constants and plain containers count nothing', () => {
    expect(parse(42).nodeCount).toBe(0)
    expect(parse('just text').nodeCount).toBe(0)
    expect(parse({ a: { b: [1, 2, { c: 'd' }] } }).nodeCount).toBe(0)
    expect(parse({ $flibble: 'inert', '$typo.x': 1 }).nodeCount).toBe(0)
  })

  test('operators, references and invalid placeholders count once each', () => {
    // one operator node + one reference; the literal 1 is a constant
    expect(parse({ $plus: [1, '$data.x'] }).nodeCount).toBe(2)
    // a skeleton holding three reference holes
    expect(parse({ a: '$data.a', b: ['$data.b', '$d.c'] }).nodeCount).toBe(3)
    // the malformed node is a broken expression, counted as one
    expect(parse({ operator: 'nope' }).nodeCount).toBe(1)
    // nested operators: outer + inner + reference
    expect(parse({ $not: { '$>': ['$data.age', 18] } }).nodeCount).toBe(3)
  })

  test('literal contents are uncounted however node-like they look', () => {
    const quoted = { $literal: { operator: 'plus', values: ['$data.x', { $plus: [1, 2] }] } }
    expect(parse(quoted).nodeCount).toBe(0)
  })

  test('maxDepth still measures the walked structure, containers included', () => {
    expect(parse(nestObjects(6, 1)).maxDepth).toBe(6)
    expect(parse(nestObjects(6, { $plus: [1, 2] })).maxDepth).toBeGreaterThan(6)
  })
})

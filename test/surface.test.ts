/**
 * Chunk 13.2 — the last two reads and the surface checklist
 * ("Introspection & housekeeping methods" and "v2 → v3 method
 * disposition" in docs-dev/v3-specs/v3-evaluator-methods.md).
 */
import { FigTree, coreOperators, version } from '../src'

const fig = new FigTree({
  operators: [coreOperators],
  fragments: { summary: { expression: 'a summary' } },
})

describe('isEvaluable — does the compile find anything to evaluate?', () => {
  test.each([
    ['an operator node', { $plus: [1, 2] }, true],
    ['a canonical-face node', { operator: 'plus', values: [1, 2] }, true],
    ['a reference', '$data.user.name', true],
    ['a fragment call', { fragment: 'summary' }, true],
    ['an expression buried in a constant shell', { a: { b: { $plus: [1, 2] } } }, true],
    ['a plain container', { a: 1, b: [2, 3] }, false],
    ['a scalar', 'just text', false],
    ['an unrecognized $ key — inert data with a warning', { $flibble: 'inert' }, false],
    // Normalization is not evaluation: these three evaluate to something
    // other than their input, and none of them holds an expression
    ['a comment key alone', { '//': 'note', a: 1 }, false],
    ['an undefined value alone', { a: 1, b: undefined }, false],
    ['a vars block nothing reads', { vars: { x: 1 }, a: 1 }, false],
    // A malformed node ENGAGED the grammar: it is an expression, a broken
    // one, and classifying it as inert data would be the silent
    // de-invocation the sibling-key rule exists to prevent
    ['a sibling-key violation', { operator: 'plus', fragment: 'summary' }, true],
    ['an unknown operator on the canonical face', { operator: 'flibble' }, true],
  ])('%s → %s', (_label, expression, expected) => {
    expect(fig.isEvaluable(expression)).toBe(expected)
  })

  test('a static error still counts — the node is a hole', () => {
    // `values` wants an array of numbers; the literal type check fails at
    // validate(), but the node is evaluable all the same
    expect(fig.validate({ $plus: 'not an array' }).valid).toBe(false)
    expect(fig.isEvaluable({ $plus: 'not an array' })).toBe(true)
  })

  test('a static error from a structural key counts too, with no hole to show for it', () => {
    // A malformed `vars` block folds its container to a constant — zero
    // holes — yet validate() rejects it and evaluate() would throw. Only
    // the issue stream records that the expression engaged the grammar
    expect(fig.validate({ vars: 'high' }).valid).toBe(false)
    expect(fig.isEvaluable({ vars: 'high' })).toBe(true)
  })

  test('never throws, whatever it is handed', () => {
    for (const expression of [undefined, () => 'opaque', { vars: 'high' }, { $get: 'a[' }])
      expect(() => fig.isEvaluable(expression)).not.toThrow()
  })
})

describe('version', () => {
  test('a readonly instance property, matching the module export', () => {
    expect(fig.version).toBe(version)
    expect(typeof fig.version).toBe('string')
  })
})

describe('the v2 → v3 method disposition, as a checklist', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const surface = fig as unknown as Record<string, any>

  test.each([
    'evaluate',
    'compile',
    'validate',
    'getDependencies',
    'isEvaluable',
    'updateOptions',
    'getOptions',
    'getOperators',
    'getFragments',
    'clearCache',
  ])('%s is present', (method) => {
    expect(typeof surface[method]).toBe('function')
  })

  test.each([
    'getCustomFunctions', // no functions tier
    'getConfig', // leaked live internals
    'getCache', // persistence is the pluggable store's job
    'setCache',
    'getVersion', // a property now
    'isFigTreeExpression', // renamed isEvaluable
    'evaluateFullObject', // deep evaluation is the only semantics
    'evaluateSync', // cut for v3.0
    'evaluateExpression', // never an instance method
  ])('%s is gone', (method) => {
    expect(surface[method]).toBeUndefined()
  })
})

/**
 * Phase-3.3 black-box suite: `fig.validate()` signature and behaviour
 * ("Signature and behaviour" under "validate() — the process" in
 * docs-dev/v3-specs/v3-evaluator-methods.md). From this chunk the compiler's
 * test surface is the public method — no artifact internals.
 */
import { FigTree, FigTreeError, type CallOptions } from '../src'
import { compileOps } from './fixtures/compileRegistry'

const fig = new FigTree({ operators: [compileOps()] })

test('validate is synchronous and returns the ValidationResult shape', () => {
  const result = fig.validate({ $plus: [1, 2] })
  expect(result.valid).toBe(true)
  expect(result.issues).toEqual([])
  expect(typeof result.timeoutShielded).toBe('boolean')
})

test('validate never throws on expression content', () => {
  const contents = [
    { operator: 'flibble' },
    { operator: 'plus', fragment: 'f' },
    { vars: 'high' },
    { $if: [true] },
    () => 'opaque',
    undefined,
  ]
  for (const expression of contents) {
    expect(() => fig.validate(expression)).not.toThrow()
  }
})

test('validate throws on a per-call configuration option — method misuse', () => {
  // Widened past the signature, as a JS host would reach it
  expect(() => fig.validate(1, { operators: [] } as CallOptions)).toThrow(FigTreeError)
  expect(() => fig.validate(1, { fragments: {} } as CallOptions)).toThrow(FigTreeError)
  expect(() => fig.validate(1, { maxNodes: 3 } as CallOptions)).toThrow(/not a per-call option/)
})

test('valid means no error-severity issues — warnings do not block', () => {
  const result = fig.validate({ $flibble: 'inert' })
  expect(result.valid).toBe(true)
  expect(result.issues.some((issue) => issue.severity === 'warning')).toBe(true)
})

test('issues come back as plain Issues in tree order', () => {
  const result = fig.validate({
    a: { $plus: [1, { operator: 'nope' }] },
    b: '$vars.x',
  })
  const errors = result.issues.filter((issue) => issue.severity === 'error')
  expect(errors.map((issue) => issue.code)).toEqual(['unknown-operator', 'unresolved-var'])
  expect(errors[0]).not.toHaveProperty('order')
})

test("a rest slice's own issue leads the issues from its elements", () => {
  // A positional surplus compiles to a synthetic container, which is still
  // the parent of the elements it holds: its constraint failure sorts ahead
  // of the warning from element 0
  const result = fig.validate({ '$>': ['$notANamespace', 1, 2] })
  const parent = result.issues.findIndex((issue) => issue.code === 'type-check')
  const element = result.issues.findIndex((issue) => issue.code === 'unrecognized-identifier')
  expect(parent).toBeGreaterThanOrEqual(0)
  expect(element).toBeGreaterThan(parent)
})

test('the evaluator-methods worked example: typo key, unresolved var, inert operator', () => {
  const result = fig.validate({
    operator: 'if',
    condition: { $graeterThan: ['$data.age', 18] },
    thn: 'Adult',
    else: '$vars.username',
  })
  expect(result.valid).toBe(false)
  expect(result.timeoutShielded).toBe(false)

  const unknownKey = result.issues.find((issue) => issue.code === 'unknown-node-key')
  expect(unknownKey?.severity).toBe('error')
  expect(unknownKey?.path).toEqual(['thn'])
  expect(unknownKey?.operator).toBe('if')

  const unresolved = result.issues.find((issue) => issue.code === 'unresolved-var')
  expect(unresolved?.severity).toBe('error')
  expect(unresolved?.path).toEqual(['else'])

  const inert = result.issues.find((issue) => issue.code === 'unrecognized-identifier')
  expect(inert?.severity).toBe('warning')
  expect(inert?.path).toEqual(['condition'])
})

test('did-you-mean suggestions ride the messages where cheap', () => {
  const result = fig.validate({ operator: 'if', condition: true, then: 1, thn: 2 })
  const unknownKey = result.issues.find((issue) => issue.code === 'unknown-node-key')
  expect(unknownKey?.message).toContain("'then'")
})

test('a fully-constant expression validates clean and vacuously shielded', () => {
  const result = fig.validate({ plain: ['data', { nested: true }] })
  expect(result).toEqual({ valid: true, issues: [], timeoutShielded: true })
})

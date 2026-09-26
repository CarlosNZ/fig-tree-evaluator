/**
 * Phase 16 — the `./format` surface ("Surface" and "Packaging" in
 * docs-dev/v3-specs/v3-format.md).
 *
 * The subpath exports its four functions and nothing else, and its types
 * export from the root. test/exports.test.ts lists values only, so the types
 * are checked here, where `pnpm typecheck` fails if one goes missing.
 */
import { FigTree, isFigTreeError, type FigTreeError } from '../src'
import type { CanonicalOptions, NameOptions, Registry, ShorthandOptions, Spelling } from '../src'
import * as format from '../src/format'
import { toCanonical, toShorthand } from '../src/format'
import { deepFreeze } from './helpers/migration'

test('the subpath exports the four conversions, and nothing else', () => {
  expect(Object.keys(format).sort()).toEqual(['toCanonical', 'toGet', 'toReference', 'toShorthand'])
})

describe('Registry', () => {
  test('a FigTree satisfies it', () => {
    const registry: Registry = new FigTree()
    expect(registry.getOperators().length).toBeGreaterThan(0)
  })

  test('so do snapshots served by plain functions', () => {
    const fig = new FigTree()
    const operators = fig.getOperators()
    const fragments = fig.getFragments()
    const registry: Registry = { getOperators: () => operators, getFragments: () => fragments }
    expect(registry.getOperators()).toBe(operators)
  })

  test('it asks only for the fields the conversions read', () => {
    const registry: Registry = {
      getOperators: () => [
        { name: 'plus', alias: '+', positionalParams: ['...values'], restParam: 'values' },
      ],
      getFragments: () => [{ name: 'greet' }],
    }
    expect(registry.getFragments()).toEqual([{ name: 'greet' }])
  })
})

test('the option types accept what the spec lists', () => {
  const spelling: Spelling = 'alias'
  const name: NameOptions = { referenceNames: spelling }
  const canonical: CanonicalOptions = { ...name, operatorNames: 'canonical', referencesAsGet: true }
  const shorthand: ShorthandOptions = { ...name, arguments: 'named', getAsReference: false }
  expect([canonical, shorthand]).toHaveLength(2)
})

describe('a malformed node stops the conversion', () => {
  const fig = new FigTree({ fragments: { greet: { expression: 'hi' } } })
  const thrownBy = (convert: () => unknown): FigTreeError => {
    try {
      convert()
    } catch (error) {
      if (isFigTreeError(error)) return error
      throw error
    }
    throw new Error('expected the conversion to throw')
  }
  // Both conversions read through the same walk, so they stop at the same
  // node with the same error
  const thrown = (expression: unknown): FigTreeError => {
    const canonical = thrownBy(() => toCanonical(expression, fig))
    const shorthand = thrownBy(() => toShorthand(expression, fig))
    expect([shorthand.code, shorthand.path]).toEqual([canonical.code, canonical.path])
    return canonical
  }

  test.each([
    ['operator beside fragment', { operator: 'plus', fragment: 'greet' }, 'malformed-node'],
    ['canonical beside shorthand', { operator: 'plus', $abs: 1 }, 'malformed-node'],
    ['two shorthand keys', { $plus: [1], $abs: 1 }, 'malformed-node'],
    ['a non-string operator', { operator: 5 }, 'malformed-node'],
    ['a non-string fragment', { fragment: ['greet'] }, 'malformed-node'],
    ['an unknown operator', { operator: 'flibble' }, 'unknown-operator'],
    ['an unknown fragment', { fragment: 'nope' }, 'unknown-fragment'],
    ['a shorthand sibling that is not a modifier', { $abs: 1, colour: 'red' }, 'malformed-node'],
    ['useCache beside a fragment shorthand', { $greet: {}, useCache: true }, 'malformed-node'],
    ['a fragment payload that is not an object', { $greet: ['x'] }, 'malformed-node'],
    ['a canonical literal without a value', { operator: 'literal' }, 'malformed-node'],
    [
      'a canonical literal with a stray key',
      { operator: 'literal', value: 1, x: 2 },
      'unknown-node-key',
    ],
    [
      'parameters on an operator node',
      { operator: 'abs', parameters: { value: 1 } },
      'malformed-node',
    ],
    ['useCache on a fragment call', { fragment: 'greet', useCache: true }, 'malformed-node'],
    ['a stray key on a fragment call', { fragment: 'greet', name: 'x' }, 'unknown-node-key'],
    [
      'fragment parameters that are not arguments',
      { fragment: 'greet', parameters: 5 },
      'malformed-node',
    ],
    ['surplus positional arguments', { $not: [1, 2] }, 'positional-arity'],
    ['a positional payload with no positions', { $abs: [1, 2] }, 'positional-arity'],
    ['a reserved key in a named payload', { $abs: { value: 1, fallback: 0 } }, 'unknown-node-key'],
    ['parameters in a named payload', { $abs: { value: 1, parameters: {} } }, 'unknown-node-key'],
  ])('%s', (_label, expression, code) => {
    const error = thrown(expression)
    expect(error.code).toBe(code)
    expect(error.path).toEqual([])
  })

  test('the path locates the node within the converted subtree', () => {
    expect(thrown({ a: [1, { $not: { $abs: [1, 2] } }] }).path).toEqual(['a', 1, 'value'])
    expect(thrown({ $if: [true, { operator: 'nope' }] }).path).toEqual(['then'])
    expect(thrown({ vars: { x: { fragment: 'nope' } }, y: 1 }).path).toEqual(['vars', 'x'])
  })

  test('nesting beyond the compiler’s ceiling', () => {
    let deep: unknown = 1
    for (let i = 0; i < 600; i++) deep = [deep]
    expect(thrown(deep).code).toBe('depth-ceiling')
  })

  test('what doesn’t affect the form converts: types, missing parameters, scope', () => {
    expect(toCanonical({ $plus: 'not numbers' }, fig)).toEqual({
      operator: 'plus',
      values: 'not numbers',
    })
    expect(toCanonical({ $if: [true] }, fig)).toEqual({ operator: 'if', condition: true })
    expect(toCanonical({ $abs: '$vars.out.of.scope' }, fig)).toEqual({
      operator: 'abs',
      value: '$vars.out.of.scope',
    })
  })

  test('an unknown parameter is carried, as the compiler reads it on either form', () => {
    expect(toCanonical({ $abs: { value: 1, typo: 2 } }, fig)).toEqual({
      operator: 'abs',
      value: 1,
      typo: 2,
    })
  })
})

test('the conversions never mutate their input', () => {
  const fig = new FigTree({ fragments: { greet: { expression: 'hi' } } })
  const input = deepFreeze({
    a: { $plus: [1, { $abs: { '//': 'c', value: -1 } }] },
    b: { $greet: { x: [{ $not: true }] }, vars: { v: { $abs: 1 } } },
    c: ['$d.x', { $literal: { $abs: 1 } }],
  })
  const before = JSON.stringify(input)
  toCanonical(input, fig, { referencesAsGet: true, operatorNames: 'alias' })
  toShorthand(input, fig, { operatorNames: 'alias' })
  toShorthand(input, fig, { arguments: 'named' })
  expect(JSON.stringify(input)).toBe(before)
})

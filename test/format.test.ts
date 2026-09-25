/**
 * Phase 16 — the `./format` surface ("Surface" and "Packaging" in
 * docs-dev/v3-specs/v3-format.md).
 *
 * The subpath exports its four functions and nothing else, and its types
 * export from the root. test/exports.test.ts lists values only, so the types
 * are checked here, where `pnpm typecheck` fails if one goes missing.
 */
import { FigTree } from '../src'
import type { CanonicalOptions, NameOptions, Registry, ShorthandOptions, Spelling } from '../src'
import * as format from '../src/format'

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

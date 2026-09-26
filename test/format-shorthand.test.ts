/**
 * Phase 16.5 — `toShorthand` by example ("`toShorthand`", "Choosing the
 * payload", "Key order" and "Comments" in docs-dev/v3-specs/v3-format.md).
 * The property tests (test/format-properties.test.ts) show a conversion
 * means what its input meant; these show which payload it picks and where
 * each key lands.
 */
import { toShorthand } from '../src/format'
import type { Registry, ShorthandOptions } from '../src'
import { corpusFig } from './fixtures/formatCorpus'

/** Key order is part of the form: compare it as well as the values. */
const expectForm = (actual: unknown, expected: unknown) => {
  expect(actual).toEqual(expected)
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected))
}

describe('choosing the payload', () => {
  // The four shapes an operator's positions can take. The conversions read
  // only names and positions, so a snapshot of shapes is registry enough
  const shapes: Registry = {
    getOperators: () => [
      { name: 'none', restParam: null },
      { name: 'lead', positionalParams: ['a', 'b', 'c'], restParam: null },
      { name: 'rest', positionalParams: ['...xs'], restParam: 'xs' },
      { name: 'both', positionalParams: ['t', '...xs'], restParam: 'xs' },
    ],
    getFragments: () => [],
  }
  const shorthand = (node: Record<string, unknown>, options?: ShorthandOptions) =>
    toShorthand(node, shapes, options)

  test.each([
    // No positions: always named
    ['none', 'a parameter', { a: 1 }, { $none: { a: 1 } }],
    ['none', 'nothing supplied', {}, { $none: {} }],
    // Leading positions: an unbroken prefix
    ['lead', 'the first', { a: 1 }, { $lead: 1 }],
    ['lead', 'two', { a: 1, b: 2 }, { $lead: [1, 2] }],
    ['lead', 'all', { a: 1, b: 2, c: 3 }, { $lead: [1, 2, 3] }],
    ['lead', 'written out of order', { b: 2, a: 1 }, { $lead: [1, 2] }],
    ['lead', 'a gap at the start', { b: 2 }, { $lead: { b: 2 } }],
    ['lead', 'a gap in the middle', { a: 1, c: 3 }, { $lead: { a: 1, c: 3 } }],
    ['lead', 'a key with no position', { a: 1, extra: 2 }, { $lead: { a: 1, extra: 2 } }],
    ['lead', 'nothing supplied', {}, { $lead: {} }],
    // The single-value collapse, and what blocks it
    ['lead', 'collapse: null', { a: null }, { $lead: null }],
    ['lead', 'collapse: a reference', { a: '$d.x' }, { $lead: '$d.x' }],
    ['lead', 'collapse: a node', { a: { operator: 'lead', a: 1 } }, { $lead: { $lead: 1 } }],
    ['lead', 'no collapse: an array', { a: [1] }, { $lead: [[1]] }],
    ['lead', 'no collapse: a plain object', { a: { x: 1 } }, { $lead: [{ x: 1 }] }],
    // A rest alone
    ['rest', 'spread', { xs: [1, 2] }, { $rest: [1, 2] }],
    ['rest', 'of one, never collapsed', { xs: [5] }, { $rest: [5] }],
    ['rest', 'empty', { xs: [] }, { $rest: [] }],
    ['rest', 'computed by reference', { xs: '$d.xs' }, { $rest: '$d.xs' }],
    [
      'rest',
      'rest, computed by node',
      { xs: { operator: 'rest', xs: [1] } },
      { $rest: { $rest: [1] } },
    ],
    ['rest', 'a plain object', { xs: { a: 1 } }, { $rest: { xs: { a: 1 } } }],
    ['rest', 'nothing supplied', {}, { $rest: {} }],
    // Leading positions and a rest
    ['both', 'with the rest', { t: 'x', xs: ['a'] }, { $both: ['x', 'a'] }],
    ['both', 'an empty rest: never collapsed', { t: 'x', xs: [] }, { $both: ['x'] }],
    ['both', 'the rest unsupplied', { t: 'x' }, { $both: { t: 'x' } }],
    ['both', 'the leading unsupplied', { xs: [1] }, { $both: { xs: [1] } }],
    ['both', 'a computed rest', { t: 'x', xs: '$d.xs' }, { $both: { t: 'x', xs: '$d.xs' } }],
  ])('%s: %s', (operator, _label, params, expected) => {
    expectForm(shorthand({ operator, ...params }), expected)
  })

  test("arguments: 'named' always takes the named payload", () => {
    expectForm(shorthand({ operator: 'lead', a: 1, b: 2 }, { arguments: 'named' }), {
      $lead: { a: 1, b: 2 },
    })
    expectForm(shorthand({ operator: 'rest', xs: [1] }, { arguments: 'named' }), {
      $rest: { xs: [1] },
    })
  })

  test('a shorthand node is re-rendered from its parameters', () => {
    expectForm(shorthand({ $lead: { a: 1, b: 2 } }), { $lead: [1, 2] })
    expectForm(shorthand({ $lead: [1] }), { $lead: 1 })
    expectForm(shorthand({ $rest: { xs: [1] } }), { $rest: [1] })
    expectForm(shorthand({ $lead: [1, 2] }, { arguments: 'named' }), { $lead: { a: 1, b: 2 } })
  })
})

describe('with the core operators', () => {
  const shorthand = (expression: unknown, options?: ShorthandOptions) =>
    toShorthand(expression, corpusFig, options)

  test.each([
    ['plus', { operator: 'plus', values: [1, 2] }, { $plus: [1, 2] }],
    ['not', { operator: 'not', value: true }, { $not: true }],
    ['if, a prefix', { operator: 'if', condition: true, then: 'y' }, { $if: [true, 'y'] }],
    [
      'if, a gap',
      { operator: 'if', condition: true, else: 'n' },
      { $if: { condition: true, else: 'n' } },
    ],
    [
      'a non-positional parameter',
      { operator: 'plus', values: [1], expect: 'number' },
      { $plus: { values: [1], expect: 'number' } },
    ],
    [
      'buildString, an empty rest',
      { operator: 'buildString', template: 't', substitutions: [] },
      { $buildString: ['t'] },
    ],
    [
      'buildString, no rest',
      { operator: 'buildString', template: 't' },
      { $buildString: { template: 't' } },
    ],
    ['and, nothing supplied', { operator: 'and' }, { $and: {} }],
    ['min, a computed rest', { operator: 'min', values: '$d.xs' }, { $min: '$d.xs' }],
    ['nested', { operator: 'not', value: { operator: 'abs', value: -1 } }, { $not: { $abs: -1 } }],
    ['by alias', { operator: '+', values: [1] }, { '$+': [1] }],
  ])('%s', (_label, input, output) => {
    expectForm(shorthand(input), output)
  })

  test.each([
    ['preserve', { operator: '+', values: [1] }, { '$+': [1] }],
    ['canonical', { operator: '+', values: [1] }, { $plus: [1] }],
    ['alias', { operator: 'plus', values: [1] }, { '$+': [1] }],
    ['alias', { operator: 'abs', value: 1 }, { $abs: 1 }],
  ] as const)('operator names: %s, %p', (operatorNames, input, output) => {
    expect(shorthand(input, { operatorNames })).toEqual(output)
  })

  test('reference names respell whole references', () => {
    expect(shorthand({ $abs: '$data.x' }, { referenceNames: 'alias' })).toEqual({ $abs: '$d.x' })
  })

  describe('get', () => {
    test.each([
      ['a plain read', { operator: 'get', path: 'a.b' }, '$d.a.b'],
      ['a read from a var', { operator: 'get', path: 'a', from: '$vars.r' }, '$vars.r.a'],
      ['a shorthand read', { $get: 'a' }, '$d.a'],
      [
        'a commented read — the comment is dropped',
        { '//': 'why', operator: 'get', path: 'a' },
        '$d.a',
      ],
      [
        'a read with a fallback',
        { operator: 'get', path: 'a', fallback: 0 },
        { $get: 'a', fallback: 0 },
      ],
      [
        'a read with a default',
        { operator: 'get', path: 'a', missingPathDefault: 0 },
        { $get: ['a', 0] },
      ],
      [
        'a read from a literal object',
        { operator: 'get', path: 'a', from: { a: 1 } },
        { $get: { path: 'a', from: { a: 1 } } },
      ],
      [
        'a nested read whose source converts first',
        { operator: 'get', path: 'b', from: { $get: 'a' } },
        '$d.a.b',
      ],
    ])('%s', (_label, input, output) => {
      expectForm(shorthand(input), output)
    })

    test('getAsReference: false keeps the node', () => {
      expect(shorthand({ operator: 'get', path: 'a' }, { getAsReference: false })).toEqual({
        $get: 'a',
      })
    })

    test('with no source to keep, preserve writes the alias', () => {
      expect(shorthand({ operator: 'get', path: 'a' }, { referenceNames: 'canonical' })).toBe(
        '$data.a'
      )
    })
  })

  describe('fragments', () => {
    test.each([
      ['arguments', { fragment: 'greet', parameters: { name: 'x' } }, { $greet: { name: 'x' } }],
      ['no arguments', { fragment: 'stamp' }, { $stamp: {} }],
      [
        'arguments computed by a node',
        { fragment: 'greet', parameters: { operator: 'upper', value: 'x' } },
        { $greet: { $upper: 'x' } },
      ],
      [
        'arguments by reference: no shorthand form',
        { fragment: 'greet', parameters: '$data.args' },
        { fragment: 'greet', parameters: '$data.args' },
      ],
      [
        'arguments read by a get that becomes a reference',
        { fragment: 'greet', parameters: { operator: 'get', path: 'args' } },
        { fragment: 'greet', parameters: '$d.args' },
      ],
      [
        'a fallback kept in place',
        { fallback: 'x', fragment: 'stamp' },
        { fallback: 'x', $stamp: {} },
      ],
    ])('%s', (_label, input, output) => {
      expectForm(shorthand(input), output)
    })

    test('a shorthand call whose argument node becomes a reference turns canonical', () => {
      expectForm(shorthand({ $greet: { $get: 'args' } }), {
        fragment: 'greet',
        parameters: '$d.args',
      })
    })

    test('without getAsReference, the get stays and the call is shorthand', () => {
      expect(
        shorthand(
          { fragment: 'greet', parameters: { operator: 'get', path: 'args' } },
          { getAsReference: false }
        )
      ).toEqual({ $greet: { $get: 'args' } })
    })
  })

  test('literal', () => {
    const content = { operator: 'plus', values: [1] }
    expectForm(shorthand({ '//': 'c', operator: 'literal', value: content }), {
      '//': 'c',
      $literal: content,
    })
  })

  describe('key order', () => {
    test('the invocation keeps its place; parameters move into the payload', () => {
      expectForm(
        shorthand({ fallback: 0, operator: 'subtract', value: 5, minus: 2, useCache: true }),
        {
          fallback: 0,
          $subtract: [5, 2],
          useCache: true,
        }
      )
    })

    test('a parameter written before the invocation moves into it too', () => {
      expectForm(shorthand({ minus: 2, fallback: 0, operator: 'subtract', value: 5 }), {
        fallback: 0,
        $subtract: [5, 2],
      })
    })

    test('a named payload keeps the written order', () => {
      expectForm(shorthand({ operator: 'subtract', minus: 2, value: 5 }, { arguments: 'named' }), {
        $subtract: { minus: 2, value: 5 },
      })
    })
  })

  describe('comments', () => {
    test('a node’s comment stays where it is', () => {
      expectForm(shorthand({ operator: 'abs', '//': 'why', value: -1 }), { $abs: -1, '//': 'why' })
    })

    test('a payload comment moves to the node when the payload is positional', () => {
      expectForm(shorthand({ fallback: 0, $abs: { value: -1, '//': 'why' } }), {
        fallback: 0,
        '//': 'why',
        $abs: -1,
      })
    })

    test('and stays in the payload when it is named', () => {
      expectForm(shorthand({ $abs: { value: -1, '//': 'why' } }, { arguments: 'named' }), {
        $abs: { value: -1, '//': 'why' },
      })
    })

    test('two comments become one flat array', () => {
      expectForm(shorthand({ '//': ['a'], $abs: { '//': 'b', value: -1 } }), {
        '//': ['a', 'b'],
        $abs: -1,
      })
    })

    test('named → positional → named leaves the comment on the node', () => {
      const once = shorthand({ $abs: { '//': 'why', value: -1 } })
      expectForm(shorthand(once, { arguments: 'named' }), { '//': 'why', $abs: { value: -1 } })
    })
  })
})

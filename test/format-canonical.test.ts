/**
 * Phase 16.4 — `toCanonical` by example ("`toCanonical`", "Spellings", "Key
 * order" and "Comments" in docs-dev/v3-specs/v3-format.md). The property
 * tests (test/format-properties.test.ts) show a conversion means what its
 * input meant; these show the form it takes: which keys, in what order,
 * spelled how.
 */
import { toCanonical } from '../src/format'
import type { CanonicalOptions } from '../src'
import { corpusFig as fig } from './fixtures/formatCorpus'

const canonical = (expression: unknown, options?: CanonicalOptions) =>
  toCanonical(expression, fig, options)

/** Key order is part of the form: compare it as well as the values. */
const expectForm = (actual: unknown, expected: unknown) => {
  expect(actual).toEqual(expected)
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected))
}

describe('each kind of object', () => {
  test.each([
    ['an array payload', { $plus: [1, 2] }, { operator: 'plus', values: [1, 2] }],
    ['a single value', { $not: true }, { operator: 'not', value: true }],
    ['a single value to a rest', { $min: '$d.xs' }, { operator: 'min', values: '$d.xs' }],
    [
      'a named payload',
      { $round: { value: 1.5, decimals: 0 } },
      { operator: 'round', value: 1.5, decimals: 0 },
    ],
    ['a leading prefix', { $if: [true, 'y'] }, { operator: 'if', condition: true, then: 'y' }],
    [
      'an empty rest, bound',
      { $buildString: ['t'] },
      { operator: 'buildString', template: 't', substitutions: [] },
    ],
    [
      'a node payload binds whole',
      { $not: { $not: true } },
      { operator: 'not', value: { operator: 'not', value: true } },
    ],
    ['an alias, kept', { '$+': [1] }, { operator: '+', values: [1] }],
    [
      'a fragment call',
      { $greet: { name: 'x' } },
      { fragment: 'greet', parameters: { name: 'x' } },
    ],
    ['an empty call keeps its map', { $stamp: {} }, { fragment: 'stamp', parameters: {} }],
    [
      'a call computing its arguments',
      { $greet: { $get: 'args' } },
      { fragment: 'greet', parameters: { operator: 'get', path: 'args' } },
    ],
    ['$literal', { $literal: { $plus: [1] } }, { operator: 'literal', value: { $plus: [1] } }],
    [
      'an already-canonical node, only its children converted',
      { operator: 'plus', values: [{ $abs: -1 }], expect: 'number' },
      { operator: 'plus', values: [{ operator: 'abs', value: -1 }], expect: 'number' },
    ],
    [
      'a plain object, its values walked',
      { a: { $abs: -1 }, b: [{ $abs: -2 }] },
      { a: { operator: 'abs', value: -1 }, b: [{ operator: 'abs', value: -2 }] },
    ],
    [
      'an unrecognized $key: a plain object',
      { $typo: { $abs: -1 } },
      { $typo: { operator: 'abs', value: -1 } },
    ],
  ])('%s', (_label, input, output) => {
    expectForm(canonical(input), output)
  })

  test('a literal’s content is never walked', () => {
    const content = { $plus: [1], nested: { $abs: -1 } }
    expect(canonical({ operator: 'literal', value: content })).toEqual({
      operator: 'literal',
      value: content,
    })
  })

  test('a comment’s content is never walked', () => {
    const comment = { $plus: [1] }
    expect(canonical({ '//': comment, a: 1 })).toEqual({ '//': comment, a: 1 })
  })

  test('modifiers are walked and kept', () => {
    expectForm(
      canonical({
        $abs: -1,
        fallback: { $abs: -2 },
        vars: { x: { $abs: -3 }, '//': 'note' },
        useCache: false,
      }),
      {
        operator: 'abs',
        value: -1,
        fallback: { operator: 'abs', value: -2 },
        vars: { x: { operator: 'abs', value: -3 }, '//': 'note' },
        useCache: false,
      }
    )
  })

  test('a vars block is never read as a node', () => {
    // `$abs` as a var name is illegal, and stays so: converting the block
    // would turn it into two vars named `operator` and `value`
    expect(canonical({ vars: { $abs: -1 }, a: 1 })).toEqual({ vars: { $abs: -1 }, a: 1 })
  })

  test('a fragment’s argument map is walked, not read as a node', () => {
    expect(canonical({ fragment: 'greet', parameters: { name: { $upper: 'x' } } })).toEqual({
      fragment: 'greet',
      parameters: { name: { operator: 'upper', value: 'x' } },
    })
  })
})

describe('spellings', () => {
  test.each([
    ['preserve', { '$+': [1] }, { operator: '+', values: [1] }],
    ['canonical', { '$+': [1] }, { operator: 'plus', values: [1] }],
    ['alias', { $plus: [1] }, { operator: '+', values: [1] }],
    ['alias', { $abs: 1 }, { operator: 'abs', value: 1 }],
    [
      'canonical',
      { operator: '?', condition: 1, then: 2 },
      { operator: 'if', condition: 1, then: 2 },
    ],
  ] as const)('operator names: %s, %p', (operatorNames, input, output) => {
    expect(canonical(input, { operatorNames })).toEqual(output)
  })

  test.each([
    ['preserve', ['$d.a', '$data.b'], ['$d.a', '$data.b']],
    ['canonical', ['$d.a', '$v.x.y', '$e'], ['$data.a', '$vars.x.y', '$element']],
    ['alias', ['$data.a', '$params.p', '$index'], ['$d.a', '$p.p', '$i']],
  ] as const)('reference names: %s', (referenceNames, input, output) => {
    expect(canonical(input, { referenceNames })).toEqual(output)
  })

  test('respelling leaves what isn’t a whole reference alone', () => {
    const input = ['$typo.x', 'Hi $data.name', '$vars', { $buildString: ['$d.name is %1', 'x'] }]
    expect(canonical(input, { referenceNames: 'canonical' })).toEqual([
      '$typo.x',
      'Hi $data.name',
      '$vars',
      { operator: 'buildString', template: '$data.name is %1', substitutions: ['x'] },
    ])
  })
})

describe('referencesAsGet', () => {
  test('every reference with a get form becomes one, anywhere', () => {
    expect(
      canonical(
        { $plus: ['$d.a', { x: '$vars.row.b' }], fallback: '$data.c' },
        { referencesAsGet: true }
      )
    ).toEqual({
      operator: 'plus',
      values: [
        { operator: 'get', path: 'a' },
        { x: { operator: 'get', path: 'b', from: '$vars.row' } },
      ],
      fallback: { operator: 'get', path: 'c' },
    })
  })

  test('a bare reference reads its whole source; $index has no get form', () => {
    expect(canonical(['$data', '$index', '$e'], { referencesAsGet: true })).toEqual([
      { operator: 'get', path: '' },
      '$index',
      { operator: 'get', path: '', from: '$e' },
    ])
  })

  test('the selected reference itself, which is how the editor uses it', () => {
    expect(canonical('$d.user.name', { referencesAsGet: true })).toEqual({
      operator: 'get',
      path: 'user.name',
    })
  })

  test('off by default', () => {
    expect(canonical({ $abs: '$d.a' })).toEqual({ operator: 'abs', value: '$d.a' })
  })
})

describe('key order', () => {
  test('the invocation keeps its place; parameters follow it', () => {
    expectForm(canonical({ fallback: 0, $subtract: [5, 2], useCache: true }), {
      fallback: 0,
      operator: 'subtract',
      value: 5,
      minus: 2,
      useCache: true,
    })
  })

  test('a named payload keeps its order', () => {
    expectForm(canonical({ $subtract: { minus: 2, value: 5 } }), {
      operator: 'subtract',
      minus: 2,
      value: 5,
    })
  })

  test('a canonical node keeps every key where it is', () => {
    const input = { minus: 2, fallback: 0, operator: 'subtract', value: 5 }
    expectForm(canonical(input), input)
  })

  test('a fragment call’s arguments follow `fragment`', () => {
    expectForm(canonical({ fallback: 'x', $greet: { name: 'a' } }), {
      fallback: 'x',
      fragment: 'greet',
      parameters: { name: 'a' },
    })
  })
})

describe('comments', () => {
  test('a node’s comment stays where it is', () => {
    expectForm(canonical({ $abs: -1, '//': 'why' }), { operator: 'abs', value: -1, '//': 'why' })
  })

  test('a comment in a named payload moves to just before the invocation', () => {
    expectForm(canonical({ fallback: 0, $abs: { value: -1, '//': 'why' } }), {
      fallback: 0,
      '//': 'why',
      operator: 'abs',
      value: -1,
    })
  })

  test('two comments become one array, in the node’s comment’s place', () => {
    expectForm(canonical({ '//': 'node', $abs: { '//': 'payload', value: -1 } }), {
      '//': ['node', 'payload'],
      operator: 'abs',
      value: -1,
    })
  })

  test('the array is flattened, never nested', () => {
    expect(canonical({ '//': ['a', 'b'], $abs: { '//': ['c'], value: -1 } })).toEqual({
      '//': ['a', 'b', 'c'],
      operator: 'abs',
      value: -1,
    })
  })

  test('a child’s payload comment stays on the child', () => {
    expect(canonical({ $not: { $abs: { '//': 'inner', value: -1 } } })).toEqual({
      operator: 'not',
      value: { '//': 'inner', operator: 'abs', value: -1 },
    })
  })

  test('a comment in a call’s arguments stays there', () => {
    expect(canonical({ $greet: { '//': 'args', name: 'a' } })).toEqual({
      fragment: 'greet',
      parameters: { '//': 'args', name: 'a' },
    })
  })
})

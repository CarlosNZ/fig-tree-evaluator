/**
 * Phase 16.2 — the grammar the compiler and `./format` share
 * (src/compile/grammar.ts; "What the walk visits" and "The positional
 * mapping is shared, not copied" in docs-dev/v3-specs/v3-format.md). The
 * compiler's suites pin these through the compiler; this file pins them as
 * the functions `./format` calls directly, with `positionalToNamed`, the
 * named reading `./format` builds on `positionalLayout` (src/format/read.ts).
 */
import {
  classifiesAsNode,
  classifyObject,
  positionalLayout,
  singlePositionalTarget,
  type PositionalShape,
} from '../src/compile/grammar'
import { positionalToNamed } from '../src/format/read'

const known = new Set(['plus', '+', 'literal', 'frag'])
const recognizes = (name: string) => known.has(name)

describe('classifyObject', () => {
  test.each([
    ['an operator key', { operator: 'plus', values: [] }, { kind: 'operator' }],
    ['a fragment key', { fragment: 'frag' }, { kind: 'fragment' }],
    ['one recognized $key', { $plus: [1], fallback: 0 }, { kind: 'shorthand', key: '$plus' }],
    ['an alias $key', { '$+': [1] }, { kind: 'shorthand', key: '$+' }],
    ['$literal', { $literal: { operator: 'x' } }, { kind: 'shorthand', key: '$literal' }],
    ['an unrecognized $key — data', { $typo: 1 }, { kind: 'plain' }],
    ['no reserved key', { a: 1 }, { kind: 'plain' }],
  ])('%s', (_label, raw, expected) => {
    expect(classifyObject(raw, recognizes)).toEqual(expected)
  })

  test.each([
    [
      'operator beside fragment',
      { operator: 'plus', fragment: 'frag' },
      "'operator' and 'fragment'",
    ],
    ['canonical beside shorthand', { operator: 'plus', $frag: {} }, "shorthand key '$frag'"],
    ['two shorthand keys', { $plus: [1], $frag: {} }, "found '$plus' and '$frag'"],
  ])('%s is malformed, with the compiler’s message', (_label, raw, fragment) => {
    const classified = classifyObject(raw, recognizes)
    expect(classified).toMatchObject({ kind: 'malformed' })
    expect(classified.kind === 'malformed' && classified.message).toContain(fragment)
  })

  test('an unrecognized $key beside an operator key is not a conflict', () => {
    expect(classifyObject({ operator: 'plus', $typo: 1 }, recognizes)).toEqual({ kind: 'operator' })
  })
})

describe('classifiesAsNode', () => {
  test.each([
    ['a canonical node', { operator: 'plus' }, true],
    ['a fragment call', { fragment: 'frag' }, true],
    ['a recognized $key', { $plus: [1] }, true],
    ['an unrecognized $key', { $typo: 1 }, false],
    ['a plain object', { a: 1 }, false],
    ['a malformed node, which is still a node', { operator: 'plus', fragment: 'frag' }, true],
    ['an array', [{ operator: 'plus' }], false],
    ['a string', '$plus', false],
    ['null', null, false],
  ])('%s', (_label, value, expected) => {
    expect(classifiesAsNode(value, recognizes)).toBe(expected)
  })
})

describe('the positional mapping', () => {
  const none: PositionalShape = { restParam: null }
  const leading: PositionalShape = { positionalParams: ['a', 'b'], restParam: null }
  const rest: PositionalShape = { positionalParams: ['...values'], restParam: 'values' }
  const both: PositionalShape = { positionalParams: ['t', '...subs'], restParam: 'subs' }

  test.each([
    ['no positional form', none, [1], null],
    ['leading only, partly filled', leading, [1], [['a', 1]]],
    [
      'leading only, filled',
      leading,
      [1, 2],
      [
        ['a', 1],
        ['b', 2],
      ],
    ],
    ['leading only, surplus', leading, [1, 2, 3], null],
    ['leading only, empty', leading, [], []],
    ['rest only', rest, [1, 2], [['values', [1, 2]]]],
    ['rest only, empty — binds an empty rest', rest, [], [['values', []]]],
    [
      'leading and rest',
      both,
      ['x', 1, 2],
      [
        ['t', 'x'],
        ['subs', [1, 2]],
      ],
    ],
    [
      'leading and rest, rest empty',
      both,
      ['x'],
      [
        ['t', 'x'],
        ['subs', []],
      ],
    ],
    ['leading and rest, leading unfilled — no rest', both, [], []],
  ])('%s', (_label, shape, payload, expected) => {
    expect(positionalToNamed(shape, payload)).toEqual(expected)
  })

  test('a rest with nothing leading is the payload itself, uncopied', () => {
    const payload = [1, 2]
    expect(positionalToNamed(rest, payload)![0][1]).toBe(payload)
  })

  test('the layout names where the rest starts', () => {
    expect(positionalLayout(both, 3)).toEqual({ bound: 1, restAt: 1 })
    expect(positionalLayout(leading, 1)).toEqual({ bound: 1, restAt: null })
    expect(positionalLayout(leading, 3)).toBeNull()
  })

  test('an integer-like parameter name keeps its position', () => {
    const shape: PositionalShape = { positionalParams: ['b', '1'], restParam: null }
    expect(positionalToNamed(shape, ['x', 'y'])).toEqual([
      ['b', 'x'],
      ['1', 'y'],
    ])
  })

  test.each([
    ['no positional form', none, null],
    ['the first leading position', leading, 'a'],
    ['the rest, when it comes first', rest, 'values'],
    ['the leading position before a rest', both, 't'],
  ])('a single value binds to %s', (_label, shape, expected) => {
    expect(singlePositionalTarget(shape)).toBe(expected)
  })
})

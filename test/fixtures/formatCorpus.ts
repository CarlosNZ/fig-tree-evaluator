/**
 * A curated corpus of v3 expressions for the format conversions' property
 * tests ("Testing" in docs-dev/v3-specs/v3-format.md): each form, and the
 * things around a node that a conversion must carry — modifiers, `vars`,
 * iterator bindings, fragment calls, literals, references in every
 * namespace, comments. Every entry compiles without errors against the
 * registry here, so equivalence is tested on expressions that mean
 * something. Deliberately modest: the suite is collated at release prep.
 */
import { FigTree, coreOperators, type FragmentDefinition } from '../../src'
import { buildRegistry } from '../../src/registry'

export const corpusFragments: Record<string, FragmentDefinition> = {
  greet: {
    expression: { $buildString: ['Hello, %1', '$params.name'] },
    parameters: { name: { type: 'string' } },
  },
  stamp: { expression: 'stamped' },
}

export const corpusFig = new FigTree({ fragments: corpusFragments })
export const corpusRegistry = buildRegistry({
  operators: [coreOperators],
  fragments: corpusFragments,
})

export const formatCorpus: [string, unknown][] = [
  // ── The forms of one node ────────────────────────────────────────────
  ['canonical', { operator: 'plus', values: [1, 2] }],
  ['canonical, by alias', { operator: '+', values: [1, 2] }],
  ['named payload', { $plus: { values: [1, 2] } }],
  ['positional payload', { $plus: [1, 2] }],
  ['single value', { $not: true }],
  ['leading positions', { $if: [true, 'yes', 'no'] }],
  ['a leading prefix', { $if: ['$d.flag', 'yes'] }],
  ['leading and rest', { $buildString: ['%1 and %2', 'a', 'b'] }],
  ['leading, empty rest', { $buildString: ['plain'] }],
  ['template only', { operator: 'buildString', template: 'plain' }],
  ['an empty rest', { $and: [] }],
  ['a computed rest', { $min: '$data.scores' }],
  ['a computed rest by node', { operator: 'or', values: { $map: ['$d.items', '$e.ok'] } }],
  ['no parameters', { operator: 'and' }],
  ['a gap', { operator: 'if', condition: true, else: 'no' }],
  ['a non-positional parameter', { operator: 'plus', values: [1], expect: 'number' }],
  ['named with every parameter', { $round: { value: 3.14159, decimals: 2 } }],
  ['a data read', { operator: 'get', path: 'user.name' }],
  ['a read with a default', { $get: ['user.nope', 'anon'] }],
  [
    'a read from a var',
    { vars: { row: { a: 1 } }, out: { $get: { path: 'a', from: '$vars.row' } } },
  ],

  // ── Around the node ──────────────────────────────────────────────────
  ['a fallback', { $divide: [1, 0], fallback: { $plus: [0, 0] } }],
  ['useCache', { operator: 'upper', value: 'x', useCache: false }],
  ['vars on a node', { vars: { n: { $plus: [1, 2] } }, $multiply: ['$vars.n', 2] }],
  ['vars on a plain object', { vars: { n: 3 }, total: '$v.n', nested: { deeper: '$vars.n' } }],
  ['modifiers between parameters', { operator: 'subtract', fallback: 0, value: 5, minus: 2 }],
  ['a node comment', { '//': 'why', operator: 'lower', value: 'X' }],
  ['a comment in a named payload', { $upper: { '//': 'why', value: 'x' } }],
  ['two comments', { '//': 'node', $upper: { '//': 'payload', value: 'x' } }],
  ['a comment array', { '//': ['a', 'b'], $trim: '  x  ' }],
  ['a comment in a plain object', { '//': 'data', a: { $abs: -1 } }],

  // ── Iterators and bindings ───────────────────────────────────────────
  ['map', { $map: ['$data.items', { $upper: '$e.name' }] }],
  ['map with as', { operator: 'map', input: '$d.items', as: 'item', each: '$item.name' }],
  ['an index binding', { operator: 'map', input: [1, 2], as: 'n', each: '$nIndex' }],
  ['a bare element', { $filter: [[1, 0, 2], '$element'] }],
  ['match', { $match: ['$d.kind', { a: 'A', b: { $upper: 'b' } }, 'other'] }],

  // ── Fragments ────────────────────────────────────────────────────────
  ['a canonical call', { fragment: 'greet', parameters: { name: 'Ada' } }],
  ['a shorthand call', { $greet: { name: { $upper: 'ada' } } }],
  ['a call computing its arguments', { fragment: 'greet', parameters: { $get: 'args' } }],
  ['a call by reference', { fragment: 'greet', parameters: '$data.args' }],
  ['a zero-argument call', { fragment: 'stamp' }],
  ['an empty shorthand call', { $stamp: {} }],
  ['a call with a fallback', { fragment: 'greet', parameters: { name: 'x' }, fallback: 'hi' }],

  // ── Literals ─────────────────────────────────────────────────────────
  ['a canonical literal', { operator: 'literal', value: { operator: 'plus', values: [1] } }],
  ['a shorthand literal', { $literal: { $plus: [1], '//': 'data' } }],

  // ── References and data ──────────────────────────────────────────────
  ['references in each namespace', ['$data.a', '$d[0].b', '$data', 'plain', '$typo.x']],
  ['a reference string alone', '$d.user.name'],
  ['an unrecognized $key', { $typo: 1, b: { $plus: [1] } }],
  ['plain data', { a: 1, b: [true, null, 'x'], c: { d: 2 } }],
  [
    'a template string',
    { $buildString: { template: 'Hi {{name}}', substitutions: { name: '$d.n' } } },
  ],
  [
    'a mixed tree',
    {
      title: { $upper: '$d.title' },
      total: { operator: '+', values: [{ $get: 'a' }, { $multiply: ['$d.b', 2] }] },
      rows: { $map: { input: '$d.rows', as: 'row', each: { $join: [['$row.x', '$row.y'], '-'] } } },
    },
  ],
]

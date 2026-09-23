/**
 * `fig-tree-evaluator/editor-hints` — display data for the core and I/O
 * operators ("`./editor-hints`" in docs-dev/v3-specs/v3-packaging.md): a
 * label and colours for every operator and category, starting values for
 * parameters, and a starting value for each type. An editor reads it as its
 * fallback layer, under whatever a host or plugin supplies.
 *
 * Data only: no functions, and no runtime import from the engine, which in
 * turn never imports this. The shapes, and the rule for picking a
 * parameter's starting value, are the root's (src/editorHintTypes.ts).
 *
 * The palette gives each category a hue, shown at full strength in
 * `categoryHints`; its operators are light shades of that hue, varied a
 * little in hue and lightness so that neighbours stay distinguishable. Every
 * text colour reaches 4.5:1 on its background (test/editor-hints.test.ts).
 */
import type { CategoryHintMap, OperatorHintMap, TypeSeeds } from '../editorHintTypes'

export const categoryHints: CategoryHintMap = {
  logic: {
    displayName: 'Logic & control',
    order: 0,
    backgroundColor: '#632fbc',
    textColor: '#ffffff',
  },
  comparison: {
    displayName: 'Comparison',
    order: 1,
    backgroundColor: '#247f7c',
    textColor: '#ffffff',
  },
  math: {
    displayName: 'Arithmetic & math',
    order: 2,
    backgroundColor: '#2b8237',
    textColor: '#ffffff',
  },
  string: { displayName: 'Strings', order: 3, backgroundColor: '#a1660c', textColor: '#ffffff' },
  array: {
    displayName: 'Arrays & iteration',
    order: 4,
    backgroundColor: '#236ac7',
    textColor: '#ffffff',
  },
  data: {
    displayName: 'Data & objects',
    order: 5,
    backgroundColor: '#b93171',
    textColor: '#ffffff',
  },
  io: { displayName: 'I/O', order: 6, backgroundColor: '#6e7a24', textColor: '#ffffff' },
  // Where an operator that fits no other category goes, plugins' included
  other: { displayName: 'Other', order: 7, backgroundColor: '#606e8a', textColor: '#ffffff' },
}

export const typeSeeds: TypeSeeds = {
  // Visible text rather than null, which an editor shows as nothing
  any: 'Replace me',
  string: 'Replace me',
  number: 1,
  integer: 1,
  // Flags default to false, so a flag is added to turn it on
  boolean: true,
  array: [],
  object: {},
  null: null,
}

// TO-DO: point each operator at its own section of the v3 README, once
// that README has one per operator
const DOCS = 'https://github.com/CarlosNZ/fig-tree-evaluator'

export const operatorHints: OperatorHintMap = {
  // ── Logic & control ────────────────────────────────────────────────────
  and: {
    displayName: 'Logical AND',
    docUrl: DOCS,
    backgroundColor: '#d6d0f0',
    textColor: '#26183f',
    seeds: { values: [true, true] },
  },
  or: {
    displayName: 'Logical OR',
    docUrl: DOCS,
    backgroundColor: '#cabfeb',
    textColor: '#26183f',
    seeds: { values: [true, false] },
  },
  not: {
    displayName: 'Logical NOT (!)',
    docUrl: DOCS,
    backgroundColor: '#c0aee5',
    textColor: '#26183f',
    seeds: { value: true },
  },
  if: {
    displayName: 'Conditional (?)',
    docUrl: DOCS,
    backgroundColor: '#ddd0f0',
    textColor: '#26183f',
    seeds: {
      condition: true,
      then: 'The condition is true',
      else: 'The condition is false',
    },
  },
  match: {
    displayName: 'Match',
    docUrl: DOCS,
    backgroundColor: '#d4bfeb',
    textColor: '#26183f',
    seeds: {
      value: 'matchMe',
      branches: { matchMe: 'YES', nonMatch: 'NO' },
      default: 'No match',
    },
  },
  firstOf: {
    displayName: 'First non-null',
    docUrl: DOCS,
    backgroundColor: '#ccaee5',
    textColor: '#26183f',
    seeds: { values: [null, 'The first non-null value'] },
  },

  // ── Comparison ─────────────────────────────────────────────────────────
  equal: {
    displayName: 'Equal (=)',
    docUrl: DOCS,
    backgroundColor: '#d2efe9',
    textColor: '#183f3e',
    seeds: { values: ['These are equal', 'These are equal'] },
  },
  notEqual: {
    displayName: 'Not equal (!=)',
    docUrl: DOCS,
    backgroundColor: '#c1e9e3',
    textColor: '#183f3e',
    seeds: { values: ['These items', "don't match"] },
  },
  greaterThan: {
    displayName: 'Greater than (>)',
    docUrl: DOCS,
    backgroundColor: '#b0e3e0',
    textColor: '#183f3e',
    seeds: { values: [10, 9] },
  },
  greaterThanOrEqual: {
    displayName: 'Greater than or equal (>=)',
    docUrl: DOCS,
    backgroundColor: '#d2efef',
    textColor: '#183f3e',
    seeds: { values: [10, 10] },
  },
  lessThan: {
    displayName: 'Less than (<)',
    docUrl: DOCS,
    backgroundColor: '#c1e6e9',
    textColor: '#183f3e',
    seeds: { values: [9, 10] },
  },
  lessThanOrEqual: {
    displayName: 'Less than or equal (<=)',
    docUrl: DOCS,
    backgroundColor: '#b0dbe3',
    textColor: '#183f3e',
    seeds: { values: [9, 9] },
  },

  // ── Arithmetic & math ──────────────────────────────────────────────────
  plus: {
    displayName: 'Plus (+)',
    docUrl: DOCS,
    backgroundColor: '#d7edd4',
    textColor: '#193e1e',
    seeds: { values: [1, 2, 3] },
  },
  subtract: {
    displayName: 'Subtract (-)',
    docUrl: DOCS,
    backgroundColor: '#bfe4bc',
    textColor: '#193e1e',
    seeds: { value: 10, minus: 5 },
  },
  multiply: {
    displayName: 'Multiply (*)',
    docUrl: DOCS,
    backgroundColor: '#b4e0b3',
    textColor: '#193e1e',
    seeds: { values: [5, 5] },
  },
  divide: {
    displayName: 'Divide (/)',
    docUrl: DOCS,
    backgroundColor: '#cceacd',
    textColor: '#193e1e',
    seeds: { value: 100, by: 10 },
  },
  modulo: {
    displayName: 'Modulo',
    docUrl: DOCS,
    backgroundColor: '#c3e7c6',
    textColor: '#193e1e',
    seeds: { value: 10, mod: 3 },
  },
  power: {
    displayName: 'Power (^)',
    docUrl: DOCS,
    backgroundColor: '#acddb1',
    textColor: '#193e1e',
    seeds: { base: 2, exponent: 3 },
  },
  round: {
    displayName: 'Round',
    docUrl: DOCS,
    backgroundColor: '#d4edd8',
    textColor: '#193e1e',
    seeds: { value: 3.14159, decimals: 2 },
  },
  floor: {
    displayName: 'Round down',
    docUrl: DOCS,
    backgroundColor: '#bce4c4',
    textColor: '#193e1e',
    seeds: { value: 2.7 },
  },
  ceil: {
    displayName: 'Round up',
    docUrl: DOCS,
    backgroundColor: '#b3e0be',
    textColor: '#193e1e',
    seeds: { value: 2.3 },
  },
  abs: {
    displayName: 'Absolute value',
    docUrl: DOCS,
    backgroundColor: '#ccead5',
    textColor: '#193e1e',
    seeds: { value: -5 },
  },
  min: {
    displayName: 'Minimum',
    docUrl: DOCS,
    backgroundColor: '#c3e7cf',
    textColor: '#193e1e',
    seeds: { values: [3, 1, 2] },
  },
  max: {
    displayName: 'Maximum',
    docUrl: DOCS,
    backgroundColor: '#acddbf',
    textColor: '#193e1e',
    seeds: { values: [3, 1, 2] },
  },

  // ── Strings ────────────────────────────────────────────────────────────
  buildString: {
    displayName: 'String builder',
    docUrl: DOCS,
    backgroundColor: '#f8d9c9',
    textColor: '#3f2f18',
    // The two agree: the template's one token is the substitution's key
    seeds: { template: 'Hello {{name}}', substitutions: { name: 'World' } },
  },
  split: {
    displayName: 'Split text',
    docUrl: DOCS,
    backgroundColor: '#f5cbab',
    textColor: '#3f2f18',
    // `trim` defaults to true, so it is added to turn it off
    seeds: { value: 'Alpha, Bravo, Charlie', delimiter: ',', trim: false },
  },
  join: {
    displayName: 'Join text',
    docUrl: DOCS,
    backgroundColor: '#f3cba0',
    textColor: '#3f2f18',
    seeds: { values: ['Alpha', 'Bravo', 'Charlie'], delimiter: ', ' },
  },
  lower: {
    displayName: 'Lower case',
    docUrl: DOCS,
    backgroundColor: '#f7e1bf',
    textColor: '#3f2f18',
    seeds: { value: 'Hello World' },
  },
  upper: {
    displayName: 'Upper case',
    docUrl: DOCS,
    backgroundColor: '#f6e1b4',
    textColor: '#3f2f18',
    seeds: { value: 'Hello World' },
  },
  trim: {
    displayName: 'Trim whitespace',
    docUrl: DOCS,
    backgroundColor: '#f2dd97',
    textColor: '#3f2f18',
    seeds: { value: '  Hello World  ' },
  },
  regex: {
    displayName: 'Regular expression',
    docUrl: DOCS,
    backgroundColor: '#f8f1c9',
    textColor: '#3f2f18',
    seeds: { value: 'test-this', pattern: '^[a-z]{4}-[a-z]{4}$', flags: 'i' },
  },

  // ── Arrays & iteration ─────────────────────────────────────────────────
  // Adding `as` renames the bindings `each` reads (as: 'item' binds $item),
  // so an editor adding it also renames `$element` in `each`
  length: {
    displayName: 'Length',
    docUrl: DOCS,
    backgroundColor: '#cde5f3',
    textColor: '#18293f',
    seeds: { value: [1, 2, 3, 4, 5] },
  },
  map: {
    displayName: 'Map each',
    docUrl: DOCS,
    backgroundColor: '#bbd7ef',
    textColor: '#18293f',
    seeds: { input: [1, 2, 3], each: '$element', as: 'item' },
  },
  filter: {
    displayName: 'Filter',
    docUrl: DOCS,
    backgroundColor: '#a8c7eb',
    textColor: '#18293f',
    seeds: { input: [0, 1, 2, 3], each: '$element', as: 'item' },
  },
  find: {
    displayName: 'Find first',
    docUrl: DOCS,
    backgroundColor: '#cddcf3',
    textColor: '#18293f',
    seeds: { input: [0, 1, 2, 3], each: '$element', as: 'item' },
  },
  some: {
    displayName: 'Any match',
    docUrl: DOCS,
    backgroundColor: '#bbccef',
    textColor: '#18293f',
    seeds: { input: [0, 1, 2, 3], each: '$element', as: 'item' },
  },
  every: {
    displayName: 'All match',
    docUrl: DOCS,
    backgroundColor: '#a8b9eb',
    textColor: '#18293f',
    seeds: { input: [0, 1, 2, 3], each: '$element', as: 'item' },
  },

  // ── Data & objects ─────────────────────────────────────────────────────
  get: {
    displayName: 'Get data',
    docUrl: DOCS,
    backgroundColor: '#f0d1e5',
    textColor: '#3f182a',
    // `from` holds what `path` reads, so adding it gives a working lookup
    seeds: {
      path: 'path.to.value',
      from: { path: { to: { value: 'Found it' } } },
      missingPathDefault: 'Not found',
    },
  },
  buildObject: {
    displayName: 'Build object',
    docUrl: DOCS,
    backgroundColor: '#eac0cc',
    textColor: '#3f182a',
    seeds: {
      entries: [
        { key: 'firstKey', value: 'firstValue' },
        { key: 'secondKey', value: 'secondValue' },
      ],
    },
  },

  // ── Other ──────────────────────────────────────────────────────────────
  convert: {
    displayName: 'Convert type',
    docUrl: DOCS,
    backgroundColor: '#dddfe3',
    textColor: '#272a30',
    seeds: { value: '42' },
  },

  // ── I/O ────────────────────────────────────────────────────────────────
  // A `timeout` is in milliseconds, so the integer type seed of 1 would
  // expire every request
  http: {
    displayName: 'HTTP request',
    docUrl: DOCS,
    backgroundColor: '#eeedd2',
    textColor: '#3a3f18',
    seeds: {
      url: 'https://restcountries.com/v3.1/name/zealand',
      returnPath: '[0].name.common',
      timeout: 5000,
    },
  },
  graphQL: {
    displayName: 'GraphQL query',
    docUrl: DOCS,
    backgroundColor: '#e3e8c2',
    textColor: '#3a3f18',
    seeds: {
      query:
        'query getCountries {\n  countries(filter: { continent: { eq: "OC" } }) {\n    name\n  }\n}',
      url: 'https://countries.trevorblades.com/',
      returnPath: 'countries[0].name',
      timeout: 5000,
    },
  },
  sql: {
    displayName: 'SQL query',
    docUrl: DOCS,
    backgroundColor: '#d2e2b1',
    textColor: '#3a3f18',
    seeds: { query: 'SELECT contact_name FROM customers LIMIT 5', timeout: 5000 },
  },
}

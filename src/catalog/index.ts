/**
 * `fig-tree-evaluator/catalog` — how the core and I/O operators, `literal`
 * and the categories are presented ("`./catalog`" in
 * docs-dev/v3-specs/v3-packaging.md): a label, text and colours for every
 * operator and category, starting values for parameters, and a starting
 * value for each type. `getCatalog` joins them, with any listings a host or
 * plugin supplies, into what an instance's `getOperators()` and
 * `getFragments()` report.
 *
 * Data, and that one function. No runtime import from the engine, which in
 * turn never imports this. The shapes, and the rule for picking a
 * parameter's starting value, are the root's (src/catalogTypes.ts).
 *
 * The palette gives each category a hue, shown at full strength in
 * `categoryListings`; its operators are light shades of that hue, varied a
 * little in hue and lightness so that neighbours stay distinguishable. Every
 * text colour reaches 4.5:1 on its background (test/catalog.test.ts).
 */
import type {
  Catalog,
  CatalogCategory,
  CatalogFragment,
  CatalogOperator,
  CatalogParameter,
  CategoryListingMap,
  FragmentMetadata,
  OperatorListing,
  OperatorListingMap,
  TypeSeeds,
} from '../catalogTypes'
import type { FigTree } from '../FigTree'
import type { ParameterInfo } from '../introspect'
import type { OperatorCategory } from '../operatorDefinition'
import type { ExpectedType } from '../typeCheck'

export const categoryListings: CategoryListingMap = {
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

export const operatorListings: OperatorListingMap = {
  // ── Logic & control ────────────────────────────────────────────────────
  and: {
    displayName: 'Logical AND',
    description: 'True when every value is truthy',
    docUrl: DOCS,
    backgroundColor: '#d6d0f0',
    textColor: '#26183f',
    seeds: { values: [true, true] },
    parameterDescriptions: { values: 'The values to test, by FigTree truthiness' },
  },
  or: {
    displayName: 'Logical OR',
    description: 'True when any value is truthy',
    docUrl: DOCS,
    backgroundColor: '#cabfeb',
    textColor: '#26183f',
    seeds: { values: [true, false] },
    parameterDescriptions: { values: 'The values to test, by FigTree truthiness' },
  },
  not: {
    displayName: 'Logical NOT (!)',
    description: 'Negate the truthiness of a value',
    docUrl: DOCS,
    backgroundColor: '#c0aee5',
    textColor: '#26183f',
    seeds: { value: true },
    parameterDescriptions: { value: 'The value to test, by FigTree truthiness' },
  },
  if: {
    displayName: 'Conditional (?)',
    description: 'Choose between two branches — only the chosen branch evaluates',
    docUrl: DOCS,
    backgroundColor: '#ddd0f0',
    textColor: '#26183f',
    seeds: {
      condition: true,
      then: 'The condition is true',
      else: 'The condition is false',
    },
    parameterDescriptions: {
      condition: 'The value to test, by FigTree truthiness',
      then: 'The value when the condition holds',
      else: 'The value when it does not',
    },
  },
  match: {
    displayName: 'Match',
    description: 'Choose a branch by a value — only the matching branch evaluates',
    docUrl: DOCS,
    backgroundColor: '#d4bfeb',
    textColor: '#26183f',
    seeds: {
      value: 'matchMe',
      branches: { matchMe: 'YES', nonMatch: 'NO' },
      default: 'No match',
    },
    parameterDescriptions: {
      value: 'The value to look up among the branch keys, compared as text',
      branches: 'The branches, each keyed by a value to match',
      default: 'The branch taken when none matches; without one, the node fails',
    },
  },
  firstNonNull: {
    displayName: 'First non-null',
    description:
      'The first candidate that is not null (SQL COALESCE) — later candidates never evaluate',
    docUrl: DOCS,
    backgroundColor: '#ccaee5',
    textColor: '#26183f',
    seeds: { values: [null, 'The first non-null value'] },
    parameterDescriptions: { values: 'Candidates, tried in order; only null is skipped' },
  },

  // ── Comparison ─────────────────────────────────────────────────────────
  equal: {
    displayName: 'Equal (=)',
    description:
      'True when all the values are equal, comparing arrays and objects by their contents',
    docUrl: DOCS,
    backgroundColor: '#d2efe9',
    textColor: '#183f3e',
    seeds: { values: ['These are equal', 'These are equal'] },
    parameterDescriptions: {
      values: 'The values to compare, any number of them',
      caseInsensitive:
        'Ignore case when comparing strings, though not strings inside arrays or objects',
    },
  },
  notEqual: {
    displayName: 'Not equal (!=)',
    description: "True when the values aren't all equal — the opposite of equal",
    docUrl: DOCS,
    backgroundColor: '#c1e9e3',
    textColor: '#183f3e',
    seeds: { values: ['These items', "don't match"] },
    parameterDescriptions: {
      values: 'The values to compare, any number of them',
      caseInsensitive:
        'Ignore case when comparing strings, though not strings inside arrays or objects',
    },
  },
  greaterThan: {
    displayName: 'Greater than (>)',
    description: 'True when the first value is greater than the second',
    docUrl: DOCS,
    backgroundColor: '#b0e3e0',
    textColor: '#183f3e',
    seeds: { values: [10, 9] },
    parameterDescriptions: {
      values: 'The two values to compare: both numbers, or both strings',
      nullValueDefault: 'Replaces a null value before comparing',
    },
  },
  greaterThanOrEqual: {
    displayName: 'Greater than or equal (>=)',
    description: 'True when the first value is greater than or equal to the second',
    docUrl: DOCS,
    backgroundColor: '#d2efef',
    textColor: '#183f3e',
    seeds: { values: [10, 10] },
    parameterDescriptions: {
      values: 'The two values to compare: both numbers, or both strings',
      nullValueDefault: 'Replaces a null value before comparing',
    },
  },
  lessThan: {
    displayName: 'Less than (<)',
    description: 'True when the first value is less than the second',
    docUrl: DOCS,
    backgroundColor: '#c1e6e9',
    textColor: '#183f3e',
    seeds: { values: [9, 10] },
    parameterDescriptions: {
      values: 'The two values to compare: both numbers, or both strings',
      nullValueDefault: 'Replaces a null value before comparing',
    },
  },
  lessThanOrEqual: {
    displayName: 'Less than or equal (<=)',
    description: 'True when the first value is less than or equal to the second',
    docUrl: DOCS,
    backgroundColor: '#b0dbe3',
    textColor: '#183f3e',
    seeds: { values: [9, 9] },
    parameterDescriptions: {
      values: 'The two values to compare: both numbers, or both strings',
      nullValueDefault: 'Replaces a null value before comparing',
    },
  },

  // ── Arithmetic & math ──────────────────────────────────────────────────
  plus: {
    displayName: 'Plus (+)',
    description:
      'Add numbers, concatenate strings or arrays, or shallow-merge objects — all operands must share one type',
    docUrl: DOCS,
    backgroundColor: '#d7edd4',
    textColor: '#193e1e',
    seeds: { values: [1, 2, 3] },
    parameterDescriptions: {
      values: 'The values to add, all of the same type',
      expect: 'The type the values must be — needed when the list could be empty',
      nullValueDefault: 'Replaces any null operand before the addition',
    },
  },
  subtract: {
    displayName: 'Subtract (-)',
    description: 'Subtract one number from another',
    docUrl: DOCS,
    backgroundColor: '#bfe4bc',
    textColor: '#193e1e',
    seeds: { value: 10, minus: 5 },
    parameterDescriptions: {
      value: 'The number to subtract from',
      minus: 'The amount to subtract',
    },
  },
  multiply: {
    displayName: 'Multiply (*)',
    description: 'Multiply numbers together — an empty list returns 1',
    docUrl: DOCS,
    backgroundColor: '#b4e0b3',
    textColor: '#193e1e',
    seeds: { values: [5, 5] },
    parameterDescriptions: {
      values: 'The numbers to multiply',
      nullValueDefault: 'Replaces any null factor before multiplying',
    },
  },
  divide: {
    displayName: 'Divide (/)',
    description: 'Divide one number by another — dividing by zero fails',
    docUrl: DOCS,
    backgroundColor: '#cceacd',
    textColor: '#193e1e',
    seeds: { value: 100, by: 10 },
    parameterDescriptions: { value: 'The number to divide', by: 'The number to divide it by' },
  },
  modulo: {
    displayName: 'Modulo',
    description: 'The remainder after dividing one number by another, with the sign of the divisor',
    docUrl: DOCS,
    backgroundColor: '#c3e7c6',
    textColor: '#193e1e',
    seeds: { value: 10, mod: 3 },
    parameterDescriptions: {
      value: 'The number to divide',
      mod: 'The number to divide by (the modulus)',
    },
  },
  power: {
    displayName: 'Power (^)',
    description:
      "Raise a base to an exponent — overflow, and results that aren't real numbers, fail",
    docUrl: DOCS,
    backgroundColor: '#acddb1',
    textColor: '#193e1e',
    seeds: { base: 2, exponent: 3 },
    parameterDescriptions: { base: 'The number to raise', exponent: 'The power to raise it to' },
  },
  round: {
    displayName: 'Round',
    description: 'Round to a number of decimal places — halfway values round away from zero',
    docUrl: DOCS,
    backgroundColor: '#d4edd8',
    textColor: '#193e1e',
    seeds: { value: 3.14159, decimals: 2 },
    parameterDescriptions: {
      value: 'The number to round',
      decimals:
        'Decimal places to keep; a negative number rounds to tens (-1), hundreds (-2) and so on',
    },
  },
  floor: {
    displayName: 'Round down',
    description: 'Round down toward negative infinity',
    docUrl: DOCS,
    backgroundColor: '#bce4c4',
    textColor: '#193e1e',
    seeds: { value: 2.7 },
    parameterDescriptions: { value: 'The number to round down' },
  },
  ceiling: {
    displayName: 'Round up',
    description: 'Round up toward positive infinity',
    docUrl: DOCS,
    backgroundColor: '#b3e0be',
    textColor: '#193e1e',
    seeds: { value: 2.3 },
    parameterDescriptions: { value: 'The number to round up' },
  },
  abs: {
    displayName: 'Absolute value',
    description: 'The absolute value',
    docUrl: DOCS,
    backgroundColor: '#ccead5',
    textColor: '#193e1e',
    seeds: { value: -5 },
    parameterDescriptions: { value: 'The number' },
  },
  min: {
    displayName: 'Minimum',
    description: 'The smallest of the values — numbers numerically, strings in codepoint order',
    docUrl: DOCS,
    backgroundColor: '#c3e7cf',
    textColor: '#193e1e',
    seeds: { values: [3, 1, 2] },
    parameterDescriptions: {
      values: 'The candidates: all numbers, or all strings (codepoint order)',
      nullValueDefault: 'Replaces any null candidate before comparing',
    },
  },
  max: {
    displayName: 'Maximum',
    description: 'The largest of the values — numbers numerically, strings in codepoint order',
    docUrl: DOCS,
    backgroundColor: '#acddbf',
    textColor: '#193e1e',
    seeds: { values: [3, 1, 2] },
    parameterDescriptions: {
      values: 'The candidates: all numbers, or all strings (codepoint order)',
      nullValueDefault: 'Replaces any null candidate before comparing',
    },
  },

  // ── Strings ────────────────────────────────────────────────────────────
  buildString: {
    displayName: 'String builder',
    description: 'Build text from a template, filling in its tokens',
    docUrl: DOCS,
    backgroundColor: '#f8d9c9',
    textColor: '#3f2f18',
    // A data reference rather than a substitution key, since `substitutions`
    // is optional and a new node is seeded with its required parameters only
    seeds: { template: 'Hello {{$data.name}}' },
    parameterDescriptions: {
      template: 'The text, with %1, %2… or {{name}} tokens, or references such as {{$data.name}}',
      substitutions: 'The values for the tokens: an array for %1, %2…, or an object for {{name}}',
      trim: "Trim whitespace from the ends of each value filled in, but not from the template's own text",
      closeGaps: 'Where a value fills in as empty text, remove the space beside it too',
      nullValueDefault: 'Written in place of a null value, which is otherwise empty text',
    },
  },
  split: {
    displayName: 'Split text',
    description: 'Divide a string into a list of pieces, at each delimiter',
    docUrl: DOCS,
    backgroundColor: '#f5cbab',
    textColor: '#3f2f18',
    // `trim` defaults to true, so it is added to turn it off
    seeds: { value: 'Alpha, Bravo, Charlie', delimiter: ',', trim: false },
    parameterDescriptions: {
      value: 'The string to divide',
      delimiter: 'The text to split at; an empty string splits into single characters',
      trim: 'Trim whitespace from the ends of each piece',
    },
  },
  join: {
    displayName: 'Join text',
    description: "Join a list's values into one string, with a delimiter between them",
    docUrl: DOCS,
    backgroundColor: '#f3cba0',
    textColor: '#3f2f18',
    seeds: { values: ['Alpha', 'Bravo', 'Charlie'], delimiter: ', ' },
    parameterDescriptions: {
      values: 'The values to join, of any type',
      delimiter: 'The text to put between each pair of values',
      nullValueDefault: 'Written in place of a null value, which is otherwise empty text',
    },
  },
  lower: {
    displayName: 'Lower case',
    description: 'Convert a string to lower case',
    docUrl: DOCS,
    backgroundColor: '#f7e1bf',
    textColor: '#3f2f18',
    seeds: { value: 'Hello World' },
    parameterDescriptions: { value: 'The string to lowercase' },
  },
  upper: {
    displayName: 'Upper case',
    description: 'Convert a string to upper case',
    docUrl: DOCS,
    backgroundColor: '#f6e1b4',
    textColor: '#3f2f18',
    seeds: { value: 'Hello World' },
    parameterDescriptions: { value: 'The string to uppercase' },
  },
  trim: {
    displayName: 'Trim whitespace',
    description: 'Remove whitespace from both ends of a string',
    docUrl: DOCS,
    backgroundColor: '#f2dd97',
    textColor: '#3f2f18',
    seeds: { value: '  Hello World  ' },
    parameterDescriptions: { value: 'The string to trim' },
  },
  regex: {
    displayName: 'Regular expression',
    description: 'Test, extract, match or replace in a string with a regular expression',
    docUrl: DOCS,
    backgroundColor: '#f8f1c9',
    textColor: '#3f2f18',
    seeds: { value: 'test-this', pattern: '^[a-z]{4}-[a-z]{4}$', flags: 'i' },
    parameterDescriptions: {
      value: 'The string to search',
      pattern: 'The regular expression, as a string',
      flags: 'Any of i, m, s and u',
      mode: "'test' returns true or false, 'extract' the first match, 'match' every match, and 'replace' the string with every match replaced",
      noMatchDefault: "What 'extract' returns when nothing matches",
      replacement:
        "What 'replace' puts in place of each match: $1 and $<name> insert a capture group, $& the whole match, $$ a dollar sign",
    },
  },

  // ── Arrays & iteration ─────────────────────────────────────────────────
  // Adding `as` renames the bindings `each` reads (as: 'item' binds $item),
  // so an editor adding it also renames `$element` in `each`
  length: {
    displayName: 'Length',
    description: 'The number of elements in an array, or characters (code points) in a string',
    docUrl: DOCS,
    backgroundColor: '#cde5f3',
    textColor: '#18293f',
    seeds: { value: [1, 2, 3, 4, 5] },
    parameterDescriptions: { value: 'The array or string to measure' },
  },
  map: {
    displayName: 'Map each',
    description: 'Transform every element of an array',
    docUrl: DOCS,
    backgroundColor: '#bbd7ef',
    textColor: '#18293f',
    seeds: { input: [1, 2, 3], each: '$element', as: 'item' },
    parameterDescriptions: {
      input: 'The array to iterate over',
      as: "A name to use in place of element: 'row' gives $row and $rowIndex",
      nullInputDefault: 'Used as the array when input is null, such as []',
      each: 'Evaluated for each element, which it reads as $element',
    },
  },
  filter: {
    displayName: 'Filter',
    description: 'Keep the elements of an array that pass a test',
    docUrl: DOCS,
    backgroundColor: '#a8c7eb',
    textColor: '#18293f',
    seeds: { input: [0, 1, 2, 3], each: '$element', as: 'item' },
    parameterDescriptions: {
      input: 'The array to iterate over',
      as: "A name to use in place of element: 'row' gives $row and $rowIndex",
      nullInputDefault: 'Used as the array when input is null, such as []',
      each: 'The test for each element, which it reads as $element, by FigTree truthiness',
    },
  },
  find: {
    displayName: 'Find first',
    description: 'The first element of an array that passes a test',
    docUrl: DOCS,
    backgroundColor: '#cddcf3',
    textColor: '#18293f',
    seeds: { input: [0, 1, 2, 3], each: '$element', as: 'item' },
    parameterDescriptions: {
      input: 'The array to iterate over',
      as: "A name to use in place of element: 'row' gives $row and $rowIndex",
      nullInputDefault: 'Used as the array when input is null, such as []',
      each: 'The test for each element, which it reads as $element, by FigTree truthiness',
      noMatchDefault: 'What to return when no element passes',
    },
  },
  some: {
    displayName: 'Any match',
    description: 'True when any element passes a test',
    docUrl: DOCS,
    backgroundColor: '#bbccef',
    textColor: '#18293f',
    seeds: { input: [0, 1, 2, 3], each: '$element', as: 'item' },
    parameterDescriptions: {
      input: 'The array to iterate over',
      as: "A name to use in place of element: 'row' gives $row and $rowIndex",
      nullInputDefault: 'Used as the array when input is null, such as []',
      each: 'The test for each element, which it reads as $element, by FigTree truthiness',
    },
  },
  every: {
    displayName: 'All match',
    description: 'True when every element passes a test',
    docUrl: DOCS,
    backgroundColor: '#a8b9eb',
    textColor: '#18293f',
    seeds: { input: [0, 1, 2, 3], each: '$element', as: 'item' },
    parameterDescriptions: {
      input: 'The array to iterate over',
      as: "A name to use in place of element: 'row' gives $row and $rowIndex",
      nullInputDefault: 'Used as the array when input is null, such as []',
      each: 'The test for each element, which it reads as $element, by FigTree truthiness',
    },
  },

  // ── Data & objects ─────────────────────────────────────────────────────
  get: {
    displayName: 'Get data',
    description: 'Read a value at a path, from $data or from another object',
    docUrl: DOCS,
    backgroundColor: '#f0d1e5',
    textColor: '#3f182a',
    // `from` holds what `path` reads, so adding it gives a working lookup
    seeds: {
      path: 'path.to.value',
      from: { path: { to: { value: 'Found it' } } },
      default: 'Not found',
    },
    parameterDescriptions: {
      path: 'The path to read, written as in a $data reference, or as an array of keys',
      from: 'What to read from, in place of the data, such as a lookup table or $vars',
      default: 'What to return when the path is missing, in place of null',
    },
  },
  buildObject: {
    displayName: 'Build object',
    description: 'Build an object from key and value pairs, for keys worked out as it runs',
    docUrl: DOCS,
    backgroundColor: '#eac0cc',
    textColor: '#3f182a',
    seeds: {
      entries: [
        { key: 'firstKey', value: 'firstValue' },
        { key: 'secondKey', value: 'secondValue' },
      ],
    },
    parameterDescriptions: {
      entries: 'The entries, each an object with a key and a value',
    },
  },

  // ── Other ──────────────────────────────────────────────────────────────
  convert: {
    displayName: 'Convert type',
    description:
      "Convert a value to a number, string, boolean or array — a value that can't be converted is an error",
    docUrl: DOCS,
    backgroundColor: '#dddfe3',
    textColor: '#272a30',
    seeds: { value: '42' },
    parameterDescriptions: {
      value: 'The value to convert',
      to: 'The type to convert to',
    },
  },

  // ── I/O ────────────────────────────────────────────────────────────────
  // A `timeout` is in milliseconds, so the integer type seed of 1 would
  // expire every request
  http: {
    displayName: 'HTTP request',
    description: 'Send an HTTP request, and return its JSON response',
    docUrl: DOCS,
    backgroundColor: '#eeedd2',
    textColor: '#3a3f18',
    seeds: {
      url: 'https://restcountries.com/v3.1/name/zealand',
      returnPath: '[0].name.common',
      timeout: 5000,
    },
    parameterDescriptions: {
      url: "The URL to request; one without http:// or https:// is joined to the instance's base endpoint",
      method: 'The request method',
      query: 'Query string parameters; any whose value is null are omitted',
      body: 'The body to send as JSON, for a POST',
      headers: "Headers to send, added to the instance's; any set to null are omitted",
      returnPath: 'The part of the response to return, as a path like a $data reference',
      timeout: 'The longest the request can take, in milliseconds',
    },
  },
  graphQL: {
    displayName: 'GraphQL query',
    description: "Send a GraphQL query, and return the response's data",
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
    parameterDescriptions: {
      query: 'The GraphQL query',
      variables: "The query's variables",
      url: "The endpoint, in place of the instance's",
      headers: "Headers to send, added to the instance's; any set to null are omitted",
      returnPath: 'The part of the response to return, as a path like a $data reference',
      timeout: 'The longest the request can take, in milliseconds',
    },
  },
  sql: {
    displayName: 'SQL query',
    description: 'Run an SQL query, and return its rows',
    docUrl: DOCS,
    backgroundColor: '#d2e2b1',
    textColor: '#3a3f18',
    seeds: { query: 'SELECT contact_name FROM customers LIMIT 5', timeout: 5000 },
    parameterDescriptions: {
      query: "The query, with placeholders in the database's own style, such as $1",
      values: "The values for the query's placeholders",
      shape: "What to return: every row, the first row, one column's values, or the first value",
      noRowDefault: "What 'firstRow' or 'firstValue' return when there's no row",
      timeout: 'The longest the request can take, in milliseconds',
    },
  },

  // ── Grammar ────────────────────────────────────────────────────────────
  // `literal` is no operator definition, so it has no category, but an
  // editor draws it as an operator node. Its colour is a shade of Other's.
  literal: {
    displayName: 'Literal',
    docUrl: DOCS,
    backgroundColor: '#d5dae4',
    textColor: '#272a30',
    seeds: { value: 'No content inside a literal node is evaluated' },
  },
}

/** The value under a key the map holds itself, not one it inherits. */
const own = <T>(map: { [key: string]: T } | undefined, key: string): T | undefined =>
  map !== undefined && Object.hasOwn(map, key) ? map[key] : undefined

/**
 * The colours an operator's listing or a fragment's metadata gives, where it
 * gives the pair.
 */
const coloursOf = (display: FragmentMetadata) =>
  display.backgroundColor !== undefined && display.textColor !== undefined
    ? { backgroundColor: display.backgroundColor, textColor: display.textColor }
    : undefined

/**
 * What a parameter starts as: the seed its operator's listing or its
 * fragment's metadata gives, else its type's.
 */
const seedOf = (display: FragmentMetadata, parameter: string, type: ExpectedType): unknown => {
  if (display.seeds !== undefined && Object.hasOwn(display.seeds, parameter))
    return display.seeds[parameter]
  if (typeof type === 'string') return typeSeeds[type]
  if ('literal' in type) return type.literal[0]
  return typeSeeds[type.find((member) => member !== 'null') ?? 'null']
}

/**
 * What a `null` at the parameter does (`CatalogParameter.nullOutcome`), in
 * the order the engine meets it: the compiler first, which owns an
 * iterator's `as` binding, then parameter resolution
 * (src/evaluate/params.ts). Its null-naming test is the engine's
 * `typeNamesNull`, repeated since this module imports no engine code;
 * test/catalog.test.ts holds every package parameter's outcome to what the
 * engine does with a `null` there.
 */
const nullOutcomeOf = (
  name: string,
  parameter: ParameterInfo,
  parameters: Record<string, ParameterInfo>
): CatalogParameter['nullOutcome'] => {
  const { type, evaluationMode } = parameter
  if (parameter.replacesNullAt) return 'none'
  // A binding name must be a literal string, so a null there is a compile
  // error (invalid-as)
  if (
    name === 'as' &&
    evaluationMode === 'structural' &&
    Object.values(parameters).some((sibling) => sibling.evaluationMode === 'perElement')
  )
    return 'error'
  // A handle is checked when the body demands it, with no default to fall
  // back on; every other delivery is resolved before the body runs
  if (![type].flat().some((member) => member === 'null' || member === 'any'))
    return parameter.required || evaluationMode === 'lazy' || evaluationMode === 'perElement'
      ? 'error'
      : 'unset'
  return evaluationMode === 'eager' || evaluationMode === 'structural'
    ? parameter.nullPolicy
    : 'value'
}

/** `from`'s own entries written onto `onto`, except any set to `undefined`. */
const assignDefined = <T>(onto: { [key: string]: T }, from: { [key: string]: T } | undefined) => {
  for (const [key, value] of Object.entries(from ?? {})) if (value !== undefined) onto[key] = value
}

/**
 * The instance's operators, each with its listing joined in, its fragments,
 * each with its metadata joined in, and the categories they group under.
 *
 * An operator's listing is the package's own entry in `operatorListings`,
 * then each map in `listings` in order, each merged over the ones before it,
 * so an override holds only what it changes. `displayName`, `description`
 * and `docUrl` are replaced where a later entry gives them; `seeds` and
 * `parameterDescriptions` are merged per parameter; colours are replaced
 * only by an entry giving the pair. A field or parameter entry set to
 * `undefined` is skipped, so it never erases what is beneath it, and only
 * keys a map or entry holds itself are read. A fragment's metadata is its
 * definition's `metadata`, with nothing merged over it.
 */
export const getCatalog = (
  fig: Pick<FigTree, 'getOperators' | 'getFragments'>,
  ...listings: OperatorListingMap[]
): Catalog => {
  const listingOf = (name: string): OperatorListing => {
    const listing: OperatorListing = { seeds: {}, parameterDescriptions: {} }
    for (const map of [operatorListings, ...listings]) {
      const layer = own(map, name)
      if (layer === undefined) continue
      for (const field of ['displayName', 'description', 'docUrl'] as const) {
        const value = layer[field]
        if (value !== undefined) listing[field] = value
      }
      Object.assign(listing, coloursOf(layer))
      assignDefined(listing.seeds!, layer.seeds)
      assignDefined(listing.parameterDescriptions!, layer.parameterDescriptions)
    }
    return listing
  }

  const categories = Object.entries(categoryListings)
    .map(([name, listing]): CatalogCategory => ({ name: name as OperatorCategory, ...listing }))
    .sort((a, b) => a.order - b.order)

  const operators = fig.getOperators().map(({ name, parameters, ...info }): CatalogOperator => {
    const listing = listingOf(name)
    const operator: CatalogOperator = {
      name,
      displayName: listing.displayName ?? name,
      ...info,
      ...(coloursOf(listing) ?? coloursOf(categoryListings[info.category])!),
      parameters: {},
    }
    if (listing.description !== undefined) operator.description = listing.description
    if (listing.docUrl !== undefined) operator.docUrl = listing.docUrl
    for (const [key, parameter] of Object.entries(parameters)) {
      const entry: CatalogParameter = {
        ...parameter,
        nullOutcome: nullOutcomeOf(key, parameter, parameters),
        seed: seedOf(listing, key, parameter.type),
      }
      // A holder has no outcome of its own, for its elements either
      if (
        !parameter.replacesNullAt &&
        [parameter.type].flat().every((member) => member === 'array' || member === 'object')
      ) {
        // Unless a policy takes them, null elements meet the constraints
        const { homogeneous, elementShape } = parameter.constraints ?? {}
        entry.elementNullOutcome =
          parameter.elementNullPolicy ??
          (elementShape || (homogeneous && !homogeneous.includes('any')) ? 'error' : 'value')
      }
      const description = own(listing.parameterDescriptions, key)
      if (description !== undefined) entry.description = description
      operator.parameters[key] = entry
    }
    return operator
  })

  const fragments = fig.getFragments().map(({ name, parameters, ...info }): CatalogFragment => {
    const metadata: FragmentMetadata = info.metadata ?? {}
    const fragment: CatalogFragment = {
      name,
      displayName: metadata.displayName ?? name,
      ...info,
      ...coloursOf(metadata),
      parameters: {},
    }
    if (metadata.docUrl !== undefined) fragment.docUrl = metadata.docUrl
    for (const [key, parameter] of Object.entries(parameters))
      fragment.parameters[key] = { ...parameter, seed: seedOf(metadata, key, parameter.type) }
    return fragment
  })

  return { categories, operators, fragments }
}

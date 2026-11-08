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
  CatalogIssue,
  CatalogOperator,
  CatalogOptions,
  CategoryListing,
  CategoryListingMap,
  CategoryOverrides,
  ColorPair,
  Listing,
  ListingMap,
  TypeSeeds,
} from '../catalogTypes'
import type { FigTree } from '../FigTree'
import type { OperatorInfo } from '../introspect'
import type { OperatorCategory } from '../operatorDefinition'
import type { ExpectedType } from '../typeCheck'

export const categoryListings: CategoryListingMap = {
  logic: {
    displayName: 'Logic & control',
    order: 0,
    colors: { background: '#632fbc', text: '#ffffff' },
  },
  comparison: {
    displayName: 'Comparison',
    order: 1,
    colors: { background: '#247f7c', text: '#ffffff' },
  },
  math: {
    displayName: 'Arithmetic & math',
    order: 2,
    colors: { background: '#2b8237', text: '#ffffff' },
  },
  string: { displayName: 'Strings', order: 3, colors: { background: '#a1660c', text: '#ffffff' } },
  array: {
    displayName: 'Arrays & iteration',
    order: 4,
    colors: { background: '#236ac7', text: '#ffffff' },
  },
  data: {
    displayName: 'Data & objects',
    order: 5,
    colors: { background: '#b93171', text: '#ffffff' },
  },
  io: { displayName: 'I/O', order: 6, colors: { background: '#6e7a24', text: '#ffffff' } },
  // Where an operator that fits no other category goes, plugins' included
  other: { displayName: 'Other', order: 7, colors: { background: '#606e8a', text: '#ffffff' } },
}

/**
 * The colours of a fragment whose listing gives none. One pair for every
 * fragment, so fragments read as one kind, as an operator reads by its
 * category.
 */
export const fragmentColors: ColorPair = { background: '#38607e', text: '#ebdf5a' }

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

export const operatorListings: ListingMap = {
  // ── Logic & control ────────────────────────────────────────────────────
  and: {
    displayName: 'Logical AND',
    description: 'True when every value is truthy',
    docUrl: DOCS,
    colors: { background: '#d6d0f0', text: '#26183f' },
    seeds: { values: [true, true] },
    parameterDescriptions: { values: 'The values to test, by FigTree truthiness' },
  },
  or: {
    displayName: 'Logical OR',
    description: 'True when any value is truthy',
    docUrl: DOCS,
    colors: { background: '#cabfeb', text: '#26183f' },
    seeds: { values: [true, false] },
    parameterDescriptions: { values: 'The values to test, by FigTree truthiness' },
  },
  not: {
    displayName: 'Logical NOT (!)',
    description: 'Negate the truthiness of a value',
    docUrl: DOCS,
    colors: { background: '#c0aee5', text: '#26183f' },
    seeds: { value: true },
    parameterDescriptions: { value: 'The value to test, by FigTree truthiness' },
  },
  if: {
    displayName: 'Conditional (?)',
    description: 'Choose between two branches — only the chosen branch evaluates',
    docUrl: DOCS,
    colors: { background: '#ddd0f0', text: '#26183f' },
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
    colors: { background: '#d4bfeb', text: '#26183f' },
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
    colors: { background: '#ccaee5', text: '#26183f' },
    seeds: { values: [null, 'The first non-null value'] },
    parameterDescriptions: { values: 'Candidates, tried in order; only null is skipped' },
  },

  // ── Comparison ─────────────────────────────────────────────────────────
  equal: {
    displayName: 'Equal (=)',
    description:
      'True when all the values are equal, comparing arrays and objects by their contents',
    docUrl: DOCS,
    colors: { background: '#d2efe9', text: '#183f3e' },
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
    colors: { background: '#c1e9e3', text: '#183f3e' },
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
    colors: { background: '#b0e3e0', text: '#183f3e' },
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
    colors: { background: '#d2efef', text: '#183f3e' },
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
    colors: { background: '#c1e6e9', text: '#183f3e' },
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
    colors: { background: '#b0dbe3', text: '#183f3e' },
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
    colors: { background: '#d7edd4', text: '#193e1e' },
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
    colors: { background: '#bfe4bc', text: '#193e1e' },
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
    colors: { background: '#b4e0b3', text: '#193e1e' },
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
    colors: { background: '#cceacd', text: '#193e1e' },
    seeds: { value: 100, by: 10 },
    parameterDescriptions: { value: 'The number to divide', by: 'The number to divide it by' },
  },
  modulo: {
    displayName: 'Modulo',
    description: 'The remainder after dividing one number by another, with the sign of the divisor',
    docUrl: DOCS,
    colors: { background: '#c3e7c6', text: '#193e1e' },
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
    colors: { background: '#acddb1', text: '#193e1e' },
    seeds: { base: 2, exponent: 3 },
    parameterDescriptions: { base: 'The number to raise', exponent: 'The power to raise it to' },
  },
  round: {
    displayName: 'Round',
    description: 'Round to a number of decimal places — halfway values round away from zero',
    docUrl: DOCS,
    colors: { background: '#d4edd8', text: '#193e1e' },
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
    colors: { background: '#bce4c4', text: '#193e1e' },
    seeds: { value: 2.7 },
    parameterDescriptions: { value: 'The number to round down' },
  },
  ceiling: {
    displayName: 'Round up',
    description: 'Round up toward positive infinity',
    docUrl: DOCS,
    colors: { background: '#b3e0be', text: '#193e1e' },
    seeds: { value: 2.3 },
    parameterDescriptions: { value: 'The number to round up' },
  },
  abs: {
    displayName: 'Absolute value',
    description: 'The absolute value',
    docUrl: DOCS,
    colors: { background: '#ccead5', text: '#193e1e' },
    seeds: { value: -5 },
    parameterDescriptions: { value: 'The number' },
  },
  min: {
    displayName: 'Minimum',
    description: 'The smallest of the values — numbers numerically, strings in codepoint order',
    docUrl: DOCS,
    colors: { background: '#c3e7cf', text: '#193e1e' },
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
    colors: { background: '#acddbf', text: '#193e1e' },
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
    colors: { background: '#f8d9c9', text: '#3f2f18' },
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
    colors: { background: '#f5cbab', text: '#3f2f18' },
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
    colors: { background: '#f3cba0', text: '#3f2f18' },
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
    colors: { background: '#f7e1bf', text: '#3f2f18' },
    seeds: { value: 'Hello World' },
    parameterDescriptions: { value: 'The string to lowercase' },
  },
  upper: {
    displayName: 'Upper case',
    description: 'Convert a string to upper case',
    docUrl: DOCS,
    colors: { background: '#f6e1b4', text: '#3f2f18' },
    seeds: { value: 'Hello World' },
    parameterDescriptions: { value: 'The string to uppercase' },
  },
  trim: {
    displayName: 'Trim whitespace',
    description: 'Remove whitespace from both ends of a string',
    docUrl: DOCS,
    colors: { background: '#f2dd97', text: '#3f2f18' },
    seeds: { value: '  Hello World  ' },
    parameterDescriptions: { value: 'The string to trim' },
  },
  regex: {
    displayName: 'Regular expression',
    description: 'Test, extract, match or replace in a string with a regular expression',
    docUrl: DOCS,
    colors: { background: '#f8f1c9', text: '#3f2f18' },
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
    colors: { background: '#cde5f3', text: '#18293f' },
    seeds: { value: [1, 2, 3, 4, 5] },
    parameterDescriptions: { value: 'The array or string to measure' },
  },
  map: {
    displayName: 'Map each',
    description: 'Transform every element of an array',
    docUrl: DOCS,
    colors: { background: '#bbd7ef', text: '#18293f' },
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
    colors: { background: '#a8c7eb', text: '#18293f' },
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
    colors: { background: '#cddcf3', text: '#18293f' },
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
    colors: { background: '#bbccef', text: '#18293f' },
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
    colors: { background: '#a8b9eb', text: '#18293f' },
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
    colors: { background: '#f0d1e5', text: '#3f182a' },
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
    colors: { background: '#eac0cc', text: '#3f182a' },
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
    colors: { background: '#dddfe3', text: '#272a30' },
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
    colors: { background: '#eeedd2', text: '#3a3f18' },
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
    colors: { background: '#e3e8c2', text: '#3a3f18' },
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
    colors: { background: '#d2e2b1', text: '#3a3f18' },
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
  // `literal` is no operator definition, but an editor draws it as an
  // operator node, so the catalog lists it as one, in Other
  literal: {
    displayName: 'Literal',
    description: 'Use a value exactly as written — nothing inside it is evaluated',
    docUrl: DOCS,
    colors: { background: '#d5dae4', text: '#272a30' },
    seeds: { value: 'No content inside a literal node is evaluated' },
    parameterDescriptions: {
      value:
        'Returned exactly as written, including any keys prefixed with $ and $data strings inside it',
    },
  },
}

/** The value under a key the map holds itself, not one it inherits. */
const own = <T>(map: { [key: string]: T } | undefined, key: string): T | undefined =>
  map !== undefined && Object.hasOwn(map, key) ? map[key] : undefined

/**
 * What a parameter starts as: the seed its listing gives, else its type's.
 */
const seedOf = (listing: Listing, parameter: string, type: ExpectedType): unknown => {
  if (listing.seeds !== undefined && Object.hasOwn(listing.seeds, parameter))
    return listing.seeds[parameter]
  if (typeof type === 'string') return typeSeeds[type]
  if ('literal' in type) return type.literal[0]
  return typeSeeds[type.find((member) => member !== 'null') ?? 'null']
}

/** `from`'s own entries written onto `onto`, except any set to `undefined`. */
const assignDefined = <T>(onto: { [key: string]: T }, from: { [key: string]: T } | undefined) => {
  for (const [key, value] of Object.entries(from ?? {})) if (value !== undefined) onto[key] = value
}

type Path = (string | number)[]

/** Records a value of the wrong type at `path`, which is then skipped. */
type Report = (path: Path, expected: string, value: unknown) => void

/** A value's kind, as a check's message names it. */
const kindOf = (value: unknown): string =>
  value === null
    ? 'null'
    : Array.isArray(value)
      ? 'array'
      : Number.isNaN(value)
        ? 'NaN'
        : typeof value

/** A plain object, as JSON gives one: not null, not an array. */
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * What a field must hold: a value of that kind, or an object of strings —
 * the two `colors` must both hold, while a `parameterDescriptions` entry
 * that doesn't is left out alone.
 */
type Rule = 'string' | 'number' | 'object' | 'colors' | 'texts'

const LISTING_RULES: Record<string, Rule> = {
  displayName: 'string',
  description: 'string',
  docUrl: 'string',
  colors: 'colors',
  seeds: 'object',
  samples: 'object',
  metadata: 'object',
  parameterDescriptions: 'texts',
}

const CATEGORY_RULES: Record<string, Rule> = {
  displayName: 'string',
  order: 'number',
  colors: 'colors',
}

/**
 * An entry's own fields that keep their rule, each other one reported and
 * left out. Unknown keys are ignored, as registration ignores them.
 */
const checkedFields = (
  entry: Record<string, unknown>,
  rules: Record<string, Rule>,
  path: Path,
  report: Report
): Record<string, unknown> => {
  const checked: Record<string, unknown> = {}
  for (const [field, rule] of Object.entries(rules)) {
    const value = own(entry, field)
    if (value === undefined) continue
    const kind = rule === 'string' || rule === 'number' ? rule : 'object'
    if (kindOf(value) !== kind) {
      report([...path, field], kind, value)
      continue
    }
    if (rule !== 'colors' && rule !== 'texts') {
      checked[field] = value
      continue
    }
    const { background, text } = value as Record<string, unknown>
    const strings = Object.entries(
      rule === 'colors' ? { background, text } : (value as Record<string, unknown>)
    ).filter(([key, string]) => {
      const kept = typeof string === 'string' || (rule === 'texts' && string === undefined)
      if (!kept) report([...path, field, key], 'string', string)
      return kept
    })
    if (rule === 'texts') checked[field] = Object.fromEntries(strings)
    else if (strings.length === 2) checked[field] = value
  }
  return checked
}

/** A listing, checked: its fields of the right type. */
const checkedListing = (entry: Record<string, unknown>, path: Path, report: Report): Listing =>
  checkedFields(entry, LISTING_RULES, path, report)

/** A category override, checked: its fields of the right type. */
const checkedCategory = (
  entry: Record<string, unknown>,
  path: Path,
  report: Report
): Partial<CategoryListing> => checkedFields(entry, CATEGORY_RULES, path, report)

/**
 * An option's layers, each checked: a single map counts as one layer, and
 * an option that is neither a map nor an array of them, a layer that isn't
 * an object, or an entry that isn't an object, is reported and left out
 * whole. Paths follow what the host wrote: a single map's have no index.
 */
const checkedLayers = <T>(
  layers: unknown,
  option: string,
  check: (entry: Record<string, unknown>, path: Path, report: Report) => T,
  report: Report
): { [name: string]: T }[] => {
  if (layers === undefined) return []
  const single = isObject(layers)
  if (!single && !Array.isArray(layers)) {
    report([option], 'object or array of objects', layers)
    return []
  }
  const maps: unknown[] = single ? [layers] : (layers as unknown[])
  const checked: { [name: string]: T }[] = []
  maps.forEach((map, i) => {
    const at: Path = single ? [option] : [option, i]
    if (!isObject(map)) return report(at, 'object', map)
    const entries: [string, T][] = []
    for (const [name, entry] of Object.entries(map)) {
      if (entry === undefined) continue
      if (isObject(entry)) entries.push([name, check(entry, [...at, name], report)])
      else report([...at, name], 'object', entry)
    }
    // fromEntries defines each key as the map's own, `__proto__` included
    checked.push(Object.fromEntries(entries))
  })
  return checked
}

/**
 * An entry's listing: its base layer, then each map's entry under its name,
 * each merged over the ones before it.
 */
const resolveListing = (base: Listing | undefined, name: string, maps: ListingMap[]): Listing => {
  const listing: Listing = { seeds: {}, samples: {}, parameterDescriptions: {}, metadata: {} }
  for (const layer of [base, ...maps.map((map) => own(map, name))]) {
    if (layer === undefined) continue
    for (const field of ['displayName', 'description', 'docUrl'] as const) {
      const value = layer[field]
      if (value !== undefined) listing[field] = value
    }
    if (layer.colors !== undefined) listing.colors = layer.colors
    for (const field of ['seeds', 'samples', 'parameterDescriptions', 'metadata'] as const)
      assignDefined<unknown>(listing[field]!, layer[field])
  }
  return listing
}

/**
 * A category's listing: the package's, then each override's entry for it,
 * each merged over the ones before it.
 */
const resolveCategory = (name: OperatorCategory, overrides: CategoryOverrides[]) => {
  const listing: CategoryListing = { ...categoryListings[name] }
  for (const layer of overrides.map((override) => own(override, name))) {
    if (layer?.displayName !== undefined) listing.displayName = layer.displayName
    if (layer?.order !== undefined) listing.order = layer.order
    if (layer?.colors !== undefined) listing.colors = layer.colors
  }
  return listing
}

/**
 * What an entry shows, from its listing: its label, text, docs link,
 * colours, and its definition's `metadata` with the listing's merged over it.
 */
const presentation = (
  name: string,
  listing: Listing,
  colors: ColorPair,
  metadata: Record<string, unknown> | undefined
) => {
  const shown: Pick<
    CatalogOperator,
    'displayName' | 'description' | 'docUrl' | 'colors' | 'metadata'
  > = {
    displayName: listing.displayName ?? name,
    colors,
    metadata: {},
  }
  if (listing.description !== undefined) shown.description = listing.description
  if (listing.docUrl !== undefined) shown.docUrl = listing.docUrl
  assignDefined(shown.metadata, metadata)
  assignDefined(shown.metadata, listing.metadata)
  return shown
}

/** What a parameter's listing gives it: its description, seed and sample. */
const parameterText = (listing: Listing, parameter: string, type: ExpectedType) => {
  const text: { description?: string; seed: unknown; sample?: unknown } = {
    seed: seedOf(listing, parameter, type),
  }
  const description = own(listing.parameterDescriptions, parameter)
  if (description !== undefined) text.description = description
  if (Object.hasOwn(listing.samples!, parameter)) text.sample = listing.samples![parameter]
  return text
}

/**
 * `literal` as `getOperators()` would report a definition declaring one
 * required `value` of any type, never evaluated, whose null is returned as
 * it is. Fresh on every call, as a snapshot's entries are.
 */
const literalInfo = (): OperatorInfo => ({
  name: 'literal',
  category: 'other',
  parameters: {
    value: {
      type: 'any',
      required: true,
      evaluationMode: 'literal',
      truthiness: false,
      nullPolicy: 'accept',
      nullBehavior: 'accept',
      elementNullBehavior: 'accept',
    },
  },
  restParam: null,
  timeoutParam: null,
  cache: false,
  returns: 'any',
  hasValidate: false,
  positionalParams: [],
})

/**
 * The instance's operators, then `literal`, and its fragments, each with its
 * listing joined in, and the categories the operators are in.
 *
 * An entry's listing is its base layer, then the map in `listings`, or each
 * of its maps in order, each merged over the ones before it, so an override
 * holds only what it changes. The base layer is the package's
 * `operatorListings` entry for a core or I/O operator and for `literal`, the
 * definition's `listing` for a fragment, and nothing for any other
 * operator. `displayName`, `description`, `docUrl` and `colors` are
 * replaced where a later layer gives them; `seeds`, `samples` and
 * `parameterDescriptions` are merged per parameter, and `metadata` per
 * key. A field, parameter or key set to `undefined` is skipped, so it never
 * erases what is beneath it, and only keys a map or entry holds itself are
 * read. Maps are keyed by canonical name, so an alias key, or a key naming
 * nothing here, is ignored. A category's listing is merged the same way,
 * from `categories`.
 */
export const getCatalog = (
  fig: Pick<FigTree, 'getOperators' | 'getFragments'>,
  options: CatalogOptions = {}
): Catalog => {
  const issues: CatalogIssue[] = []
  const report: Report = (path, expected, value) => {
    issues.push({ path, message: `expected ${expected}, got ${kindOf(value)}` })
  }
  if (!isObject(options)) report([], 'object', options)
  const given = isObject(options) ? options : {}
  for (const key of Object.keys(given))
    if (key !== 'listings' && key !== 'categories')
      issues.push({ path: [key], message: 'not an option: expected listings or categories' })
  const listings: ListingMap[] = checkedLayers(given.listings, 'listings', checkedListing, report)
  const overrides: CategoryOverrides[] = checkedLayers(
    given.categories,
    'categories',
    checkedCategory,
    report
  )
  // `literal` is a reserved name, so no registered operator can be another
  const snapshot = [...fig.getOperators(), literalInfo()]

  const inUse = new Set(snapshot.map(({ category }) => category))
  const resolved = new Map(
    (Object.keys(categoryListings) as OperatorCategory[])
      .filter((name) => inUse.has(name))
      .map((name) => [name, resolveCategory(name, overrides)])
  )
  const categories = [...resolved]
    .map(([name, listing]): CatalogCategory => ({ name, ...listing }))
    .sort((a, b) => a.order - b.order)

  const operators = snapshot.map(({ name, parameters, metadata, ...info }): CatalogOperator => {
    const listing = resolveListing(own(operatorListings, name), name, listings)
    const colors = listing.colors ?? resolved.get(info.category)!.colors
    const operator: CatalogOperator = {
      name,
      ...info,
      ...presentation(name, listing, colors, metadata),
      parameters: {},
    }
    for (const [key, parameter] of Object.entries(parameters)) {
      operator.parameters[key] = { ...parameter, ...parameterText(listing, key, parameter.type) }
    }
    return operator
  })

  const fragments = fig
    .getFragments()
    .map(({ name, parameters, listing: written, metadata, ...info }): CatalogFragment => {
      const base = isObject(written)
        ? checkedListing(written, ['fragments', name, 'listing'], report)
        : undefined
      const listing = resolveListing(base, name, listings)
      const fragment: CatalogFragment = {
        name,
        ...info,
        ...presentation(name, listing, listing.colors ?? fragmentColors, metadata),
        parameters: {},
      }
      for (const [key, parameter] of Object.entries(parameters))
        fragment.parameters[key] = { ...parameter, ...parameterText(listing, key, parameter.type) }
      return fragment
    })

  return { categories, operators, fragments, issues }
}

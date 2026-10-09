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
  FragmentListing,
  OperatorListing,
  OperatorListingMap,
  TypeSeeds,
} from '../catalogTypes'
import type { FigTree } from '../FigTree'
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
    description: 'True when every value is truthy — operands run in parallel',
    docUrl: DOCS,
    backgroundColor: '#d6d0f0',
    textColor: '#26183f',
    seeds: { values: [true, true] },
    parameterDescriptions: { values: 'Operands, judged by FigTree truthiness; null is falsy' },
  },
  or: {
    displayName: 'Logical OR',
    description: 'True when any value is truthy — operands run in parallel',
    docUrl: DOCS,
    backgroundColor: '#cabfeb',
    textColor: '#26183f',
    seeds: { values: [true, false] },
    parameterDescriptions: { values: 'Operands, judged by FigTree truthiness; null is falsy' },
  },
  not: {
    displayName: 'Logical NOT (!)',
    description: 'Negate the truthiness of a value',
    docUrl: DOCS,
    backgroundColor: '#c0aee5',
    textColor: '#26183f',
    seeds: { value: true },
    parameterDescriptions: {
      value: 'Judged by FigTree truthiness; null is falsy, so not(null) is true',
    },
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
      condition: 'Judged by FigTree truthiness; null is falsy',
      then: 'The value when the condition holds',
      else: 'The value when it does not; omitted means null',
    },
  },
  match: {
    displayName: 'Match',
    description: 'Dispatch on a value — only the matching branch evaluates',
    docUrl: DOCS,
    backgroundColor: '#d4bfeb',
    textColor: '#26183f',
    seeds: {
      value: 'matchMe',
      branches: { matchMe: 'YES', nonMatch: 'NO' },
      default: 'No match',
    },
    parameterDescriptions: {
      value: 'Matched against branch keys by its canonical string form',
      branches: 'A literal map of branches, or an expression computing one',
      default: 'The branch taken when none matches; absent means failure',
    },
  },
  firstOf: {
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
      'Are all the values equal? Deep, structural, key-order-insensitive; a cross-type comparison is false',
    docUrl: DOCS,
    backgroundColor: '#d2efe9',
    textColor: '#183f3e',
    seeds: { values: ['These are equal', 'These are equal'] },
    parameterDescriptions: {
      values: 'The values compared; null is comparable (null equals null)',
      caseInsensitive: 'Fold string operands to one case before comparing (shallow)',
    },
  },
  notEqual: {
    displayName: 'Not equal (!=)',
    description: 'Are the values NOT all equal? The exact negation of equal (never "all distinct")',
    docUrl: DOCS,
    backgroundColor: '#c1e9e3',
    textColor: '#183f3e',
    seeds: { values: ['These items', "don't match"] },
    parameterDescriptions: {
      values: 'The values compared; null is comparable (null equals null)',
      caseInsensitive: 'Fold string operands to one case before comparing (shallow)',
    },
  },
  greaterThan: {
    displayName: 'Greater than (>)',
    description: 'Is the first value strictly greater than the second?',
    docUrl: DOCS,
    backgroundColor: '#b0e3e0',
    textColor: '#183f3e',
    seeds: { values: [10, 9] },
    parameterDescriptions: {
      values: 'Exactly two operands: both numbers, or both strings (codepoint order)',
      nullValueDefault: 'Replaces a null operand before comparing',
    },
  },
  greaterThanOrEqual: {
    displayName: 'Greater than or equal (>=)',
    description: 'Is the first value greater than or equal to the second?',
    docUrl: DOCS,
    backgroundColor: '#d2efef',
    textColor: '#183f3e',
    seeds: { values: [10, 10] },
    parameterDescriptions: {
      values: 'Exactly two operands: both numbers, or both strings (codepoint order)',
      nullValueDefault: 'Replaces a null operand before comparing',
    },
  },
  lessThan: {
    displayName: 'Less than (<)',
    description: 'Is the first value strictly less than the second?',
    docUrl: DOCS,
    backgroundColor: '#c1e6e9',
    textColor: '#183f3e',
    seeds: { values: [9, 10] },
    parameterDescriptions: {
      values: 'Exactly two operands: both numbers, or both strings (codepoint order)',
      nullValueDefault: 'Replaces a null operand before comparing',
    },
  },
  lessThanOrEqual: {
    displayName: 'Less than or equal (<=)',
    description: 'Is the first value less than or equal to the second?',
    docUrl: DOCS,
    backgroundColor: '#b0dbe3',
    textColor: '#183f3e',
    seeds: { values: [9, 9] },
    parameterDescriptions: {
      values: 'Exactly two operands: both numbers, or both strings (codepoint order)',
      nullValueDefault: 'Replaces a null operand before comparing',
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
      values: 'The operands; homogeneous: all numbers, strings, arrays or objects',
      expect:
        'Pin the mode: every operand must be this type, and an empty input yields its identity',
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
    parameterDescriptions: { value: 'The main operand', minus: 'The amount subtracted from value' },
  },
  multiply: {
    displayName: 'Multiply (*)',
    description: 'Multiply numbers together — an empty input is 1, the empty product',
    docUrl: DOCS,
    backgroundColor: '#b4e0b3',
    textColor: '#193e1e',
    seeds: { values: [5, 5] },
    parameterDescriptions: {
      values: 'The factors',
      nullValueDefault: 'Replaces any null factor before multiplying',
    },
  },
  divide: {
    displayName: 'Divide (/)',
    description: 'Divide one number by another — true division; zero divisors fail',
    docUrl: DOCS,
    backgroundColor: '#cceacd',
    textColor: '#193e1e',
    seeds: { value: 100, by: 10 },
    parameterDescriptions: { value: 'The main operand', by: 'The divisor' },
  },
  modulo: {
    displayName: 'Modulo',
    description: 'The floored remainder: the result takes the sign of mod, so modulo(-7, 3) is 2',
    docUrl: DOCS,
    backgroundColor: '#c3e7c6',
    textColor: '#193e1e',
    seeds: { value: 10, mod: 3 },
    parameterDescriptions: { value: 'The main operand', mod: 'The modulus' },
  },
  power: {
    displayName: 'Power (^)',
    description: 'Raise a base to an exponent — overflow and complex results fail',
    docUrl: DOCS,
    backgroundColor: '#acddb1',
    textColor: '#193e1e',
    seeds: { base: 2, exponent: 3 },
    parameterDescriptions: { base: 'The number to raise', exponent: 'The power to raise it to' },
  },
  round: {
    displayName: 'Round',
    description:
      'Round to a number of decimal places — ties go half away from zero; negative decimals round to tens, hundreds, …',
    docUrl: DOCS,
    backgroundColor: '#d4edd8',
    textColor: '#193e1e',
    seeds: { value: 3.14159, decimals: 2 },
    parameterDescriptions: {
      value: 'The number to round',
      decimals: 'Decimal places to keep; negative values round to powers of ten',
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
  ceil: {
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
    description: 'Render a template, filling its tokens — the result is always a string',
    docUrl: DOCS,
    backgroundColor: '#f8d9c9',
    textColor: '#3f2f18',
    // A data reference rather than a substitution key, since `substitutions`
    // is optional and a new node is seeded with its required parameters only
    seeds: { template: 'Hello {{$data.name}}' },
    parameterDescriptions: {
      template:
        'The text, with %N or {{name}} tokens; in a literal template, {{$data.x}} is that reference',
      substitutions:
        'An array pairs with %N tokens, an object with {{name}} tokens; the mode dispatches on which arrives',
      trim: 'Trim whitespace from each rendered value, never from the template text',
      closeGaps: 'A value that renders empty also takes one run of adjacent template whitespace',
      nullValueDefault: 'Rendered in place of a null value, instead of ""',
    },
  },
  split: {
    displayName: 'Split text',
    description:
      'Divide a string on a delimiter into an array of pieces — empty pieces are kept; an empty delimiter splits into code points',
    docUrl: DOCS,
    backgroundColor: '#f5cbab',
    textColor: '#3f2f18',
    // `trim` defaults to true, so it is added to turn it off
    seeds: { value: 'Alpha, Bravo, Charlie', delimiter: ',', trim: false },
    parameterDescriptions: {
      value: 'The string to divide',
      delimiter: 'Split on each occurrence; "" splits into code points',
      trim: 'Trim whitespace from each piece',
    },
  },
  join: {
    displayName: 'Join text',
    description: 'Render array elements to text and concatenate them with a delimiter',
    docUrl: DOCS,
    backgroundColor: '#f3cba0',
    textColor: '#3f2f18',
    seeds: { values: ['Alpha', 'Bravo', 'Charlie'], delimiter: ', ' },
    parameterDescriptions: {
      values:
        'Elements of any type, rendered by the stringification table; a null renders "" and still occupies its slot',
      delimiter: 'Placed between each adjacent pair — shares its contract with split',
      nullValueDefault: 'Rendered in place of a null element, instead of ""',
    },
  },
  lower: {
    displayName: 'Lower case',
    description: 'Lowercase a string — Unicode default case mapping, locale-independent',
    docUrl: DOCS,
    backgroundColor: '#f7e1bf',
    textColor: '#3f2f18',
    seeds: { value: 'Hello World' },
    parameterDescriptions: { value: 'The string to lowercase' },
  },
  upper: {
    displayName: 'Upper case',
    description: 'Uppercase a string — Unicode default case mapping, locale-independent',
    docUrl: DOCS,
    backgroundColor: '#f6e1b4',
    textColor: '#3f2f18',
    seeds: { value: 'Hello World' },
    parameterDescriptions: { value: 'The string to uppercase' },
  },
  trim: {
    displayName: 'Trim whitespace',
    description: 'Strip whitespace (the JS trim set) from both ends of a string',
    docUrl: DOCS,
    backgroundColor: '#f2dd97',
    textColor: '#3f2f18',
    seeds: { value: '  Hello World  ' },
    parameterDescriptions: { value: 'The string to trim' },
  },
  regex: {
    displayName: 'Regular expression',
    description: 'Test, extract or match a string against a regular expression',
    docUrl: DOCS,
    backgroundColor: '#f8f1c9',
    textColor: '#3f2f18',
    seeds: { value: 'test-this', pattern: '^[a-z]{4}-[a-z]{4}$', flags: 'i' },
    parameterDescriptions: {
      value: 'The subject string',
      pattern: 'The regular expression source',
      flags: 'The admitted subset: i, m, s, u',
      mode: 'test gives a boolean, extract the first matching substring, match every one of them',
      noMatchDefault:
        'The extract answer when nothing matches — a matched empty string still passes through',
    },
  },

  // ── Arrays & iteration ─────────────────────────────────────────────────
  // Adding `as` renames the bindings `each` reads (as: 'item' binds $item),
  // so an editor adding it also renames `$element` in `each`
  length: {
    displayName: 'Length',
    description: "An array's element count, or a string's Unicode code-point count",
    docUrl: DOCS,
    backgroundColor: '#cde5f3',
    textColor: '#18293f',
    seeds: { value: [1, 2, 3, 4, 5] },
    parameterDescriptions: { value: 'The array or string measured' },
  },
  map: {
    displayName: 'Map each',
    description: 'Transform every element of an array',
    docUrl: DOCS,
    backgroundColor: '#bbd7ef',
    textColor: '#18293f',
    seeds: { input: [1, 2, 3], each: '$element', as: 'item' },
    parameterDescriptions: {
      input: 'The collection iterated over; a null input is a type error',
      as: "Rename the bindings: as: 'row' binds $row and $rowIndex",
      nullInputDefault: 'Used as the collection when input evaluates to null — typically []',
      each: 'Evaluated per element, with $element and $index bound',
    },
  },
  filter: {
    displayName: 'Filter',
    description: 'Keep the elements of an array whose predicate is truthy',
    docUrl: DOCS,
    backgroundColor: '#a8c7eb',
    textColor: '#18293f',
    seeds: { input: [0, 1, 2, 3], each: '$element', as: 'item' },
    parameterDescriptions: {
      input: 'The collection iterated over; a null input is a type error',
      as: "Rename the bindings: as: 'row' binds $row and $rowIndex",
      nullInputDefault: 'Used as the collection when input evaluates to null — typically []',
      each: 'The predicate, per element — a truthiness position, so null is falsy',
    },
  },
  find: {
    displayName: 'Find first',
    description: 'The first element of an array whose predicate is truthy',
    docUrl: DOCS,
    backgroundColor: '#cddcf3',
    textColor: '#18293f',
    seeds: { input: [0, 1, 2, 3], each: '$element', as: 'item' },
    parameterDescriptions: {
      input: 'The collection iterated over; a null input is a type error',
      as: "Rename the bindings: as: 'row' binds $row and $rowIndex",
      nullInputDefault: 'Used as the collection when input evaluates to null — typically []',
      each: 'The predicate, per element — a truthiness position, so null is falsy',
      noMatchDefault: 'The answer when nothing matches; a found null passes through unchanged',
    },
  },
  some: {
    displayName: 'Any match',
    description: 'True when any element satisfies the predicate',
    docUrl: DOCS,
    backgroundColor: '#bbccef',
    textColor: '#18293f',
    seeds: { input: [0, 1, 2, 3], each: '$element', as: 'item' },
    parameterDescriptions: {
      input: 'The collection iterated over; a null input is a type error',
      as: "Rename the bindings: as: 'row' binds $row and $rowIndex",
      nullInputDefault: 'Used as the collection when input evaluates to null — typically []',
      each: 'The predicate, per element — a truthiness position, so null is falsy',
    },
  },
  every: {
    displayName: 'All match',
    description: 'True when every element satisfies the predicate',
    docUrl: DOCS,
    backgroundColor: '#a8b9eb',
    textColor: '#18293f',
    seeds: { input: [0, 1, 2, 3], each: '$element', as: 'item' },
    parameterDescriptions: {
      input: 'The collection iterated over; a null input is a type error',
      as: "Rename the bindings: as: 'row' binds $row and $rowIndex",
      nullInputDefault: 'Used as the collection when input evaluates to null — typically []',
      each: 'The predicate, per element — a truthiness position, so null is falsy',
    },
  },

  // ── Data & objects ─────────────────────────────────────────────────────
  get: {
    displayName: 'Get data',
    description:
      'Read a path out of the evaluation data, or out of a supplied object — the dynamic face of a $data reference',
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
      path: 'Dot and bracket segments, quoted keys and the [*] projection — or an array of segments, taken verbatim',
      from:
        'The source the path reads: a value, or a bare namespace ($data, $vars, $params, $element) ' +
        'whose var or parameter name opens the path — replace, never merge; a null source misses every path',
      default:
        'The answer when the path is missing — a stored null passes through unchanged (firstOf replaces one); supplying it also opts out of strictDataPaths',
    },
  },
  buildObject: {
    displayName: 'Build object',
    description:
      'Assemble an object from computed key/value entries — for keys known only at runtime',
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
      entries: 'Objects with a "key" and a "value"; a null value keeps its key',
    },
  },

  // ── Other ──────────────────────────────────────────────────────────────
  convert: {
    displayName: 'Convert type',
    description:
      'Convert a value to a number, string, boolean or array — strict: a failed conversion is an error, never a guess',
    docUrl: DOCS,
    backgroundColor: '#dddfe3',
    textColor: '#272a30',
    seeds: { value: '42' },
    parameterDescriptions: {
      value: 'The value to convert; null propagates except for boolean, where it is false',
      to: 'The target type',
    },
  },

  // ── I/O ────────────────────────────────────────────────────────────────
  // A `timeout` is in milliseconds, so the integer type seed of 1 would
  // expire every request
  http: {
    displayName: 'HTTP request',
    description: 'One HTTP request — GET or POST — returning the parsed JSON response',
    docUrl: DOCS,
    backgroundColor: '#eeedd2',
    textColor: '#3a3f18',
    seeds: {
      url: 'https://restcountries.com/v3.1/name/zealand',
      returnPath: '[0].name.common',
      timeout: 5000,
    },
    parameterDescriptions: {
      url: 'A full http(s) URL is used verbatim; anything else — including an empty string — joins http.baseEndpoint',
      method: 'Lowercase; the mutating verbs are deliberately absent — an expression is a read',
      query: 'Query-string pairs; a null value omits its pair, a composite one is an error',
      body: 'The JSON payload; a whole-null body means NO body, while nulls inside one are JSON nulls',
      headers:
        'Merged over the http.headers option per key; a null value removes an inherited pair',
      returnPath: 'Dot/bracket path or segments array applied to the response; a miss is null',
      timeout:
        'Per-request deadline in ms; expiry is an ordinary failure this node’s fallback catches',
    },
  },
  graphQL: {
    displayName: 'GraphQL query',
    description: 'One GraphQL query — a POST of { query, variables } — returning the data field',
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
      query: 'The GraphQL document — the protocol’s own word, as sql.query is',
      variables:
        'Query variables; a null value is CARRIED as JSON null, a nullable argument being meaningful GraphQL',
      url: 'Per-node endpoint override; unset means the graphQL.endpoint option',
      headers: 'Merged over http.headers then graphQL.headers; a null value removes a pair',
      returnPath: 'Dot/bracket path or segments array applied to the response; a miss is null',
      timeout:
        'Per-request deadline in ms; expiry is an ordinary failure this node’s fallback catches',
    },
  },
  sql: {
    displayName: 'SQL query',
    description:
      'One SQL query against the registered connection. Expressions are READS — give the connection a read-only role and run mutations host-side',
    docUrl: DOCS,
    backgroundColor: '#d2e2b1',
    textColor: '#3a3f18',
    seeds: { query: 'SELECT contact_name FROM customers LIMIT 5', timeout: 5000 },
    parameterDescriptions: {
      query: 'SQL text with the driver’s own placeholders — FigTree never parses SQL',
      values: 'Bind values — positional as an array, named as an object; a null binds SQL NULL',
      shape:
        'rows: every row object; firstRow: the first; column: one column’s values; firstValue: one scalar',
      noRowDefault:
        'The answer when firstRow / firstValue find no row — never for rows / column, never on failure',
      timeout:
        'Per-request deadline in ms; expiry is an ordinary failure this node’s fallback catches',
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

/** A listing's colours, where it gives the pair. */
const coloursOf = (listing: FragmentListing) =>
  listing.backgroundColor !== undefined && listing.textColor !== undefined
    ? { backgroundColor: listing.backgroundColor, textColor: listing.textColor }
    : undefined

/** What a parameter starts as: its listing's seed, else its type's. */
const seedOf = (listing: FragmentListing, parameter: string, type: ExpectedType): unknown => {
  if (listing.seeds !== undefined && Object.hasOwn(listing.seeds, parameter))
    return listing.seeds[parameter]
  if (typeof type === 'string') return typeSeeds[type]
  if ('literal' in type) return type.literal[0]
  return typeSeeds[type.find((member) => member !== 'null') ?? 'null']
}

/**
 * The instance's operators and fragments, each with its listing joined in,
 * and the categories they group under. An operator's listing is the last
 * of `listings` to have an entry for its name, else the package's own in
 * `operatorListings`; an entry is taken whole, never merged with another
 * map's. A fragment's listing is its definition's `metadata`.
 */
export const getCatalog = (
  fig: Pick<FigTree, 'getOperators' | 'getFragments'>,
  ...listings: OperatorListingMap[]
): Catalog => {
  const listingOf = (name: string): OperatorListing => {
    for (let i = listings.length - 1; i >= 0; i--) {
      const listing = own(listings[i], name)
      if (listing !== undefined) return listing
    }
    return own(operatorListings, name) ?? {}
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
      const entry: CatalogParameter = { ...parameter, seed: seedOf(listing, key, parameter.type) }
      const description = own(listing.parameterDescriptions, key)
      if (description !== undefined) entry.description = description
      operator.parameters[key] = entry
    }
    return operator
  })

  const fragments = fig.getFragments().map(({ name, parameters, ...info }): CatalogFragment => {
    // A convention only: the engine never reads `metadata`
    const listing = (info.metadata ?? {}) as FragmentListing
    const fragment: CatalogFragment = {
      name,
      displayName: listing.displayName ?? name,
      ...info,
      ...coloursOf(listing),
      parameters: {},
    }
    if (listing.docUrl !== undefined) fragment.docUrl = listing.docUrl
    for (const [key, parameter] of Object.entries(parameters))
      fragment.parameters[key] = { ...parameter, seed: seedOf(listing, key, parameter.type) }
    return fragment
  })

  return { categories, operators, fragments }
}

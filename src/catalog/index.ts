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
  CatalogLiteral,
  CatalogOperator,
  CatalogOperatorParameter,
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
import type { ParameterInfo } from '../introspect'
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
    description: 'True when every value is truthy — operands run in parallel',
    docUrl: DOCS,
    colors: { background: '#d6d0f0', text: '#26183f' },
    seeds: { values: [true, true] },
    parameterDescriptions: { values: 'Operands, judged by FigTree truthiness; null is falsy' },
  },
  or: {
    displayName: 'Logical OR',
    description: 'True when any value is truthy — operands run in parallel',
    docUrl: DOCS,
    colors: { background: '#cabfeb', text: '#26183f' },
    seeds: { values: [true, false] },
    parameterDescriptions: { values: 'Operands, judged by FigTree truthiness; null is falsy' },
  },
  not: {
    displayName: 'Logical NOT (!)',
    description: 'Negate the truthiness of a value',
    docUrl: DOCS,
    colors: { background: '#c0aee5', text: '#26183f' },
    seeds: { value: true },
    parameterDescriptions: {
      value: 'Judged by FigTree truthiness; null is falsy, so not(null) is true',
    },
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
      condition: 'Judged by FigTree truthiness; null is falsy',
      then: 'The value when the condition holds',
      else: 'The value when it does not; omitted means null',
    },
  },
  match: {
    displayName: 'Match',
    description: 'Dispatch on a value — only the matching branch evaluates',
    docUrl: DOCS,
    colors: { background: '#d4bfeb', text: '#26183f' },
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
      'Are all the values equal? Deep, structural, key-order-insensitive; a cross-type comparison is false',
    docUrl: DOCS,
    colors: { background: '#d2efe9', text: '#183f3e' },
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
    colors: { background: '#c1e9e3', text: '#183f3e' },
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
    colors: { background: '#b0e3e0', text: '#183f3e' },
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
    colors: { background: '#d2efef', text: '#183f3e' },
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
    colors: { background: '#c1e6e9', text: '#183f3e' },
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
    colors: { background: '#b0dbe3', text: '#183f3e' },
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
    colors: { background: '#d7edd4', text: '#193e1e' },
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
    colors: { background: '#bfe4bc', text: '#193e1e' },
    seeds: { value: 10, minus: 5 },
    parameterDescriptions: { value: 'The main operand', minus: 'The amount subtracted from value' },
  },
  multiply: {
    displayName: 'Multiply (*)',
    description: 'Multiply numbers together — an empty input is 1, the empty product',
    docUrl: DOCS,
    colors: { background: '#b4e0b3', text: '#193e1e' },
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
    colors: { background: '#cceacd', text: '#193e1e' },
    seeds: { value: 100, by: 10 },
    parameterDescriptions: { value: 'The main operand', by: 'The divisor' },
  },
  modulo: {
    displayName: 'Modulo',
    description: 'The floored remainder: the result takes the sign of mod, so modulo(-7, 3) is 2',
    docUrl: DOCS,
    colors: { background: '#c3e7c6', text: '#193e1e' },
    seeds: { value: 10, mod: 3 },
    parameterDescriptions: { value: 'The main operand', mod: 'The modulus' },
  },
  power: {
    displayName: 'Power (^)',
    description: 'Raise a base to an exponent — overflow and complex results fail',
    docUrl: DOCS,
    colors: { background: '#acddb1', text: '#193e1e' },
    seeds: { base: 2, exponent: 3 },
    parameterDescriptions: { base: 'The number to raise', exponent: 'The power to raise it to' },
  },
  round: {
    displayName: 'Round',
    description:
      'Round to a number of decimal places — ties go half away from zero; negative decimals round to tens, hundreds, …',
    docUrl: DOCS,
    colors: { background: '#d4edd8', text: '#193e1e' },
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
    description: 'Render a template, filling its tokens — the result is always a string',
    docUrl: DOCS,
    colors: { background: '#f8d9c9', text: '#3f2f18' },
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
    colors: { background: '#f5cbab', text: '#3f2f18' },
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
    colors: { background: '#f3cba0', text: '#3f2f18' },
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
    colors: { background: '#f7e1bf', text: '#3f2f18' },
    seeds: { value: 'Hello World' },
    parameterDescriptions: { value: 'The string to lowercase' },
  },
  upper: {
    displayName: 'Upper case',
    description: 'Uppercase a string — Unicode default case mapping, locale-independent',
    docUrl: DOCS,
    colors: { background: '#f6e1b4', text: '#3f2f18' },
    seeds: { value: 'Hello World' },
    parameterDescriptions: { value: 'The string to uppercase' },
  },
  trim: {
    displayName: 'Trim whitespace',
    description: 'Strip whitespace (the JS trim set) from both ends of a string',
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
      value: 'The subject string',
      pattern: 'The regular expression source',
      flags: 'The admitted subset: i, m, s, u',
      mode: 'test gives a boolean, extract the first matching substring, match every one of them, replace the string with every match replaced',
      noMatchDefault:
        'The extract answer when nothing matches — a matched empty string still passes through',
      replacement:
        'What replace puts in place of each match — $1 and $<name> insert a capture group, $& the whole match, $$ a dollar sign; empty removes the matches',
    },
  },

  // ── Arrays & iteration ─────────────────────────────────────────────────
  // Adding `as` renames the bindings `each` reads (as: 'item' binds $item),
  // so an editor adding it also renames `$element` in `each`
  length: {
    displayName: 'Length',
    description: "An array's element count, or a string's Unicode code-point count",
    docUrl: DOCS,
    colors: { background: '#cde5f3', text: '#18293f' },
    seeds: { value: [1, 2, 3, 4, 5] },
    parameterDescriptions: { value: 'The array or string measured' },
  },
  map: {
    displayName: 'Map each',
    description: 'Transform every element of an array',
    docUrl: DOCS,
    colors: { background: '#bbd7ef', text: '#18293f' },
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
    colors: { background: '#a8c7eb', text: '#18293f' },
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
    colors: { background: '#cddcf3', text: '#18293f' },
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
    colors: { background: '#bbccef', text: '#18293f' },
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
    colors: { background: '#a8b9eb', text: '#18293f' },
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
    colors: { background: '#f0d1e5', text: '#3f182a' },
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
        'The answer when the path is missing — a stored null passes through unchanged (firstNonNull replaces one); supplying it also opts out of strictDataPaths',
    },
  },
  buildObject: {
    displayName: 'Build object',
    description:
      'Assemble an object from computed key/value entries — for keys known only at runtime',
    docUrl: DOCS,
    colors: { background: '#eac0cc', text: '#3f182a' },
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
    colors: { background: '#dddfe3', text: '#272a30' },
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
    colors: { background: '#eeedd2', text: '#3a3f18' },
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
    colors: { background: '#e3e8c2', text: '#3a3f18' },
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
    colors: { background: '#d2e2b1', text: '#3a3f18' },
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
    colors: { background: '#d5dae4', text: '#272a30' },
    seeds: { value: 'No content inside a literal node is evaluated' },
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

/**
 * What a `null` at the parameter does
 * (`CatalogOperatorParameter.nullOutcome`), in the order the engine meets
 * it: the compiler first, which owns an iterator's `as` binding, then
 * parameter resolution (src/evaluate/params.ts). Its null-naming test is
 * the engine's `typeNamesNull`, repeated since this module imports no
 * engine code; test/catalog.test.ts holds every package parameter's outcome
 * to what the engine does with a `null` there.
 */
const nullOutcomeOf = (
  name: string,
  parameter: ParameterInfo,
  parameters: Record<string, ParameterInfo>
): CatalogOperatorParameter['nullOutcome'] => {
  const { type, evaluationMode } = parameter
  if (parameter.replacesNullAt) return 'none'
  // A binding name must be a literal string, so a null there is a compile
  // error (invalid-as)
  if (
    name === 'as' &&
    evaluationMode === 'literal' &&
    Object.values(parameters).some((sibling) => sibling.evaluationMode === 'perElement')
  )
    return 'error'
  // A handle is checked when the body demands it, with no default to fall
  // back on; every other delivery is resolved before the body runs
  if (![type].flat().some((member) => member === 'null' || member === 'any'))
    return parameter.required || evaluationMode === 'lazy' || evaluationMode === 'perElement'
      ? 'error'
      : 'unset'
  return evaluationMode === 'eager' || evaluationMode === 'literal' ? parameter.nullPolicy : 'value'
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
  const shown: Omit<CatalogLiteral, 'parameters'> = {
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
 * The instance's operators and fragments, each with its listing joined in,
 * `literal`, and the categories the operators are in.
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
  const snapshot = fig.getOperators()

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
      const entry: CatalogOperatorParameter = {
        ...parameter,
        nullOutcome: nullOutcomeOf(key, parameter, parameters),
        ...parameterText(listing, key, parameter.type),
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
      operator.parameters[key] = entry
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

  const literalListing = resolveListing(operatorListings.literal, 'literal', listings)
  const literal: CatalogLiteral = {
    // The package's listing gives the pair, and a layer can only replace it
    ...presentation('literal', literalListing, literalListing.colors!, undefined),
    parameters: { value: parameterText(literalListing, 'value', 'any') },
  }

  return { categories, operators, fragments, literal, issues }
}

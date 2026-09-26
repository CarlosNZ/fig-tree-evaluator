/**
 * Phase 15.1 — the issue catalogue ("The issue catalogue" in
 * docs-dev/v3-specs/v3-converter.md).
 *
 * The converter emits the spec's codes and no others, each with its tag, as
 * test/exports.test.ts holds the root to its list. Each row is triggered
 * through the public functions, at the path its row gives. And every
 * placeholder carries its issue's message as a `//` note, while nothing
 * else carries one.
 */
import type { MigrationIssue, V2Options } from '../src'
import { migrateV2Expression, migrateV2Fragments } from '../src/migrate'
import { CATALOGUE } from '../src/migrate/issues'
import { clone, deepFreeze } from './helpers/migration'
import { randomCases } from './helpers/randomV2'

type Code = MigrationIssue['code']
type Tag = MigrationIssue['tag']

/** The spec's three tables, row by row */
const SPEC_CODES: Record<Tag, Code[]> = {
  'intentional-semantic-change': [
    'split-trailing-empty',
    'remainder-sign',
    'template-numbering',
    'named-token-source',
    'response-collapse',
    'computed-delimiter',
    'computed-branches',
    'graphql-relative-url',
    'output-type',
    'missing-data-fallback',
    'unprefixed-parameter',
  ],
  'lossy-default': [
    'instance-case-insensitive',
    'values-cut',
    'fallback-converted',
    'malformed-entry',
    'unreachable-branches',
    'overridden-value',
    'discarded-expression',
    'fragment-shorthand-payload',
    'shadowed-argument',
    'unknown-argument',
    'fragment-use-cache',
    'name-renamed',
    'unknown-parameter-type',
    'default-outside-type',
    'unused-output-type',
  ],
  'non-convertible': [
    'deciding-value',
    'drilled-substitution-token',
    'number-mapping',
    'template-escape',
    'computed-dollar-template',
    'custom-function-call',
    'computed-function-name',
    'computed-arguments',
    'body-override',
    'computed-fragment-name',
    'replaced-output-type',
    'computed-children',
    'unknown-operator',
  ],
}

const TAG_OF = new Map(
  Object.entries(SPEC_CODES).flatMap(([tag, codes]) => codes.map((code) => [code, tag as Tag]))
)

const NOTE = 'v2 conversion: '

// Every `//` note in a converted value
const notesIn = (value: unknown, found: string[] = []): string[] => {
  if (Array.isArray(value)) value.forEach((element) => notesIn(element, found))
  else if (typeof value === 'object' && value !== null)
    for (const [key, element] of Object.entries(value)) {
      if (key === '//')
        for (const note of [element].flat())
          if (typeof note === 'string' && note.startsWith(NOTE)) found.push(note)
      notesIn(element, found)
    }
  return found
}

/** The notes a conversion's output carries, beside the ones its issues owe */
const notes = (output: unknown, issues: MigrationIssue[]) => ({
  carried: notesIn(output).sort(),
  owed: issues
    .filter(({ tag }) => tag === 'non-convertible')
    .map(({ message }) => `${NOTE}${message}`)
    .sort(),
})

const frozen = <T>(value: T): T => deepFreeze(clone(value)) as T

describe('the catalogue', () => {
  test('the converter has exactly the spec’s codes', () => {
    expect(Object.keys(CATALOGUE).sort()).toEqual([...TAG_OF.keys()].sort())
  })

  test.each([...TAG_OF])('%s is %s', (code, tag) => {
    expect(CATALOGUE[code].tag).toBe(tag)
  })
})

// The fragments the call rows convert against
const FRAGMENTS = {
  adder: { operator: '+', values: '$values' },
  withDefault: { operator: '+', values: ['$n', 1], $n: 1 },
  ownOutput: { operator: 'objectProperties', property: '$path', outputType: 'string' },
  convertsItself: { operator: 'objectProperties', property: '$path', type: 'string' },
}

interface Row {
  code: Code
  /** An expression, or with `fragments` alone, the definitions converted */
  input?: unknown
  options?: V2Options
  path: MigrationIssue['path']
}

const ROWS: Row[] = [
  // intentional-semantic-change
  {
    code: 'split-trailing-empty',
    input: { operator: 'split', value: 'a,b,', delimiter: ',' },
    path: [],
  },
  {
    code: 'remainder-sign',
    input: { operator: '/', values: [-7, 3], output: 'remainder' },
    path: ['output'],
  },
  {
    code: 'template-numbering',
    input: { operator: 'stringSubstitution', string: { $getData: 't' }, substitutions: ['x'] },
    path: ['string'],
  },
  {
    code: 'named-token-source',
    input: {
      operator: 'stringSubstitution',
      string: { $getData: 't' },
      substitutions: { name: 'x' },
    },
    path: ['string'],
  },
  { code: 'response-collapse', input: { operator: 'GET', url: 'https://example.org' }, path: [] },
  {
    code: 'computed-delimiter',
    input: { operator: 'split', value: 'a,b', delimiter: { $getData: 'd' } },
    path: ['delimiter'],
  },
  {
    code: 'computed-branches',
    input: { operator: 'match', matchExpression: 'a', branches: { $getData: 'b' } },
    path: ['branches'],
  },
  {
    code: 'graphql-relative-url',
    input: { operator: 'graphQL', query: '{ countries { name } }', url: 'countries' },
    path: ['url'],
  },
  {
    code: 'output-type',
    input: { operator: '+', values: [1, 2], outputType: 'string' },
    path: ['outputType'],
  },
  {
    code: 'missing-data-fallback',
    input: { operator: '+', values: [{ operator: 'getData', property: 'a' }, 1], fallback: 0 },
    path: ['fallback'],
  },

  // lossy-default
  {
    code: 'instance-case-insensitive',
    input: { operator: '=', values: ['a', 'A'] },
    options: { caseInsensitive: true },
    path: [],
  },
  { code: 'values-cut', input: { operator: '>', values: [3, 2, 1] }, path: ['values'] },
  {
    code: 'fallback-converted',
    input: { operator: 'getData', property: 'a', fallback: 'none', outputType: 'number' },
    path: ['fallback'],
  },
  {
    code: 'malformed-entry',
    input: { operator: 'buildObject', properties: [{ key: 'a', value: 1 }, { key: 'b' }] },
    path: ['properties', 1],
  },
  {
    code: 'unreachable-branches',
    input: { operator: 'match', matchExpression: 'a', branches: { fallback: 0 }, a: 1 },
    path: ['a'],
  },
  {
    code: 'overridden-value',
    input: { $plus: { values: [1, 2] }, values: [3, 4] },
    path: ['$plus', 'values'],
  },
  {
    code: 'discarded-expression',
    input: { operator: '>', values: [3, 2, { $getData: 'x' }] },
    path: ['values', 2],
  },
  {
    code: 'fragment-shorthand-payload',
    input: { $adder: 5 },
    options: { fragments: FRAGMENTS },
    path: ['$adder'],
  },
  {
    code: 'shadowed-argument',
    input: { fragment: 'withDefault', $n: 3 },
    options: { fragments: FRAGMENTS },
    path: ['$n'],
  },
  {
    code: 'unknown-argument',
    input: { fragment: 'adder', parameters: { $values: [1], $other: 2 } },
    options: { fragments: FRAGMENTS },
    path: ['parameters', '$other'],
  },
  {
    code: 'fragment-use-cache',
    input: { fragment: 'adder', parameters: { $values: [1] }, useCache: true },
    options: { fragments: FRAGMENTS },
    path: ['useCache'],
  },
  {
    code: 'unprefixed-parameter',
    options: {
      fragments: {
        g: {
          operator: 'stringSubstitution',
          string: 'Hi %1',
          substitutions: ['$name'],
          metadata: { parameters: [{ name: 'name', type: 'string' }] },
        },
      },
    },
    path: ['g', 'metadata', 'parameters', 0, 'name'],
  },
  {
    code: 'name-renamed',
    options: { fragments: { plus: { operator: '+', values: [1, 2] } } },
    path: ['plus'],
  },
  {
    code: 'unknown-parameter-type',
    options: {
      fragments: {
        f: {
          operator: '+',
          values: ['$a', 1],
          metadata: { parameters: [{ name: '$a', type: 'date' }] },
        },
      },
    },
    path: ['f', 'metadata', 'parameters', 0, 'type'],
  },
  {
    code: 'default-outside-type',
    options: {
      fragments: {
        f: {
          operator: '+',
          values: ['$a', 1],
          metadata: { parameters: [{ name: '$a', type: 'number', default: 'one' }] },
        },
      },
    },
    path: ['f', 'metadata', 'parameters', 0, 'default'],
  },
  {
    code: 'unused-output-type',
    input: { fragment: 'ownOutput', parameters: { $path: 'a' }, outputType: 'number' },
    options: { fragments: FRAGMENTS },
    path: ['outputType'],
  },

  // non-convertible
  {
    code: 'deciding-value',
    input: { operator: '>', values: [1, 2], strict: { $getData: 's' } },
    path: ['strict'],
  },
  {
    code: 'drilled-substitution-token',
    input: { operator: 'stringSubstitution', string: '{{a.b}}', substitutions: { a: { b: 1 } } },
    path: ['string'],
  },
  {
    code: 'number-mapping',
    input: {
      operator: 'stringSubstitution',
      string: '{{n}} items',
      substitutions: { n: 1 },
      numberMapping: { n: { 1: 'one' } },
    },
    path: ['numberMapping', 'n'],
  },
  {
    code: 'template-escape',
    input: { operator: 'stringSubstitution', string: '\\%1 is %1', substitutions: ['x'] },
    path: ['string'],
  },
  {
    code: 'computed-dollar-template',
    input: {
      operator: 'stringSubstitution',
      string: { $getData: 't' },
      substitutions: ['x'],
      substitutionCharacter: '$',
    },
    path: ['string'],
  },
  {
    code: 'custom-function-call',
    input: { operator: 'fn', input: 1 },
    options: { functions: ['fn'] },
    path: [],
  },
  {
    code: 'computed-function-name',
    input: { operator: 'customFunctions', functionName: { $getData: 'f' } },
    path: ['functionName'],
  },
  {
    code: 'computed-arguments',
    input: { fragment: 'adder', parameters: { operator: 'getData', property: 'p' } },
    options: { fragments: FRAGMENTS },
    path: ['parameters'],
  },
  {
    code: 'body-override',
    input: { fragment: 'adder', parameters: { $values: [1], label: 'sum' } },
    options: { fragments: FRAGMENTS },
    path: ['parameters', 'label'],
  },
  {
    code: 'computed-fragment-name',
    input: { fragment: { $getData: 'which' } },
    options: { fragments: FRAGMENTS },
    path: ['fragment'],
  },
  {
    code: 'replaced-output-type',
    input: { fragment: 'convertsItself', parameters: { $path: 'a' }, outputType: 'number' },
    options: { fragments: FRAGMENTS },
    path: ['outputType'],
  },
  {
    code: 'computed-children',
    input: { operator: '?', children: { $getData: 'c' } },
    path: ['children'],
  },
  { code: 'unknown-operator', input: { operator: 'nope', values: [1] }, path: ['operator'] },
]

/** A row's conversion, through the function it names */
const convertRow = ({ input, options = {} }: Row) =>
  input === undefined
    ? (({ fragments, issues }) => ({ output: fragments as unknown, issues }))(
        migrateV2Fragments(frozen(options))
      )
    : (({ expression, issues }) => ({ output: expression, issues }))(
        migrateV2Expression(frozen(input), frozen(options))
      )

describe('each row is triggered with its tag, at its path', () => {
  test('every code has a row', () => {
    expect(ROWS.map(({ code }) => code).sort()).toEqual([...TAG_OF.keys()].sort())
  })

  test.each(ROWS)('$code', (row) => {
    const { issues } = convertRow(row)
    expect(issues).toContainEqual({
      code: row.code,
      tag: TAG_OF.get(row.code),
      path: row.path,
      message: expect.any(String),
    })
  })
})

describe('notes', () => {
  test.each(ROWS)('$code: every placeholder carries its note, and nothing else does', (row) => {
    const { output, issues } = convertRow(row)
    const { carried, owed } = notes(output, issues)
    expect(carried).toEqual(owed)
  })

  test('over random input, the notes are exactly the placeholders’ issues', () => {
    for (const { input, options } of randomCases(7, 400)) {
      const { expression, issues } = migrateV2Expression(frozen(input), frozen(options))
      const expressionNotes = notes(expression, issues)
      expect({ input, options, ...expressionNotes }).toEqual({
        input,
        options,
        carried: expressionNotes.owed,
        owed: expressionNotes.owed,
      })
      const definitions = migrateV2Fragments(frozen(options))
      const definitionNotes = notes(definitions.fragments, definitions.issues)
      expect({ options, carried: definitionNotes.carried }).toEqual({
        options,
        carried: definitionNotes.owed,
      })
    }
  })
})

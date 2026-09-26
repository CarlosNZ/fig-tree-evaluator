/**
 * Phase 15 showcase — `pnpm dev phase15_showcase`. The v2 converter: v2
 * expressions through `migrateV2Expression` and `migrateV2Fragments`, each
 * printed with its conversion and its issues, then v2's answer beside v3's
 * for the conversion. Every phase closes with one of these
 * (implementation-plan working rule 7).
 *
 * v2's answers are recorded, from the v2 package (2.23.2), since nothing
 * under src/ imports it ("Packaging" in docs-dev/v3-specs/v3-converter.md).
 * The differential (`pnpm differential`) makes the live comparison, over
 * every case in the v2 tests; this is a reading of it.
 *
 * Runs offline: the one HTTP example is answered by a stub fetch.
 */
import {
  FetchClient,
  FigTree,
  coreOperators,
  defineOperator,
  httpOperators,
  isFigTreeError,
} from '../index'
import type { MigrationIssue, V2Options } from '../index'
import { migrateV2Expression, migrateV2Fragments } from '../migrate'
import { WIDTH, section } from './showcase'

const data = {
  user: { firstName: 'Ada', lastName: 'Lovelace', role: 'Admin' },
  list: 'red,green,',
  price: '42.5',
}

/** One canned response, a list of single-key objects */
const stubFetch = async (url: string) => {
  const body = [{ name: 'New Zealand' }, { name: 'Australia' }]
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    url,
    headers: new Map(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

/**
 * The v2 host's custom function, as the v3 operator it becomes, registered
 * as "The custom-function wrapper recipe" in v3-migration.md suggests
 */
const double = defineOperator({
  name: 'double',
  category: 'other',
  description: 'The v2 function double',
  parameters: { args: { type: 'array', default: [] } },
  positionalParams: ['...args'],
  evaluate: ({ args }) => (args as number[])[0] * 2,
})

const v2Fragments = {
  greeting: {
    operator: 'stringSubstitution',
    string: '%1, %2!',
    substitutions: ['$salutation', '$name'],
    metadata: {
      description: 'A greeting',
      parameters: [
        { name: '$name', type: 'string', required: true },
        { name: '$salutation', type: 'string', default: 'Hello' },
      ],
    },
  },
}

const v2Options: V2Options = { fragments: v2Fragments, functions: ['double'] }
const { fragments } = migrateV2Fragments(v2Options)

const fig = new FigTree({
  operators: [coreOperators, httpOperators(new FetchClient(stubFetch)), double],
  fragments,
  data,
})

/**
 * JSON for reading, as the shared `block` has it, except that only what
 * does not fit on its line is expanded, so a small node inside a large one
 * stays on one line. `indent` is the line's, and `start` the column the
 * value starts in, after its key.
 */
const json = (value: unknown, indent: number, start = indent): string => {
  const compact = JSON.stringify(value)
  if (compact === undefined) return String(value)
  if (start + compact.length <= WIDTH || value === null || typeof value !== 'object') return compact
  const inner = indent + 2
  const entries = Array.isArray(value)
    ? value.map((item) => json(item, inner))
    : Object.entries(value).map(([key, item]) => {
        const label = `${JSON.stringify(key)}: `
        return label + json(item, inner, inner + label.length)
      })
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}']
  const pad = ' '.repeat(inner)
  return `${open}\n${entries.map((entry) => pad + entry).join(',\n')}\n${' '.repeat(indent)}${close}`
}

/** The column the values start in, after a row's label */
const COLUMN = 13

const row = (label: string, text: string) => console.log(`    ${label.padEnd(COLUMN - 4)}${text}`)

/** A failure v2 reported, by its message */
class Failed {
  constructor(readonly message: string) {}
}
const failed = (message: string) => new Failed(message)

const rendered = (value: unknown) =>
  value instanceof Failed ? `✗ ${value.message}` : `→ ${json(value, COLUMN + 2)}`

/** v3's result, or its failure */
const result = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    return rendered(await run())
  } catch (error) {
    if (isFigTreeError(error)) return `✗ ${error.code}: ${error.message}`
    return `✗ ${String(error)}`
  }
}

const issueLine = ({ code, tag, path }: MigrationIssue) =>
  `${code} (${tag})${path.length > 0 ? ` at ${JSON.stringify(path)}` : ''}`

/**
 * One v2 expression: converted, with its issues, then v2's recorded answer
 * and v3's evaluation of the conversion. `options` are the v2 host's, beyond
 * the fragments and functions every example has.
 */
const show = async (label: string, expression: unknown, v2: unknown, options: V2Options = {}) => {
  const { expression: converted, issues } = migrateV2Expression(expression, {
    ...v2Options,
    ...options,
  })
  console.log(`  ${label}`)
  row('v2', json(expression, COLUMN))
  row('v3', json(converted, COLUMN))
  if (issues.length === 0) row('issues', 'none: a clean conversion')
  issues.forEach((issue, i) => row(i === 0 ? 'issues' : '', issueLine(issue)))
  row('v2 gave', rendered(v2))
  row('v3 gave', await result(() => fig.evaluate(converted)))
  console.log()
}

const note = (text: string) => console.log(`${text.replace(/^/gm, '  ')}\n`)

const main = async () => {
  section('One form out, whatever form went in')

  await show('Shorthand', { $plus: [1, 2] }, 3)
  await show('A symbol, with children', { operator: '+', children: [1, 2] }, 3)
  await show(
    'An alias, and a key v2 ignored',
    {
      operator: 'add',
      values: [1, 2],
      comment: 'Adds two numbers',
    },
    3
  )
  note(
    'All three come out canonical v3: `operator` nodes, canonical names and\n' +
      'named parameters. A key v2 ignored goes into a `//` comment, which v3\n' +
      'strips, so nothing changes.'
  )

  section('Clean conversions: the meaning kept')

  await show(
    'getData becomes a reference',
    { operator: 'getData', property: 'user.firstName' },
    'Ada'
  )
  await show(
    'CONDITIONAL becomes if, and COUNT becomes length',
    {
      operator: '?',
      condition: { operator: '>', values: [{ operator: 'count', values: [1, 2, 3] }, 2] },
      valueIfTrue: 'many',
      valueIfFalse: 'few',
    },
    'many'
  )
  await show(
    "DIVIDE's `output: 'quotient'` becomes a floor",
    {
      operator: '/',
      values: [17, 5],
      output: 'quotient',
    },
    3
  )
  await show(
    'Aliases become vars',
    {
      operator: '-',
      $total: { operator: '+', values: [10, 20, 30] },
      values: ['$total', 15],
    },
    45
  )
  await show(
    "A template's gapped tokens renumbered, as v2 paired them by rank",
    {
      operator: 'stringSubstitution',
      string: '%1 %3',
      substitutions: [{ operator: 'getData', property: 'user.firstName' }, 'Lovelace'],
    },
    'Ada Lovelace'
  )
  await show(
    'A token that read data becomes a reference token',
    {
      operator: 'stringSubstitution',
      string: '{{greeting}}, {{user.firstName}}',
      substitutions: { greeting: 'Welcome' },
    },
    'Welcome, Ada'
  )
  await show(
    'Branches written on the node move into `branches`',
    {
      operator: 'match',
      matchExpression: { operator: 'getData', property: 'user.role' },
      Admin: 'Full access',
      Guest: 'Read only',
    },
    'Full access'
  )
  await show(
    "A plain object v2 didn't look inside is quoted with literal",
    {
      operator: 'passThru',
      value: { note: 'kept as data', formula: { operator: '+', values: [1, 2] } },
    },
    { note: 'kept as data', formula: { operator: '+', values: [1, 2] } }
  )

  section('Flagged: the node works, but may answer differently')

  await show(
    'v2 dropped a trailing empty piece, and v3 keeps it',
    {
      operator: 'split',
      value: { operator: 'getData', property: 'list' },
      delimiter: ',',
    },
    ['red', 'green']
  )
  await show(
    "The remainder takes the sign of `mod` in v3's modulo",
    {
      operator: '/',
      values: [-7, 3],
      output: 'remainder',
    },
    -1
  )
  await show(
    "Every outputType: v3's convert is strict where v2 guessed",
    {
      operator: 'getData',
      property: 'price',
      outputType: 'number',
    },
    42.5
  )
  await show(
    'v3 compares two values, so the rest are cut',
    { operator: '>', values: [5, 3, 100] },
    true
  )
  await show(
    "v2's instance-wide caseInsensitive belongs in v3's operatorDefaults",
    { operator: '=', values: ['ADMIN', { operator: 'getData', property: 'user.role' }] },
    true,
    { caseInsensitive: true }
  )
  await show(
    'A fallback that caught missing data no longer fires',
    {
      operator: '+',
      values: [{ operator: 'getData', property: 'user.age' }, 1],
      fallback: 0,
    },
    0
  )
  await show(
    'v2 collapsed single-key objects in a response, and v3 does not',
    {
      operator: 'get',
      url: 'https://example.com/countries',
    },
    ['New Zealand', 'Australia']
  )
  note(
    'Each depends on the data or a response, which the converter cannot see,\n' +
      "so its issue says what to check and how to fix it. The collapse's fix is\n" +
      "v3's projection: `returnPath: '[*].name'` returns the names."
  )

  section("What it can't convert: placeholders with a `//` note")

  await show(
    'A custom function becomes an operator call, checked by hand',
    {
      operator: 'double',
      args: [21],
    },
    42
  )
  await show(
    'An operator v2 never had is quoted unconverted',
    {
      operator: 'reverse',
      values: [1, 2, 3],
    },
    failed('Invalid operator: reverse')
  )
  await show(
    'A computed fragment name has no v3 spelling',
    {
      fragment: { operator: 'getData', property: 'user.role' },
    },
    failed('Fragment not defined: Admin')
  )
  note(
    "A placeholder's note is its issue's message, and every note starts\n" +
      '`v2 conversion: `, so a search of stored expressions finds what is left\n' +
      'to fix, even where a script lost the issues. v3 strips `//`, so a\n' +
      'quoted node evaluates to its own source.'
  )

  section('Fragments: definitions and calls')

  row('v2 body', json(v2Fragments.greeting, COLUMN))
  row('v3', json(fragments.greeting, COLUMN))
  console.log()
  await show(
    'A call, with an argument on the node',
    {
      fragment: 'greeting',
      $name: { operator: 'getData', property: 'user.firstName' },
    },
    'Hello, Ada!'
  )
  await show(
    'A shorthand call, overriding the default',
    {
      $greeting: { $name: 'Carl', $salutation: 'Kia ora' },
    },
    'Kia ora, Carl!'
  )
  note(
    'migrateV2Fragments turns the body\'s `"$name"` placeholders into\n' +
      '`"$params.name"`, and the declared parameters are keyed without the `$`.\n' +
      'migrateV2Expression reads the definitions from the options to map the\n' +
      "calls' arguments."
  )

  section('Converted once: the converter assumes v2')

  const once = migrateV2Expression({ operator: 'getData', property: 'user' }).expression
  const v3 = { operator: 'get', path: 'role', from: once }
  const twice = migrateV2Expression(v3)
  row('v3', json(v3, COLUMN))
  row('again', json(twice.expression, COLUMN))
  twice.issues.forEach((issue, i) => row(i === 0 ? 'issues' : '', issueLine(issue)))
  console.log()
  note(
    "Converted again, v3's `get` is read as v2's GET, an HTTP request, and its\n" +
      'parameters as keys v2 ignored. There is no detection, since v2 and v3\n' +
      'share most of their syntax: each caller knows its input is v2, and\n' +
      'converts each expression once.'
  )
}

main()

/**
 * Runs with each of the release's test files during extraction. Once the
 * file's tests have run, each evaluation they made is run again as the
 * runner will run it, with the runner's defaults and only the options the
 * case keeps, and written out with that outcome for
 * differential/extract/index.ts to assemble.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v2 from 'fig-tree-evaluator-v2'
import { GRAPHQL_ENDPOINT, type Case } from '../case'
import { literal } from '../literal'
import { onUnanswered } from '../mocks/unanswered'
import { openV2Io } from './io'
import { runV2, sameOutcome, type Outcome } from './outcome'
import { evaluations } from './v2'

// One test at a time, so each evaluation is credited to its own test
Object.assign(test, { concurrent: test })

/** The options v3 has no counterpart for ("The corpus") */
const NO_COUNTERPART = [
  'skipRuntimeTypeCheck',
  'excludeOperators',
  'supportDeprecatedValueNodes',
  'nullEqualsUndefined',
] as const

/** What the runner supplies, never passes on, or cannot see in a result */
const DROPPED = [
  'httpClient',
  'sqlConnection',
  'graphQLConnection',
  'objects',
  'returnErrorAsString',
  'allowJSONStringInput',
  'maxCacheSize',
  'maxCacheTime',
  ...NO_COUNTERPART,
] as const

/** Flags whose `false` is v2's default */
const FLAGS = ['evaluateFullObject', 'noShorthand', 'caseInsensitive']

/** The options a case keeps: what it adds to the runner's defaults */
const caseOptions = (options: v2.FigTreeOptions): Case['options'] => {
  const kept: Record<string, unknown> = { ...options }
  for (const key of DROPPED) delete kept[key]
  for (const [key, value] of Object.entries(kept))
    if (
      value === undefined ||
      (value === false && FLAGS.includes(key)) ||
      (isObject(value) && Object.keys(value).length === 0)
    )
      delete kept[key]
  const connection: Record<string, unknown> = { ...options.graphQLConnection }
  delete connection.httpClient
  if (
    Object.keys(connection).length > 0 &&
    !isDeepStrictEqual(connection, { endpoint: GRAPHQL_ENDPOINT })
  )
    kept.graphQLConnection = connection
  return Object.keys(kept).length > 0 ? kept : undefined
}

const isObject = (value: unknown): value is object =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * v2 parsed a string holding an operator node when `allowJSONStringInput`
 * was on; the corpus holds the node, as any caller converting it must
 */
const parsed = (expression: unknown): unknown => {
  if (typeof expression !== 'string') return expression
  try {
    const node: unknown = JSON.parse(expression)
    return isObject(node) && 'operator' in node ? node : expression
  } catch {
    return expression
  }
}

/** What the test saw, where it differs from what the runner will see */
const seen = (outcome: Outcome, runner: Outcome) => {
  if (sameOutcome(outcome, runner)) return undefined
  try {
    return literal(outcome)
  } catch {
    return JSON.stringify({ unwritable: String(outcome) })
  }
}

let massiveQuery: string | undefined
const isMassiveQuery = (expression: unknown) => {
  if (!isObject(expression)) return false
  const json = JSON.stringify(expression)
  if (json.length < 1_000_000) return false
  massiveQuery ??= JSON.stringify(JSON.parse(readFileSync('test/massiveQuery.json', 'utf8')))
  return json === massiveQuery
}

afterAll(async () => {
  const unanswered: string[] = []
  onUnanswered((message) => unanswered.push(message))
  const { io, close } = await openV2Io(v2)
  // v2's FetchClient logs every failed response
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  const written: string[] = []
  try {
    for (const evaluation of evaluations) {
      const expression = evaluation.options.allowJSONStringInput
        ? parsed(evaluation.expression)
        : evaluation.expression
      const entry: Case = {
        id: 0,
        from: '',
        expression,
        options: caseOptions(evaluation.options),
        ...(evaluation.database === 'sqlite' ? { database: 'sqlite' as const } : {}),
      }
      const outcome = await runV2(v2, entry, io)
      const inPlay = NO_COUNTERPART.filter(
        (key) => evaluation.options[key] !== undefined && evaluation.options[key] !== false
      )
      const withThem = Object.fromEntries(inPlay.map((key) => [key, evaluation.options[key]]))
      const leftOut =
        inPlay.length > 0 && !sameOutcome(await runV2(v2, entry, io, withThem), outcome)
          ? `its outcome depends on ${inPlay.join(', ')}`
          : undefined
      const fields = {
        test: JSON.stringify(evaluation.test),
        expression: JSON.stringify(
          isMassiveQuery(expression) ? 'massiveQuery' : literal(expression)
        ),
        options: entry.options && JSON.stringify(literal(entry.options, { functions: true })),
        database: entry.database && JSON.stringify(entry.database),
        outcome: literal(outcome),
        seen: seen(await evaluation.outcome, outcome),
        leftOut: leftOut && JSON.stringify(leftOut),
        removed: leftOut === undefined && inPlay.length > 0 ? JSON.stringify(inPlay) : undefined,
      }
      written.push(
        `{ ${Object.entries(fields)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')} }`
      )
    }
  } finally {
    onUnanswered(undefined)
    await close()
  }
  if (unanswered.length > 0)
    throw new Error(`The runner's defaults left requests unanswered: ${unanswered.join('; ')}`)
  const file = basename(expect.getState().testPath ?? 'unknown')
  writeFileSync(
    join(process.env.EXTRACT_OUT ?? '.', `${file}.ts`),
    `export default [\n${written.join(',\n')}\n]\n`
  )
})

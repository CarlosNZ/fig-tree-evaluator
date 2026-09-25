/**
 * `toV3Options` ("Options" in docs-dev/v3-specs/v3-converter.md): a case's
 * options as v3's, the migration a host does by hand ("Moved options" in
 * docs-dev/v3-specs/v3-migration.md), written once, on v3's clients over
 * the same doubles as v2's, with the same defaults (differential/case.ts).
 */
import {
  coreOperators,
  defineOperator,
  httpOperators,
  sqlOperators,
  type FigTreeOptions,
  type HttpClient,
  type MigrationIssue,
  type SqlConnection,
  type ValidatedOperatorDefinition,
} from '../src'
import { migrateV2Fragments } from '../src/migrate'
import { GRAPHQL_ENDPOINT, converterOptions, type Case, type CaseOptions } from './case'

/** v3's clients over the differential's doubles */
export interface V3Io {
  http: HttpClient
  postgres: SqlConnection
}

export interface V3Setup {
  options: FigTreeOptions
  /** What migrating the fragment definitions raised, rooted at their names */
  fragmentIssues: MigrationIssue[]
  /** The v2 functions not registered, each with why */
  notes: string[]
}

/** The keys it maps, or knows the converter applied; any other stops the run */
const MAPPED: (keyof CaseOptions)[] = [
  'data',
  'fragments',
  'functions',
  'caseInsensitive',
  'baseEndpoint',
  'headers',
  'graphQLConnection',
  'evaluateFullObject',
  'noShorthand',
  'useCache',
]

/** The options of a case the runner cannot map, which stop the run */
export const unmappedOptions = ({ options = {} }: Case): string[] =>
  Object.keys(options).filter((key) => !MAPPED.includes(key as keyof CaseOptions))

export const toV3Options = (entry: Case, io: V3Io): V3Setup => {
  const { options = {} } = entry
  const unmapped = unmappedOptions(entry)
  if (unmapped.length > 0)
    throw new Error(`#${entry.id} has options the runner cannot map: ${unmapped.join(', ')}`)

  const operators = [coreOperators, httpOperators(io.http), sqlOperators(io.postgres)]
  const notes: string[] = []
  const functions = functionOperators(options.functions ?? {}, taken(operators), notes)
  const { fragments, issues } = options.fragments
    ? migrateV2Fragments(converterOptions(entry))
    : { fragments: undefined, issues: [] }
  const { graphQLConnection } = options

  return {
    options: {
      operators: [...operators, ...functions],
      ...(options.data ? { data: options.data } : {}),
      ...(fragments ? { fragments } : {}),
      ...(options.caseInsensitive
        ? {
            operatorDefaults: {
              equal: { caseInsensitive: true },
              notEqual: { caseInsensitive: true },
            },
          }
        : {}),
      ...(options.baseEndpoint || options.headers
        ? {
            http: {
              ...(options.baseEndpoint ? { baseEndpoint: options.baseEndpoint } : {}),
              ...(options.headers ? { headers: options.headers } : {}),
            },
          }
        : {}),
      graphQL: {
        endpoint: graphQLConnection?.endpoint ?? GRAPHQL_ENDPOINT,
        ...(graphQLConnection?.headers ? { headers: graphQLConnection.headers } : {}),
      },
    },
    fragmentIssues: issues,
    notes,
  }
}

/** Every name and alias the registered operators claim */
const taken = (operators: (ValidatedOperatorDefinition | ValidatedOperatorDefinition[])[]) =>
  new Set(
    operators
      .flat()
      .flatMap((operator) => [operator.name, ...(operator.alias ? [operator.alias] : [])])
  )

/**
 * Each v2 function as a v3 operator of its name, the recipe's way ("The
 * custom-function wrapper recipe" in docs-dev/v3-specs/v3-migration.md):
 * an optional `input` and `...args` as its positional rest, called as v2
 * called it, `f(input, ...args)`. A name v3 refuses, or one an operator
 * already claims, is not registered, and the calls on it fail in v3, where
 * the converter's issue at each call says the function must be renamed.
 */
const functionOperators = (
  functions: NonNullable<CaseOptions['functions']>,
  claimed: Set<string>,
  notes: string[]
) =>
  Object.entries(functions).flatMap(([name, definition]) => {
    const fn = typeof definition === 'function' ? definition : definition?.function
    if (typeof fn !== 'function') return []
    if (claimed.has(name)) {
      notes.push(`${name}: a v3 operator already has the name`)
      return []
    }
    try {
      return [
        defineOperator({
          name,
          category: 'other',
          description: `The v2 function ${name}`,
          parameters: {
            input: { type: 'any', required: false },
            args: { type: 'array', default: [] },
          },
          positionalParams: ['...args'],
          evaluate: ({ input, args }) =>
            fn(...(input === undefined ? [] : [input]), ...(args as unknown[])),
        }),
      ]
    } catch (error) {
      notes.push(`${name}: ${(error as Error).message}`)
      return []
    }
  })

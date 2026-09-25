/**
 * A case of the differential's corpus, and what it runs with ("The corpus"
 * and "Options" in docs-dev/v3-specs/v3-converter.md).
 *
 * Every case runs with the runner's defaults, and a case records only the
 * options it adds to them. The defaults are the I/O every case can reach:
 * one HTTP client, which also carries GraphQL, since which client v2 used
 * is not under test; the GraphQL endpoint five of the v2 test files set;
 * and Postgres, unless the case says SQLite.
 */
import type { FigTreeOptions as FigTreeOptionsV2, UnknownFunction } from 'fig-tree-evaluator-v2'

export interface Case {
  /** Unique and never reused: a new case takes the next number */
  id: number
  /** The v2 test it came from, as `file › test name` */
  from: string
  expression: unknown
  /** The options v2 evaluated it with, beyond the runner's defaults */
  options?: CaseOptions
  /** The database its SQL runs against, where not Postgres */
  database?: 'sqlite'
}

/**
 * v2's options, less those the runner supplies (the clients), those it
 * never passes on (`returnErrorAsString`, and `allowJSONStringInput`,
 * whose strings the extractor parsed), those that cannot change a result
 * (the cache's size and age), `objects` (which v2 read as `data`), and
 * those v3 has no counterpart for (left out, or removed where the case's
 * outcome did not depend on them)
 */
export type CaseOptions = Omit<
  FigTreeOptionsV2,
  | 'data'
  | 'httpClient'
  | 'sqlConnection'
  | 'objects'
  | 'returnErrorAsString'
  | 'allowJSONStringInput'
  | 'maxCacheSize'
  | 'maxCacheTime'
  | 'skipRuntimeTypeCheck'
  | 'excludeOperators'
  | 'supportDeprecatedValueNodes'
  | 'nullEqualsUndefined'
> & { data?: Record<string, Data> }

/**
 * What `data` holds, typed so that a function in it, which v2 could call
 * by its path, reads its parameters as v2's own functions do
 */
type Data =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | UnknownFunction
  | Data[]
  | { [key: string]: Data }

export const GRAPHQL_ENDPOINT = 'https://countries.trevorblades.com/'

/** v2's clients over the differential's doubles */
export interface V2Io {
  http: NonNullable<FigTreeOptionsV2['httpClient']>
  postgres: NonNullable<FigTreeOptionsV2['sqlConnection']>
  sqlite: NonNullable<FigTreeOptionsV2['sqlConnection']>
}

/** The options v2 evaluates a case with: the defaults, then the case's own */
export const v2Options = ({ options = {}, database }: Case, io: V2Io): FigTreeOptionsV2 => ({
  ...options,
  httpClient: io.http,
  graphQLConnection: {
    endpoint: GRAPHQL_ENDPOINT,
    ...options.graphQLConnection,
    httpClient: io.http,
  },
  sqlConnection: database === 'sqlite' ? io.sqlite : io.postgres,
})

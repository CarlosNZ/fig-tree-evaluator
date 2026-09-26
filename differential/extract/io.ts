/**
 * v2's clients as the extractor runs cases: HTTP over the fetch mock, and a
 * live Northwind Postgres (test/database/pgConfig.json), which extraction
 * needs.
 */
import { Client } from 'pg'
import type * as V2 from 'fig-tree-evaluator-v2'
import pgConfig from '../../test/database/pgConfig.json'
import type { V2Io } from '../case'
import { mockFetch } from '../mocks/fetch'

/** The v2 package is passed in: Jest and tsx load it differently */
export const openV2Io = async (
  v2: typeof V2
): Promise<{ io: V2Io; close: () => Promise<void> }> => {
  const client = new Client(pgConfig)
  await client.connect()
  return {
    io: {
      http: v2.FetchClient(mockFetch as unknown as Parameters<typeof v2.FetchClient>[0]),
      postgres: v2.SQLNodePostgres(client),
    },
    close: () => client.end(),
  }
}

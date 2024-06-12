/**
 * Connection abstractions for various database interfaces
 */

import { Client, QueryResult } from 'pg'
import { QueryInput, QueryOutput } from './operators'
import { Database } from 'sqlite'
import { FigTreeError } from './types'

/**
 * Postgres (using node-postgres)
 * https://www.npmjs.com/package/pg
 */

export const SQLNodePostgres = (client: Client) => {
  const query = async ({ query, values = [] }: QueryInput): Promise<QueryOutput> => {
    const pgQuery = { text: query, values: values ?? [] } as {
      text: string
      values: (string | number | boolean)[]
    }

    try {
      const res: QueryResult & { error?: string } = await client.query(pgQuery)
      // node-postgres doesn't throw, it just returns error object
      if (res?.error) throw new Error(res.error)

      return res.rows
    } catch (err) {
      ;(err as FigTreeError).name = 'Node-Postgres error'
      throw err
    }
  }

  return { query }
}

/**
 * SQLite (using sqlite/sqlite3)
 * https://www.npmjs.com/package/sqlite
 */

export const SQLite = (db: Database) => {
  const query = async ({ query, values = [] }: QueryInput) => {
    try {
      const result = await db.all(query, values)
      return result
    } catch (err) {
      ;(err as FigTreeError).name = 'SQLite error'
      throw err
    }
  }

  return { query }
}

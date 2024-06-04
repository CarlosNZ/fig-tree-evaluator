/**
 * Connections for various database interfaces
 */

import { Client, QueryResult } from 'pg'
import { QueryInput, QueryOutput } from './operators'

// Postgres (using node-postgres)

export const SqlNodePostgres = (client: Client) => {
  const query = async ({ text, values, resultType }: QueryInput): Promise<QueryOutput> => {
    const pgQuery = {
      text,
      values: values,
      rowMode: resultType ? 'array' : '',
    }

    const res: QueryResult & { error?: string } = await client.query(pgQuery)
    // node-postgres doesn't throw, it just returns error object
    if (res?.error) throw new Error(res.error)

    switch (resultType) {
      case 'array':
        return res.rows.flat()
      case 'string':
        return res.rows.flat().join(' ')
      case 'number': {
        const result = res.rows.flat()
        return Number.isNaN(Number(result)) ? result : Number(result)
      }
      default:
        return res.rows
    }
  }

  return { query }
}

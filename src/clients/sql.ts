/**
 * The bundled `SqlConnection` wrappers ("The client contracts" in
 * docs-dev/v3-specs/v3-operator-contract.md; the root-entry inventory in
 * docs-dev/v3-specs/v3-packaging.md).
 *
 * Ported from v2's `databaseConnections.ts`, renamed to say what they
 * implement (`SQLNodePostgres` / `SQLite` → `PostgresConnection` /
 * `SQLiteConnection` — packaging open Q2, resolved September 2026). The
 * contract is one method returning rows as objects: every reshaping
 * question belongs to the `sql` operator, so a host's own wrapper stays
 * this thin too.
 *
 * `pg` and `sqlite` are never dependencies of this package, so their types
 * are not imported — each wrapper declares the minimum shape it calls.
 */
import { OperatorFailure } from '../OperatorFailure'
import type { SqlConnection, SqlRequest } from '../types'
import { sqlFailure } from './failures'

/** node-postgres' `Client` or `Pool`, reduced to the one call. */
export interface PgClientLike {
  query(config: { text: string; values?: unknown[] }): Promise<{ rows: Record<string, unknown>[] }>
}

/** The `sqlite` package's `Database`, reduced to the one call. */
export interface SqliteDatabaseLike {
  all(sql: string, params?: unknown[] | Record<string, unknown>): Promise<Record<string, unknown>[]>
}

export class PostgresConnection implements SqlConnection {
  constructor(private readonly client: PgClientLike) {
    if (typeof client?.query !== 'function')
      throw new OperatorFailure(
        'PostgresConnection(client): pass a connected node-postgres Client or Pool'
      )
  }

  query = async (req: SqlRequest): Promise<Record<string, unknown>[]> => {
    // node-postgres has no named-bind form. Passing an object through
    // would bind nothing and run the query with empty placeholders —
    // plausible output from the wrong query, so it is refused here
    if (req.values !== undefined && !Array.isArray(req.values))
      throw new OperatorFailure(
        'postgres takes positional binds ($1, $2, …) — an object of named binds ' +
          'needs a driver that supports them'
      )
    try {
      // The signal is accepted and not forwarded: node-postgres cannot
      // abort a query in flight. Recorded rather than hidden — the
      // engine's own deadline still fails the node on time
      const result = await this.client.query({
        text: req.text,
        ...(req.values !== undefined ? { values: req.values } : {}),
      })
      return result?.rows ?? []
    } catch (error) {
      throw sqlFailure('postgres', error)
    }
  }
}

export class SQLiteConnection implements SqlConnection {
  constructor(private readonly db: SqliteDatabaseLike) {
    if (typeof db?.all !== 'function')
      throw new OperatorFailure('SQLiteConnection(db): pass an open sqlite Database')
  }

  query = async (req: SqlRequest): Promise<Record<string, unknown>[]> => {
    try {
      // SQLite takes both bind forms, and its driver is synchronous, so
      // the signal cannot be honoured at all — best-effort, as the
      // contract says, and the deadline does the rest
      return (await this.db.all(req.text, req.values)) ?? []
    } catch (error) {
      throw sqlFailure('sqlite', error)
    }
  }
}

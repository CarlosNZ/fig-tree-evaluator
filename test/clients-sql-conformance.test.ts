/**
 * Chunk 9.2 — the `SqlConnection` contract, run over every connection
 * ("The client contracts" in docs-dev/v3-specs/v3-operator-contract.md).
 * The HTTP suite's sibling: one table, several stub drivers, so the
 * wrappers stay equivalent and a host's own wrapper has a specification to
 * satisfy.
 *
 * The contract is deliberately one method returning rows as objects. Every
 * reshaping question — `shape`, `noRowDefault`, multi-column rejection —
 * belongs to the `sql` operator, which is why nothing here knows about
 * them.
 */
import { OperatorFailure, PostgresConnection, SQLiteConnection } from '../src'
import type { PgClientLike, SqlConnection, SqliteDatabaseLike } from '../src'
import { MockSqlConnection } from './helpers'
import { rejection } from './helpers/rejection'

const ROWS = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }]

/** What each stub driver was handed, for the passthrough assertions. */
interface Seen {
  text?: string
  values?: unknown
}

const pgStub = (rows: Record<string, unknown>[], seen: Seen = {}): PgClientLike => ({
  query: async ({ text, values }) => {
    seen.text = text
    seen.values = values
    return { rows }
  },
})

const sqliteStub = (rows: Record<string, unknown>[], seen: Seen = {}): SqliteDatabaseLike => ({
  all: async (sql, params) => {
    seen.text = sql
    seen.values = params
    return rows
  },
})

const CONNECTIONS: { name: string; build: (rows: Record<string, unknown>[]) => SqlConnection }[] = [
  { name: 'PostgresConnection', build: (rows) => new PostgresConnection(pgStub(rows)) },
  { name: 'SQLiteConnection', build: (rows) => new SQLiteConnection(sqliteStub(rows)) },
  {
    name: 'MockSqlConnection',
    build: (rows) => new MockSqlConnection({ defaultRows: rows }),
  },
]

describe.each(CONNECTIONS)('$name — the contract every connection satisfies', ({ build }) => {
  it('returns rows as objects', async () => {
    expect(await build(ROWS).query({ text: 'SELECT id, name FROM people' })).toEqual(ROWS)
  })

  it('returns an empty array for an empty result, never null', async () => {
    expect(await build([]).query({ text: 'SELECT 1 WHERE false' })).toEqual([])
  })

  it('accepts positional binds', async () => {
    expect(
      await build(ROWS).query({ text: 'SELECT * FROM people WHERE id = $1', values: [1] })
    ).toEqual(ROWS)
  })

  it('accepts a signal without throwing, whether or not it can honour one', async () => {
    const connection = build(ROWS)
    const controller = new AbortController()
    expect(await connection.query({ text: 'SELECT 1', signal: controller.signal })).toEqual(ROWS)
  })
})

describe('PostgresConnection', () => {
  it("maps the request onto node-postgres' own vocabulary", async () => {
    const seen: Seen = {}
    await new PostgresConnection(pgStub(ROWS, seen)).query({
      text: 'SELECT * FROM people WHERE id = $1',
      values: [7],
    })
    expect(seen).toEqual({ text: 'SELECT * FROM people WHERE id = $1', values: [7] })
  })

  it('omits values entirely when the node supplied none', async () => {
    const seen: Seen = {}
    await new PostgresConnection(pgStub(ROWS, seen)).query({ text: 'SELECT 1' })
    expect(seen.values).toBeUndefined()
  })

  it('refuses named binds rather than silently running with none', async () => {
    const failure = await rejection<OperatorFailure>(
      new PostgresConnection(pgStub(ROWS)).query({ text: 'SELECT :id', values: { id: 1 } })
    )
    expect(failure.message).toMatch(/positional binds/)
  })

  it('names the driver in the failure and carries its classifiers', async () => {
    const angry: PgClientLike = {
      query: async () => {
        throw Object.assign(new Error('relation "nope" does not exist'), {
          code: '42P01',
          table: 'nope',
        })
      },
    }
    const failure = await rejection<OperatorFailure>(
      new PostgresConnection(angry).query({ text: 'SELECT * FROM nope' })
    )
    expect(failure.message).toBe('postgres: relation "nope" does not exist')
    expect(failure.errorData).toEqual({ driver: 'postgres', code: '42P01', table: 'nope' })
  })

  it('carries no field that quotes row values', async () => {
    const angry: PgClientLike = {
      query: async () => {
        throw Object.assign(new Error('duplicate key'), {
          code: '23505',
          detail: 'Key (email)=(ada@example.test) already exists.',
          hint: 'try another address',
        })
      },
    }
    const failure = await rejection<OperatorFailure>(
      new PostgresConnection(angry).query({ text: 'INSERT …' })
    )
    // `detail` and `hint` quote the offending values, which a host may
    // well log — deliberately excluded
    expect(JSON.stringify(failure.errorData)).not.toContain('ada@example.test')
  })

  it('refuses anything that is not a client', () => {
    // @ts-expect-error — the likely mistake: a config object, not a client
    expect(() => new PostgresConnection({ host: 'localhost' })).toThrow(/node-postgres/)
  })
})

describe('SQLiteConnection', () => {
  it('passes both bind forms through, as the driver supports both', async () => {
    const positional: Seen = {}
    await new SQLiteConnection(sqliteStub(ROWS, positional)).query({
      text: 'SELECT * FROM people WHERE id = ?',
      values: [1],
    })
    expect(positional.values).toEqual([1])

    const named: Seen = {}
    await new SQLiteConnection(sqliteStub(ROWS, named)).query({
      text: 'SELECT * FROM people WHERE id = :id',
      values: { ':id': 1 },
    })
    expect(named.values).toEqual({ ':id': 1 })
  })

  it('names the driver in the failure', async () => {
    const angry: SqliteDatabaseLike = {
      all: async () => {
        throw new Error('SQLITE_ERROR: no such table: nope')
      },
    }
    const failure = await rejection<OperatorFailure>(
      new SQLiteConnection(angry).query({ text: 'SELECT * FROM nope' })
    )
    expect(failure.message).toBe('sqlite: SQLITE_ERROR: no such table: nope')
    expect(failure.errorData).toEqual({ driver: 'sqlite' })
  })

  it('refuses anything that is not a database', () => {
    // @ts-expect-error — the likely mistake: the sqlite3 module rather
    // than an open Database
    expect(() => new SQLiteConnection({ open: () => {} })).toThrow(/sqlite Database/)
  })
})

/**
 * Chunk 9.2 — the `SqlConnection` contract, run over every connection
 * ("The client contracts" in docs-dev/v3-specs/v3-operator-contract.md).
 * The HTTP suite's sibling: shared tables, several stub drivers, so the
 * wrappers stay equivalent and a host's own wrapper has a specification to
 * satisfy — what each connection returns, and what it hands its driver
 * (#273).
 *
 * The contract is deliberately one method returning rows as objects. Every
 * reshaping question — `shape`, `noRowDefault`, multi-column rejection —
 * belongs to the `sql` operator, which is why nothing here knows about
 * them.
 */
import {
  ErrorCodes,
  OperatorFailure,
  PostgresConnection,
  SQLiteConnection,
  isFigTreeError,
} from '../src'
import type {
  FigTreeError,
  PgClientLike,
  SqlConnection,
  SqlRequest,
  SqliteDatabaseLike,
} from '../src'
import { MockSqlConnection } from './helpers'
import { rejection } from './helpers/rejection'

/** A constructor's throw, which has to be a `FigTreeError`. */
const refusal = (construct: () => unknown): FigTreeError => {
  try {
    construct()
  } catch (error) {
    if (isFigTreeError(error)) return error
    throw error
  }
  throw new Error('expected construction to throw')
}

const ROWS = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Grace' },
]

/** What each stub driver was handed, for the passthrough assertions. */
interface Seen {
  text?: string
  /** Absent when the driver was handed no binds. */
  values?: unknown
}

const pgStub = (rows: Record<string, unknown>[], seen: Seen = {}): PgClientLike => ({
  query: async (config) => {
    seen.text = config.text
    if ('values' in config) seen.values = config.values
    return { rows }
  },
})

const sqliteStub = (rows: Record<string, unknown>[], seen: Seen = {}): SqliteDatabaseLike => ({
  all: async (sql, params) => {
    seen.text = sql
    if (params !== undefined) seen.values = params
    return rows
  },
})

/**
 * Every connection, in the same shape: built to answer with some rows, and
 * able to say what it handed its driver. `MockSqlConnection` has no driver,
 * so what it was handed comes from its call log.
 */
const CONNECTIONS: {
  name: string
  build: (rows: Record<string, unknown>[]) => { connection: SqlConnection; sent: () => Seen }
}[] = [
  {
    name: 'PostgresConnection',
    build: (rows) => {
      const seen: Seen = {}
      return { connection: new PostgresConnection(pgStub(rows, seen)), sent: () => seen }
    },
  },
  {
    name: 'SQLiteConnection',
    build: (rows) => {
      const seen: Seen = {}
      return { connection: new SQLiteConnection(sqliteStub(rows, seen)), sent: () => seen }
    },
  },
  {
    name: 'MockSqlConnection',
    build: (rows) => {
      const connection = new MockSqlConnection({ defaultRows: rows })
      return { connection, sent: () => ({ ...connection.calls[0] }) }
    },
  },
]

/**
 * One query per row, which every connection must hand its driver
 * unchanged: the text verbatim, whatever its placeholders, and the binds as
 * given. Positional binds only, the one form every driver takes.
 */
const QUERIES: { name: string; req: SqlRequest }[] = [
  { name: 'no binds', req: { text: 'SELECT 1' } },
  {
    name: 'a bind of every JSON kind',
    req: {
      text: 'SELECT * FROM people WHERE a = $1 AND b = $2 AND c = $3 AND d = $4',
      values: [1, 'ada', null, true],
    },
  },
  {
    name: 'an object and an array, bound whole',
    req: { text: 'SELECT $1::jsonb, $2::jsonb', values: [{ a: 1 }, [1, 2]] },
  },
  { name: 'an empty bind list', req: { text: 'SELECT 1', values: [] } },
  {
    name: 'text with layout, kept as it is',
    req: { text: '  SELECT *\n  FROM people\n  WHERE id = ?  ', values: [7] },
  },
]

describe.each(CONNECTIONS)('$name — the query every connection sends', ({ build }) => {
  it.each(QUERIES)('$name', async ({ req }) => {
    const { connection, sent } = build(ROWS)
    await connection.query(req)
    expect(sent()).toStrictEqual(req)
  })
})

describe.each(CONNECTIONS)('$name — the contract every connection satisfies', ({ build }) => {
  it('returns rows as objects', async () => {
    expect(await build(ROWS).connection.query({ text: 'SELECT id, name FROM people' })).toEqual(
      ROWS
    )
  })

  it('returns an empty array for an empty result, never null', async () => {
    expect(await build([]).connection.query({ text: 'SELECT 1 WHERE false' })).toEqual([])
  })

  it('accepts positional binds', async () => {
    expect(
      await build(ROWS).connection.query({
        text: 'SELECT * FROM people WHERE id = $1',
        values: [1],
      })
    ).toEqual(ROWS)
  })

  it('accepts a signal without throwing, whether or not it can honour one', async () => {
    const { connection } = build(ROWS)
    const controller = new AbortController()
    expect(await connection.query({ text: 'SELECT 1', signal: controller.signal })).toEqual(ROWS)
  })
})

describe('PostgresConnection', () => {
  it('refuses named binds rather than silently running with none', async () => {
    const failure = await rejection<OperatorFailure>(
      new PostgresConnection(pgStub(ROWS)).query({ text: 'SELECT :id', values: { id: 1 } })
    )
    // Refused before the driver, so the failure has no driverCode
    expect(failure.message).toMatch(/^postgres: takes positional binds/)
    expect(failure.code).toBe('sql-error')
    expect(failure.errorData).toEqual({ driver: 'postgres' })
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
    expect(failure.code).toBe('sql-error')
    expect(failure.errorData).toEqual({ driver: 'postgres', driverCode: '42P01', table: 'nope' })
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
    expect(refusal(() => new PostgresConnection({ host: 'localhost' }))).toMatchObject({
      code: ErrorCodes.invalidOptions,
      path: [],
      message: expect.stringMatching(/node-postgres/),
    })
  })
})

describe('SQLiteConnection', () => {
  it('passes named binds through too, as the driver supports them', async () => {
    const named: Seen = {}
    await new SQLiteConnection(sqliteStub(ROWS, named)).query({
      text: 'SELECT * FROM people WHERE id = :id',
      values: { ':id': 1 },
    })
    expect(named.values).toEqual({ ':id': 1 })
  })

  it('names the driver in the failure, with its result code', async () => {
    const angry: SqliteDatabaseLike = {
      all: async () => {
        throw Object.assign(new Error('SQLITE_ERROR: no such table: nope'), {
          code: 'SQLITE_ERROR',
          errno: 1,
        })
      },
    }
    const failure = await rejection<OperatorFailure>(
      new SQLiteConnection(angry).query({ text: 'SELECT * FROM nope' })
    )
    expect(failure.message).toBe('sqlite: SQLITE_ERROR: no such table: nope')
    expect(failure.code).toBe('sql-error')
    expect(failure.errorData).toEqual({ driver: 'sqlite', driverCode: 'SQLITE_ERROR' })
  })

  it('refuses anything that is not a database', () => {
    // @ts-expect-error — the likely mistake: the sqlite3 module rather
    // than an open Database
    expect(refusal(() => new SQLiteConnection({ open: () => {} }))).toMatchObject({
      code: ErrorCodes.invalidOptions,
      path: [],
      message: expect.stringMatching(/sqlite Database/),
    })
  })
})

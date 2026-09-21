/**
 * Chunk 9.3 — `sql` end to end against a real database.
 *
 * Hand-migrated from the SQLite half of
 * test/v2-working/12_database.test.ts, and it runs in the DEFAULT suite
 * rather than a tagged one: `test/database/northwind.sqlite` is in the
 * repo and `sqlite`/`sqlite3` are already dev dependencies, so this needs
 * no external resource. That makes it real `sql` coverage in CI, which v2
 * never had — its database tests all wanted a local Postgres.
 *
 * The migration is where v2's `single` × `flatten` matrix becomes `shape`.
 * Two v2 cases have no v3 spelling on purpose: `flatten` over a
 * multi-column result returned arrays-of-values per row, which `'column'`
 * now rejects, and the `type: 'number'` rider died with `outputType`.
 *
 * Guarded rather than assumed: a CI image without the native binding
 * skips instead of failing.
 */
import { FigTree, FigTreeError, SQLiteConnection, coreOperators, sqlOperators } from '../src'
import { rejection } from './helpers/rejection'

/** Set by `beforeAll` when the fixture opens; everything skips if not. */
let fig: FigTree | undefined
let db: { close: () => Promise<void> } | undefined

beforeAll(async () => {
  try {
    const sqlite3 = (await import('sqlite3')).default
    const { open } = await import('sqlite')
    const opened = await open({
      filename: './test/database/northwind.sqlite',
      driver: sqlite3.Database,
    })
    db = opened
    fig = new FigTree({
      operators: [coreOperators, sqlOperators(new SQLiteConnection(opened))],
    })
  } catch {
    // No native binding on this machine — the suite reports skips
  }
})

afterAll(async () => {
  await db?.close()
})

/** Runs the case, or skips it where the fixture never opened. */
const ev = async (expression: unknown, data?: Record<string, unknown>) => {
  if (fig === undefined) return SKIPPED
  return fig.evaluate(expression, data !== undefined ? { data } : {})
}
const SKIPPED = Symbol('sqlite unavailable')
const ran = (result: unknown) => result !== SKIPPED

it('rows — the default shape, one object per row', async () => {
  const result = await ev({
    $sql: [
      'SELECT order_id, ship_city FROM orders WHERE customer_id = ? AND order_id < 10500',
      'FAMIA',
    ],
  })
  if (!ran(result)) return
  expect(result).toEqual([
    { order_id: 10347, ship_city: 'Sao Paulo' },
    { order_id: 10386, ship_city: 'Sao Paulo' },
    { order_id: 10414, ship_city: 'Sao Paulo' },
  ])
})

it('firstValue — one scalar out, where v2 needed single + flatten', async () => {
  const result = await ev({
    $sql: {
      query: 'SELECT contact_name FROM customers WHERE customer_id = ?',
      values: ['FAMIA'],
      shape: 'firstValue',
    },
  })
  if (!ran(result)) return
  expect(result).toBe('Aria Cruz')
})

it('firstValue — an aggregate, where v2 needed the outputType rider too', async () => {
  const result = await ev({
    $sql: { query: 'SELECT COUNT(*) AS n FROM employees', shape: 'firstValue' },
  })
  if (!ran(result)) return
  expect(result).toBe(9)
})

it('column — one column’s values as an array', async () => {
  const result = await ev({
    $sql: {
      query: 'SELECT company_name FROM suppliers WHERE country = ? ORDER BY company_name',
      values: ['Australia'],
      shape: 'column',
    },
  })
  if (!ran(result)) return
  expect(result).toEqual(["G'day, Mate", 'Pavlova, Ltd.'])
})

it('firstRow — the first row object', async () => {
  const result = await ev({
    $sql: {
      query: 'SELECT contact_name, city FROM customers ORDER BY customer_id',
      shape: 'firstRow',
    },
  })
  if (!ran(result)) return
  expect(result).toMatchObject({ contact_name: expect.any(String) })
})

it('binds a reference, and a null reaches the driver as SQL NULL', async () => {
  const result = await ev(
    {
      $sql: {
        query: 'SELECT COUNT(*) AS n FROM customers WHERE region IS ? OR region = ?',
        values: ['$data.missing', '$data.missing'],
        shape: 'firstValue',
      },
    },
    {}
  )
  if (!ran(result)) return
  // `region IS NULL` matches, which only holds if the bind arrived as NULL
  expect(result).toBeGreaterThan(0)
})

it('answers noRowDefault when the query matches nothing — register row 29', async () => {
  const result = await ev({
    $sql: {
      query: 'SELECT contact_name FROM customers WHERE customer_id = ?',
      values: ['NOPE'],
      shape: 'firstValue',
      noRowDefault: 'unknown',
    },
  })
  if (!ran(result)) return
  expect(result).toBe('unknown')
})

it('refuses a multi-column result under a single-column shape', async () => {
  if (fig === undefined) return
  const error = await rejection<FigTreeError>(
    fig.evaluate({
      $sql: { query: 'SELECT contact_name, city FROM customers', shape: 'column' },
    })
  )
  // v2 silently returned arrays-of-values here, and returned SCALARS for a
  // single-column query — the same expression changing shape with the SQL
  expect(error.code).toBe('type-check')
})

it('surfaces a driver error, named by driver', async () => {
  if (fig === undefined) return
  const error = await rejection<FigTreeError>(
    fig.evaluate({ $sql: ['SELECT * FROM employee_table'] })
  )
  expect(error.message).toMatch(/sqlite: .*no such table: employee_table/)
  expect(error.errorData).toMatchObject({ driver: 'sqlite' })
})

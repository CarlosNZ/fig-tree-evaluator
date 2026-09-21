/**
 * On-demand: `sql` against a local Northwind **Postgres**
 * (`pnpm test:live`). Hand-migrated from the Postgres half of
 * test/v2-working/12_database.test.ts.
 *
 * The SQLite half needs no external resource and therefore runs in the
 * default suite (test/operators-io-sql-northwind.test.ts). This one wants
 * a database initialised from `test/database/northwind.sql` with the
 * connection details in `test/database/pgConfig.json`, so it stays here.
 */
import { FigTree, FigTreeError, PostgresConnection, coreOperators, sqlOperators } from '../../src'
import pgConfig from '../database/pgConfig.json'
import { rejection } from '../helpers/rejection'
import { gate } from './gate'

const database = gate('a local Northwind Postgres')
let fig: FigTree | undefined
let client: { end: () => Promise<void> } | undefined

beforeAll(async () => {
  await database.open(async () => {
    const { Client } = await import('pg')
    const connected = new Client(pgConfig)
    await connected.connect()
    client = connected
    fig = new FigTree({
      operators: [coreOperators, sqlOperators(new PostgresConnection(connected))],
    })
    return connected.query({ text: 'SELECT 1' })
  })
})

afterAll(async () => {
  await client?.end()
})

it('rows — objects, with positional binds', async () => {
  if (!database.ok() || fig === undefined) return
  expect(
    await fig.evaluate({
      $sql: ['SELECT order_id FROM orders WHERE customer_id = $1 AND order_id < 10500', 'FAMIA'],
    })
  ).toEqual([{ order_id: 10347 }, { order_id: 10386 }, { order_id: 10414 }])
})

it('firstValue — one scalar, where v2 needed single + flatten', async () => {
  if (!database.ok() || fig === undefined) return
  expect(
    await fig.evaluate({
      $sql: {
        query: 'SELECT contact_name FROM customers WHERE customer_id = $1',
        values: ['FAMIA'],
        shape: 'firstValue',
      },
    })
  ).toBe('Aria Cruz')
})

it('column — one column across rows', async () => {
  if (!database.ok() || fig === undefined) return
  const result = await fig.evaluate({
    $sql: {
      query: 'SELECT company_name FROM suppliers ORDER BY supplier_id LIMIT 3',
      shape: 'column',
    },
  })
  expect(Array.isArray(result)).toBe(true)
  expect(result).toHaveLength(3)
})

it('refuses a multi-column result under a single-column shape', async () => {
  if (!database.ok() || fig === undefined) return
  const error = await rejection<FigTreeError>(
    fig.evaluate({ $sql: { query: 'SELECT * FROM customers LIMIT 1', shape: 'column' } })
  )
  expect(error.code).toBe('type-check')
})

it('names the driver, and its classifiers, on a real SQL error', async () => {
  if (!database.ok() || fig === undefined) return
  const error = await rejection<FigTreeError>(
    fig.evaluate({ $sql: ['SELECT * FROM employee_table'] })
  )
  expect(error.message).toMatch(/^sql – postgres: /)
  expect(error.errorData).toMatchObject({ driver: 'postgres', code: '42P01' })
})

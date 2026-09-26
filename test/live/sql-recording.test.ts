/**
 * On-demand: the differential's Postgres recordings against a local
 * Northwind (`pnpm test:live`). Live results, recorded, written as the
 * module, evaluated back and replayed through the stand-in, come out as the
 * live client gave them, each value of the type it had.
 */
import { isDeepStrictEqual } from 'node:util'
import type { Client } from 'pg'
import pgConfig from '../database/pgConfig.json'
import { PostgresStandIn, type PgQuery, type SqlRecording } from '../../differential/mocks/postgres'
import { recordingClient, renderRecordings } from '../../differential/recordSql'
import { evaluateRecordings } from '../helpers/evaluateRecordings'
import { gate } from './gate'

const database = gate('a local Northwind Postgres')
let client: Client | undefined

beforeAll(async () => {
  await database.open(async () => {
    const { Client } = await import('pg')
    const connected = new Client(pgConfig)
    await connected.connect()
    client = connected
  })
})

afterAll(async () => {
  await client?.end()
})

const outcome = async (query: () => Promise<{ rows: unknown[] }>) => {
  try {
    return { rows: (await query()).rows }
  } catch (error) {
    const { message, code } = error as { message: string; code?: string }
    return { error: { message, code } }
  }
}

it('replays what the live client answered, types kept', async () => {
  if (!database.ok() || client === undefined) return
  const queries: PgQuery[] = [
    // A `date` and a `real`
    {
      text: 'SELECT order_id, order_date, freight FROM orders WHERE customer_id = $1 AND order_id < 10500',
      values: ['FAMIA'],
    },
    // A `bytea`
    { text: 'SELECT category_name, picture FROM categories WHERE category_id = $1', values: [1] },
    // A `bigint`, which pg gives as a string, and no `values`
    { text: 'SELECT COUNT(*) FROM employees' },
    { text: 'SELECT * FROM employee_table' },
  ]
  const saved = new Map<string, SqlRecording>()
  const recording = recordingClient(client, saved)
  const live = await Promise.all(queries.map((query) => outcome(() => recording.query(query))))

  const standIn = new PostgresStandIn(evaluateRecordings(renderRecordings(saved.values())))
  const replayed = await Promise.all(queries.map((query) => outcome(() => standIn.query(query))))
  expect(isDeepStrictEqual(replayed, live)).toBe(true)
  expect(live[1]).toMatchObject({ rows: [{ picture: expect.any(Buffer) }] })
  expect(live[3]).toMatchObject({ error: { code: '42P01' } })
})

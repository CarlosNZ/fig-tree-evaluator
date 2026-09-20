/**
 * Chunk 9.2 — the injected-driver shapes, checked against the real
 * packages.
 *
 * `axios`, `pg` and `sqlite` are dev dependencies here and **never**
 * dependencies of the published package, so the wrappers declare the
 * minimum structural shape they call rather than importing those packages'
 * types — importing them would put the packages into the emitted `.d.ts`
 * and demand them of every consumer.
 *
 * The risk that buys is silent drift: a driver changes an overload and a
 * host discovers it, not us. These assignments are the check, and they run
 * at COMPILE time — `pnpm compile` and ts-jest both fail here before a
 * consumer ever sees it. The imports are type-only, so no driver is loaded
 * and no native binding is touched.
 */
import type { AxiosStatic } from 'axios'
import type { Client, Pool } from 'pg'
import type { Database } from 'sqlite'
import type { AxiosLike, PgClientLike, SqliteDatabaseLike } from '../src'

/** Never called — `undefined` wearing a type is all this needs to be. */
const asType = <T>(): T => undefined as unknown as T

test('the real drivers satisfy the shapes the wrappers declare', () => {
  const axios: AxiosLike = asType<AxiosStatic>()
  const pgClient: PgClientLike = asType<Client>()
  const pgPool: PgClientLike = asType<Pool>()
  const sqlite: SqliteDatabaseLike = asType<Database>()

  // The assignments above are the assertion; this keeps the runtime honest
  // about what it just proved
  expect([axios, pgClient, pgPool, sqlite]).toEqual([undefined, undefined, undefined, undefined])
})

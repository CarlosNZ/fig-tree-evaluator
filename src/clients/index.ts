/**
 * The bundled client wrappers. Thin adapters over a driver the host
 * injects — `axios`, `pg` and `sqlite` are never dependencies of this
 * package, and the I/O operators reach the network only because someone
 * visibly registered them (the packaging area's principle 1).
 */
export { FetchClient, AxiosClient } from './http'
export type { FetchLike, FetchResponseLike, AxiosLike, AxiosErrorLike } from './http'
export { PostgresConnection, SQLiteConnection } from './sql'
export type { PgClientLike, SqliteDatabaseLike } from './sql'
export { httpFailure, sqlFailure } from './failures'
export type { HttpFailureInfo } from './failures'

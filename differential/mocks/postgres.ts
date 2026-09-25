/**
 * The Postgres stand-in ("I/O" in docs-dev/v3-specs/v3-converter.md): a
 * `pg` client that answers from recordings, beneath each engine's own
 * wrapper (v2's `SQLNodePostgres`, v3's `PostgresConnection`), which run
 * unchanged. The recordings are `differential/sqlRecordings.ts`, written by
 * `pnpm differential --record-sql` (differential/recordSql.ts).
 */
import { unanswered } from './unanswered'

export type Row = Record<string, unknown>

/**
 * The fields of a `pg` error that v3's failure reads. Not `detail` or
 * `hint`, which quote row values.
 */
export interface RecordedError {
  message: string
  code?: string
  table?: string
  column?: string
  constraint?: string
}

/**
 * One query and what the real client answered: its rows, as it returned
 * them, or its error. The rest of `pg`'s result holds class instances that
 * neither wrapper reads.
 */
export type SqlRecording = { text: string; values: unknown[] } & (
  { rows: Row[] } | { error: RecordedError }
)

export interface PgQuery {
  text: string
  values?: unknown[]
}

/**
 * A query's text and values. A missing `values` counts as `[]`: v2 always
 * sends one, and v3 only when there are binds.
 */
export const recordingKey = ({ text, values = [] }: PgQuery): string =>
  JSON.stringify([text, values])

/**
 * A copy of what a query returned, keeping each value's type, since the
 * real client gives every query objects of its own
 */
export const copy = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(copy) as T
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T
  if (value instanceof Date) return new Date(value.getTime()) as T
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, copy(v)])) as T
}

export class PostgresStandIn {
  private readonly recordings: Map<string, SqlRecording>

  constructor(recordings: SqlRecording[]) {
    this.recordings = new Map(recordings.map((recording) => [recordingKey(recording), recording]))
  }

  /**
   * Async, as the real client's is. Any call but `query({ text, values })`
   * throws at once, before any promise, so a wrapper that changes how it
   * calls the client fails loudly rather than being answered wrongly, and
   * the callback form cannot leave a case waiting for a callback.
   */
  query = (...args: unknown[]): Promise<{ rows: Row[] }> => {
    const query = args[0] as PgQuery
    if (args.length !== 1 || !isPgQuery(query))
      throw unanswered(
        `The Postgres stand-in answers query({ text, values }) only, not query(${args
          .map((arg) => (typeof arg === 'function' ? 'callback' : JSON.stringify(arg)))
          .join(', ')})`
      )
    const recording = this.recordings.get(recordingKey(query))
    if (recording === undefined)
      return Promise.reject(unanswered(`No recording for the query ${recordingKey(query)}`))
    if ('error' in recording)
      // A new error each time: v2's wrapper renames the one it catches
      return Promise.reject(Object.assign(new Error(recording.error.message), recording.error))
    return Promise.resolve({ rows: copy(recording.rows) })
  }
}

const isPgQuery = (query: unknown): query is PgQuery => {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) return false
  const { text, values, ...rest } = query as Record<string, unknown>
  return (
    typeof text === 'string' &&
    (values === undefined || Array.isArray(values)) &&
    Object.keys(rest).length === 0
  )
}

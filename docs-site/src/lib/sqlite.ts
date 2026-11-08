import initSqlJs, { type BindParams, type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import type { SqlRequest } from 'fig-tree-evaluator'
import northwind from './northwind.sql?raw'

/**
 * The site's database: a few tables of Northwind (./northwind.sql), in an
 * in-memory SQLite run by sql.js. Only the connection in ./figTree.ts imports
 * this module, dynamically, on the first query, so sql.js, its WebAssembly and
 * the data load then, never with a page.
 *
 * The database is built once per page load and kept for the rest of it, so a
 * reader's own changes to it last until they reload.
 *
 * At build time, sql.js finds its WebAssembly beside itself in node_modules.
 * In the browser it needs the file's URL, which Vite serves.
 */
const database: Promise<Database> = initSqlJs(
  import.meta.env.SSR ? {} : { locateFile: () => wasmUrl }
).then((SQL) => {
  const db = new SQL.Database()
  db.exec(northwind)
  return db
})

/** Runs a query, giving its rows as objects, as a `SqlConnection` does. */
export const query = async ({ text, values }: SqlRequest) => {
  const statement = (await database).prepare(text)
  try {
    if (values !== undefined) statement.bind(values as BindParams)
    const rows: Record<string, unknown>[] = []
    while (statement.step()) rows.push(statement.getAsObject())
    return rows
  } finally {
    statement.free()
  }
}

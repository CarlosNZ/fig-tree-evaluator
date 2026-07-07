/**
 * fig-tree-evaluator — public entry point.
 *
 * ⚠ v3 rebuild in progress. This is the Phase-0 skeleton (docs/v3-implementation-plan.md):
 * a fresh source tree built up phase by phase, beside the frozen v2 engine kept
 * in /v2-src (excluded from this build; v3 source may never import from it).
 *
 * Today the public surface exposes only the version and the client/cache
 * contracts the test doubles implement. Everything else — `FigTree`,
 * `defineOperator`, `coreOperators`, the I/O factories, `FigTreeError`, guards
 * and helpers — lands in later phases (see docs/v3-packaging.md for the final
 * export inventory).
 */
export { version } from './version'

export type { HttpClient, SqlConnection, CacheStore } from './types'

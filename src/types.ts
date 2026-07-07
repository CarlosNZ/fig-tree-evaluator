/**
 * fig-tree-evaluator v3 — shared public types.
 *
 * v3 is a full rewrite (see docs/v3-implementation-plan.md, Phase 0). This file
 * currently holds only the client + cache contracts the Phase-0 test doubles
 * implement — "interfaces early, features behind them" (implementation-plan
 * working rule 3). The full v3 type vocabulary lands across Phases 1–13.
 *
 * These shapes are anchored to the settled spec:
 *   - HttpClient / SqlConnection: docs/v3-operator-contract.md § "The client contracts"
 *   - CacheStore:                 docs/v3-api.md § Caching ("CacheStore = { get, set }")
 * They may be refined when Phase 9 formalises the I/O layer; per working rule 2,
 * any such change goes back to the spec docs first.
 */

/**
 * The HTTP client contract. Deliberately minimal — one entry point, a
 * fully-resolved request in, a parsed value out — so `FetchClient`,
 * `AxiosClient` and a host's own wrapper stay thin and equivalent.
 * The operator body owns URL assembly; the client only transports.
 */
export interface HttpClient {
  request(req: {
    /** Fully resolved: base joined, query string rendered and appended (null pairs already omitted). */
    url: string
    method: 'get' | 'post'
    /** The merged, rendered header chain. */
    headers: Record<string, string>
    /** JSON payload; the client serialises it. Absent = no body. */
    body?: unknown
    /** The composed signal (contract ledger #15) — the client must honour it. */
    signal: AbortSignal
  }): Promise<unknown>
}

/**
 * The SQL connection contract. Rows come back as objects, always — any
 * reshaping is the operator's job, not the client's.
 */
export interface SqlConnection {
  query(req: {
    /** Dialect-owned placeholders, verbatim. */
    text: string
    values?: unknown[] | Record<string, unknown>
    /** Best-effort where the driver can't abort (e.g. SQLite) — recorded, not hidden. */
    signal?: AbortSignal
  }): Promise<Record<string, unknown>[]>
}

/**
 * A pluggable result-cache store. The engine owns TTL / maxSize / key
 * namespacing and never caches failures; the store is just a keyed get/set.
 * Sync and async implementations are both permitted.
 */
export interface CacheStore {
  get(key: string): unknown | Promise<unknown>
  set(key: string, value: unknown): void | Promise<void>
}

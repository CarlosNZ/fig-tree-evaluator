/**
 * fig-tree-evaluator v3 — shared public types.
 *
 * v3 is a full rewrite (see docs-dev/v3-specs/v3-implementation-plan.md, Phase
 * 0). This file currently holds only the client + cache contracts the Phase-0
 * test doubles implement — "interfaces early, features behind them"
 * (implementation-plan working rule 3). The full v3 type vocabulary lands
 * across Phases 1–13.
 *
 * These shapes are anchored to the settled spec:
 *   - HttpClient / SqlConnection: "The client contracts" in
 *     docs-dev/v3-specs/v3-operator-contract.md
 *   - CacheStore: "Caching" in docs-dev/v3-specs/v3-api.md
 *     ("CacheStore = { get, set }")
 * They may be refined when Phase 9 formalises the I/O layer; per working rule
 * 2, any such change goes back to the spec docs first.
 */

/**
 * The HTTP client contract. Deliberately minimal — one entry point, a
 * fully-resolved request in, a parsed value out — so `FetchClient`,
 * `AxiosClient` and a host's own wrapper stay thin and equivalent.
 * The operator body owns URL assembly; the client only transports.
 */
export interface HttpRequest {
  /**
   * Fully resolved: base joined, query string rendered and appended (null
   * pairs already omitted).
   */
  url: string
  method: 'get' | 'post'
  /** The merged, rendered header chain. */
  headers: Record<string, string>
  /** JSON payload; the client serialises it. Absent = no body. */
  body?: unknown
  /**
   * The composed signal (contract ledger #15) — the client must honour it.
   */
  signal: AbortSignal
}

export interface HttpClient {
  /**
   * Resolves to the parsed JSON body — `null` for an empty success (204).
   * Throws `OperatorFailure` carrying `errorData` (status, url, response
   * payload) on a non-2xx or non-JSON response. Header VALUES never appear
   * in that payload: headers are the secret-bearing channel, so error and
   * trace output render header names only, and a custom client must follow
   * suit.
   */
  request(req: HttpRequest): Promise<unknown>
}

/**
 * The SQL connection contract. Rows come back as objects, always — any
 * reshaping is the operator's job, not the client's.
 */
export interface SqlRequest {
  /** Dialect-owned placeholders, verbatim. */
  text: string
  values?: unknown[] | Record<string, unknown>
  /**
   * Best-effort where the driver can't abort (e.g. SQLite) — recorded, not
   * hidden.
   */
  signal?: AbortSignal
}

export interface SqlConnection {
  /** Rows as objects, always; reshaping is the operator's job, not this. */
  query(req: SqlRequest): Promise<Record<string, unknown>[]>
}

/**
 * A pluggable result-cache store: keyed storage, and nothing else. The
 * engine owns TTL and key namespacing, and never caches failures. The
 * bound is the store's own: `cache.maxSize` sizes the built-in store and
 * does not reach a host-supplied one, which brings its own eviction
 * policy. Sync and async implementations are both permitted.
 *
 * Four methods rather than two (ruled September 2026, at Phase-9
 * planning): `clearCache()` needs `clear`, and `delete` is how the engine
 * frees an entry it has found expired or invalidated on lookup, rather
 * than leaving a dead envelope in the host's store. Both are best-effort
 * on the engine's side — a store that cannot forget is still correct,
 * because the envelope's expiry and generation already make the entry a
 * miss. `new Map()` satisfies this interface as it stands.
 *
 * Values are engine-owned envelopes carrying the cached value, the cache
 * generation and an expiry, so a store persisting them round-trips an
 * opaque record rather than the operator's result.
 *
 * The three mutators are declared `void` rather than `void | Promise<void>`
 * so that a store returning something else still satisfies the contract —
 * which is what lets a plain `new Map()` be passed straight in, its `set`
 * returning the map and its `delete` a boolean. The engine awaits whatever
 * comes back, so an asynchronous store works equally well; it simply has
 * nothing useful to say in its return type.
 */
export interface CacheStore {
  get(key: string): unknown | Promise<unknown>
  set(key: string, value: unknown): void
  delete(key: string): void
  clear(): void
}

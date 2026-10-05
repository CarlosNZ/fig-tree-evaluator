/**
 * The shapes the `./authoring` subpath takes and returns, exported from the
 * root so the subpath stays an analysis over the engine, like the other
 * subpaths' types ("Types" in docs-dev/v3-specs/v3-packaging.md).
 */

/** What `fallbackCoverage` reports. */
export interface FallbackCoverage {
  /**
   * The top-level values that may throw with no fallback to catch them, in
   * tree order: each is a place a `fallback` belongs. Empty when every one
   * is covered. Meaningful for a valid expression only.
   */
  uncovered: (string | number)[][]
}

/** What `fallbackCoverage` takes beside the instance and the expression. */
export interface FallbackCoverageOptions {
  /**
   * A timeout the host passes to `evaluate()` per call, which the instance
   * cannot know of. Its own `timeout` applies without it.
   */
  timeout?: number
}

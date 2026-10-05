/**
 * The shapes the `./authoring` subpath takes and returns, exported from the
 * root so the subpath stays an analysis over the engine, like the other
 * subpaths' types ("Types" in docs-dev/v3-specs/v3-packaging.md).
 */
import type { FigTreeErrorCode } from './errorCodes'

/**
 * What `fallbackCoverage` reports ("What it returns" in
 * docs-dev/v3-specs/v3-fallback-coverage.md). Meaningful for a valid
 * expression only.
 */
export interface FallbackCoverage {
  /**
   * Failures nothing catches: each can reject evaluate(). Empty when none
   * can
   */
  uncovered: CoverageFinding[]
  /** Failures a fallback catches */
  covered: CoveredFinding[]
}

/** One way a node can fail, where the failure starts. */
export interface CoverageFinding {
  /**
   * The node where the failure starts; for a failure inside a fragment
   * body, the call
   */
  path: (string | number)[]
  /**
   * The code the runtime error would carry: 'type-check',
   * 'non-finite-result', …
   */
  code: FigTreeErrorCode
  message: string
  /** 'always': whenever the node is reached. 'may': for some inputs */
  certainty: 'may' | 'always'
  operator?: string
  parameter?: string
  /** A failure inside a fragment body: the fragment, and where in its body */
  fragment?: string
  fragmentPath?: (string | number)[]
}

/** A failure a fallback catches. */
export interface CoveredFinding extends CoverageFinding {
  /** The node whose fallback catches it (the call, for a fallback in a body) */
  coveredBy: (string | number)[]
  coveredByFragmentPath?: (string | number)[]
}

/** What `fallbackCoverage` takes beside the instance and the expression. */
export interface FallbackCoverageOptions {
  /**
   * A timeout the host passes to `evaluate()` per call, which the instance
   * cannot know of. Its own `timeout` applies without it.
   */
  timeout?: number
  /**
   * How strictly the analysis treats numbers ("Numbers" in
   * docs-dev/v3-specs/v3-fallback-coverage.md). Accepted, and without effect
   * until the operators' failure rules are in place.
   */
  numbers?: 'ordinary' | 'strict'
}

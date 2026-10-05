/**
 * The shapes the `./authoring` subpath takes and returns, exported from the
 * root so the subpath stays an analysis over the engine, like the other
 * subpaths' types ("Types" in docs-dev/v3-specs/v3-packaging.md).
 */
import type { FigTreeErrorCode } from './errorCodes'
import type { ExpectedType } from './typeCheck'

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

/**
 * What an operator declares of its own failures, for `./authoring`
 * ("Where the rules live" in docs-dev/v3-specs/v3-fallback-coverage.md):
 * the `coverage` field of a definition. Declaring it says the rules are
 * complete, and that the operator is pure. Without it, a host operator is
 * external: it may fail whatever its inputs.
 */
export interface OperatorCoverage {
  /**
   * The ways its body can fail beside the engine's own checks on its
   * parameters. Absent or empty: it never fails of itself
   */
  failures?: FailureRule[]
  /** It may fail whatever its inputs: a request, or code nothing describes */
  external?: true
  /** What a node returns, where its inputs narrow its `returns` */
  output?: CoverageOutput
}

/**
 * One way an operator's body can fail: the code its error carries, and the
 * conditions on what its parameters receive under which it does.
 */
export interface FailureRule {
  code: FigTreeErrorCode
  /** The parameter the failure is about, which its finding names */
  parameter?: string
  /** Tests on parameters, by name; every one must hold. Absent: always holds */
  when?: Record<string, CoverageTest>
  /** Options the rule needs, such as { strictDataPaths: true } */
  options?: Record<string, unknown>
  /** Holding makes the failure possible, not certain */
  may?: true
  /**
   * A failure only extreme numbers reach: counted under numbers: 'strict'
   * only
   */
  overflow?: true
}

/** A test on what one parameter receives. */
export type CoverageTest =
  /** Equals this value */
  | string
  | number
  | boolean
  | null
  /** Has this type */
  | { type: ExpectedType }
  /** A number less than this */
  | { below: number }
  /** An empty array, string or object */
  | { empty: true }
  /** The parameter has a value, supplied or defaulted, or has none */
  | { supplied: boolean }
  /** The operator's `validate` hook refuses it */
  | { invalid: true }
  /** Some element of an array, or value of an object, passes */
  | { some: CoverageTest }
  | { not: CoverageTest }

/**
 * What an operator node returns, in terms of what its parameters receive
 * ("Output declarations" in docs-dev/v3-specs/v3-fallback-coverage.md).
 */
export type CoverageOutput =
  /** A fixed type */
  | ExpectedType
  /** What that parameter receives: each element or entry of a lazy container */
  | { param: string }
  /** An element of an array parameter */
  | { elementOf: string }
  /** The types of an array parameter's elements, as a sum of them is */
  | { kindOf: string }
  | { arrayOf: CoverageOutput }
  | { oneOf: CoverageOutput[] }
  /** The type a literal parameter names */
  | { typeNamedBy: string }
  /** Chosen by a literal parameter */
  | { byParam: string; cases: Record<string, CoverageOutput> }
  /** The first of an array parameter's elements that is not null */
  | { firstNonNull: string }

/**
 * The shapes the `./authoring` subpath takes and returns, exported from the
 * root so the subpath stays an analysis over the engine, like the other
 * subpaths' types ("Types" in docs-dev/v3-specs/v3-packaging.md).
 */
import type { FallbackErrorCode, FigTreeErrorCode } from './errorCodes'
import type { ExpectedType } from './typeCheck'

/**
 * What `fallbackCoverage` reports ("What it returns" in
 * docs-dev/v3-specs/v3-fallback-coverage.md). For an expression with a
 * static error, its static errors alone: `evaluate()` refuses it before
 * anything runs.
 */
export interface FallbackCoverage {
  /**
   * Failures nothing catches: each can reject evaluate(). Empty when none
   * can. Every static error is one, and beside one there is nothing else
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
  /**
   * Set where the failure is in a fallback that reads its own `$error`,
   * which never fails: the node `coveredBy` names gives `null` for it,
   * rather than its fallback's value
   */
  givesNull?: true
}

/**
 * The analysis's own options. The evaluation options it reads, such as
 * `timeout` and `strictDataPaths`, are the instance's.
 */
export interface FallbackCoverageOptions {
  /**
   * Treat numbers strictly ("Numbers" in
   * docs-dev/v3-specs/v3-fallback-coverage.md): overflow on numbers the
   * analysis cannot pin down counts, and a number from the data may be NaN
   * or infinite. False by default.
   */
  strictNumbers?: boolean
}

/**
 * What static analysis may assume of an operator, for `./authoring`
 * ("Where the rules live" in docs-dev/v3-specs/v3-fallback-coverage.md):
 * the `analysis` field of a definition. Declaring it says the rules are
 * complete, and that the operator is pure: the analysis runs its body where
 * its inputs are known, so the body must settle from its parameters alone.
 * Without it, a host operator is external: it may fail whatever its inputs.
 */
export interface OperatorAnalysis {
  /**
   * The ways its body can fail beside the engine's own checks on its
   * parameters. Absent or empty: it never fails of itself
   */
  failures?: FailureRule[]
  /** It may fail whatever its inputs: a request, or code nothing describes */
  external?: true
  /** What a node returns, where its inputs narrow its `returns` */
  output?: DeclaredOutput
}

/**
 * One way an operator's body can fail: the code its error carries, and the
 * conditions on what its parameters receive under which it does.
 */
export interface FailureRule {
  code: FallbackErrorCode
  /** The parameter the failure is about, which its finding names */
  parameter?: string
  /** Tests on parameters, by name; every one must hold. Absent: always holds */
  when?: Record<string, FailureTest>
  /** Options the rule needs, such as { strictDataPaths: true } */
  options?: Record<string, unknown>
  /** Holding makes the failure possible, not certain */
  may?: true
  /** A failure only extreme numbers reach: counted under strictNumbers only */
  overflow?: true
}

/** A test on what one parameter receives. */
export type FailureTest =
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
  | { some: FailureTest }
  | { not: FailureTest }

/**
 * What an operator node returns, in terms of what its parameters receive
 * ("Output declarations" in docs-dev/v3-specs/v3-fallback-coverage.md).
 */
export type DeclaredOutput =
  /** A fixed type */
  | ExpectedType
  /** A number between `min` and `max`, inclusive, where they are given */
  | { type: 'number' | 'integer'; min?: number; max?: number }
  /** A string or array at least `minLength` long (a string in code points) */
  | { type: 'string' | 'array'; minLength?: number }
  /** What that parameter receives: each element or entry of a lazy container */
  | { param: string }
  /** An element of an array parameter */
  | { elementOf: string }
  /** The types of an array parameter's elements, as a sum of them is */
  | { kindOf: string }
  | { arrayOf: DeclaredOutput; minLength?: number }
  | { oneOf: DeclaredOutput[] }
  /** The type a literal parameter names */
  | { typeNamedBy: string }
  /**
   * Chosen by a literal parameter: the case it names, else `otherwise`; all
   * of them where it is not known
   */
  | { byParam: string; cases: Record<string, DeclaredOutput>; otherwise?: DeclaredOutput }
  /** The first of an array parameter's elements that is not null */
  | { firstNonNull: string }
  /**
   * The sum of an array parameter's elements, from 0 and in order: a range
   * for numbers, the kind of anything else
   */
  | { sum: string }
  /** The product of an array parameter's numbers, from 1 and in order */
  | { product: string }
  /** One number parameter less another */
  | { difference: [string, string] }
  /** A number parameter's absolute value */
  | { abs: string }
  /** The least of an array parameter's elements: numbers by value */
  | { min: string }
  /** The greatest of an array parameter's elements: numbers by value */
  | { max: string }

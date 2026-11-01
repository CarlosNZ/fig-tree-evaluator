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
  /**
   * The analyses of the instance's own operators, each from
   * `declareAnalysis`. An operator without one is external: it may fail
   * whatever its inputs
   */
  operators?: readonly OperatorAnalysis[]
}

/**
 * The set of values a node can return, as the analysis knows it ("Gamuts"
 * in docs-dev/v3-specs/v3-operator-coverage.md). Opaque: a hook reads and
 * builds one through its `helpers`, never by its members, which are free to
 * change. The brand is a string key, not a unique symbol: each entry's
 * declarations carry their own copy of the type, and two copies of a
 * symbol-keyed brand would be two types.
 */
export interface Gamut {
  readonly '~gamut': true
}

/**
 * A definition built by `defineOperator()`, as far as its type can say.
 * The definition's own type reaches types branded by a unique symbol, and
 * each entry's declarations carry their own copy of those, so the root's
 * definitions would not fit this entry's copy. `declareAnalysis` checks
 * that it was built at runtime instead.
 */
export interface BuiltOperator {
  readonly name: string
}

/**
 * The answer to a yes-or-no question asked of a gamut: `yes` where every
 * value in it satisfies the question, `no` where none does, `maybe` where
 * some do.
 */
export type Answer = 'no' | 'maybe' | 'yes'

/**
 * The second argument of both analysis hooks ("The helpers" in
 * docs-dev/v3-specs/v3-operator-coverage.md). A helper about a value takes
 * its gamut; one about a parameter takes the parameter's name.
 */
export interface GamutHelpers {
  /** Is the value this one */
  is(gamut: Gamut, value: string | number | boolean | null): Answer
  /** Is the value of this type */
  isType(gamut: Gamut, type: ExpectedType): Answer
  /** Is the value a number less than `n` */
  isBelow(gamut: Gamut, n: number): Answer
  /** Is the value an empty array, string or object */
  isEmpty(gamut: Gamut): Answer
  /**
   * Would the operator's own `validate` hook refuse what this parameter
   * receives: `maybe` while its value is not known
   */
  refused(parameter: string): Answer
  /**
   * Did the parameter receive anything, given or by default: `maybe` where
   * its null means omitted and a null may arrive
   */
  isSupplied(parameter: string): Answer
  /** `no` if any is, `yes` if all are */
  all(...answers: Answer[]): Answer
  /** `yes` if any is, `no` if all are */
  any(...answers: Answer[]): Answer
  /** `yes` and `no` swapped */
  not(answer: Answer): Answer
  /**
   * Its numbers as one range, an open end an infinity; `undefined` where it
   * holds no number
   */
  span(gamut: Gamut): { min: number; max: number; integer: boolean } | undefined
  /** Its values, where it is one of a few known exactly */
  exactValues(gamut: Gamut): unknown[] | undefined
  /** One element of an array */
  elementOf(gamut: Gamut): Gamut
  /** One value of an object */
  valueOf(gamut: Gamut): Gamut
  /** The length of a string or array: an integer from 0 */
  lengthOf(gamut: Gamut): Gamut
  /** Every value of a type */
  type(type: ExpectedType): Gamut
  /** That one value */
  exactly(value: unknown): Gamut
  /** The numbers in a range, inclusive, either end open */
  range(range: { min?: number; max?: number; integer?: boolean }): Gamut
  /** Anything in any of them */
  union(...gamuts: Gamut[]): Gamut
  /**
   * An array whose every element is in `elements`. Given a `perElement`
   * parameter walked once per element of a known input, those elements'
   * results in order
   */
  arrayOf(elements: Gamut, lengths?: { length?: number; minLength?: number }): Gamut
  /** The empty gamut: nothing at all */
  nothing(): Gamut
}

/**
 * One way an operator's body fails of itself ("The `failures` hook" in
 * docs-dev/v3-specs/v3-operator-coverage.md).
 */
export interface FailureEntry {
  /** The code the error would carry */
  code: FallbackErrorCode
  /** The parameter the failure is about, which the finding names */
  parameter?: string
  /**
   * Whether it happens: the finding's certainty. Omitted: `maybe`, it can
   * happen
   */
  occurs?: Answer
  /** Makes the failure possible, not certain: caps `occurs` at `maybe` */
  may?: true
  /**
   * Only extreme numbers cause it: counted under `strictNumbers` only, and
   * never certain
   */
  overflow?: true
  /** Instance options the failure needs, such as `{ strictDataPaths: true }` */
  options?: Record<string, unknown>
  /** A short reason for the finding's message, such as "'by' is 0" */
  message?: string
}

/**
 * An operator's analysis, from `declareAnalysis` ("Reaching the analysis"
 * in docs-dev/v3-specs/v3-operator-coverage.md): what a node of it returns
 * and how its body fails, given what its parameters receive.
 */
export interface OperatorAnalysis {
  readonly operator: BuiltOperator
  /** What the body returns. Omitted: the declared `returns` */
  readonly gamut?: (params: Record<string, Gamut>, helpers: GamutHelpers) => Gamut
  /**
   * The ways the body fails of itself; a list for one that holds whatever
   * the inputs. Omitted: the operator is external, and may fail whatever
   * its inputs
   */
  readonly failures?:
    | readonly FailureEntry[]
    | ((params: Record<string, Gamut>, helpers: GamutHelpers) => FailureEntry[])
}

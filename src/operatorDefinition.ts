/**
 * The operator-definition shapes ("The definition shape" through "Evaluation
 * modes" in docs-dev/v3-specs/v3-operator-contract.md): the authored input
 * (`OperatorDefinition`), the normalized validated output
 * (`ValidatedOperatorDefinition`, branded and frozen by `defineOperator()`),
 * and the two runtime values the shapes carry — the brand symbol and the
 * `EvaluationData` sentinel.
 *
 * The parameter declaration extends `TypeDeclaration` (src/typeCheck.ts), so
 * a fragment declaration stays byte-compatible with an operator parameter
 * declaration, per the contract.
 */
import type { Constraints, ExpectedType, TypeDeclaration } from './typeCheck'
import type { Severity } from './issues'
import type { ValidateHelpers } from './parse/helpers'
import type { OperatorContext } from './runtimeInterface'
import type { ResolvedParams } from './inference'

/**
 * The delivery-mode vocabulary ("Evaluation modes" in the contract).
 * Contract open Q1 keeps the names provisional — they live in this one union
 * and nowhere else, so a rename is one edit.
 */
export type EvaluationMode =
  'eager' | 'race' | 'lazy' | 'lazyElements' | 'lazyEntries' | 'perElement' | 'structural'

/**
 * The grouping vocabulary ("`category` — the closed vocabulary" in the
 * contract): a closed set of eight, required on every definition. The
 * engine never reads it — it is what a tool building an operator dropdown
 * with sections groups by, which is why it travels on the definition
 * rather than in a hints module keyed by this package's own names. The
 * tuple is the one source: the type derives from it, and so does
 * `defineOperator()`'s membership check.
 */
export const OPERATOR_CATEGORIES = [
  'logic',
  'comparison',
  'math',
  'string',
  'array',
  'data',
  'io',
  'other',
] as const

export type OperatorCategory = (typeof OPERATOR_CATEGORIES)[number]

export type NullPolicyValue = 'propagate' | 'value'

/**
 * The conditional null-policy form ("The conditional null-policy form" in
 * the contract): a function of the definition's single literal-union parameter,
 * called once per union member at registration and compiled to a policy
 * table — never called at evaluation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConditionalNullPolicy = (selectorValue: any) => NullPolicyValue

export type NullPolicy = NullPolicyValue | ConditionalNullPolicy

/**
 * The compiled form of a conditional null policy: one row per member of the
 * selector's literal union, in declaration order. This — never the source
 * function — is what the validated definition carries and what
 * `getOperators()` reports.
 */
export interface CompiledNullPolicy {
  /** The definition's single literal-union parameter. */
  selector: string
  table: { value: string | number | boolean; policy: NullPolicyValue }[]
}

/**
 * The sentinel a parameter may declare as its `default` (contract ledger
 * #13): when the parameter is unsupplied, the body receives the frozen,
 * read-only merged per-evaluation data context in its place. Legal only in
 * `default` position; `get.from` is the holder.
 */
export const EvaluationData: unique symbol = Symbol('fig-tree:EvaluationData')

/**
 * The operator body as the engine calls it: post-everything params in, a
 * value (or a promise of one) out. The authored form is typed from its
 * declarations (`OperatorDefinition.evaluate`); this is the erased shape a
 * validated definition carries.
 */
export type OperatorEvaluate = (
  params: Record<string, unknown>,
  context: OperatorContext
) => unknown

/**
 * One finding from a `validate` hook. The hook classifies and describes; the
 * engine supplies the `code` (`operator-validate`) and the `path` — the
 * named parameter's, where `parameter` names one, else the operator node's —
 * to complete the `Issue` it appends to the stream.
 */
export interface ValidateFinding {
  severity: Severity
  message: string
  /** A declared parameter the finding is about; anchors its path. */
  parameter?: string
}

/**
 * The static validation hook (contract ledger #11). Runs at parse (Phase 3);
 * registration only checks it is a function. The `helpers` toolbox is the
 * frozen primitives object of src/parse/helpers.ts (contract Q7).
 */
export type OperatorValidate = (
  literalParams: Record<string, unknown>,
  helpers: ValidateHelpers
) => ValidateFinding[]

/** A parameter declaration as authored ("Parameter declarations", contract). */
export interface ParameterDeclaration extends TypeDeclaration {
  // Inherited from TypeDeclaration: type?, required?, constraints?
  /** A constant or the `EvaluationData` sentinel. Presence implies optional. */
  default?: unknown
  description?: string
  /** Opaque; engine never reads it. */
  metadata?: Record<string, unknown>
  /** How the engine delivers the value to the body. Default `'eager'`. */
  evaluation?: EvaluationMode
  /** `'perElement'` only: the sibling array parameter iterated over. */
  over?: string
  /**
   * The position is judged by the shared `isTruthy()`; the body receives
   * actual booleans. Implies null policy `'value'` — declaring a conflicting
   * `'propagate'` is a registration error.
   */
  truthiness?: boolean
  /**
   * Legal only where the declared type names `null` (type-driven admission);
   * a type without `null` IS the reject declaration.
   */
  nullPolicy?: NullPolicy
  /**
   * Container parameters only: the policy applied per element (arrays) / per
   * value (objects). Plain vocabulary only — no conditional form.
   */
  elementNullPolicy?: NullPolicyValue
  /**
   * Marks a `…Default` parameter as the engine-side null replacement for the
   * named sibling target(s). Requires `evaluation: 'lazy'`, optional, no
   * `default`.
   */
  replacesNullAt?: readonly string[]
}

/** The `parameters` map of a definition, keyed by parameter name. */
export type ParameterDeclarations = Record<string, ParameterDeclaration>

/**
 * A definition as authored, before it passes through `defineOperator()`.
 * Generic over its own `parameters` so the body's `params` is typed from
 * them (src/inference.ts).
 */
export interface OperatorDefinition<P extends ParameterDeclarations = ParameterDeclarations> {
  /** Shared legality rule + reservation set; collision-checked on registry. */
  name: string
  /** Exactly one, like natives; same legality/collision rules as `name`. */
  alias?: string
  /** Grouping for tooling, from the closed set; never read by the engine. */
  category: OperatorCategory
  description: string
  /** Opaque; engine never reads it; returned verbatim by `getOperators()`. */
  metadata?: Record<string, unknown>
  /** Keyed by parameter name; ordering lives in `positionalParams`. */
  parameters: P
  /**
   * Ordered names; the last entry may be rest-marked (`'...values'`); every
   * entry names a declared parameter. Omitted ⇒ named-face only.
   */
  positionalParams?: readonly string[]
  /**
   * Names the declared `integer` parameter whose resolved value joins the
   * abort composition on `context.signal` (ledger #15; Q5 resolution).
   */
  timeoutParam?: string
  /** The metadata default at the bottom of the `useCache` chain. */
  useCache?: boolean
  /** How caching is keyed when effective `useCache` is true. */
  cache?: 'auto' | 'manual'
  validate?: OperatorValidate
  /** The body, its `params` typed from the declarations above. */
  evaluate: (params: ResolvedParams<P>, context: OperatorContext) => unknown
  /** Declared result type — drives the static feeding-position check. */
  returns?: ExpectedType
}

/**
 * The brand key. The symbol value is internal (never exported from the
 * barrel), so external code can neither forge the property nor satisfy the
 * validated type structurally — `defineOperator()` is the only mint.
 */
export const VALIDATED_OPERATOR: unique symbol = Symbol('fig-tree:validated-operator')

/**
 * A parameter declaration after validation: every documented default filled,
 * `required` computed once, and any conditional null policy replaced by its
 * compiled table.
 */
export interface ValidatedParameter {
  type: ExpectedType
  required: boolean
  /** Present only when authored; may be the `EvaluationData` sentinel. */
  default?: unknown
  description?: string
  metadata?: Record<string, unknown>
  evaluation: EvaluationMode
  truthiness: boolean
  nullPolicy: NullPolicyValue | CompiledNullPolicy
  elementNullPolicy?: NullPolicyValue
  constraints?: Constraints
  over?: string
  replacesNullAt?: string[]
}

/**
 * A definition after `defineOperator()`: branded, deep-frozen, normalized.
 * `metadata` and `default` values are kept by reference and unfrozen —
 * host-owned, opaque.
 */
export interface ValidatedOperatorDefinition {
  readonly [VALIDATED_OPERATOR]: true
  name: string
  alias?: string
  category: OperatorCategory
  description: string
  metadata?: Record<string, unknown>
  parameters: Record<string, ValidatedParameter>
  positionalParams?: string[]
  /** Derived: the rest-marked positional parameter's name, or null. */
  restParam: string | null
  /**
   * Derived: does any parameter reach the body as a handle rather than a
   * value? Only such a node can still have work in flight once its body
   * has settled, so only such a node needs an abort scope of its own.
   */
  deliversLazily: boolean
  /** Normalized `timeoutParam`: the declared name, or null. */
  timeoutParam: string | null
  /** The definition's own default — the bottom of the `useCache` chain. */
  useCache: boolean
  /** How caching is keyed; doubles as the `'manual'` capability flag. */
  cache: 'auto' | 'manual'
  validate?: OperatorValidate
  evaluate: OperatorEvaluate
  returns: ExpectedType
}

/** True when the value is a definition minted by `defineOperator()`. */
export const isValidatedOperator = (input: unknown): input is ValidatedOperatorDefinition =>
  typeof input === 'object' &&
  input !== null &&
  (input as Record<PropertyKey, unknown>)[VALIDATED_OPERATOR] === true

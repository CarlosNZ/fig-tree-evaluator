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
import type { Issue } from './issues'

/**
 * The delivery-mode vocabulary ("Evaluation modes" in the contract).
 * Contract open Q1 keeps the names provisional — they live in this one union
 * and nowhere else, so a rename is one edit.
 */
export type EvaluationMode =
  | 'eager'
  | 'race'
  | 'lazy'
  | 'lazyElements'
  | 'lazyEntries'
  | 'perElement'
  | 'structural'

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
 * The operator body. Loosely typed until Phase 4 lands `OperatorContext` and
 * the resolved-params shapes — the contract's TS-inference stack is deferred
 * until real bodies exist to exercise it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OperatorEvaluate = (params: Record<string, any>, context?: any) => unknown

/**
 * The static validation hook (contract ledger #11). Runs at parse (Phase 3);
 * registration only checks it is a function. The `helpers` toolbox shape is
 * contract open Q7, settled at Phase-3 implementation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OperatorValidate = (literalParams: Record<string, unknown>, helpers: any) => Issue[]

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
  replacesNullAt?: string[]
}

/** A definition as authored, before it passes through `defineOperator()`. */
export interface OperatorDefinition {
  /** Shared legality rule + reservation set; collision-checked on registry. */
  name: string
  /** Exactly one, like natives; same legality/collision rules as `name`. */
  alias?: string
  description: string
  /** Opaque; engine never reads it; returned verbatim by `getOperators()`. */
  metadata?: Record<string, unknown>
  /** Keyed by parameter name; ordering lives in `positionalParams`. */
  parameters: Record<string, ParameterDeclaration>
  /**
   * Ordered names; the last entry may be rest-marked (`'...values'`); every
   * entry names a declared parameter. Omitted ⇒ named-face only.
   */
  positionalParams?: string[]
  /**
   * Names the declared `integer` parameter whose resolved value joins the
   * abort composition on `context.signal` (ledger #15; Q5 resolution).
   */
  timeoutParam?: string
  /** The metadata default at the bottom of the `useCache` chain. */
  useCache?: boolean
  /** How caching is keyed when effective `useCache` is true. */
  cache?: 'auto' | 'manual'
  /** Option blocks the body reads; they arrive frozen on `context.options`. */
  readsOptions?: string[]
  validate?: OperatorValidate
  evaluate: OperatorEvaluate
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
  description: string
  metadata?: Record<string, unknown>
  parameters: Record<string, ValidatedParameter>
  positionalParams?: string[]
  /** Derived: the rest-marked positional parameter's name, or null. */
  restParam: string | null
  /** Normalized `timeoutParam`: the declared name, or null. */
  timeoutParam: string | null
  useCache: boolean
  cache: 'auto' | 'manual'
  readsOptions: string[]
  validate?: OperatorValidate
  evaluate: OperatorEvaluate
  returns: ExpectedType
}

/** True when the value is a definition minted by `defineOperator()`. */
export const isValidatedOperator = (input: unknown): input is ValidatedOperatorDefinition =>
  typeof input === 'object' &&
  input !== null &&
  (input as Record<PropertyKey, unknown>)[VALIDATED_OPERATOR] === true

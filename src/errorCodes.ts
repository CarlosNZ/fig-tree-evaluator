/**
 * Stable, machine-readable classifiers shared by `FigTreeError.code`,
 * `Issue.code` and `OperatorFailure.code` ("The code vocabulary" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * `ErrorCodes` is the whole known vocabulary, one authoring example per code
 * so it stays self-explaining, grouped by when a code can occur. The first
 * group is what a `fallback` can catch. A code that occurs in more than one
 * group is listed in the first that applies, with the others noted.
 *
 * The code types stay open, since a host operator throws codes of its own.
 * Their `string & {}` member accepts any string without absorbing the known
 * codes, so editors still offer those; it narrows nothing.
 *
 * The "sigil" is the leading `$` that marks a key or string as special in
 * FigTree; the "identifier" is the name after it — an operator, alias or
 * fragment in key position (`$plus`), a reference namespace in string
 * position (`$data.…`).
 */
export const ErrorCodes = {
  // ── Evaluation failures: what a fallback catches ─────────────────────
  typeCheck: 'type-check', // { $plus: ['x', 2] } — a string where a number is required; also a static error on a literal, and a registration issue
  operatorFailure: 'operator-failure', // an $http request 500s, or an operator body throws
  // one node's own `timeout` parameter expires (ledger #15). Distinct
  // from `timeout`, which is the whole-evaluation kill switch: this one
  // is an ORDINARY failure the node's `fallback` catches
  requestTimeout: 'request-timeout',
  nonFiniteResult: 'non-finite-result', // { $divide: [1, 0] } — a body produced NaN / ±Infinity
  escapedHandle: 'escaped-handle', // a body returned a LazyValue / PerElement handle instead of demanding it — a host operator's bug, but an ordinary failure
  emptyAggregate: 'empty-aggregate', // { $plus: [] } with no mode pinned, { $min: [] } — no identity to return
  missingDataPath: 'missing-data-path', // a strictDataPaths miss; also the sample-data warning: a $data path absent from the supplied sample
  missingRequired: 'missing-required', // { $if: [true] } — a required parameter not supplied: a static error, and a runtime one for a dynamic-mode fragment call

  // ── The kill switch: cuts through every fallback ─────────────────────
  // evaluation exceeds the `timeout` deadline. No fallback catches it, but
  // a shielded one answers it, so it is a fallback code too
  timeout: 'timeout',
  aborted: 'aborted', // the caller's AbortSignal fired

  // ── Static errors: evaluate() throws the first, before anything runs ──
  malformedNode: 'malformed-node', // { operator: 'plus', fragment: 'f' } — a node-grammar hard error
  unknownOperator: 'unknown-operator', // { operator: 'flibble' } — names no registered operator; also an operatorDefaults key naming none
  unknownFragment: 'unknown-fragment', // { fragment: 'flibble' } — names no registered fragment
  unknownNodeKey: 'unknown-node-key', // { $plus: {...}, colour: 'red' } — 'colour' isn't a declared property
  unrecognizedIdentifier: 'unrecognized-identifier', // { $flibble: 1 } — the name after the sigil matches no operator/fragment/namespace (an error on a key, a warning on a string or a branch label)
  positionalArity: 'positional-arity', // { $not: [1, 2] } — surplus positional arguments
  invalidVars: 'invalid-vars', // { vars: [1, 2] } — the vars shape rule (loud)
  invalidReference: 'invalid-reference', // drilled '$index' — a recognized namespace used illegally
  invalidAs: 'invalid-as', // as: '$data.x' (dynamic), as: 'data' (reserved), nested as collisions
  unresolvedVar: 'unresolved-var', // '$vars.foo' referenced but 'foo' isn't defined in scope
  unresolvedParam: 'unresolved-param', // '$params.x' outside a fragment body, or naming an undeclared parameter
  unresolvedBinding: 'unresolved-binding', // '$element' outside an iterator's each subtree
  bareVars: 'bare-vars', // '$vars' with no name — a scope is a chain, not a value
  varCycle: 'var-cycle', // vars: { a: '$vars.b', b: '$vars.a' }
  depthCeiling: 'depth-ceiling', // input nests deeper than the engine's built-in walk ceiling (option-independent)
  maxDepthExceeded: 'max-depth', // the expression nests deeper than options.maxDepth
  maxNodesExceeded: 'max-nodes', // the expression holds more nodes than options.maxNodes
  returnsMismatch: 'returns-mismatch', // a boolean-returning node feeding a number-typed parameter
  operatorValidate: 'operator-validate', // an operator validate-hook finding (regex pattern compile, …); a hook sets its own severity

  // ── Static warnings: validate() and trace report them, nothing throws ──
  uselessModifier: 'useless-modifier', // fallback / vars / noCache on `literal`, a redundant or dead noCache — legal but dead
  unreferencedVar: 'unreferenced-var', // a vars block declaring names nothing references
  shadowedVar: 'shadowed-var', // an inner vars block redeclaring an outer name
  deadBinding: 'dead-binding', // an `each` referencing none of its own iterator's bindings
  fallbackMismatch: 'fallback-mismatch', // { $round: { value: { $divide: […], fallback: 'n/a' } } } — a fallback its position can never take
  // buildString's literal-face token checks
  unboundToken: 'unbound-token', // { $buildString: ['Hi %2', 'there'] } — a token with nothing to bind to
  unusedSubstitution: 'unused-substitution', // a literal substitution the literal template never names
  inertReferenceToken: 'inert-reference-token', // {{$data.x}} beside array or dynamic substitutions — not recognized

  // ── Registration and options ──────────────────────────────────────────
  // defineOperator(), new FigTree(), updateOptions() and a call's own options
  invalidDefinition: 'invalid-definition', // defineOperator() throw umbrella; also the generic malformed-definition issue
  invalidName: 'invalid-name', // 'foo.bar' — a name violating the shared legality rule; also a static error for a var name
  reservedName: 'reserved-name', // an operator named 'data', a parameter named 'fallback'
  invalidNullPolicy: 'invalid-null-policy', // nullPolicy on a null-free type, a bad conditional policy, truthiness conflicts
  duplicateOperator: 'duplicate-operator', // two registrations claiming one name/alias
  fragmentCycle: 'fragment-cycle', // a fragment transitively reaching itself — recursion is banned
  invalidOptions: 'invalid-options', // new FigTree() throw umbrella; also generic bad-options issues, and a call's own bad options
} as const

type KnownErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

/**
 * Any code a `FigTreeError` or an `Issue` carries: the known vocabulary,
 * open to a host operator's own codes.
 */
export type FigTreeErrorCode = KnownErrorCode | (string & {})

/**
 * Every code a fallback can receive from the engine or the package's own
 * operators: the evaluation failures, and `timeout`, which a fallback meets
 * only through timeout shielding. Closed, so a test can hold the engine to
 * it.
 */
export type KnownFallbackErrorCode = (typeof ErrorCodes)[
  | 'typeCheck'
  | 'operatorFailure'
  | 'requestTimeout'
  | 'nonFiniteResult'
  | 'escapedHandle'
  | 'emptyAggregate'
  | 'missingDataPath'
  | 'missingRequired'
  | 'timeout']

/**
 * A code a fallback can receive: the known ones, open to a host operator's
 * own codes, which reach a fallback unchanged.
 */
export type FallbackErrorCode = KnownFallbackErrorCode | (string & {})

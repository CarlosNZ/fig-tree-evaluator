/**
 * Stable, machine-readable classifiers shared by `FigTreeError.code` and
 * `Issue.code` ("FigTreeError" and "validate" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * The vocabulary is deliberately an open `string`, not a closed union: nearly
 * every later build phase introduces new codes, and an open type lets them be
 * added here additively without a breaking type change. `ErrorCodes` documents
 * the known set — the first cut lifted from the spec — with one authoring
 * example per code so the vocabulary stays self-explaining.
 *
 * The "sigil" is the leading `$` that marks a key or string as special in
 * FigTree; the "identifier" is the name after it — an operator, alias or
 * fragment in key position (`$plus`), a reference namespace in string
 * position (`$data.…`).
 */
export type FigTreeErrorCode = string

export const ErrorCodes = {
  unknownOperator: 'unknown-operator', // { operator: 'flibble' } — names no registered operator
  typeCheck: 'type-check', // { $plus: ['x', 2] } — a string where a number is required
  operatorFailure: 'operator-failure', // an $http request 500s, or an operator body throws
  timeout: 'timeout', // evaluation exceeds the `timeout` deadline
  aborted: 'aborted', // the caller's AbortSignal fired
  unknownNodeKey: 'unknown-node-key', // { $plus: {...}, colour: 'red' } — 'colour' isn't a declared property
  unresolvedVar: 'unresolved-var', // '$vars.foo' referenced but 'foo' isn't defined in scope
  unrecognizedIdentifier: 'unrecognized-identifier', // { $flibble: 1 } — the name after the sigil matches no operator/fragment/namespace (warning)

  // Phase 3 — parse / static validation
  malformedNode: 'malformed-node', // { operator: 'plus', fragment: 'f' } — a node-grammar hard error
  unknownFragment: 'unknown-fragment', // { fragment: 'flibble' } — names no registered fragment
  positionalArity: 'positional-arity', // { $not: [1, 2] } — surplus positional arguments
  invalidVars: 'invalid-vars', // { vars: [1, 2] } — the vars shape rule (loud)
  invalidReference: 'invalid-reference', // bare '$vars', drilled '$index' — a recognized namespace used illegally
  uselessModifier: 'useless-modifier', // fallback / vars / useCache on `literal` — legal but dead (warning)
  unreferencedVar: 'unreferenced-var', // a vars block declaring names nothing references (warning)
  missingRequired: 'missing-required', // { $if: [true] } — a required parameter not supplied
  unresolvedParam: 'unresolved-param', // '$params.x' outside a fragment body, or naming an undeclared parameter
  unresolvedBinding: 'unresolved-binding', // '$element' outside an iterator's each subtree
  invalidAs: 'invalid-as', // as: '$data.x' (dynamic), as: 'data' (reserved), nested as collisions
  maxDepthExceeded: 'max-depth', // the expression nests deeper than options.maxDepth
  maxNodesExceeded: 'max-nodes', // the expression holds more nodes than options.maxNodes
  returnsMismatch: 'returns-mismatch', // a boolean-returning node feeding a number-typed parameter
  operatorValidate: 'operator-validate', // an operator validate-hook finding (regex pattern compile, …)
  missingDataPath: 'missing-data-path', // sample-data check: a $data path absent from the supplied sample (warning)
  shadowedVar: 'shadowed-var', // an inner vars block redeclaring an outer name (warning)
  varCycle: 'var-cycle', // vars: { a: '$vars.b', b: '$vars.a' }

  // Phase 2 — registration (defineOperator / registry / construction)
  invalidDefinition: 'invalid-definition', // defineOperator() throw umbrella; also the generic malformed-definition issue
  invalidName: 'invalid-name', // 'foo.bar' — a name violating the shared legality rule
  reservedName: 'reserved-name', // an operator named 'data', a parameter named 'fallback'
  invalidNullPolicy: 'invalid-null-policy', // nullPolicy on a null-free type, a bad conditional policy, truthiness conflicts
  duplicateOperator: 'duplicate-operator', // two registrations claiming one name/alias
  invalidOptions: 'invalid-options', // new FigTree() throw umbrella; also generic bad-options issues
} as const

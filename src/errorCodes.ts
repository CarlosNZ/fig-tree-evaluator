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

  // Phase 2 — registration (defineOperator / registry / construction)
  invalidDefinition: 'invalid-definition', // defineOperator() throw umbrella; also the generic malformed-definition issue
  invalidName: 'invalid-name', // 'foo.bar' — a name violating the shared legality rule
  reservedName: 'reserved-name', // an operator named 'data', a parameter named 'fallback'
  invalidNullPolicy: 'invalid-null-policy', // nullPolicy on a null-free type, a bad conditional policy, truthiness conflicts
  duplicateOperator: 'duplicate-operator', // two registrations claiming one name/alias
  invalidOptions: 'invalid-options', // new FigTree() throw umbrella; also generic bad-options issues
} as const

/**
 * Phase 14.1 — the root entry's value exports ("The root entry" in
 * docs-dev/v3-specs/v3-packaging.md).
 *
 * Everything exported is contract, so the root exports exactly the spec's
 * inventory. The list is exact rather than a floor: an export nobody listed
 * fails here, and so does any v2 export the disposition table deletes, if
 * it ever comes back — without this file having to name one.
 */
import * as root from '../src'

/** The value inventory, row by row as the spec's table has it. */
const SPEC_VALUE_EXPORTS = [
  'FigTree',
  'defineOperator',
  'coreOperators',
  'httpOperators',
  'sqlOperators',
  'FetchClient',
  'AxiosClient',
  'PostgresConnection',
  'SQLiteConnection',
  'FigTreeError',
  'isFigTreeError',
  'ErrorCodes',
  'OperatorFailure',
  'isOperatorFailure',
  'isTruthy',
  'compareValues',
  'renderText',
  'resolvePath',
  'deepEqual',
  'parsePath',
  'WILDCARD',
  'ARRAY',
  'OBJECT',
  'OPERATOR_CATEGORIES',
  'inspect',
  'EvaluationData',
  'version',
]

test('the root exports exactly the spec’s value inventory', () => {
  expect(Object.keys(root).sort()).toEqual([...SPEC_VALUE_EXPORTS].sort())
})

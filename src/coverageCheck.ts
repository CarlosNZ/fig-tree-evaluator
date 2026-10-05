/**
 * `defineOperator()`'s check of a definition's `coverage` field ("Where the
 * rules live" in docs-dev/v3-specs/v3-fallback-coverage.md). The field is
 * read only by `./authoring`, but a malformed one is the host's mistake,
 * so it is refused at registration like any other.
 */
import { ErrorCodes } from './errorCodes'
import { isExpectedType } from './typeCheck'
import { isPlainObject } from './utils'

type Report = (code: string, message: string, path: (string | number)[]) => void

const COVERAGE_KEYS = new Set(['failures', 'external'])
const RULE_KEYS = new Set(['code', 'parameter', 'when', 'options', 'may', 'overflow'])

/** Whether a value is a test of the coverage vocabulary. */
const isTest = (test: unknown): boolean => {
  if (test === null || ['string', 'number', 'boolean'].includes(typeof test)) return true
  if (!isPlainObject(test)) return false
  const keys = Object.keys(test)
  if (keys.length !== 1) return false
  const value = test[keys[0]]
  switch (keys[0]) {
    case 'type':
      return isExpectedType(value)
    case 'below':
      return typeof value === 'number' && Number.isFinite(value)
    case 'empty':
    case 'invalid':
      return value === true
    case 'supplied':
      return typeof value === 'boolean'
    case 'some':
    case 'not':
      return isTest(value)
    default:
      return false
  }
}

export const checkCoverage = (
  coverage: unknown,
  parameters: Record<string, unknown>,
  report: Report
): void => {
  const fail = (message: string, ...path: (string | number)[]) =>
    report(ErrorCodes.invalidDefinition, message, ['coverage', ...path])
  if (!isPlainObject(coverage)) return fail("'coverage' must be a plain object")
  for (const key of Object.keys(coverage))
    if (!COVERAGE_KEYS.has(key)) fail(`'${key}' is not a coverage field`, key)
  const { failures, external } = coverage
  if (external !== undefined && external !== true)
    fail("'external' must be the literal true", 'external')
  if (failures === undefined) return
  if (!Array.isArray(failures)) return fail("'failures' must be an array of rules", 'failures')
  if (external === true)
    fail("an external operator declares no 'failures': it may fail whatever its inputs", 'failures')
  const declared = (name: unknown) => typeof name === 'string' && Object.hasOwn(parameters, name)
  failures.forEach((rule: unknown, index) => {
    const at = (...path: (string | number)[]) => ['failures', index, ...path]
    if (!isPlainObject(rule)) return fail('a rule must be a plain object', ...at())
    for (const key of Object.keys(rule))
      if (!RULE_KEYS.has(key)) fail(`'${key}' is not a rule field`, ...at(key))
    if (typeof rule.code !== 'string' || rule.code === '')
      fail("a rule's 'code' must be a non-empty string", ...at('code'))
    if (rule.parameter !== undefined && !declared(rule.parameter))
      fail(`'parameter' names no declared parameter`, ...at('parameter'))
    if (rule.when !== undefined) {
      if (!isPlainObject(rule.when)) fail("'when' must be an object of tests", ...at('when'))
      else
        for (const [name, test] of Object.entries(rule.when)) {
          if (!declared(name)) fail(`'${name}' is not a declared parameter`, ...at('when', name))
          else if (!isTest(test)) fail(`the test on '${name}' is malformed`, ...at('when', name))
        }
    }
    if (rule.options !== undefined && !isPlainObject(rule.options))
      fail("'options' must be a plain object", ...at('options'))
    for (const flag of ['may', 'overflow'] as const)
      if (rule[flag] !== undefined && rule[flag] !== true)
        fail(`'${flag}' must be the literal true`, ...at(flag))
  })
}

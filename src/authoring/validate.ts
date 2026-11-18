/**
 * `validate()` ("validate() — the process" in
 * docs-dev/v3-specs/v3-evaluator-methods.md): the full static-issue report.
 * It lives in `./authoring`, not on the instance, because it exists for
 * whoever is fixing an expression, and so does its did-you-mean, which
 * only this compile computes ("Suggestions are validate()'s alone" there).
 */
import { compileWithRegistry, viewInstance, withCallOptions } from '../FigTree'
import { FigTreeError } from '../FigTreeError'
import { ErrorCodes } from '../errorCodes'
import { validationIssues } from '../validation'
import type { StaticCheckContext } from '../compile'
import type { ValidationResult } from '../issues'
import type { CallOptions, ValidateOptions } from '../options'
import { nearestName } from './nearestName'

/**
 * Every static issue in an expression, against an instance's registry and
 * options. Synchronous, and never throws on expression content — even hard
 * grammar errors come back as error-severity issues. Throws only on misuse:
 * something other than a `FigTree`, a per-call option that is instance
 * configuration, or a `params` that is not a list of names. It takes the
 * same per-call shape as `evaluate()`, of which only `data` — the sample
 * data for the missing-path check — bears on a static report, plus
 * `params` of its own: the declared parameter names of a fragment body, so
 * the body checks as it would at registration.
 *
 * It compiles fresh, never through the compile cache, so its report always
 * costs a compile and the cache holds only what evaluation asked for. That
 * is also what lets its compile take the suggester: no artifact it makes
 * can answer an evaluation.
 */
export const validate = (
  fig: unknown,
  expression: unknown,
  options?: ValidateOptions
): ValidationResult => {
  const instance = viewInstance(fig)
  if (instance === undefined) throw new TypeError('validate() takes a FigTree instance')
  let call: CallOptions | undefined = options
  const context: StaticCheckContext = { suggest: nearestName }
  if (options?.params !== undefined) {
    const { params, ...rest } = options
    call = rest
    context.fragmentParams = paramNames(params)
  }
  const effective =
    call === undefined ? instance.evaluation : withCallOptions(instance.evaluation, call)
  const artifact = compileWithRegistry(expression, instance.registry, context)
  const issues = validationIssues(artifact, effective, (sequenced) => sequenced.issue)
  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
  }
}

/** The `params` option as the static checks take it, refused unless names. */
const paramNames = (params: unknown): ReadonlySet<string> => {
  if (!Array.isArray(params) || params.some((name) => typeof name !== 'string'))
    throw new FigTreeError({
      code: ErrorCodes.invalidOptions,
      message: "'params' must be an array of parameter names",
      path: [],
    })
  return new Set(params)
}

/**
 * `declareAnalysis`, a host's one door to an operator's analysis
 * ("Reaching the analysis" in docs-dev/v3-specs/v3-operator-coverage.md),
 * and the match of a `fallbackCoverage` call's analyses to its instance's
 * operators.
 * Nothing goes on the definition: a field there would ship analysis code
 * to every consumer of the operator.
 */
import { FigTreeError } from '../FigTreeError'
import { ErrorCodes } from '../errorCodes'
import { coreOperators } from '../operators'
import { isValidatedOperator } from '../operatorDefinition'
import { isPlainObject } from '../utils'
import type { BuiltOperator, OperatorAnalysis } from '../authoringTypes'
import type { OperatorRegistry } from '../registry'
import type { ValidatedOperatorDefinition } from '../operatorDefinition'

/** Every analysis made here, core's included. */
const declared = new WeakSet<OperatorAnalysis>()

const HOOKS = new Set(['gamut', 'failures'])

const refuse = (message: string): FigTreeError =>
  new FigTreeError({ code: ErrorCodes.invalidDefinition, message, path: [] })

/**
 * An operator's analysis for `fallbackCoverage`: what a node of it returns
 * and how its body fails, given what its parameters receive. The hooks are
 * checked for their kind only: a literal is nowhere to validate, and
 * calling a hook on made-up inputs would prove nothing. A core operator's
 * analysis is built in, so it takes none.
 */
export const declareAnalysis = (
  operator: BuiltOperator,
  hooks: Pick<OperatorAnalysis, 'gamut' | 'failures'>
): OperatorAnalysis => {
  if (!isValidatedOperator(operator))
    throw refuse('declareAnalysis() takes an operator built by defineOperator()')
  if (coreOperators.includes(operator))
    throw refuse(`'${operator.name}' is a core operator, whose analysis is built in`)
  return analysisFrom(operator, hooks)
}

/**
 * An analysis of a built operator, core or not: `declareAnalysis` past its
 * refusal of a core operator, which is how ./core.ts declares core's.
 */
export const analysisFrom = (
  operator: ValidatedOperatorDefinition,
  hooks: Pick<OperatorAnalysis, 'gamut' | 'failures'>
): OperatorAnalysis => {
  const name = operator.name
  if (!isPlainObject(hooks)) throw refuse(`the analysis of '${name}' must be a plain object`)
  for (const key of Object.keys(hooks))
    if (!HOOKS.has(key)) throw refuse(`'${key}' is not an analysis hook of '${name}'`)
  const { gamut, failures } = hooks
  if (gamut === undefined && failures === undefined)
    throw refuse(
      `the analysis of '${name}' declares no hook: without one, it is external and returns its 'returns', as an undeclared operator is`
    )
  if (gamut !== undefined && typeof gamut !== 'function')
    throw refuse(`'gamut' of '${name}' must be a function`)
  if (failures !== undefined && typeof failures !== 'function' && !Array.isArray(failures))
    throw refuse(`'failures' of '${name}' must be a function or a list of entries`)
  const analysis: OperatorAnalysis = Object.freeze({
    operator,
    ...(gamut !== undefined ? { gamut } : {}),
    ...(failures !== undefined ? { failures } : {}),
  })
  declared.add(analysis)
  return analysis
}

/**
 * A call's analyses, by the definition each declares. Each entry is an
 * analysis or a list of them, flattened one level, as the constructor's
 * `operators` are. An analysis of an operator the instance does not
 * register is ignored: without it that operator would be external, so
 * leaving one out can only add findings, never hide a failure, and an
 * operator `operatorSet({ replace })` swaps out is a different definition.
 * The same analysis twice is one; two different analyses of one operator
 * are a mistake, since one would silently win.
 */
export const analysesFor = (
  entries: unknown,
  registry: OperatorRegistry
): Map<ValidatedOperatorDefinition, OperatorAnalysis> => {
  const analyses = new Map<ValidatedOperatorDefinition, OperatorAnalysis>()
  if (entries === undefined) return analyses
  const fail = (message: string) =>
    new FigTreeError({ code: ErrorCodes.invalidOptions, message, path: [] })
  const shape = 'an array of analyses from declareAnalysis(), or of lists of them'
  if (!Array.isArray(entries)) throw fail(`'analyses' must be ${shape}`)
  const registered = new Set([...registry.operators.values()].map((entry) => entry.definition))
  const add = (analysis: unknown, at: string) => {
    if (!declared.has(analysis as OperatorAnalysis))
      throw fail(`${at} is not an analysis: build it with declareAnalysis()`)
    const operator = (analysis as OperatorAnalysis).operator as ValidatedOperatorDefinition
    if (!registered.has(operator)) return
    const earlier = analyses.get(operator)
    if (earlier !== undefined && earlier !== analysis)
      throw fail(`${at} is a second, different analysis of '${operator.name}'`)
    analyses.set(operator, analysis as OperatorAnalysis)
  }
  entries.forEach((entry: unknown, index) => {
    if (Array.isArray(entry))
      entry.forEach((analysis: unknown, inner) => add(analysis, `'analyses[${index}][${inner}]'`))
    else add(entry, `'analyses[${index}]'`)
  })
  return analyses
}

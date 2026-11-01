/**
 * `declareAnalysis`, the one door to an operator's analysis ("Reaching the
 * analysis" in docs-dev/v3-specs/v3-operator-coverage.md), and the match
 * of a `fallbackCoverage` call's declarations to its instance's operators.
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

/** Every analysis `declareAnalysis` has made. */
const declared = new WeakSet<OperatorAnalysis>()

const HOOKS = new Set(['gamut', 'failures'])

const refuse = (message: string): FigTreeError =>
  new FigTreeError({ code: ErrorCodes.invalidDefinition, message, path: [] })

/**
 * An operator's analysis for `fallbackCoverage`: what a node of it returns
 * and how its body fails, given what its parameters receive. The hooks are
 * checked for their kind only: a literal is nowhere to validate, and
 * calling a hook on made-up inputs would prove nothing.
 */
export const declareAnalysis = (
  operator: BuiltOperator,
  hooks: Pick<OperatorAnalysis, 'gamut' | 'failures'>
): OperatorAnalysis => {
  if (!isValidatedOperator(operator))
    throw refuse('declareAnalysis() takes an operator built by defineOperator()')
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
 * A call's declarations, by the definition each declares. Each must be one
 * of the instance's own operators, by identity, and declared once: a
 * declaration nothing reads, or a second that one of the two would
 * silently override, is a mistake. Core's analyses are built in.
 */
export const analysesFor = (
  operators: unknown,
  registry: OperatorRegistry
): Map<ValidatedOperatorDefinition, OperatorAnalysis> => {
  const analyses = new Map<ValidatedOperatorDefinition, OperatorAnalysis>()
  if (operators === undefined) return analyses
  const fail = (message: string) =>
    new FigTreeError({ code: ErrorCodes.invalidOptions, message, path: [] })
  if (!Array.isArray(operators))
    throw fail("'operators' must be an array of analyses from declareAnalysis()")
  const registered = new Set([...registry.operators.values()].map((entry) => entry.definition))
  const core = new Set<unknown>(coreOperators)
  operators.forEach((analysis: unknown, index) => {
    const at = `'operators[${index}]'`
    if (!declared.has(analysis as OperatorAnalysis))
      throw fail(`${at} is not an analysis: build it with declareAnalysis()`)
    const operator = (analysis as OperatorAnalysis).operator as ValidatedOperatorDefinition
    if (core.has(operator))
      throw fail(`${at} declares '${operator.name}', a core operator, whose analysis is built in`)
    if (!registered.has(operator))
      throw fail(`${at} declares '${operator.name}', which this instance does not register`)
    if (analyses.has(operator)) throw fail(`${at} declares '${operator.name}' a second time`)
    analyses.set(operator, analysis as OperatorAnalysis)
  })
  return analyses
}

import { parseChildren } from '../AND/operator'
import { getTypeCheckInput } from '../_operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluateMethod, OperatorObject } from '../../types'
import operatorData, { propertyAliases } from './data'

// const aliasExtensions = [{ '>=': { strict: false } }] // To-do - Issue #22

const evaluate: EvaluateMethod = async (expression, config) => {
  const [values, strict = true] = (await evaluateArray(
    [expression.values, expression.strict],
    config
  )) as [(string | number)[], boolean]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { values, strict }))

  if (values.length < 2) throw new Error('- Not enough values provided')

  const [first, second] = values

  if (first === second && !strict) return true

  return first > second
}

export const GREATER_THAN: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}

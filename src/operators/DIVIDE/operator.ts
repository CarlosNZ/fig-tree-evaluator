import { parseChildren } from '../AND/operator'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { OperatorObject, EvaluateMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [values, dividend, divisor, output] = (await evaluateArray(
    [expression.values, expression.dividend, expression.divisor, expression.output],
    config
  )) as [[number, number], number, number, 'quotient' | 'remainder']

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, { values, dividend, divisor, output })
  )

  const vals = values ?? [dividend, divisor].filter((e) => e !== undefined)

  if (vals.length < 2) throw new Error('- Not enough values provided')
  if (vals.some((e) => typeof e !== 'number')) throw new Error('- Not all values are numbers')
  if (vals[1] === 0) throw new Error('Division by zero!')

  switch (output) {
    case 'quotient':
      return Math.floor(vals[0] / vals[1])
    case 'remainder':
      return vals[0] % vals[1]
    default:
      return vals[0] / vals[1]
  }
}

export const DIVIDE: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}

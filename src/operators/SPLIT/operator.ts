import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import { OperatorObject, EvaluatorNode, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const DEFAULT_DELIMITER = ' '

// Allow common whitespace escape sequences to be expressed literally in the
// delimiter (e.g. a `\n` typed into an editor field), since single-line inputs
// can't hold real control characters. A genuine control character has no
// backslash to replace, so it passes through untouched.
const unescapeDelimiter = (delimiter: string) =>
  delimiter.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')

const evaluate: EvaluateMethod = async (expression, config) => {
  const [value, delimiter, trimWhiteSpace, excludeTrailing] = (await evaluateArray(
    [
      expression.value,
      expression.delimiter ?? DEFAULT_DELIMITER,
      expression.trimWhiteSpace ?? true,
      expression.excludeTrailing ?? true,
    ],
    config
  )) as [string, string, boolean, boolean]

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, {
      value,
      delimiter,
      trimWhiteSpace,
      excludeTrailing,
    })
  )

  let splitValues = value.split(unescapeDelimiter(delimiter))
  if (trimWhiteSpace) splitValues = splitValues.map((val) => val.trim())
  if (excludeTrailing && splitValues[splitValues.length - 1] === '') splitValues.pop()

  return splitValues
}

const parseChildren: ParseChildrenMethod = (expression) => {
  const [value, delimiter = DEFAULT_DELIMITER] = expression.children as EvaluatorNode[]
  return { ...expression, value, delimiter }
}

export const SPLIT: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}

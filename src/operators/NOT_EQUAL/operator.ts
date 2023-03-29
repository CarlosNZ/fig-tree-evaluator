import { parseChildren, BasicExtendedNode } from '../AND/operator'
import { evaluateArray, getTypeCheckInput } from '../_operatorUtils'
import { FigTreeConfig, OperatorObject } from '../../types'
import { dequal } from 'dequal/lite'

import operatorData, { requiredProperties, propertyAliases } from './data'

const evaluate = async (
  expression: BasicExtendedNode & { nullEqualsUndefined?: boolean },
  config: FigTreeConfig
): Promise<boolean> => {
  const [values, nullMatch] = (await evaluateArray(
    [expression.values, expression.nullEqualsUndefined],
    config
  )) as [boolean[], boolean]

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, { values, nullEqualsUndefined: nullMatch })
  )

  const nullEqualsUndefined =
    nullMatch !== undefined
      ? nullMatch
      : config.options?.nullEqualsUndefined !== undefined
      ? config.options.nullEqualsUndefined
      : false

  if (nullEqualsUndefined && (values[0] === null || values[0] === undefined))
    return values.some((value) => value === null && value === undefined)

  return values.some((val) => !dequal(val, values[0]))
}

export const NOT_EQUAL: OperatorObject = {
  requiredProperties,
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}

import { parseChildren, BasicExtendedNode } from './logicalAnd'
import { evaluateArray } from './_operatorUtils'
import { FigTreeConfig, OperatorObject } from '../types'
import { dequal } from 'dequal/lite'

const requiredProperties = ['values'] as const
const operatorAliases = ['=', 'eq', 'equal', 'equals']
const propertyAliases = {}

const evaluate = async (
  expression: BasicExtendedNode & { nullEqualsUndefined?: boolean },
  config: FigTreeConfig
): Promise<boolean> => {
  const [values, nullMatch] = (await evaluateArray(
    [expression.values, expression.nullEqualsUndefined],
    config
  )) as [boolean[], boolean]

  config.typeChecker({ name: 'values', value: values, expectedType: 'array' })

  const nullEqualsUndefined =
    nullMatch !== undefined
      ? nullMatch
      : config.options?.nullEqualsUndefined !== undefined
      ? config.options.nullEqualsUndefined
      : false

  if (nullEqualsUndefined && (values[0] === null || values[0] === undefined))
    return values.every((value) => value === null || value === undefined)

  return values.every((value) => dequal(value, values[0]))
}

export const EQUAL: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}

import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Multiply several numerical values together'
const aliases = ['*', 'x', 'multiply', 'times']
const parameters: Parameter[] = [
  {
    name: 'values',
    description: 'Array of values whose product will be calculated',
    aliases: [],
    required: true,
    type: 'array',
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

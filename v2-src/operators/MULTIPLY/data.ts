import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'Multiply several numerical values together'
const aliases = ['*', 'x', 'multiply', 'times']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'values',
    description: 'Array of values whose product will be calculated',
    aliases: [],
    required: true,
    type: 'array',
    default: [5, 5],
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

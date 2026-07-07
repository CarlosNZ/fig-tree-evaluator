import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'Count elements in an array'
const aliases = ['count', 'length']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'values',
    description: 'An array to count',
    aliases: [],
    required: true,
    type: 'array',
    default: [1, 2, 3, 4, 5],
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'Add, concatenate or merge multiple values'
const aliases = ['+', 'plus', 'add', 'concat', 'join', 'merge']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'values',
    description: 'Array of values to check to add together',
    aliases: [],
    required: true,
    type: 'array',
    default: [1, 2, 3],
  },
  {
    name: 'type',
    description: 'Data type to coerce input values to before addition',
    aliases: [],
    required: false,
    type: { literal: ['string', 'array', 'number', 'boolean', 'bool'] },
    default: 'string',
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

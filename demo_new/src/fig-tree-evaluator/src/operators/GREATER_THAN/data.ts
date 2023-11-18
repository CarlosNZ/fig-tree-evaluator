import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'Test if a value is greater than (or equal to) another value'
const aliases = ['>', 'greaterThan', 'higher', 'larger']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'values',
    description: 'Array of values - 1st element will be compared to the second',
    aliases: [],
    required: true,
    type: 'array',
    default: [10, 9],
  },
  {
    name: 'strict',
    description: 'Whether value must be strictly greater than (i.e. not equal) (default: false)',
    aliases: [],
    required: false,
    type: 'boolean',
    default: false,
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

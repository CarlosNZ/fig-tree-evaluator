import { getRequiredProperties, getPropertyAliases } from '../_operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Test if a value is greater than (or equal to) another value'
const aliases = ['>', 'greaterThan', 'higher', 'larger']
const parameters: Parameter[] = [
  {
    name: 'values',
    description: 'Array of values - 1st element will be compared to the second',
    aliases: [],
    required: true,
    type: 'array',
  },
  {
    name: 'strict',
    description: 'Whether value must be strictly greater than (i.e. not equal) (default: false)',
    aliases: [],
    required: false,
    type: 'boolean',
  },
]

export const requiredProperties = getRequiredProperties(parameters)
export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

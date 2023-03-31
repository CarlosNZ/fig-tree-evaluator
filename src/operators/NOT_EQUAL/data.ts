import { getPropertyAliases } from '../_operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Test if any values are different'
const aliases = ['!=', '!', 'ne', 'notEqual']
const parameters: Parameter[] = [
  {
    name: 'values',
    description: 'Array of values to check for inequality',
    aliases: [],
    required: true,
    type: 'array',
  },
  {
    name: 'nullEqualsUndefined',
    description: 'Whether a null value should be considered equal to an undefined value',
    aliases: [],
    required: false,
    type: 'boolean',
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

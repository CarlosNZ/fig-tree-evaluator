import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Test multiple values are equal'
const aliases = ['=', 'eq', 'equal', 'equals']
const parameters: Parameter[] = [
  {
    name: 'values',
    description: 'Array of values to check for equality',
    aliases: [],
    required: true,
    type: 'array',
  },
  {
    name: 'caseInsensitive',
    description: 'If the values are strings, ignore the case (default: false)',
    aliases: [],
    required: false,
    type: 'boolean',
  },
  {
    name: 'nullEqualsUndefined',
    description:
      'Whether a null value should be considered equal to an undefined value (default: false)',
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

import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, Parameter } from '../../types'

const aliases = ['buildObject', 'build', 'object']
const description = 'Construct an object using objects defining keys and values'
const parameters: Parameter[] = [
  {
    name: 'properties',
    description: 'An array of objects, each with a "key" property and a "value" property',
    aliases: ['values', 'keyValPairs', 'keyValuePairs'],
    required: true,
    type: 'array',
    default: ['firstKey', 'firstValue', 'secondKey', 'secondValue'],
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

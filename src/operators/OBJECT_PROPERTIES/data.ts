import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Extract values from data objects'
const aliases = [
  'dataProperties',
  'data',
  'getData',
  'objectProperties',
  'objProps',
  'getProperty',
  'getObjProp',
]
const parameters: Parameter[] = [
  {
    name: 'property',
    description: 'The path to the required property (e.g. "user.firstName")',
    aliases: ['path', 'propertyName'],
    required: true,
    type: 'string',
  },
  {
    name: 'additionalData',
    description: 'Additional data objects to be considered',
    aliases: ['additional', 'objects', 'data', 'additionalObjects'],
    required: false,
    type: 'object',
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

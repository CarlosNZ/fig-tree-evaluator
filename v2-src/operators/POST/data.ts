import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'HTTP POST Request'
const aliases = ['POST', 'post']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'url',
    description: 'Endpoint URL',
    aliases: ['endpoint'],
    required: true,
    type: 'string',
    default: 'https://jsonplaceholder.typicode.com/posts',
  },
  {
    name: 'returnProperty',
    description: 'Property path from request result',
    aliases: ['outputProperty'],
    required: false,
    type: 'string',
    default: 'result.path',
  },
  {
    name: 'headers',
    description: 'HTTP Headers',
    aliases: [],
    required: false,
    type: 'object',
    default: {},
  },
  {
    name: 'parameters',
    description: 'JSON Body parameters (key-value)',
    aliases: ['bodyJson', 'data'],
    required: false,
    type: 'object',
    default: {},
  },
  {
    name: 'useCache',
    description: 'Whether or not the FigTree cache is used',
    aliases: [],
    required: false,
    type: 'boolean',
    default: true,
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

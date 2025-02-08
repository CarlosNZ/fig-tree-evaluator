import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'HTTP GET Request'
const aliases = ['GET', 'get', 'api']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'url',
    description: 'Endpoint URL',
    aliases: ['endpoint'],
    required: true,
    type: 'string',
    default: 'https://restcountries.com/v3.1/name/zealand',
  },
  {
    name: 'returnProperty',
    description: 'Property from request result',
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
    description: 'Query parameters (key-value)',
    aliases: ['queryParams', 'queryParameters', 'urlQueries'],
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

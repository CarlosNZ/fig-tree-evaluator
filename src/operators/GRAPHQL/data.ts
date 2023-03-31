import { getPropertyAliases } from '../_operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'GraphQL request'
const aliases = ['graphQl', 'graphql', 'gql']
const parameters: Parameter[] = [
  {
    name: 'query',
    description: 'GraphQL query string',
    aliases: [],
    required: true,
    type: 'string',
  },
  {
    name: 'url',
    description: 'Endpoint for the GraphQL request (if not already provided in options)',
    aliases: ['endpoint'],
    required: false,
    type: ['string', 'null'],
  },
  {
    name: 'headers',
    description: 'HTTP Headers (if not already provided in options)',
    aliases: [],
    required: false,
    type: 'object',
  },
  {
    name: 'variables',
    description: 'Values for the variables used in query (key-value pairs)',
    aliases: [],
    required: false,
    type: 'object',
  },
  {
    name: 'returnNode',
    description: 'Property path to extract from the query response',
    aliases: ['outputNode', 'returnProperty'],
    required: false,
    type: 'string',
  },
  {
    name: 'useCache',
    description: 'Whether or not the FigTree cache is used',
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

import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'GraphQL request'
const aliases = ['graphQL', 'graphQl', 'graphql', 'gql']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'query',
    description: 'GraphQL query string',
    aliases: [],
    required: true,
    type: 'string',
    default: `query getCountries {
      countries(filter: {continent: {eq: "OC"}}) {
        name
      }
    }`,
  },
  {
    name: 'url',
    description: 'Endpoint for the GraphQL request (if not already provided in options)',
    aliases: ['endpoint'],
    required: false,
    type: ['string', 'null'],
    default: 'https://countries.trevorblades.com/',
  },
  {
    name: 'headers',
    description: 'HTTP Headers (if not already provided in options)',
    aliases: [],
    required: false,
    type: 'object',
    default: {},
  },
  {
    name: 'variables',
    description: 'Values for the variables used in query (key-value pairs)',
    aliases: [],
    required: false,
    type: 'object',
    default: {},
  },
  {
    name: 'returnNode',
    description: 'Property path to extract from the query response',
    aliases: ['outputNode', 'returnProperty'],
    required: false,
    type: 'string',
    default: 'data.countries[1].name',
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

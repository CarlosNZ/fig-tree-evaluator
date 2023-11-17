import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'Query a Postgres database using node-postgres'
const aliases = ['pgSql', 'sql', 'postgres', 'pg', 'pgDb']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'query',
    description: 'A SQL query string, with parameterised replacements (i.e. $1, $2, etc)',
    aliases: [],
    required: true,
    type: 'string',
    default: 'SELECT contact_name FROM customers;',
  },
  {
    name: 'values',
    description: 'An array of values to replace in the SQL string parameters',
    aliases: ['replacements'],
    required: false,
    type: 'array',
    default: [],
  },
  {
    name: 'type',
    description: 'Determines the shape of the resulting data (see documentation)',
    aliases: ['queryType'],
    required: false,
    type: { literal: ['array', 'string', 'number'] },
    default: 'array',
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

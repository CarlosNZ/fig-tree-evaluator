import { getRequiredProperties, getPropertyAliases } from '../_operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Query a Postgres database using node-postgres'
const aliases = ['pgSql', 'sql', 'postgres', 'pg', 'pgDb']
const parameters: Parameter[] = [
  {
    name: 'query',
    description: 'A SQL query string, with parameterised replacements (i.e. $1, $2, etc)',
    aliases: [],
    required: true,
    type: 'string',
  },
  {
    name: 'values',
    description: 'An array of values to replace in the SQL string parameters',
    aliases: ['replacements'],
    required: false,
    type: 'array',
  },
  {
    name: 'type',
    description: 'Determines the shape of the resulting data (see documentation)',
    aliases: ['queryType'],
    required: false,
    type: { literal: ['array', 'string', 'number'] },
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

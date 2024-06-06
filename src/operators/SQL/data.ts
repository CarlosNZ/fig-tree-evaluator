import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Query an SQL database'
const aliases = ['sql', 'pgSql', 'postgres', 'pg', 'sqLite', 'sqlite', 'mySql']
const parameters: Parameter[] = [
  {
    name: 'query',
    description: 'SQL query string, with parameterised replacements (e.g. $1, $2, etc)',
    aliases: ['text'],
    required: true,
    type: 'string',
  },
  {
    name: 'values',
    description:
      'An array/object of values to replace the SQL string parameters, as per SQL connection specifications ',
    aliases: ['replacements'],
    required: false,
    type: ['array', 'object'],
  },
  {
    name: 'single',
    description: 'Specify if returning a single record',
    aliases: ['singleRecord'],
    required: false,
    type: 'boolean',
  },
  {
    name: 'flatten',
    description: 'Specify whether to flatten resulting record objects to arrays of values',
    aliases: ['flat', 'array'],
    required: false,
    type: 'boolean',
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

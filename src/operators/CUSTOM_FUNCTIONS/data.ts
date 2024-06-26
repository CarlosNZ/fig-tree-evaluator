import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Call a custom function (defined in options)'
const aliases = [
  'customFunctions',
  'customFunction',
  'objectFunctions',
  'function',
  'functions',
  'runFunction',
]
const parameters: Parameter[] = [
  {
    name: 'functionPath',
    description: 'Path (in options.functions) to the required function',
    aliases: ['functionsPath', 'functionName', 'funcName', 'path', 'name'],
    required: true,
    type: 'string',
  },
  {
    name: 'args',
    description: 'Arguments for the function',
    aliases: ['arguments', 'variables'],
    required: false,
    type: 'array',
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

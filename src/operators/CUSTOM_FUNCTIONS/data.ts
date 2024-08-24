import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'Call a custom function (defined in options)'
const aliases = [
  'customFunctions',
  'customFunction',
  'objectFunctions',
  'function',
  'functions',
  'runFunction',
]
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'functionPath',
    description: 'Path (in options.functions) to the required function',
    aliases: ['functionPath', 'funcName', 'functionName', 'function', 'path', 'name'],
    required: true,
    type: 'string',
    default: null,
  },
  {
    name: 'args',
    description: 'Arguments for the function',
    aliases: ['arguments', 'variables'],
    required: false,
    type: ['array', 'any'],
    default: [],
  },
  {
    name: 'input',
    description: 'Argument for the function if a single input parameter',
    aliases: ['arg'],
    required: false,
    type: 'any',
    default: 'input',
  },
  {
    name: 'useCache',
    description: 'Whether or not the FigTree cache is used',
    aliases: [],
    required: false,
    type: 'boolean',
    default: false,
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

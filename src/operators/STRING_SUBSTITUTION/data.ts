import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'Replace values in a string using simple parameter substitution'
const aliases = ['stringSubstitution', 'substitute', 'stringSub', 'replace']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'string',
    description: 'A parameterised (%1, %2) string where the parameters are to be replaced',
    aliases: [],
    required: true,
    type: 'string',
    default: 'Hello, %1',
  },
  {
    name: 'substitutions',
    description: 'An array of substitution values for the parameterised string',
    aliases: ['replacements', 'values'],
    required: false, // Can use "data" object
    type: ['array', 'object'],
    default: {},
  },
  {
    name: 'trimWhiteSpace',
    description:
      'Whether or not to trim white space from either end of the substituted strings (default: true)',
    aliases: ['trim', 'trimWhitespace'],
    required: false,
    type: 'boolean',
    default: true,
  },
  {
    name: 'substitutionCharacter',
    description:
      'Which character to search for in original string for replacement -- can be "%" or "$" (default: "%")',
    aliases: ['subCharacter', 'subChar'],
    required: false,
    type: 'string',
    default: '$',
  },
  {
    name: 'numberMapping',
    description: 'Rules for mapping number values to text strings, such as pluralisation.',
    aliases: ['numMap', 'numberMap', 'pluralisation', 'pluralization', 'plurals'],
    required: false,
    type: 'object',
    default: {},
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

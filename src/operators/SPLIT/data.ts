import { getPropertyAliases } from '../_operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Split a string into an array'
const aliases = ['split', 'arraySplit']
const parameters: Parameter[] = [
  {
    name: 'value',
    description: 'The string to be split',
    aliases: ['string'],
    required: true,
    type: 'string',
  },
  {
    name: 'delimiter',
    description: 'The value to split the string on (default is white space)',
    aliases: ['separator'],
    required: false,
    type: 'string',
  },
  {
    name: 'trimWhiteSpace',
    description: 'Whether to trim white space from around the resulting elements (default: true)',
    aliases: ['trim', 'trimWhitespace'],
    required: false,
    type: 'boolean',
  },
  {
    name: 'excludeTrailing',
    description:
      'If the input string ends in a delimiter, there will be an additional blank element if this value is false (default: true)',
    aliases: ['removeTrailing', 'excludeTrailingDelimiter'],
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

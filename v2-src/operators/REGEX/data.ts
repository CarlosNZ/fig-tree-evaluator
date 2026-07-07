import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'Compare a string against a regex pattern'
const aliases = ['regex', 'patternMatch', 'regexp', 'matchPattern']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'testString',
    description: 'The string to test',
    aliases: ['string', 'value'],
    required: true,
    type: 'string',
    default: 'test-this',
  },
  {
    name: 'pattern',
    description: 'The regular expression pattern',
    aliases: ['regex', 'regexp', 'regExp', 're'],
    required: true,
    type: 'string',
    default: '^[a-z]{4}-[a-z]{4}$',
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

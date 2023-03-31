import { getPropertyAliases } from '../_operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Compare a string against a regex pattern'
const aliases = ['regex', 'patternMatch', 'regexp', 'matchPattern']
const parameters: Parameter[] = [
  {
    name: 'testString',
    description: 'The string to test',
    aliases: ['string', 'value'],
    required: true,
    type: 'string',
  },
  {
    name: 'pattern',
    description: 'The regular expression pattern',
    aliases: ['regex', 'regexp', 'regExp', 're'],
    required: true,
    type: 'string',
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'Return different values depending on a matching expression'
const aliases = ['match', 'switch']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'matchExpression',
    description: 'Expression to match against',
    aliases: ['matchValue'],
    required: true,
    type: ['string', 'number', 'boolean'],
    default: 'matchMe',
  },
  {
    name: 'branches',
    description:
      'Object whose keys are compared against the match expression. The value of the matching key is returned',
    aliases: ['arms', 'cases'],
    required: false,
    type: ['object', 'array'],
    default: { matchMe: 'YES', nonMatch: 'NO' },
  },
  {
    name: '[...branches]',
    description: 'Branch properties can optionally be placed at the operator root',
    aliases: [],
    required: false,
    type: ['object', 'array'],
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

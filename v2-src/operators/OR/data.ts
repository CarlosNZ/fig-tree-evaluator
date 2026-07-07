import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'Logical OR'
const aliases = ['or', '|', '||']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'values',
    description: 'Returns true if any values are true',
    aliases: [],
    required: true,
    type: 'array',
    default: [true, false],
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

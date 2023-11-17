import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Logical AND'
const aliases = ['and', '&', '&&']
const parameters: Parameter[] = [
  {
    name: 'values',
    description: 'Returns true if all values are true',
    aliases: [],
    required: true,
    type: 'array',
    default: [true, true],
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

import { getPropertyAliases } from '../_operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Logical OR'
const aliases = ['or', '|', '||']
const parameters: Parameter[] = [
  {
    name: 'values',
    description: 'Returns true if any values are true',
    aliases: [],
    required: true,
    type: 'array',
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

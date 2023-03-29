import { getPropertyAliases } from '../_operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Pass through a value unchanged (or change its type)'
const aliases = ['_', 'passThru', 'passthru', 'pass', 'ignore', 'coerce', 'convert']
const parameters: Parameter[] = [
  {
    name: 'value',
    description: 'Value to pass through',
    aliases: ['_', 'data'],
    required: true,
    type: 'any',
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

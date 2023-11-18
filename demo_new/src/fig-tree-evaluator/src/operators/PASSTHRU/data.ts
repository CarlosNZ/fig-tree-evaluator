import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'Pass through a value unchanged (or change its type)'
const aliases = ['_', 'passThru', 'passthru', 'pass', 'ignore', 'coerce', 'convert']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'value',
    description: 'Value to pass through',
    aliases: ['_', 'data'],
    required: true,
    type: 'any',
    default: null,
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

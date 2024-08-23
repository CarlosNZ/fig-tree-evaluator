import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, OperatorParameterMetadata } from '../../types'

const description = 'Divide one numerical value by another'
const aliases = ['/', 'divide', '÷']
const parameters: OperatorParameterMetadata[] = [
  {
    name: 'values',
    description: 'Array of values - 1st element will be divided by the first',
    aliases: [],
    required: false,
    type: 'array',
    default: [100, 10],
  },
  {
    name: 'dividend',
    description: 'The number that will be divided',
    aliases: ['divide'],
    required: false,
    type: 'number',
    default: 99,
  },
  {
    name: 'divisor',
    description: 'The number that dividend will be divided by',
    aliases: ['by', 'divideBy'],
    required: false,
    type: 'number',
    default: 3,
  },
  {
    name: 'output',
    description: 'Whether to output a quotient, remainder or decimal',
    aliases: [],
    required: false,
    type: { literal: ['quotient', 'remainder'] },
    default: 'quotient',
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Return a value based on a condition'
const aliases = ['?', 'conditional', 'ifThen']
const parameters: Parameter[] = [
  {
    name: 'condition',
    description: 'The expression to check for truthiness',
    aliases: [],
    required: true,
    type: 'any',
    default: true,
  },
  {
    name: 'valueIfTrue',
    description: 'Value to return if condition is true',
    aliases: ['ifTrue'],
    required: true,
    type: 'any',
    default: 'The condition is true',
  },
  {
    name: 'valueIfFalse',
    description: 'Value to return if condition is false',
    aliases: ['ifFalse', 'ifNot'],
    required: true,
    type: 'any',
    default: 'The condition is false',
  },
]

export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

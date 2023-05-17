import { getPropertyAliases } from '../operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Replace values in a string using simple parameter substitution'
const aliases = ['stringSubstitution', 'substitute', 'stringSub', 'replace']
const parameters: Parameter[] = [
  {
    name: 'string',
    description: 'A parameterised (%1, %2) string where the parameters are to be replaced',
    aliases: [],
    required: true,
    type: 'string',
  },
  {
    name: 'substitutions',
    description: 'An array of substitution values for the parameterised string',
    aliases: ['replacements'],
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

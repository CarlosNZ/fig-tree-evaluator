import { getRequiredProperties, getPropertyAliases } from '../_operatorUtils'
import { OperatorData, Parameter } from '../../types'

const description = 'Subtract one numerical value from another'
const aliases = ['-', 'subtract', 'minus', 'takeaway']
const parameters: Parameter[] = [
  {
    name: 'values',
    description: 'Array of values - 2nd element will be subtracted from the first',
    aliases: [],
    required: false,
    type: 'array',
  },
  {
    name: 'from',
    description: 'Numerical value that will be subtracted from',
    aliases: ['subtractFrom'],
    required: false,
    type: 'number',
  },
  {
    name: 'subtract',
    description: 'Numerical value to subtract',
    aliases: [],
    required: false,
    type: 'number',
  },
]

export const requiredProperties = getRequiredProperties(parameters)
export const propertyAliases = getPropertyAliases(parameters)

const operatorData: OperatorData = {
  description,
  aliases,
  parameters,
}

export default operatorData

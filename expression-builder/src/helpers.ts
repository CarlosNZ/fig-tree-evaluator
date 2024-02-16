import { EvaluatorNode, ExpectedType, OperatorMetadata } from 'fig-tree-evaluator'
import { NodeType } from './NodeTypeSelector'

// Returns a valid default value for each (FigTree) data type
export const getDefaultValue = (type: ExpectedType | NodeType) => {
  switch (type) {
    case 'operator':
      return { operator: '+', values: [1, 1] }
    case 'fragment':
      return { fragment: 'TO-DO' }
    case 'value':
      return 'TEMP' // TO-DO: Should generate default based on property type
    case 'array':
      return []
    case 'string':
      return 'New Value'
    case 'boolean':
      return true
    case 'number':
      return 1
    case 'object':
      return {}
    case 'null':
      return null
    case 'any':
    default:
      return 'DEFAULT'
  }
}

export const getCurrentOperator = (node: EvaluatorNode, operators: readonly OperatorMetadata[]) => {
  if (typeof node !== 'object' || node === null || !('operator' in node)) return undefined

  const operatorName = node?.operator as string
  const operator = operators.find(
    (op) => op.name === operatorName || op.aliases.includes(operatorName)
  )
  if (!operator) return undefined
  return operator
}

export const commonProperties = [
  {
    name: 'fallback',
    description: 'Value to return if the evaluation throws an error',
    aliases: [],
    required: false,
    type: 'any',
    default: 'Returning fallback...',
  },
  {
    name: 'outputType',
    description: 'Convert the evaluation result to this type',
    aliases: ['type'],
    required: false,
    type: 'any',
    default: 'string',
  },
  // {
  //   name: 'useCache',
  //   description: 'Override the global useCache value fo this node only',
  //   aliases: [],
  //   required: false,
  //   type: 'boolean',
  //   default: false,
  // },
]

export const reservedProperties = [
  'operator',
  'fragment',
  'children',
  'fallback',
  'outputType',
  'type',
  'useCache',
]

export const isArbitraryPropertyMarker = (propertyName: string) =>
  /^\[\s*\.\.\.[A-Za-z]+\s*\]$/gm.test(propertyName)

export const operatorAcceptsArbitraryProperties = ({ parameters }: OperatorMetadata) =>
  parameters.some((param) => isArbitraryPropertyMarker(param.name))

export const getButtonFontSize = (operatorAlias: string) => {
  const charCount = operatorAlias.length

  if (charCount === 1) return '2.2em'
  if (charCount < 8) return '2em'
  if (charCount < 15) return '1.5em'
  return '1.2em'
}

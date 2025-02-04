import {
  ExpectedType,
  standardiseOperatorName,
  OperatorMetadata,
  isObject,
  isAliasString,
  OperatorAlias,
  EvaluatorNode,
} from 'fig-tree-evaluator'
import { NodeData } from './_imports'
import { NodeType } from './NodeTypeSelector'

export const operatorStringRegex = /(\$[^()]+)\((.*)\)/

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

export const getCurrentOperator = (
  operatorName: string | undefined,
  operators: readonly OperatorMetadata[]
) => {
  if (!operatorName) return undefined

  const standardisedOpName = standardiseOperatorName(operatorName)

  const operator = operators.find(
    (op) => op.name === standardisedOpName || op.aliases.includes(standardisedOpName)
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

export const operatorAcceptsArbitraryProperties = (opData: OperatorMetadata) => {
  const { parameters } = opData
  if (!parameters) return false
  return parameters.some((param) => isArbitraryPropertyMarker(param.name))
}

export const getAliases = (expression: EvaluatorNode) => {
  if (!isObject(expression)) return {}
  return Object.fromEntries(Object.entries(expression).filter(([key, _]) => isAliasString(key)))
}

export const getButtonFontSize = (operatorAlias: string) => {
  const charCount = operatorAlias.length

  if (charCount === 1) return '2em'
  if (charCount < 3) return '1.6em'
  if (charCount < 7) return '1.2em'
  if (charCount < 15) return '1em'
  return '0.9em'
}

export const propertyCountReplace = (
  nodeData: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>,
  allFunctions: Set<string>
) => {
  const { value } = nodeData
  if (!(value instanceof Object)) return null
  if ('operator' in value) return `Operator: ${value.operator}`
  if ('fragment' in value) return `Fragment: ${value.fragment}`
  if (isShorthandNodeWithSimpleValue(nodeData, allOperatorAliases, allFragments, allFunctions)) {
    const shorthandOperator = Object.keys(value)[0]
    return `Shorthand: ${shorthandOperator}`
  }
  return null
}

// See Shorthand.tsx for the difference between ShorthandNodeCollection &
// ShorthandNodeWithSimpleValue

export const isShorthandNodeCollection = (
  nodeData: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>,
  allFunctions: Set<string>
) => {
  const { parentData, key } = nodeData

  if (!isObject(parentData)) return false

  const alias = (key as string).slice(1)

  return allOperatorAliases.has(alias) || allFragments.has(alias) || allFunctions.has(alias)
}

export const isShorthandNodeWithSimpleValue = (
  nodeData: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>,
  allFunctions: Set<string>
) => {
  const { value } = nodeData
  if (!isObject(value)) return false
  const keys = Object.keys(value)
  if (keys.length > 1) return false

  const shorthandKey = keys[0]
  if (!isAliasString(shorthandKey)) return false

  const alias = shorthandKey.slice(1)

  return allOperatorAliases.has(alias) || allFragments.has(alias) || allFunctions.has(alias)
}

export const isAliasNode = (
  { key, parentData }: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>,
  allFunctions: Set<string>
) => {
  const keyString = key as string
  return (
    isAliasString(keyString) &&
    parentData &&
    !('fragment' in parentData) &&
    !allOperatorAliases.has(keyString) &&
    !allFragments.has(keyString) &&
    !allFunctions.has(keyString.slice(1))
  )
}

export const isFirstAliasNode = (
  nodeData: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>,
  allFunctions: Set<string>
) => {
  if (!isAliasNode(nodeData, allOperatorAliases, allFragments, allFunctions)) return false

  const { parentData, index } = nodeData

  const nonAliasProperties = isObject(parentData)
    ? Object.keys(parentData).filter((k) => !isAliasString(k))
    : []
  return index === nonAliasProperties.length
}

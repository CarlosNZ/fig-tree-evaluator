import {
  ExpectedType,
  standardiseOperatorName,
  OperatorMetadata,
  preProcessShorthand,
  isOperatorNode,
  isFragmentNode,
  EvaluatorNode,
  isObject,
  isAliasString,
  OperatorAlias,
} from './exports/figTreeImport'
import { NodeData } from './exports/JsonEditReactImport'
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

export const operatorAcceptsArbitraryProperties = ({ parameters }: OperatorMetadata) =>
  parameters.some((param) => isArbitraryPropertyMarker(param.name))

export const getButtonFontSize = (operatorAlias: string) => {
  const charCount = operatorAlias.length

  if (charCount === 1) return '2em'
  if (charCount < 3) return '1.6em'
  if (charCount < 7) return '1.2em'
  if (charCount < 15) return '1em'
  return '0.9em'
}

export const propertyCountReplace = ({
  value,
}: {
  key: string | number
  path: (string | number)[]
  level: number
  value: unknown
  size: number | null
}) => {
  if (!(value instanceof Object)) return null
  if ('operator' in value) return `Operator: ${value.operator}`
  if ('fragment' in value) return `Fragment: ${value.fragment}`
  return null
}

// TO-DO: Replace with exported one from jer
export const isCollection = (value: unknown): value is Record<string, unknown> | unknown[] =>
  value !== null && typeof value === 'object'

export const isShorthandNode = (
  node: EvaluatorNode,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>
) => {
  if (!isObject(node)) return false
  const keys = Object.keys(node)
  if (keys.length > 1) return false

  const shorthandKey = keys[0]
  if (!isAliasString(shorthandKey)) return false

  const alias = shorthandKey.slice(1)

  if (!isCollection(node[shorthandKey as string])) return false

  return allOperatorAliases.has(alias) || allFragments.has(alias)
}

export const isShorthandStringNode = (
  node: EvaluatorNode,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>
) => {
  if (!isObject(node)) return false
  const keys = Object.keys(node)
  if (keys.length > 1) return false

  const shorthandKey = keys[0]
  if (!isAliasString(shorthandKey)) return false

  const alias = shorthandKey.slice(1)

  if (isCollection(node[shorthandKey as string])) return false

  return allOperatorAliases.has(alias) || allFragments.has(alias)
}

export const isShorthandString = (
  value: unknown,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>
) => {
  if (typeof value !== 'string') return false
  const match = operatorStringRegex.exec(value)
  if (!match) return false
  const op = match[1].trim().slice(1)
  return allOperatorAliases.has(op) || allFragments.has(op)
}

export const isAliasNode = (
  { key, parentData }: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>
) => {
  return (
    isAliasString(key as string) &&
    parentData &&
    !('fragment' in parentData) &&
    !isShorthandNode(parentData, allOperatorAliases, allFragments) &&
    !isShorthandStringNode(parentData, allOperatorAliases, allFragments)
  )
}

export const isFirstAliasNode = (
  nodeData: NodeData,
  allOperatorAliases: Set<OperatorAlias>,
  allFragments: Set<string>
) => {
  if (!isAliasNode(nodeData, allOperatorAliases, allFragments)) return false

  const { parentData, index } = nodeData
  const nonAliasProperties = isObject(parentData)
    ? Object.keys(parentData).filter((k) => !isAliasString(k))
    : []
  return index === nonAliasProperties.length
}

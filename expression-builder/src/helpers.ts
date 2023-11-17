import { EvaluatorNode, OperatorMetadata } from 'fig-tree-evaluator'

export const isAliasString = (value: string) => /^\$.+/.test(value)

export const isFigTreeNode = (data: unknown) => {
  if (!data) return false
  if (typeof data !== 'object' || Array.isArray(data)) return false
  return 'operator' in data || 'fragment' in data
}

// Returns a valid default value for each (FigTree) data type
export const getDefaultValue = (type: string) => {
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
    (op) => op.operator === operatorName || op.aliases.includes(operatorName)
  )
  if (!operator) return undefined
  return { operator, alias: operatorName }
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

export const validateOperatorState = (node: object, operator: OperatorMetadata) => {
  const updatedNode = { ...node }

  const requiredProperties = operator.parameters.filter((param) => param.required)

  const optionalProperties = operator.parameters.filter((param) => !param.required)

  const currentPropertyKeys = Object.keys(node)
  const allPropertyAliases = operator.parameters.reduce(
    (acc: string[], curr) => [...acc, curr.name, ...curr.aliases],
    []
  )

  currentPropertyKeys.forEach((property) => {
    if (reservedProperties.includes(property)) return
    if (isAliasString(property)) return
    if (allPropertyAliases.includes(property)) return

    // It shouldn't be there, so remove it from node
    delete updatedNode[property]
  })

  // Check if all required properties are present, and add them if not
  requiredProperties.forEach((property) => {
    if (currentPropertyKeys.includes(property.name)) return
    if (property.aliases.some((alias) => currentPropertyKeys.includes(alias))) return

    updatedNode[property.name] = property.default ?? getDefaultValue(property.type as string)
  })

  // Check if optional properties are present, and add them to available
  // list if not
  const availableProperties: OperatorData[] = [] as {
    name: string
    description: string
    aliases: string[]
    required: boolean
    type: string
    default?: unknown
  }[] // CHANGE TO PARAMETER

  optionalProperties.forEach((property) => {
    if (currentPropertyKeys.includes(property.name)) return
    if (property.aliases.some((alias) => currentPropertyKeys.includes(alias))) return

    availableProperties.push(property)
  })

  // Check if common properties are present, and add them to available
  // list if not
  commonProperties.forEach((property) => {
    if (currentPropertyKeys.includes(property.name)) return
    if (property.aliases.some((alias) => currentPropertyKeys.includes(alias))) return

    availableProperties.push(property)
  })

  return { updatedNode, availableProperties }
}

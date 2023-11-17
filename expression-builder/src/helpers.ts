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

type OperatorNodeProperty = AliasNodeProperty & {
  description: string
  required?: boolean
  valid?: boolean
}

interface AliasNodeProperty {
  name: string
  value: EvaluatorNode
}

export const buildOperatorProps = (node: object, operator: OperatorMetadata) => {
  const currentProps: OperatorNodeProperty[] = []
  const aliases: AliasNodeProperty[] = []
  const availableProps: OperatorNodeProperty[] = []
  let fallback
  let outputType
  let useCache
  for (const property in node) {
    if (property === 'operator') continue
    if (isAliasString(property)) {
      aliases.push({ name: property, value: node[property] })
      continue
    }
    if (property === 'fallback') {
      fallback = node[property]
      continue
    }
    if (property === 'outputType') {
      outputType = node[property]
      continue
    }
    if (property === 'useCache') {
      useCache = node[property]
      continue
    }

    const propertyData = operator.parameters.find(
      (param) => param.name === property || param.aliases.includes(property)
    )

    currentProps.push({
      name: property,
      value: node[property],
      description: propertyData?.description ?? '',
      required: propertyData?.required ?? false,
      valid: true, // TODO -- check type AND if it's a relevant property for this operator
    })
  }

  const currentPropertyKeys = currentProps.map((prop) => prop.name)
  const allPropertyAliases = operator.parameters.reduce(
    (acc: string[], curr) => [...acc, curr.name, ...curr.aliases],
    []
  )

  // Add any required properties that aren't already in the node, and remove any
  // that don't belong
  const additionalProps = {}
  operator.parameters.forEach((param) => {
    const allAliases = [param.name, ...param.aliases]
    if (!allAliases.some((alias) => currentPropertyKeys.includes(alias))) {
      if (param.required) {
        additionalProps[param.name] = getDefaultValue(param.type as string)
      } else {
        availableProps.push({
          name: param.name,
          value: getDefaultValue(param.type as string),
          description: param?.description ?? '',
          required: false,
          valid: true, // TODO -- check type AND if it's a relevant property for this operator
        })
      }
    }
  })

  currentProps.forEach((prop) => {
    if (!allPropertyAliases.includes(prop.name)) {
      delete node[prop.name]
    }
  })

  return {
    currentProps,
    additionalProps,
    availableProps,
    aliases,
    fallback,
    outputType,
    useCache,
  }
}

import React, { Dispatch, SetStateAction, useState } from 'react'
import { useFigTreeContext } from './FigTreeContext'
import { EvaluatorNode, OperatorMetadata } from 'fig-tree-evaluator'
import { isAliasString } from './helpers'

type NodeType = 'operator' | 'fragment' | 'value'

const nodeTypeOptions = [
  { key: 'operator', text: 'Operator', value: 'operator' },
  { key: 'fragment', text: 'Fragment', value: 'fragment' },
  { key: 'value', text: 'Value', value: 'value' },
]

export const FigTreeNode: React.FC<{ path?: string }> = ({ path = '' }) => {
  const { getNode, evaluate } = useFigTreeContext()
  const [nodeType, setNodeType] = useState<NodeType>(getNodeType(getNode(path)))

  const pathArray = path.split('.')
  const [collapsed, setCollapsed] = useState(pathArray.length > 2)
  const [editValue, setEditValue] = useState(false)

  if (nodeType === 'value' && !editValue)
    return <ValueNode path={path} edit={editValue} setEdit={setEditValue} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 20 * pathArray.length }}>
      <button
        onClick={() => {
          evaluate(path).then((result) => console.log(result))
        }}
      >
        Evaluate
      </button>
      <select value={nodeType} onChange={(e) => setNodeType(e.target.value as NodeType)}>
        {nodeTypeOptions.map(({ key, text, value }) => (
          <option key={key} value={value}>
            {text}
          </option>
        ))}
      </select>
      {nodeType === 'operator' && <OperatorNode path={path} />}
      {nodeType === 'fragment' && <FragmentNode path={path} />}
    </div>
  )
}

const getNodeType = (expression: EvaluatorNode) => {
  if (expression && typeof expression === 'object' && !Array.isArray(expression)) {
    if ('operator' in expression) return 'operator'
    if ('fragment' in expression) return 'fragment'
  }
  return 'value'
}

interface OperatorProps {
  path: string
}

export const OperatorNode: React.FC<OperatorProps> = ({ path }) => {
  const { getNode, update, operatorOptions, operators } = useFigTreeContext()

  const thisNode = getNode(path) as object
  const updateNode = (value: EvaluatorNode) => update(path, value)

  const current = getCurrentOperator(thisNode, operators)
  const operator = current?.operator
  const alias = current?.alias

  const { props, availableProps, aliases, fallback, outputType, useCache } = operator
    ? buildOperatorProps(thisNode, operator, updateNode)
    : { props: [], aliases: [] }

  console.log('availableProps', availableProps)

  return (
    <div>
      <select
        value={alias}
        onChange={(e) => update(`${path}`, { ...thisNode, operator: e.target.value })}
      >
        {operatorOptions.map(({ key, text, value }) => (
          <option key={key} value={value}>
            {text}
          </option>
        ))}
      </select>
      {props.map((prop) => (
        <div key={prop.name} style={{ display: 'flex' }}>
          {prop.name}
          <FigTreeNode path={path === '' ? prop.name : `${path}.${prop.name}`} />
        </div>
      ))}
      <CommonProperties path={path} />
    </div>
  )
}

export const FragmentNode: React.FC<OperatorProps> = ({ path }) => {
  return <p>FRAGMENT: {path}</p>
}

export const CommonProperties: React.FC<OperatorProps> = ({ path }) => {
  return <p>Common properties: {path}</p>
}

interface ValueNodeProps extends OperatorProps {
  edit: boolean
  setEdit: Dispatch<SetStateAction<boolean>>
}

export const ValueNode: React.FC<ValueNodeProps> = ({ path }) => {
  const { getNode, update, operatorOptions, operators } = useFigTreeContext()

  const value = getNode(path)

  return <p>{JSON.stringify(value)}</p>
}

const getCurrentOperator = (node: EvaluatorNode, operators: readonly OperatorMetadata[]) => {
  if (typeof node !== 'object' || node === null || !('operator' in node)) return undefined

  const operatorName = node?.operator as string
  const operator = operators.find(
    (op) => op.operator === operatorName || op.aliases.includes(operatorName)
  )
  if (!operator) return undefined
  return { operator, alias: operatorName }
}

interface AliasNodeProperty {
  name: string
  value: EvaluatorNode
}

type OperatorNodeProperty = AliasNodeProperty & {
  description: string
  required?: boolean
  valid?: boolean
}

const buildOperatorProps = (
  node: object,
  operator: OperatorMetadata,
  updateNode: (value: EvaluatorNode) => void
) => {
  const props: OperatorNodeProperty[] = []
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

    props.push({
      name: property,
      value: node[property],
      description: propertyData?.description ?? '',
      required: propertyData?.required ?? false,
      valid: true, // TODO -- check type AND if it's a relevant property for this operator
    })
  }

  const currentPropertyKeys = props.map((prop) => prop.name)
  const allPropertyAliases = operator.parameters.reduce(
    (acc: string[], curr) => [...acc, curr.name, ...curr.aliases],
    []
  )

  let shouldUpdateNode = false
  // Add any required properties that aren't already in the node, and remove any
  // that don't belong
  const additionalProps = {}
  operator.parameters.forEach((param) => {
    const allAliases = [param.name, ...param.aliases]
    if (!allAliases.some((alias) => currentPropertyKeys.includes(alias))) {
      if (param.required) {
        additionalProps[param.name] = getDefaultValue(param.type as string)
        shouldUpdateNode = true
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

  props.forEach((prop) => {
    if (!allPropertyAliases.includes(prop.name)) {
      delete node[prop.name]
      shouldUpdateNode = true
    }
  })

  if (shouldUpdateNode) updateNode({ ...node, ...additionalProps })

  return { props, availableProps, aliases, fallback, outputType, useCache }
}

// Returns a valid default value for each (FigTree) data type
const getDefaultValue = (type: string) => {
  switch (type) {
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

import React, { useState } from 'react'
import { DropdownOption, useFigTreeContext } from './FigTreeContext'
import { EvaluatorNode, FigTreeEvaluator, Operator, OperatorMetadata } from 'fig-tree-evaluator'
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 20 * pathArray.length }}>
      {nodeType !== 'value' && (
        <button
          onClick={() => {
            evaluate(path).then((result) => console.log(result))
          }}
        >
          Evaluate
        </button>
      )}
      <select value={nodeType} onChange={(e) => setNodeType(e.target.value as NodeType)}>
        {nodeTypeOptions.map(({ key, text, value }) => (
          <option key={key} value={value}>
            {text}
          </option>
        ))}
      </select>
      {nodeType === 'operator' && <OperatorNode path={path} />}
      {nodeType === 'fragment' && <p>FRAGMENT</p>}
      {nodeType === 'value' && JSON.stringify(getNode(path))}
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

  const current = getCurrentOperator(thisNode, operators)
  const operator = current?.operator
  const alias = current?.alias

  console.log('currentOperator', operator)

  const { props, aliases, fallback, outputType, useCache } = operator
    ? buildOperatorProps(thisNode, operator)
    : { props: [], aliases: [] }

  console.log('props', props)

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
        <>
          <p>{path === '' ? prop.name : `${path}.${prop.name}`}</p>
          <FigTreeNode path={path === '' ? prop.name : `${path}.${prop.name}`} />
        </>
      ))}
    </div>
  )
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

const buildOperatorProps = (node: object, operator: OperatorMetadata) => {
  const props: OperatorNodeProperty[] = []
  const aliases: AliasNodeProperty[] = []
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
    const propertyData = operator.parameters.find((param) => param.name === property)

    props.push({
      name: property,
      value: node[property],
      description: propertyData?.description ?? '',
      required: propertyData?.required ?? false,
      valid: true, // TODO -- check type
    })
  }
  return { props, aliases, fallback, outputType, useCache }
}

import React, { useState } from 'react'
import { DropdownOption, useFigTreeContext } from './FigTreeContext'
import { EvaluatorNode, FigTreeEvaluator, Operator, OperatorMetadata } from 'fig-tree-evaluator'

type NodeType = 'operator' | 'fragment' | 'value'

const nodeTypeOptions = [
  { key: 'operator', text: 'Operator', value: 'operator' },
  { key: 'fragment', text: 'Fragment', value: 'fragment' },
  { key: 'value', text: 'Value', value: 'value' },
]

// const operators = figTree.getOperators()
// const fragments = figTree.getFragments()
// const functions = figTree.getCustomFunctions()

// const operatorOptions = operators.map((op) => ({
//   key: op.operator,
//   text: `${op.operator}: ${op.description}`,
//   value: op.operator,
// }))

export const FigTreeNode: React.FC<{ path?: string }> = ({ path = '' }) => {
  const { figTree, expression, update, evaluate } = useFigTreeContext()
  const [nodeType, setNodeType] = useState<NodeType>(getNodeType(expression))

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <select value={nodeType} onChange={(e) => setNodeType(e.target.value as NodeType)}>
        {nodeTypeOptions.map(({ key, text, value }) => (
          <option key={key} value={value}>
            {text}
          </option>
        ))}
      </select>
      {nodeType === 'operator' && <OperatorNode path={path} />}
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
  const { figTree, getNode, update, evaluate, operators } = useFigTreeContext()

  const thisNode = getNode(path) as object

  console.log('thisNode', thisNode)

  const current = getCurrentOperator(thisNode, operators)
  const operator = current?.operator
  const metadata = current?.metadata

  console.log('currentOperator', operator)
  console.log('metadata', metadata)

  return (
    <select
      value={operator}
      onChange={(e) => update(`${path}`, { ...thisNode, operator: e.target.value })}
    >
      {operators.map(({ key, text, value }) => (
        <option key={key} value={value}>
          {text}
        </option>
      ))}
    </select>
  )
}

const getCurrentOperator = (node: EvaluatorNode, operators: DropdownOption[]) => {
  if (typeof node !== 'object' || node === null || !('operator' in node)) return undefined

  const operatorName = node?.operator as string

  console.log('operatorName', operatorName)

  const operator = operators.find((op) => op.value === operatorName)

  if (!operator) return undefined

  return { operator: operatorName, metadata: operator }
}

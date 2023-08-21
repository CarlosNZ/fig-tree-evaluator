import React, { useState } from 'react'
import { useFigTreeContext } from './FigTreeContext'
import { EvaluatorNode, FigTreeEvaluator, Operator } from 'fig-tree-evaluator'

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

export const FigTreeNode: React.FC<{ path: string }> = ({ path }) => {
  const [nodeType, setNodeType] = useState<NodeType>('operator')
  const { figTree, expression, update, evaluate } = useFigTreeContext()

  return (
    <div className="flex-column-center-start">
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

interface OperatorProps {
  path: string
}

export const OperatorNode: React.FC<OperatorProps> = ({ path }) => {
  const { figTree, getNode, update, evaluate } = useFigTreeContext()

  const thisNode = getNode(path)

  const currentOperator = getCurrentOperator(thisNode, figTree)

  return <p>TEST</p>
}

const getCurrentOperator = (node: EvaluatorNode, figTree: FigTreeEvaluator) => {
  const x = figTree.getOperators()
}

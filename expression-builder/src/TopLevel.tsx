import React, { useState } from 'react'
import { FigTreeEvaluator, EvaluatorNode, isOperatorNode, isFragmentNode } from 'fig-tree-evaluator'
import { CustomNodeProps, NodeData } from './_imports'
import { EvaluateButton } from './DisplayBar'

interface TopLevelProps {
  figTree: FigTreeEvaluator
  evaluateNode: (expression: EvaluatorNode) => Promise<void>
  isEvaluating: boolean
  isShorthandNode: (nodeData: NodeData) => boolean
  evaluateFullObject: boolean
}

export const TopLevelContainer: React.FC<CustomNodeProps<TopLevelProps>> = ({
  customNodeProps,
  data,
  nodeData,
  children,
}) => {
  const [loading, setLoading] = useState(false)
  const { evaluateNode, isShorthandNode } = customNodeProps ?? {}

  if (!evaluateNode || !isShorthandNode) return null

  if (
    isOperatorNode(nodeData.value as EvaluatorNode) ||
    isFragmentNode(nodeData.value as EvaluatorNode) ||
    isShorthandNode(nodeData)
  )
    return children

  return (
    <div className="ft-top-level">
      <div
        className="ft-display-bar"
        title="Evaluate a non-FigTree expression. In order for the inner nodes to be evaluated, the option 'Evaluate full object input' should be enabled."
      >
        <EvaluateButton
          name="Evaluate"
          backgroundColor="#454545"
          textColor="white"
          evaluate={async () => {
            setLoading(true)
            await evaluateNode(data as object)
            setLoading(false)
          }}
          isLoading={loading}
        />
      </div>
      {children}
    </div>
  )
}

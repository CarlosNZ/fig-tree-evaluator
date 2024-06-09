import React, { useState } from 'react'
import {
  FigTreeEvaluator,
  EvaluatorNode,
  isOperatorNode,
  isFragmentNode,
  CustomNodeProps,
  NodeData,
} from './_imports'
// import './styles.css'
import { EvaluateButton } from './Operator'

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
  const { evaluateNode, isShorthandNode, figTree } = customNodeProps ?? {}

  if (!evaluateNode || !isShorthandNode) return null

  if (
    !figTree?.getOptions().evaluateFullObject ||
    isOperatorNode(nodeData.value as EvaluatorNode) ||
    isFragmentNode(nodeData.value as EvaluatorNode) ||
    isShorthandNode(nodeData)
  )
    return children

  return (
    <div className="ft-top-level">
      <div className="ft-display-bar">
        {/* <div> */}
        <EvaluateButton
          // name=""
          backgroundColor="#454545"
          textColor="white"
          evaluate={async () => {
            setLoading(true)
            await evaluateNode(data as object)
            setLoading(false)
          }}
          isLoading={loading}
        />
        {/* </div> */}
      </div>
      {children}
    </div>
  )
}

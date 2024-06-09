import React, { useEffect, useState } from 'react'
import {
  FigTreeEvaluator,
  EvaluatorNode,
  isOperatorNode,
  isFragmentNode,
} from './packages/figTreeImport'
import { CustomNodeProps, NodeData } from './packages/JsonEditReactImport'
import './styles.css'
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
    isOperatorNode(nodeData.value as EvaluatorNode) ||
    isFragmentNode(nodeData.value as EvaluatorNode) ||
    isShorthandNode(nodeData) ||
    !figTree?.getOptions().evaluateFullObject
  )
    return children

  return (
    <div className="ft-top-level">
      <div className="ft-display-bar">
        {/* <div> */}
        <EvaluateButton
          name=""
          backgroundColor="black"
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

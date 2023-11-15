import React from 'react'
import { FigTreeNode } from './FigTreeNode'
import { FigTreeProvider } from './FigTreeContext'
import { EvaluatorNode, FigTreeEvaluator } from 'fig-tree-evaluator'

type UpdateMethod = ({
  prevExpression,
  newExpression,
}: {
  prevExpression: EvaluatorNode
  newExpression: EvaluatorNode
}) => void

interface FigTreeEditorProps {
  figTree: FigTreeEvaluator
  expression?: EvaluatorNode
  onUpdate?: UpdateMethod
}

const FigTreeEditor: React.FC<FigTreeEditorProps> = ({ figTree, expression }) => {
  return (
    <FigTreeProvider figTree={figTree} expression={expression}>
      <FigTreeNode />
    </FigTreeProvider>
  )
}

export default FigTreeEditor

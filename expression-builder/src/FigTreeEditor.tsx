import React from 'react'
import { FigTreeNode } from './FigTreeNode'
import { FigTreeProvider } from './FigTreeContext'
import { EvaluatorNode, FigTreeEvaluator } from 'fig-tree-evaluator'

const FigTreeEditor: React.FC<{ figTree: FigTreeEvaluator; expression?: EvaluatorNode }> = ({
  figTree,
  expression,
}) => {
  return (
    <FigTreeProvider figTree={figTree} expression={expression}>
      <FigTreeNode />
    </FigTreeProvider>
  )
}

export default FigTreeEditor

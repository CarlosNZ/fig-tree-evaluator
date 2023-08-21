import React from 'react'
import { FigTreeNode } from './FigTreeNode'
import { FigTreeProvider } from './FigTreeContext'
import { FigTreeEvaluator } from 'fig-tree-evaluator'

const FigTreeEditor: React.FC<{ figTree: FigTreeEvaluator }> = ({ figTree }) => {
  return (
    <FigTreeProvider figTree={figTree}>
      <FigTreeNode path="" />
    </FigTreeProvider>
  )
}

export default FigTreeEditor

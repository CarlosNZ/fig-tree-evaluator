import { EvaluatorNode, EvaluatorOutput, FigTreeEvaluator } from 'fig-tree-evaluator'
import React, { createContext, useContext, useState } from 'react'
import assign from 'object-property-assigner'
import extract from 'object-property-extractor'

interface FigTreeState {
  figTree: FigTreeEvaluator
  expression: EvaluatorNode
  getNode: (path: string) => EvaluatorNode
  update: (path: string, value: EvaluatorNode) => void
  evaluate: (path: string) => EvaluatorOutput
  // operators: OperatorMetadata[]
}

const initialState = {
  figTree: new FigTreeEvaluator(),
  expression: {},
  getNode: () => ({}),
  update: () => {},
  evaluate: () => 'temp',
}

const FigTreeContext = createContext<FigTreeState>(initialState)

export const FigTreeProvider = ({
  children,
  figTree,
  expression: initExpression = {},
}: {
  children: React.ReactNode
  figTree: FigTreeEvaluator
  expression?: EvaluatorNode
}) => {
  const [expression, setExpression] = useState<EvaluatorNode>(initExpression)

  const getNode = (path: string) => extract(expression, path)

  const update = (path: string, value: EvaluatorNode) => {}

  const evaluate = async (path: string) => {
    return 'TEST'
  }

  return (
    <FigTreeContext.Provider value={{ figTree, expression, getNode, update, evaluate }}>
      {children}
    </FigTreeContext.Provider>
  )
}

export const useFigTreeContext = () => useContext(FigTreeContext)

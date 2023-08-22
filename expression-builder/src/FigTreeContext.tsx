import {
  CustomFunctionMetadata,
  EvaluatorNode,
  EvaluatorOutput,
  FigTreeEvaluator,
  FragmentMetadata,
  OperatorMetadata,
} from 'fig-tree-evaluator'
import React, { createContext, useContext, useMemo, useState } from 'react'
import assign from 'object-property-assigner'
import extract from 'object-property-extractor'

export interface DropdownOption {
  key: string
  value: string
  text: string
}

interface FigTreeState {
  figTree: FigTreeEvaluator
  expression: EvaluatorNode
  getNode: (path: string) => EvaluatorNode
  update: (path: string, value: EvaluatorNode) => void
  evaluate: (path: string) => Promise<EvaluatorOutput>
  operatorOptions: DropdownOption[]
  operators: readonly OperatorMetadata[]
  fragments: readonly FragmentMetadata[]
  customFunctions: readonly CustomFunctionMetadata[]
}

const initialState = {
  figTree: new FigTreeEvaluator(),
  expression: {},
  getNode: () => ({}),
  update: () => {},
  evaluate: async () => 'temp',
  operatorOptions: [],
  operators: [],
  fragments: [],
  customFunctions: [],
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

  const update = (path: string, value: EvaluatorNode) => {
    if (path === '') {
      setExpression(value)
      return
    }
    const newNode = { ...(expression as object) }
    assign(newNode, path, value)
    setExpression(newNode)
  }

  const evaluate = async (path: string) => {
    const subNode = extract(expression, path)
    return await figTree.evaluate(subNode)
  }

  const operators = figTree.getOperators()
  const operatorOptions = useMemo(() => getOperatorOptions(operators), [])
  const fragments = figTree.getFragments()
  const customFunctions = figTree.getCustomFunctions()

  return (
    <FigTreeContext.Provider
      value={{
        figTree,
        expression,
        getNode,
        update,
        evaluate,
        operatorOptions,
        operators,
        fragments,
        customFunctions,
      }}
    >
      {children}
    </FigTreeContext.Provider>
  )
}

export const useFigTreeContext = () => useContext(FigTreeContext)

const getOperatorOptions = (operators: readonly OperatorMetadata[]) => {
  const options: DropdownOption[] = []
  for (const op of operators) {
    options.push({
      key: op.operator,
      value: op.operator,
      text: `${op.operator} - ${op.description}`,
    })
    op.aliases.forEach((alias) => options.push({ key: alias, value: alias, text: ` - ${alias}` }))
  }

  return options
}

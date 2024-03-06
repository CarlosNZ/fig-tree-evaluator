import React, { useMemo, useState } from 'react'
import {
  CustomFunctionMetadata,
  FigTreeEvaluator,
  Operator as OperatorName,
  OperatorAlias,
  OperatorMetadata,
  OperatorNode,
  OperatorParameterMetadata,
  EvaluatorNode,
} from './figTreeImport'
import { CustomNodeProps, IconEdit, IconOk, IconCancel } from 'json-edit-react'
import { Select, SelectOption } from './Select'
import { Icons } from './Icons'
import './styles.css'
import { getButtonFontSize, getCurrentOperator, getDefaultValue } from './helpers'
import { NodeTypeSelector } from './NodeTypeSelector'
import { cleanOperatorNode, getAvailableProperties } from './validator'
import { OperatorDisplay, operatorDisplay } from './operatorDisplay'

const README_URL = 'https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#'

export interface OperatorProps {
  figTree: FigTreeEvaluator
  evaluateNode: (expression: EvaluatorNode) => Promise<void>
  operatorDisplay: Partial<Record<OperatorName, OperatorDisplay>>
}

export const ShorthandNode: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
  const {
    data,
    parentData,
    nodeData: { path },
    onEdit,
    customNodeProps,
    children,
  } = props

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const { figTree, evaluateNode } = customNodeProps
  //   const [prevState, setPrevState] = useState(parentData)
  //   const [isEditing, setIsEditing] = useState(false)
  //   const [loading, setLoading] = useState(false)

  if (!figTree) return null

  //   const expressionPath = path.slice(0, -1)
  //   const operatorData = getCurrentOperator(
  //     parentData.operator,
  //     figTree.getOperators()
  //   ) as OperatorMetadata
  //   const thisOperator = data as OperatorAlias

  //   const availableProperties = getAvailableProperties(operatorData, parentData as OperatorNode)

  //   const isCustomFunction = operatorData.name === 'CUSTOM_FUNCTIONS'
  //   const opDisplay = operatorDisplay[operatorData.name]

  //   const fragments = figTree.getFragments()

  return (
    <div className="ft-custom ft-operator">
      Shorthand
      {children}
    </div>
  )
}

import React, { useState } from 'react'
import {
  FigTreeEvaluator,
  Operator as OperatorName,
  OperatorMetadata,
  EvaluatorNode,
} from 'fig-tree-evaluator'
import { CustomNodeProps } from './_imports'
import { getAliases, getCurrentOperator } from './helpers'
import { OperatorDisplay, operatorDisplay } from './operatorDisplay'
import { DisplayBar, EvaluateButton } from './DisplayBar'

const README_URL = 'https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#'

export interface ShorthandProps {
  figTree: FigTreeEvaluator
  evaluateNode: (expression: EvaluatorNode, e: React.MouseEvent) => Promise<void>
  operatorDisplay: Partial<Record<OperatorName, OperatorDisplay>>
  topLevelAliases: Record<string, EvaluatorNode>
}

/**
 * ShorthandNodeCollection has a "collection" as its property, e.g.
 * { $getData: { property: "simple.property.path" }}
 * or
 * { $getData: ["simple.property.path"]}
 */
export const ShorthandNodeCollection: React.FC<CustomNodeProps<ShorthandProps>> = ({
  children,
  nodeData,
  customNodeProps,
}) => {
  const { key, parentData } = nodeData
  const { figTree, evaluateNode, topLevelAliases } = customNodeProps ?? {}
  if (!figTree || !evaluateNode) return null

  const [loading, setLoading] = useState(false)

  const operatorAlias = (key as string).slice(1)

  const operatorData = getCurrentOperator(operatorAlias, figTree.getOperators()) as OperatorMetadata

  const aliases = { ...topLevelAliases, ...getAliases(parentData) }

  return (
    <div className="ft-shorthand-wrapper">
      <div className="ft-shorthand-display-bar">
        <DisplayBar
          name={key as string}
          setIsEditing={() => {}}
          evaluate={async (e) => {
            setLoading(true)
            await evaluateNode({ ...parentData, ...aliases }, e)
            setLoading(false)
          }}
          isLoading={loading}
          canonicalName={operatorData?.name}
        />
      </div>
      {children}
    </div>
  )
}

/**
 * ShorthandNodeWithSimpleValue is a node of the type:
 * { $getData: "simple.property.path"}
 *
 * Note that the "node" here is actually the value "simple.property.path",
 * whereas with with the ShorthandNodeCollection we are targeting the
 * "wrapper" (i.e. the parentData)
 */

export const ShorthandNodeWithSimpleValue: React.FC<CustomNodeProps<ShorthandProps>> = (props) => {
  const { data: d, customNodeProps, children } = props
  const data = d as Record<string, string>

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const { figTree, evaluateNode, topLevelAliases } = customNodeProps
  const [loading, setLoading] = useState(false)

  if (!figTree) return null

  const property = Object.keys(data)[0]

  const operatorAlias = property.slice(1)

  const operatorData = getCurrentOperator(operatorAlias, figTree.getOperators()) as OperatorMetadata

  const { backgroundColor, textColor, displayName } = operatorDisplay[operatorData.name]

  const aliases = { ...topLevelAliases, ...getAliases(data) }

  return (
    <div className="ft-shorthand-node">
      <EvaluateButton
        name={property}
        backgroundColor={backgroundColor}
        textColor={textColor}
        evaluate={async (e) => {
          setLoading(true)
          await evaluateNode({ ...data, ...aliases }, e)
          setLoading(false)
        }}
        isLoading={loading}
        isShorthand
      />
      {/* Negative margin to cancel out Json-Edit-React indent for this case */}
      <div style={{ marginLeft: '-1.7em' }}>{children}</div>
      <div className="ft-display-name">
        <a href={README_URL + operatorData.name.toLowerCase()} target="_blank">
          {displayName}
        </a>
      </div>
    </div>
  )
}

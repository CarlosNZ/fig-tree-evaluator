import React, { useState } from 'react'
import {
  FigTreeEvaluator,
  Operator as OperatorName,
  OperatorMetadata,
  EvaluatorNode,
} from 'fig-tree-evaluator'
import { CustomNodeProps } from './_imports'
import { Icons } from './Icons'
// import './styles.css'
import { getAliases, getButtonFontSize, getCurrentOperator, operatorStringRegex } from './helpers'
import { OperatorDisplay, operatorDisplay } from './operatorDisplay'
import { DisplayBar } from './DisplayBar'

const README_URL = 'https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#'

export interface ShorthandProps {
  figTree: FigTreeEvaluator
  evaluateNode: (expression: EvaluatorNode, e: React.MouseEvent) => Promise<void>
  operatorDisplay: Partial<Record<OperatorName, OperatorDisplay>>
  topLevelAliases: Record<string, EvaluatorNode>
}

export const ShorthandNode: React.FC<CustomNodeProps<ShorthandProps>> = (props) => {
  const { data: d, nodeData, customNodeProps, getStyles } = props
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
      <div
        className="ft-display-button"
        style={{ backgroundColor, color: textColor, width: 'unset' }}
        onClick={async (e) => {
          setLoading(true)
          await evaluateNode({ ...data, ...aliases }, e)
          setLoading(false)
        }}
      >
        {!loading ? (
          <>
            <span
              className="ft-operator-alias"
              style={{
                fontSize: getButtonFontSize(property),
                fontStyle: 'italic',
              }}
            >
              {property}
            </span>
            {Icons.evaluate}
          </>
        ) : (
          <div style={{ width: '100%', textAlign: 'center' }}>
            <span
              className="ft-loader"
              style={{ width: '1.5em', height: '1.5em', borderTopColor: textColor }}
            ></span>
          </div>
        )}
      </div>
      <div className="jer-value-string" style={getStyles('string', nodeData)}>
        &quot;{data[property]}&quot;
      </div>
      <div className="ft-display-name">
        <a href={README_URL + operatorData.name.toLowerCase()} target="_blank">
          {displayName}
        </a>
      </div>
    </div>
  )
}

export const ShorthandNodeWrapper: React.FC<CustomNodeProps<ShorthandProps>> = ({
  children,
  nodeData: { key, parentData },
  customNodeProps,
}) => {
  const { figTree, evaluateNode, topLevelAliases } = customNodeProps ?? {}
  if (!figTree || !evaluateNode) return null

  const [loading, setLoading] = useState(false)

  if (!figTree) return null

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

export const ShorthandStringNode: React.FC<CustomNodeProps<ShorthandProps>> = (props) => {
  const { data: d, customNodeProps } = props

  const data = d as string

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const { figTree, evaluateNode } = customNodeProps
  const [loading, setLoading] = useState(false)

  if (!figTree) return null

  const property = data.match(operatorStringRegex)

  const operatorAlias = property?.[1].slice(1)

  const operatorData = getCurrentOperator(operatorAlias, figTree.getOperators()) as OperatorMetadata

  const { backgroundColor, textColor, displayName } = operatorDisplay[operatorData.name]

  return (
    <div className="ft-shorthand-string">
      <div
        className="ft-display-button"
        style={{ backgroundColor, color: textColor, width: 'unset' }}
        onClick={async (e) => {
          setLoading(true)
          await evaluateNode(data, e)
          setLoading(false)
        }}
      >
        {!loading ? (
          <>
            <span
              className="ft-operator-alias"
              style={{
                fontSize: '0.9em',
                fontStyle: 'italic',
                // fontWeight: '400',
              }}
            >
              {data}
            </span>
            {Icons.evaluate}
          </>
        ) : (
          <div style={{ width: '100%', textAlign: 'center' }}>
            <span
              className="ft-loader"
              style={{ width: '1.5em', height: '1.5em', borderTopColor: textColor }}
            ></span>
          </div>
        )}
      </div>
      <div className="ft-display-name">
        <a href={README_URL + operatorData.name.toLowerCase()} target="_blank">
          {displayName}
        </a>
      </div>
    </div>
  )
}

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
} from './exports/figTreeImport'
import { CustomNodeProps, IconEdit, IconOk, IconCancel } from './exports/JsonEditReactImport'
import { Select, SelectOption } from './Select'
import { Icons } from './Icons'
import './styles.css'
import {
  getButtonFontSize,
  getCurrentOperator,
  getDefaultValue,
  isCollection,
  operatorStringRegex,
} from './helpers'
import { NodeTypeSelector } from './NodeTypeSelector'
import { cleanOperatorNode, getAvailableProperties } from './validator'
import { OperatorDisplay, operatorDisplay } from './operatorDisplay'
import { DisplayBar } from './Operator'

const README_URL = 'https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#'

export interface OperatorProps {
  figTree: FigTreeEvaluator
  evaluateNode: (expression: EvaluatorNode) => Promise<void>
  operatorDisplay: Partial<Record<OperatorName, OperatorDisplay>>
}

export const ShorthandNode: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
  const { data, parentData, nodeData, onEdit, customNodeProps, children, getStyles } = props

  const { path } = nodeData
  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const { figTree, evaluateNode } = customNodeProps
  const [loading, setLoading] = useState(false)

  if (!figTree) return null

  const property = Object.keys(data)[0]

  const operatorAlias = property.slice(1)

  const operatorData = getCurrentOperator(operatorAlias, figTree.getOperators()) as OperatorMetadata

  const { backgroundColor, textColor, displayName } = operatorDisplay[operatorData.name]

  return (
    <div className="ft-shorthand-node">
      <div
        className="ft-display-button"
        style={{ backgroundColor, color: textColor, width: 'unset' }}
        onClick={() => evaluateNode(data)}
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
              className="loader"
              style={{ width: '1.5em', height: '1.5em', borderTopColor: textColor }}
            ></span>
          </div>
        )}
      </div>
      <div
        // onDoubleClick={() => setIsEditing(true)}
        // onClick={(e) => {
        //   if (e.getModifierState('Control') || e.getModifierState('Meta')) setIsEditing(true)
        // }}
        className="jer-value-string"
        style={getStyles('string', nodeData)}
      >
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

export const ShorthandNodeWrapper: React.FC<CustomNodeProps<OperatorProps>> = ({
  children,
  nodeData: { key, parentData },
  isEditing,
  customNodeProps,
}) => {
  const { figTree, evaluateNode } = customNodeProps
  const [loading, setLoading] = useState(false)

  if (!figTree) return null

  //   console.log(parentData)

  const operatorAlias = (key as string).slice(1)

  console.log('operatorAlias', operatorAlias)

  const operatorData = getCurrentOperator(operatorAlias, figTree.getOperators()) as OperatorMetadata

  return (
    <div className="ft-shorthand-wrapper">
      <div className="ft-shorthand-display-bar">
        <DisplayBar
          name={key as string}
          setIsEditing={() => {}}
          evaluate={async () => {
            setLoading(true)
            await evaluateNode(parentData)
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

export const ShorthandStringNode: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
  const { data, parentData, nodeData, onEdit, customNodeProps } = props

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const { figTree, evaluateNode } = customNodeProps
  //   const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!figTree) return null

  const property = data.match(operatorStringRegex)

  const operatorAlias = property[1].slice(1)

  const operatorData = getCurrentOperator(operatorAlias, figTree.getOperators()) as OperatorMetadata

  const { backgroundColor, textColor, displayName } = operatorDisplay[operatorData.name]

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
    <div className="ft-shorthand-string">
      <div
        className="ft-display-button"
        style={{ backgroundColor, color: textColor, width: 'unset' }}
        onClick={() => evaluateNode(data)}
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
              className="loader"
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

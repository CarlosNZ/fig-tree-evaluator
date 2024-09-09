import React from 'react'
import { CustomFunctionMetadata, OperatorNode, OperatorParameterMetadata } from 'fig-tree-evaluator'
import { CustomNodeProps, IconOk, IconCancel } from './_imports'
import { Select, SelectOption } from './Select'
import { Icons } from './Icons'
// import './styles.css'
import { getButtonFontSize } from './helpers'
import { OperatorProps, PropertySelector } from './Operator'
import { DisplayBar } from './DisplayBar'
import { NodeTypeSelector } from './NodeTypeSelector'
import { useCommon } from './useCommon'
import { getAvailableProperties } from './validator'

export const CustomOperator: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
  const { data, parentData, nodeData, onEdit, customNodeProps } = props

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const { handleCancel, handleSubmit, expressionPath, isEditing, setIsEditing, evaluate, loading } =
    useCommon({
      customNodeProps,
      parentData,
      nodeData,
      onEdit,
    })

  const { figTree } = customNodeProps

  if (!figTree) return null

  const functionData = figTree.getCustomFunctions().find((f) => f.name === data)

  if (!functionData) return null

  const availableProperties = getAvailableProperties([], parentData as OperatorNode)

  const { textColor, backgroundColor } = functionData

  const operatorData =
    textColor && backgroundColor
      ? { textColor, backgroundColor, displayName: 'Custom Operator' }
      : undefined

  return (
    <div className="ft-custom ft-operator">
      {isEditing ? (
        <div className="ft-toolbar ft-operator-toolbar">
          <NodeTypeSelector
            value="customOperator"
            changeNode={(newValue) => onEdit(newValue, expressionPath)}
            figTree={figTree}
            currentExpression={parentData}
          />
          :
          <FunctionSelector
            value={(parentData as OperatorNode)?.functionName as string}
            functions={figTree.getCustomFunctions()}
            updateNode={({ name, numRequiredArgs, argsDefault, inputDefault }) => {
              const newNode = { operator: name, ...inputDefault } as Record<string, unknown>
              delete newNode.input
              delete newNode.args
              if (argsDefault) newNode.args = argsDefault
              if (numRequiredArgs && !argsDefault && !inputDefault)
                newNode.args = new Array(numRequiredArgs).fill(null)
              onEdit(newNode, expressionPath)
            }}
          />
          {availableProperties.length > 0 && (
            <PropertySelector
              availableProperties={availableProperties as OperatorParameterMetadata[]}
              updateNode={(newProperty) =>
                onEdit({ ...parentData, ...newProperty }, expressionPath)
              }
            />
          )}
          <div className="ft-clickable ft-okay-icon" onClick={handleSubmit}>
            <IconOk size="2em" style={{ color: 'green' }} />
          </div>
          <div className="ft-clickable ft-cancel-icon" onClick={handleCancel}>
            <IconCancel size="2.8em" style={{ color: 'rgb(203, 75, 22)' }} />
          </div>
        </div>
      ) : (
        <DisplayBar
          name={functionData.name}
          description={functionData.description}
          setIsEditing={() => setIsEditing(true)}
          evaluate={evaluate}
          isLoading={loading}
          canonicalName={'CUSTOM_FUNCTIONS'}
          operatorDisplay={operatorData}
        />
      )}
    </div>
  )
}

export interface EvaluateButtonProps {
  name?: string
  backgroundColor: string
  textColor: string
  evaluate: () => void
  isLoading: boolean
}

export const EvaluateButton: React.FC<EvaluateButtonProps> = ({
  name,
  backgroundColor,
  textColor,
  evaluate,
  isLoading,
}) => {
  return (
    <div
      className="ft-display-button"
      style={{ backgroundColor, color: textColor }}
      onClick={evaluate}
    >
      {!isLoading ? (
        <>
          {name && (
            <span
              className="ft-operator-alias"
              style={{
                fontSize: getButtonFontSize(name),
                fontStyle: 'inherit',
              }}
            >
              {name}
            </span>
          )}
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
  )
}

export const FunctionSelector: React.FC<{
  value: string
  functions: readonly CustomFunctionMetadata[]
  updateNode: (functionDefinition: CustomFunctionMetadata) => void
}> = ({ value, functions, updateNode }) => {
  const functionOptions = functions.map(({ name, numRequiredArgs }) => ({
    key: name,
    label: `${name} (${numRequiredArgs})`,
    value: name,
  }))

  const handleFunctionSelect = (selected: SelectOption) => {
    const func = functions.find((f) => f.name === selected.value)
    if (func) updateNode(func)
  }

  return (
    <div className="ft-function-select">
      <Select
        value={functionOptions.find((option) => value === option.value)}
        options={functionOptions}
        placeholder="Select function"
        onChange={handleFunctionSelect as (s: unknown) => void}
      />
    </div>
  )
}

export interface DropdownOption {
  label: string
  options: { value: string; label: string }[]
}

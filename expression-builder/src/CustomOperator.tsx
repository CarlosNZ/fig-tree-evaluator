import React, { useEffect, useMemo, useState } from 'react'
import {
  // fig-tree
  CustomFunctionMetadata,
  FigTreeEvaluator,
  OperatorAlias,
  OperatorMetadata,
  OperatorNode,
  OperatorParameterMetadata,
  EvaluatorNode,
  FragmentParameterMetadata,
  Operator as OpType,
  // json-edit-react
  CustomNodeProps,
  IconEdit,
  IconOk,
  IconCancel,
} from './_imports'
import { Select, SelectOption } from './Select'
import { Icons } from './Icons'
// import './styles.css'
import { getButtonFontSize, getDefaultValue } from './helpers'
import { DisplayBar } from './Operator'
import { NodeTypeSelector } from './NodeTypeSelector'
import { useCommon } from './useCommon'

export interface OperatorProps {
  figTree: FigTreeEvaluator
  evaluateNode: (expression: EvaluatorNode) => Promise<void>
  topLevelAliases: Record<string, EvaluatorNode>
}

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
              const newNode = { ...parentData, functionName: name } as Record<string, unknown>
              delete newNode.input
              delete newNode.args
              if (inputDefault) newNode.input = inputDefault
              if (argsDefault) newNode.args = argsDefault
              if (numRequiredArgs && !argsDefault && !inputDefault)
                newNode.args = new Array(numRequiredArgs).fill(null)
              onEdit(newNode, expressionPath)
            }}
          />
          {/* {availableProperties.length > 0 && (
            <PropertySelector
              availableProperties={availableProperties as OperatorParameterMetadata[]}
              updateNode={(newProperty) =>
                onEdit({ ...parentData, ...newProperty }, expressionPath)
              }
            />
          )} */}
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
          setIsEditing={() => setIsEditing(true)}
          evaluate={evaluate}
          isLoading={loading}
          canonicalName={'CUSTOM_FUNCTIONS'}
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
            className="loader"
            style={{ width: '1.5em', height: '1.5em', borderTopColor: textColor }}
          ></span>
        </div>
      )}
    </div>
  )
}

const OperatorSelector: React.FC<{
  value: OperatorAlias
  figTree: FigTreeEvaluator
  changeOperator: (operator: OperatorAlias) => void
}> = ({ value, figTree, changeOperator }) => {
  const operatorOptions = useMemo(() => getOperatorOptions(figTree.getOperators()), [figTree])

  return (
    <Select
      className="ft-operator-select"
      options={operatorOptions}
      value={{ value, label: value }}
      onChange={(newValue) => changeOperator((newValue as SelectOption).value)}
      // styles={{ control: { minWidth: '10em' } }}
    />
  )
}

export const PropertySelector: React.FC<{
  availableProperties: OperatorParameterMetadata[] | FragmentParameterMetadata[]
  updateNode: (newField: any) => void
}> = ({ availableProperties, updateNode }) => {
  const propertyOptions = availableProperties.map((property) => ({
    label: property.name,
    value: property,
  }))

  const handleAddProperty = (selected: OperatorParameterMetadata) => {
    updateNode({ [selected.name]: selected.default ?? getDefaultValue(selected.type) })
  }

  return (
    <Select
      className="ft-property-select"
      options={propertyOptions}
      value={null}
      placeholder="Add property"
      onChange={(selected) =>
        handleAddProperty((selected as { label: string; value: OperatorParameterMetadata }).value)
      }
    />
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

const getOperatorOptions = (operators: readonly OperatorMetadata[]) => {
  const options: DropdownOption[] = []
  for (const op of operators) {
    const operatorAliases = op.aliases.map((alias) => ({ value: alias, label: alias }))
    options.push({ label: op.name, options: operatorAliases })
  }

  return options
}

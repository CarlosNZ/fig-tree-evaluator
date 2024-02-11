import React, { useMemo, useState } from 'react'
import {
  CustomFunctionMetadata,
  FigTreeEvaluator,
  OperatorAlias,
  OperatorMetadata,
  OperatorNode,
  OperatorParameterMetadata,
} from 'fig-tree-evaluator'
import { CustomNodeProps } from 'json-edit-react'
import { Select, SelectOption } from './Select'
import './styles.css'
import { getCurrentOperator, getDefaultValue } from './helpers'
import { NodeTypeSelector } from './NodeTypeSelector'
import { cleanOperatorNode, getAvailableProperties } from './validator'

// interface OperatorProps {
//   figTree: FigTreeEvaluator
//   isCustomFunctions?: boolean
// }

export const Operator: React.FC<CustomNodeProps> = (props) => {
  const {
    data,
    parentData,
    path,
    onEdit,
    customProps: { figTree, isCustomFunctions, onEvaluate },
  } = props

  const [isEditing, setIsEditing] = useState(false)

  const expressionPath = path.slice(0, -1)
  const operatorData = getCurrentOperator(parentData, figTree.getOperators()) as OperatorMetadata
  const thisOperator = data as OperatorAlias
  const availableProperties = getAvailableProperties(operatorData, parentData as OperatorNode)

  return (
    <div className="ft-custom ft-operator">
      <div className="ft-toolbar ft-operator-toolbar">
        {isEditing && (
          <>
            <NodeTypeSelector
              value="operator"
              changeNode={(newValue) => onEdit(newValue, expressionPath)}
              showFragments={figTree.getFragments().length > 0}
            />
            :
            <OperatorSelector
              value={thisOperator}
              figTree={figTree}
              changeOperator={(operator: OperatorAlias) =>
                onEdit(
                  { ...cleanOperatorNode(parentData as OperatorNode), operator },
                  expressionPath
                )
              }
            />
            {availableProperties.length > 0 && (
              <PropertySelector
                availableProperties={availableProperties as OperatorParameterMetadata[]}
                updateNode={(newProperty) =>
                  onEdit({ ...parentData, ...newProperty }, expressionPath)
                }
              />
            )}
            <button
              style={{ border: '1px solid black', maxWidth: 200 }}
              onClick={() => setIsEditing(false)}
            >
              Done
            </button>
          </>
        )}
        {!isEditing && (
          <div style={{ display: 'flex', gap: '1em', alignItems: 'center' }}>
            <span>operator:</span>
            <span style={{ fontSize: '2em' }}>{thisOperator}</span>
            <span onClick={() => setIsEditing(true)}>Edit</span>
            <button
              style={{ border: '1px solid black', maxWidth: 200 }}
              onClick={() => {
                figTree.evaluate(parentData).then((result) => onEvaluate(result))
              }}
            >
              Evaluate
            </button>
          </div>
        )}
      </div>
      {isCustomFunctions && (
        <FunctionSelector
          value={(parentData as OperatorNode)?.functionPath as string}
          functions={figTree.getCustomFunctions()}
          updateNode={(functionPath, numArgs) => {
            console.log(functionPath, numArgs)
            const newNode = { ...parentData, functionPath } as Record<string, unknown>
            if (numArgs) newNode.args = new Array(numArgs).fill(null)
            onEdit(newNode, expressionPath)
          }}
        />
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
    />
  )
}

export const PropertySelector: React.FC<{
  availableProperties: OperatorParameterMetadata[]
  updateNode: (newField: any) => void
}> = ({ availableProperties, updateNode }) => {
  const propertyOptions = availableProperties.map((property) => ({
    label: property.name,
    value: property,
  }))

  const handleAddProperty = (selected) => {
    updateNode({ [selected.name]: selected.default ?? getDefaultValue(selected.type) })
  }

  return (
    <Select
      className="ft-property-select"
      options={propertyOptions}
      value={null}
      placeholder="Add property"
      onChange={(selected) => handleAddProperty((selected as SelectOption).value)}
    />
  )
}

export const FunctionSelector: React.FC<{
  value: string
  functions: readonly CustomFunctionMetadata[]
  updateNode: (functionPath: string, numArgs: number) => void
}> = ({ value, functions, updateNode }) => {
  const functionOptions = functions.map(({ name, numRequiredArgs }) => ({
    key: name,
    label: `${name} (${numRequiredArgs})`,
    value: name,
  }))

  const handleFunctionSelect = (selected: SelectOption) => {
    const { name, numRequiredArgs = 0 } = functions.find((f) => f.name === selected.value) ?? {}
    console.log(name, numRequiredArgs)
    if (name) updateNode(name, numRequiredArgs)
  }

  return (
    <div className="ft-function-toolbar">
      <span>Select function: </span>
      <Select
        value={functionOptions.find((option) => value === option.value)}
        options={functionOptions}
        onChange={handleFunctionSelect}
      />
    </div>
  )
}

export interface DropdownOption {
  key: string
  value: string
  text: string
}

const getOperatorOptions = (operators: readonly OperatorMetadata[]) => {
  const options: DropdownOption[] = []
  for (const op of operators) {
    const operatorAliases = op.aliases.map((alias) => ({ value: alias, label: alias }))
    options.push({ label: op.name, options: operatorAliases })
  }

  return options
}

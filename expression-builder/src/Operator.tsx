import React, { useMemo, useState } from 'react'
import { FigTreeEvaluator, OperatorAlias, OperatorMetadata } from 'fig-tree-evaluator'
import { dequal } from 'dequal/lite'
import { CustomNodeProps } from './json-edit-react/types'
import './styles.css'
import { validateOperatorState, getCurrentOperator, getDefaultValue } from './helpers'
import { NodeTypeSelector } from './NodeTypeSelector'

interface OperatorProps {
  figTree: FigTreeEvaluator
}

export const Operator: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
  const {
    data,
    parentData,
    path,
    onEdit,
    customProps: { figTree },
  } = props

  const expressionPath = path.slice(0, -1)
  const operatorData = getCurrentOperator(parentData, figTree.getOperators())
  const thisOperator = data as OperatorAlias

  const { updatedNode = {}, availableProperties = [] } = operatorData
    ? validateOperatorState(parentData, operatorData.operator)
    : {}

  if (!dequal(parentData, updatedNode)) {
    setTimeout(() => onEdit(updatedNode, expressionPath), 100)
  }

  return (
    <div className="ft-operator-block">
      <NodeTypeSelector
        value="operator"
        changeNode={(newValue) => onEdit(newValue, expressionPath)}
      />
      :
      <OperatorSelector
        value={thisOperator}
        figTree={figTree}
        changeOperator={(operator: OperatorAlias) =>
          onEdit({ ...parentData, operator }, expressionPath)
        }
      />
      {availableProperties.length > 0 && (
        <PropertySelector
          availableProperties={availableProperties}
          updateNode={(newProperty) => onEdit({ ...parentData, ...newProperty }, expressionPath)}
        />
      )}
      <button
        style={{ border: '1px solid black', maxWidth: 200 }}
        onClick={() => {
          figTree.evaluate(parentData).then((result) => console.log(result))
        }}
      >
        Evaluate
      </button>
    </div>
  )
}

const OperatorSelector: React.FC<{
  value: OperatorAlias
  figTree: FigTreeEvaluator
  changeOperator: (operator: OperatorAlias) => void
}> = ({ value, figTree, changeOperator }) => {
  const operatorOptions = useMemo(() => getOperatorOptions(figTree.getOperators()), [figTree])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    changeOperator(e.target.value)
  }

  return (
    // <div style={{ display: 'flex' }}>
    <select value={value} onChange={handleChange} style={{ maxWidth: 150 }}>
      {operatorOptions.map(({ key, text, value }) => (
        <option key={key} value={value}>
          {text}
        </option>
      ))}
    </select>
    // </div>
  )
}

export const PropertySelector: React.FC<{
  availableProperties: {
    name: string
    description?: string
    aliases?: string[]
    required: boolean
    type: string
    default?: unknown
  }[]
  updateNode: (newField: any) => void
}> = ({ availableProperties, updateNode }) => {
  const propertyOptions = availableProperties.map(({ name }) => ({
    key: name,
    text: name,
    value: name,
  }))

  const [value, setValue] = useState<string>()

  const handleAddProperty = () => {
    const selected = availableProperties.find((property) => property.name === value)
    if (selected) {
      updateNode({ [selected.name]: selected.default ?? getDefaultValue(selected.type) })
      setValue(undefined)
    }
  }

  return (
    <div style={{ display: 'flex' }}>
      <span>Add Property: </span>
      <select value={value} onChange={(e) => setValue(e.target.value)} style={{ maxWidth: 200 }}>
        <option label=" " hidden />
        {propertyOptions.map(({ key, text, value }) => (
          <option key={key} value={value}>
            {text}
          </option>
        ))}
      </select>
      {value && (
        <button style={{ border: '1px solid black', maxWidth: 200 }} onClick={handleAddProperty}>
          +
        </button>
      )}
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
    options.push({
      key: op.operator,
      value: op.operator,
      text: `${op.operator}`,
    })
    op.aliases.forEach((alias) => options.push({ key: alias, value: alias, text: ` • ${alias}` }))
  }

  return options
}

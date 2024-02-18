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
} from 'fig-tree-evaluator'
import { CustomNodeProps, IconEdit, IconOk } from './package'
// import { CustomNodeProps, IconEdit } from 'json-edit-react'
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

export const Operator: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
  const {
    data,
    parentData,
    nodeData: { path },
    onEdit,
    customNodeProps,
  } = props

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const { figTree, evaluateNode } = customNodeProps
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!figTree) return null

  const expressionPath = path.slice(0, -1)
  const operatorData = getCurrentOperator(
    parentData.operator,
    figTree.getOperators(),
    figTree
  ) as OperatorMetadata
  const thisOperator = data as OperatorAlias

  const availableProperties = getAvailableProperties(operatorData, parentData as OperatorNode)

  const isCustomFunction = operatorData.name === 'CUSTOM_FUNCTIONS'
  const opDisplay = operatorDisplay[operatorData.name]

  return (
    <div className="ft-custom ft-operator">
      {isEditing ? (
        <div className="ft-toolbar ft-operator-toolbar">
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
              onEdit({ ...cleanOperatorNode(parentData as OperatorNode), operator }, expressionPath)
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
          <div className="ft-okay-icon" onClick={() => setIsEditing(false)}>
            <IconOk size="2em" style={{ color: 'green' }} />
          </div>
        </div>
      ) : (
        <DisplayBar
          name={thisOperator}
          setIsEditing={() => setIsEditing(true)}
          evaluate={async () => {
            setLoading(true)
            await evaluateNode(parentData)
            setLoading(false)
          }}
          isLoading={loading}
          canonicalName={operatorData.name}
          {...opDisplay}
        />
      )}
      {isCustomFunction && isEditing && (
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

interface DisplayBarProps extends OperatorDisplay {
  name: OperatorAlias
  setIsEditing: () => void
  evaluate: () => void
  isLoading: boolean
  canonicalName: string
}

export const DisplayBar: React.FC<DisplayBarProps> = ({
  name,
  setIsEditing,
  evaluate,
  isLoading,
  backgroundColor,
  textColor,
  canonicalName,
  displayName,
}) => {
  return (
    <div className="ft-display-bar">
      <div className="ft-button-and-edit">
        <div
          className="ft-display-button"
          style={{ backgroundColor, color: textColor }}
          onClick={evaluate}
        >
          {!isLoading ? (
            <>
              <span className="ft-operator-alias" style={{ fontSize: getButtonFontSize(name) }}>
                {name}
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
        <span onClick={() => setIsEditing()} className="ft-edit-icon">
          <IconEdit size="1.5em" style={{ color: 'rgb(42, 161, 152)' }} />
        </span>
      </div>
      <div className="ft-display-name">
        <a href={README_URL + canonicalName.toLowerCase()} target="_blank">
          {displayName}
        </a>
      </div>
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
    <div className="ft-function-select">
      <Select
        value={functionOptions.find((option) => value === option.value)}
        options={functionOptions}
        placeholder="Select function"
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

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
import { getAliases, getButtonFontSize, getCurrentOperator, getDefaultValue } from './helpers'
import { NodeTypeSelector } from './NodeTypeSelector'
import { cleanOperatorNode, getAvailableProperties } from './validator'
import { operatorDisplay } from './operatorDisplay'

const README_URL = 'https://github.com/CarlosNZ/fig-tree-evaluator?tab=readme-ov-file#'

export interface OperatorProps {
  figTree: FigTreeEvaluator
  evaluateNode: (expression: EvaluatorNode) => Promise<void>
  topLevelAliases: Record<string, EvaluatorNode>
}

export const Operator: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
  const {
    data,
    parentData,
    nodeData: { path, level },
    onEdit,
    customNodeProps,
  } = props

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const { figTree, evaluateNode, topLevelAliases } = customNodeProps
  const [prevState, setPrevState] = useState(parentData)
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!figTree) return null

  const expressionPath = path.slice(0, -1)
  const operatorData = getCurrentOperator(
    (parentData as OperatorNode).operator,
    figTree.getOperators()
  ) as OperatorMetadata
  const thisOperator = data as OperatorAlias

  if (!operatorData) return null

  const availableProperties = getAvailableProperties(operatorData, parentData as OperatorNode)

  const isCustomFunction = operatorData.name === 'CUSTOM_FUNCTIONS'

  const fragments = figTree.getFragments()

  const handleSubmit = () => {
    setPrevState(parentData)
    setIsEditing(false)
  }

  const handleCancel = () => {
    onEdit(prevState, expressionPath)
    setIsEditing(false)
  }

  const listenForSubmit = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') handleCancel()
  }

  useEffect(() => {
    if (isEditing) {
      setPrevState(parentData)
      document.addEventListener('keydown', listenForSubmit)
    } else document.removeEventListener('keydown', listenForSubmit)
    return () => document.removeEventListener('keydown', listenForSubmit)
  }, [isEditing])

  const aliases = { ...topLevelAliases, ...getAliases(parentData) }

  return (
    <div className="ft-custom ft-operator">
      {isEditing ? (
        <div className="ft-toolbar ft-operator-toolbar">
          <NodeTypeSelector
            value="operator"
            changeNode={(newValue) => onEdit(newValue, expressionPath)}
            defaultFragment={fragments.length > 0 ? fragments[0].name : undefined}
          />
          :
          <OperatorSelector
            value={thisOperator}
            figTree={figTree}
            changeOperator={(operator: OperatorAlias) => {
              // If we're just changing to another alias of the same operator
              // type, then don't clean the node
              const newNode = operatorData.aliases.includes(operator)
                ? { ...parentData, operator }
                : { ...cleanOperatorNode(parentData as OperatorNode), operator }
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
          name={thisOperator}
          setIsEditing={() => setIsEditing(true)}
          evaluate={async () => {
            setLoading(true)
            await evaluateNode({ ...parentData, ...aliases })
            setLoading(false)
          }}
          isLoading={loading}
          canonicalName={operatorData.name}
        />
      )}
      {isCustomFunction && isEditing && (
        <FunctionSelector
          value={(parentData as OperatorNode)?.functionPath as string}
          functions={figTree.getCustomFunctions()}
          updateNode={(functionPath, numArgs) => {
            const newNode = { ...parentData, functionPath } as Record<string, unknown>
            if (numArgs) newNode.args = new Array(numArgs).fill(null)
            onEdit(newNode, expressionPath)
          }}
        />
      )}
    </div>
  )
}

interface DisplayBarProps {
  name: OperatorAlias
  setIsEditing: () => void
  evaluate: () => void
  isLoading: boolean
  canonicalName: OpType | 'FRAGMENT'
}

export const DisplayBar: React.FC<DisplayBarProps> = ({
  name,
  setIsEditing,
  evaluate,
  isLoading,
  canonicalName,
}) => {
  const { backgroundColor, textColor, displayName } = operatorDisplay[canonicalName]
  const isShorthand = name.startsWith('$')
  const link = README_URL + canonicalName.toLowerCase() + (canonicalName === 'FRAGMENT' ? 's' : '')

  return (
    <div className="ft-display-bar">
      <div className="ft-button-and-edit">
        <EvaluateButton
          name={name}
          backgroundColor={backgroundColor}
          textColor={textColor}
          evaluate={evaluate}
          isLoading={isLoading}
        />
        {!isShorthand && (
          <span onClick={() => setIsEditing()} className="ft-clickable ft-edit-icon">
            <IconEdit size="1.5em" style={{ color: 'rgb(42, 161, 152)' }} />
          </span>
        )}
      </div>
      <div className="ft-display-name">
        <a href={link} target="_blank">
          {displayName}
        </a>
      </div>
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

import React, { useMemo } from 'react'
import { FigTreeEvaluator, OperatorAlias, OperatorMetadata } from 'fig-tree-evaluator'
import { CustomNodeProps } from './json-edit-react/types'
import './styles.css'
import { buildOperatorProps, getCurrentOperator } from './helpers'
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

  console.log('operatorData', operatorData)

  const {
    // currentProps = [],
    additionalProps = {},
    availableProps = [],
    // aliases=[],
    // fallback,
    // outputType,
    // useCache,
  } = operatorData ? buildOperatorProps(parentData, operatorData.operator) : {}

  console.log('availableProps', availableProps)

  if (Object.keys(additionalProps).length > 0) {
    setTimeout(() => onEdit({ ...parentData, ...additionalProps }, expressionPath), 100)
  }

  return (
    <div className="ft-operator-block">
      <NodeTypeSelector
        value="operator"
        changeNode={(newValue: unknown) => onEdit(newValue, expressionPath)}
      />
      <OperatorSelector
        value={thisOperator}
        figTree={figTree}
        changeOperator={(operator: OperatorAlias) => onEdit({ operator }, expressionPath)}
      />
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
    <div style={{ display: 'flex' }}>
      <span>Operator: </span>
      <select value={value} onChange={handleChange} style={{ maxWidth: 200 }}>
        {operatorOptions.map(({ key, text, value }) => (
          <option key={key} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  )
}

interface DropdownOption {
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
      text: `${op.operator} - ${op.description}`,
    })
    op.aliases.forEach((alias) => options.push({ key: alias, value: alias, text: ` - ${alias}` }))
  }

  return options
}

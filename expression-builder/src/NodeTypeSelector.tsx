import React, { useMemo } from 'react'
import { FigTreeEvaluator } from 'fig-tree-evaluator'
import { Select, SelectOption } from './Select'

export type NodeType = 'operator' | 'fragment' | 'value' | 'customOperator'

const nodeTypeOptions = [
  { key: 'operator', label: 'Operator', value: 'operator' },
  { key: 'value', label: 'Value', value: 'value' },
]

export const NodeTypeSelector: React.FC<{
  value: NodeType
  changeNode: (type: unknown) => void
  figTree: FigTreeEvaluator
  currentExpression?: object | unknown[] | null
}> = ({ value, changeNode, figTree, currentExpression }) => {
  const fragments = useMemo(() => figTree.getFragments(), [figTree])
  const functions = useMemo(() => figTree.getCustomFunctions(), [figTree])

  const options = [
    ...nodeTypeOptions,
    ...(fragments.length > 0 ? [{ key: 'fragment', label: 'Fragment', value: 'fragment' }] : []),
    ...(functions.length > 0
      ? [{ key: 'customOperator', label: 'Custom Operator', value: 'customOperator' }]
      : []),
  ]

  const currentSelection = options.find((option) => option.value === value)

  const defaultFunction = functions[0]
  const defaultFragment = fragments[0]

  const handleChange = (selected: SelectOption) => {
    const newType = selected.value
    if (currentSelection?.value === newType) return

    switch (newType) {
      case 'operator':
        changeNode({ operator: '+' })
        break
      case 'fragment':
        changeNode({ fragment: defaultFragment.name })
        break
      case 'customOperator':
        const { name, numRequiredArgs, argsDefault, inputDefault } = defaultFunction
        const newNode = { ...currentExpression, operator: name } as Record<string, unknown>
        delete newNode.input
        delete newNode.args
        if (inputDefault) newNode.input = inputDefault
        if (argsDefault) newNode.args = argsDefault
        if (numRequiredArgs && !argsDefault && !inputDefault)
          newNode.args = new Array(numRequiredArgs).fill(null)
        changeNode(newNode)
        break
      case 'value':
        changeNode('DEFAULT STRING')
    }
  }

  return (
    <Select
      className="ft-node-type-select"
      value={currentSelection}
      options={options}
      onChange={handleChange as (s: unknown) => void}
      onKeyDown={(e) => console.log('SELECT Key', e.key)}
    />
  )
}

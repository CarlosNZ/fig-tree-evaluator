import React from 'react'
import { Select, SelectOption } from './Select'

export type NodeType = 'operator' | 'fragment' | 'value'

const nodeTypeOptions = [
  { key: 'operator', label: 'Operator', value: 'operator' },
  { key: 'value', label: 'Value', value: 'value' },
]

export const NodeTypeSelector: React.FC<{
  value: NodeType
  changeNode: (type: unknown) => void
  showFragments: boolean
}> = ({ value, changeNode, showFragments }) => {
  const options = [
    ...nodeTypeOptions,
    ...(showFragments ? [{ key: 'fragment', label: 'Fragment', value: 'fragment' }] : []),
  ]

  const handleChange = (selected: SelectOption) => {
    const newType = selected.value
    switch (newType) {
      case 'operator':
        changeNode({ operator: '+' })
        break
      case 'fragment':
        changeNode({ fragment: '' })
        break
      case 'value':
        changeNode('DEFAULT STRING')
    }
  }

  return (
    <Select
      value={options.find((option) => option.value === value)}
      options={options}
      onChange={handleChange}
    />
  )
}

import React from 'react'

export type NodeType = 'operator' | 'fragment' | 'value'

const nodeTypeOptions = [
  { key: 'operator', text: 'Operator', value: 'operator' },
  { key: 'fragment', text: 'Fragment', value: 'fragment' },
  { key: 'value', text: 'Value', value: 'value' },
]

export const NodeTypeSelector: React.FC<{
  value: NodeType
  changeNode: (type: unknown) => void
}> = ({ value, changeNode }) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as NodeType
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
    <select value={value} onChange={handleChange}>
      {nodeTypeOptions.map(({ key, text, value }) => (
        <option key={key} value={value}>
          {text}
        </option>
      ))}
    </select>
  )
}

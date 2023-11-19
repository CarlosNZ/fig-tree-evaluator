import React, { useMemo } from 'react'
import { FigTreeEvaluator, FragmentMetadata, FragmentNode, isAliasString } from 'fig-tree-evaluator'
import { CustomNodeProps } from 'json-edit-react'
import './styles.css'
import { NodeTypeSelector } from './NodeTypeSelector'
import { commonProperties, getDefaultValue, reservedProperties } from './helpers'
import { PropertySelector } from './Operator'
import { getAvailableProperties } from './validator'

interface FragmentProps {
  figTree: FigTreeEvaluator
}

export const Fragment: React.FC<CustomNodeProps<FragmentProps>> = (props) => {
  const {
    data,
    parentData,
    path,
    onEdit,
    customProps: { figTree },
  } = props

  // console.log('figTree.getFragments()', figTree.getFragments())

  const expressionPath = path.slice(0, -1)
  const fragmentData = getCurrentFragment(parentData as FragmentNode, figTree.getFragments())
  const thisFragment = data as string

  const availableProperties = getAvailableProperties(fragmentData, parentData)

  return (
    <div className="ft-operator-block">
      <NodeTypeSelector
        value="fragment"
        changeNode={(newValue: unknown) => onEdit(newValue, expressionPath)}
      />
      :
      <FragmentSelector
        value={thisFragment}
        figTree={figTree}
        changeFragment={(fragment) => onEdit({ ...parentData, fragment }, expressionPath)}
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

const FragmentSelector: React.FC<{
  value: string
  figTree: FigTreeEvaluator
  changeFragment: (fragment: string) => void
}> = ({ value, figTree, changeFragment }) => {
  const fragmentOptions = useMemo(
    () => figTree.getFragments().map(({ name }) => ({ key: name, text: name, value: name })),
    [figTree]
  )
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    changeFragment(e.target.value)
  }

  return (
    <select value={value} onChange={handleChange} style={{ maxWidth: 150 }}>
      <option key="_blank" label=" " />
      {fragmentOptions.map(({ key, text, value }) => (
        <option key={key} value={value}>
          {text}
        </option>
      ))}
    </select>
  )
}

const getCurrentFragment = (node: FragmentNode, fragments: readonly FragmentMetadata[]) => {
  const fragmentName = node?.fragment
  const fragment = fragments.find((frag) => frag.name === fragmentName)

  return fragment ?? fragments[0]
}

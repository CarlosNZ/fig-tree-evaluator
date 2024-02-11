import React, { useMemo } from 'react'
import { FigTreeEvaluator, FragmentMetadata, FragmentNode, isAliasString } from 'fig-tree-evaluator'
import { CustomNodeProps } from 'json-edit-react'
import './styles.css'
import { NodeTypeSelector } from './NodeTypeSelector'
import { commonProperties, getDefaultValue, reservedProperties } from './helpers'
import { PropertySelector } from './Operator'
import { getAvailableProperties } from './validator'
import { Select, SelectOption } from './Select'

interface FragmentProps {
  figTree: FigTreeEvaluator
}

export const Fragment: React.FC<CustomNodeProps<FragmentProps>> = (props) => {
  const {
    data,
    parentData,
    path,
    onEdit,
    customProps: { figTree, onEvaluate },
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
        showFragments
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
          figTree.evaluate(parentData).then((result) => onEvaluate(result))
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
    () => figTree.getFragments().map(({ name }) => ({ label: name, value: name })),
    [figTree]
  )

  return (
    <Select
      value={{ label: value, value }}
      onChange={(selected) => changeFragment((selected as SelectOption).value)}
      options={fragmentOptions}
    />
  )
}

const getCurrentFragment = (node: FragmentNode, fragments: readonly FragmentMetadata[]) => {
  const fragmentName = node?.fragment
  const fragment = fragments.find((frag) => frag.name === fragmentName)

  return fragment ?? fragments[0]
}

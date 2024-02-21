import React, { useState, useMemo } from 'react'
import { FigTreeEvaluator, FragmentMetadata, FragmentNode, OperatorNode } from 'fig-tree-evaluator'
// import { CustomNodeProps, IconOk } from './package'
import { CustomNodeProps, IconOk } from 'json-edit-react'
import './styles.css'
import { NodeTypeSelector } from './NodeTypeSelector'
import { DisplayBar, OperatorProps, PropertySelector } from './Operator'
import { getAvailableProperties } from './validator'
import { Select, SelectOption } from './Select'
import { operatorDisplay } from './operatorDisplay'

export const Fragment: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
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
  const fragmentData = getCurrentFragment(parentData as FragmentNode, figTree.getFragments())
  const thisFragment = data as string

  const availableProperties = getAvailableProperties(fragmentData, parentData as OperatorNode)

  const opDisplay = operatorDisplay.FRAGMENT

  return (
    <div className="ft-custom ft-fragment">
      {isEditing ? (
        <div className="ft-toolbar ft-fragment-toolbar">
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
              updateNode={(newProperty) =>
                onEdit({ ...parentData, ...newProperty }, expressionPath)
              }
            />
          )}
          <div className="ft-okay-icon" onClick={() => setIsEditing(false)}>
            <IconOk size="2em" className="" style={{ color: 'green' }} />
          </div>
        </div>
      ) : (
        <DisplayBar
          name={thisFragment}
          setIsEditing={() => setIsEditing(true)}
          evaluate={async () => {
            setLoading(true)
            await evaluateNode(parentData)
            setLoading(false)
          }}
          isLoading={loading}
          {...opDisplay}
        />
      )}
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
      className="ft-fragment-select"
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
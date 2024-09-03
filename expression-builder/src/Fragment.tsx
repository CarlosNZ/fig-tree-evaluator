import React, { useMemo } from 'react'
import {
  FigTreeEvaluator,
  FragmentMetadata,
  FragmentNode,
  FragmentParameterMetadata,
} from 'fig-tree-evaluator'
import { CustomNodeProps, IconOk, IconCancel } from './_imports'
import { NodeTypeSelector } from './NodeTypeSelector'
import { OperatorProps, PropertySelector } from './Operator'
import { DisplayBar } from './DisplayBar'
import { getAvailableProperties } from './validator'
import { Select, SelectOption } from './Select'
import { useCommon } from './useCommon'

export const Fragment: React.FC<CustomNodeProps<OperatorProps>> = (props) => {
  const { data, parentData, nodeData, onEdit, customNodeProps } = props

  if (!customNodeProps) throw new Error('Missing customNodeProps')

  const {
    handleCancel,
    handleSubmit,
    expressionPath,
    isEditing,
    setIsEditing,
    evaluate,
    loading,
    operatorDisplay,
  } = useCommon({
    customNodeProps,
    parentData,
    nodeData,
    onEdit,
  })

  const { figTree } = customNodeProps

  if (!figTree) return null

  const fragmentData = getCurrentFragment(parentData as FragmentNode, figTree.getFragments())
  const thisFragment = data as string

  const availableProperties = getAvailableProperties(
    fragmentData.parameters ?? [],
    parentData as FragmentNode
  )

  const { textColor, backgroundColor } = fragmentData

  const displayData =
    textColor && backgroundColor
      ? { textColor, backgroundColor, displayName: 'Fragment' }
      : undefined

  return (
    <div className="ft-custom ft-fragment">
      {isEditing ? (
        <div className="ft-toolbar ft-fragment-toolbar">
          <NodeTypeSelector
            value="fragment"
            changeNode={(newValue: unknown) => onEdit(newValue, expressionPath)}
            figTree={figTree}
          />
          :
          <FragmentSelector
            value={thisFragment}
            figTree={figTree}
            changeFragment={(fragment) => onEdit({ ...parentData, fragment }, expressionPath)}
          />
          {availableProperties.length > 0 && (
            <PropertySelector
              availableProperties={availableProperties as FragmentParameterMetadata[]}
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
          name={thisFragment}
          description={fragmentData.description}
          setIsEditing={() => setIsEditing(true)}
          evaluate={evaluate}
          isLoading={loading}
          canonicalName="FRAGMENT"
          operatorDisplay={displayData ?? operatorDisplay?.FRAGMENT}
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

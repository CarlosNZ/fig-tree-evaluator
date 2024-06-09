import React, { useState, useMemo, useEffect } from 'react'
import {
  FigTreeEvaluator,
  FragmentMetadata,
  FragmentNode,
  OperatorMetadata,
} from './packages/figTreeImport'
import { CustomNodeProps, IconOk, IconCancel } from './packages/JsonEditReactImport'
// import './styles.css'
import { NodeTypeSelector } from './NodeTypeSelector'
import { DisplayBar, OperatorProps, PropertySelector } from './Operator'
import { getAvailableProperties } from './validator'
import { Select, SelectOption } from './Select'
import { FragmentParameterMetadata } from './fig-tree-evaluator/src/types'

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
  const [prevState, setPrevState] = useState(parentData)
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!figTree) return null

  const expressionPath = path.slice(0, -1)
  const fragmentData = getCurrentFragment(parentData as FragmentNode, figTree.getFragments())
  const thisFragment = data as string

  const availableProperties = getAvailableProperties(
    fragmentData as OperatorMetadata,
    parentData as FragmentNode
  )

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
    if (isEditing) document.addEventListener('keydown', listenForSubmit)
    else document.removeEventListener('keydown', listenForSubmit)
    return () => document.removeEventListener('keydown', listenForSubmit)
  }, [isEditing])

  return (
    <div className="ft-custom ft-fragment">
      {isEditing ? (
        <div className="ft-toolbar ft-fragment-toolbar">
          <NodeTypeSelector
            value="fragment"
            changeNode={(newValue: unknown) => onEdit(newValue, expressionPath)}
            defaultFragment={thisFragment}
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
          <div className="ft-okay-icon" onClick={handleSubmit}>
            <IconOk size="2em" style={{ color: 'green' }} />
          </div>
          <div className="ft-cancel-icon" onClick={handleCancel}>
            <IconCancel size="2.8em" style={{ color: 'rgb(203, 75, 22)' }} />
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
          canonicalName="FRAGMENT"
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

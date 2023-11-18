import React, { useMemo } from 'react'
import { FigTreeEvaluator, FragmentMetadata, FragmentNode, isAliasString } from 'fig-tree-evaluator'
import { CustomNodeProps } from 'json-edit-react/types'
import './styles.css'
import { NodeTypeSelector } from './NodeTypeSelector'
import { dequal } from 'dequal'
import { commonProperties, getDefaultValue, reservedProperties } from './helpers'
import { PropertySelector } from './Operator'

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

  const expressionPath = path.slice(0, -1)
  const fragmentData = getCurrentFragment(parentData as FragmentNode, figTree.getFragments())
  const thisFragment = data as string

  const { updatedNode = {}, availableProperties = [] } = fragmentData
    ? validateFragmentProperties(parentData as FragmentNode, fragmentData)
    : {}

  if (!dequal(parentData, updatedNode)) {
    setTimeout(() => onEdit(updatedNode, expressionPath), 100)
  }

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
    // <div style={{ display: 'flex' }}>
    <select value={value} onChange={handleChange} style={{ maxWidth: 150 }}>
      {fragmentOptions.map(({ key, text, value }) => (
        <option key={key} value={value}>
          {text}
        </option>
      ))}
    </select>
    // </div>
  )
}

const getCurrentFragment = (node: FragmentNode, fragments: readonly FragmentMetadata[]) => {
  const fragmentName = node?.fragment
  const fragment = fragments.find((frag) => frag.name === fragmentName)

  return fragment ?? fragments[0]
}

const validateFragmentProperties = (node: FragmentNode, fragment: FragmentMetadata) => {
  const updatedNode = { ...node, fragment: fragment.name }

  const parameters = Object.entries(fragment?.parameters ?? {}).map(
    ([name, { type, required }]) => ({
      name,
      type,
      required,
    })
  )

  const requiredProperties = parameters.filter(({ required }) => required)

  const optionalProperties = parameters.filter(({ required }) => !required)

  const currentPropertyKeys = Object.keys(node)

  currentPropertyKeys.forEach((property) => {
    if (reservedProperties.includes(property)) return
    if (isAliasString(property)) return

    // It shouldn't be there, so remove it from node
    // delete updatedNode[property]
  })

  // Check if all required properties are present, and add them if not
  requiredProperties.forEach((property) => {
    if (currentPropertyKeys.includes(property.name)) return

    updatedNode[property.name] = getDefaultValue(property.type as string)
  })

  // Check if optional properties are present, and add them to available
  // list if not
  const availableProperties = [] as {
    name: string
    required: boolean
    type: string
    // default?: unknown
  }[] // CHANGE TO PARAMETER

  optionalProperties.forEach((property) => {
    if (currentPropertyKeys.includes(property.name)) return
    availableProperties.push(property)
  })

  // Check if common properties are present, and add them to available
  // list if not
  commonProperties.forEach((property) => {
    if (currentPropertyKeys.includes(property.name)) return
    if (property.aliases.some((alias) => currentPropertyKeys.includes(alias))) return

    availableProperties.push(property)
  })

  return { updatedNode, availableProperties }
}

// const getFragmentOptions = (fragments: readonly FragmentMetadata[]) => {
//   return fragments.map(({ name }) => ({ key: name, text: name, value: name }))
// }

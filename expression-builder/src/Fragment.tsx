import React from 'react'
import { FigTreeEvaluator } from 'fig-tree-evaluator'
import { CustomNodeProps } from './json-edit-react/types'
import './styles.css'
import { NodeTypeSelector } from './NodeTypeSelector'

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
  // const operatorData = getCurrentOperator(parentData, figTree.getOperators())

  return (
    <div className="ft-operator-block">
      <NodeTypeSelector
        value="fragment"
        changeNode={(newValue: unknown) => onEdit(newValue, expressionPath)}
      />
      {/* <OperatorSelector /> */}
      <span>OPERATOR:</span>
      <span>{data}</span>
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

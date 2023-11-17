import React, { useState } from 'react'
import { EvaluatorNode, FigTreeEvaluator } from 'fig-tree-evaluator'
import JsonEditor from './json-edit-react'
import './styles.css'
import { Operator } from './Operator'
import { Fragment } from './Fragment'

interface FigTreeEditorProps {
  figTree: FigTreeEvaluator
  expression: EvaluatorNode
}

const FigTreeEditor: React.FC<FigTreeEditorProps> = ({ figTree, expression: expressionInit }) => {
  const [expression, setExpression] = useState(expressionInit)
  return (
    <JsonEditor
      data={expression as object}
      onUpdate={({ newData }) => {
        console.log('newData', newData)
        setExpression(newData)
      }}
      customNodeDefinitions={[
        {
          condition: ({ key }) => key === 'operator',
          element: Operator,
          name: 'Operator',
          props: { figTree },
          hideKey: true,
          defaultValue: { operator: '+', values: [2, 2] },
        },
        {
          condition: ({ key }) => key === 'fragment',
          element: Fragment,
          name: 'Fragment',
          props: { figTree },
          hideKey: true,
          defaultValue: { fragment: '' },
        },
      ]}
    />
  )
}

export default FigTreeEditor

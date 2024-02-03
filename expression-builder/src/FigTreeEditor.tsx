import React, { useMemo, useState } from 'react'
import { EvaluatorNode, FigTreeEvaluator, OperatorMetadata } from 'fig-tree-evaluator'
import { JsonEditor } from './json-edit-react'
import './styles.css'
import { Operator } from './Operator'
import { Fragment } from './Fragment'
import { validateExpression } from './validator'

interface FigTreeEditorProps {
  figTree: FigTreeEvaluator
  expression: EvaluatorNode
}

const FigTreeEditor: React.FC<FigTreeEditorProps> = ({ figTree, expression: expressionInit }) => {
  const operators = useMemo(() => figTree.getOperators(), [figTree])
  const fragments = useMemo(() => figTree.getFragments(), [figTree])

  const [expression, setExpression] = useState(
    validateExpression(expressionInit, { operators, fragments })
  )

  const customFunctionData = operators.find(
    (op) => op.name === 'CUSTOM_FUNCTIONS'
  ) as OperatorMetadata

  const customFunctionAliases = [customFunctionData?.name, ...customFunctionData.aliases]

  return (
    <JsonEditor
      data={expression as object}
      onUpdate={({ newData }) => {
        console.log('newData', newData)
        console.log('validated', validateExpression(newData, { operators, fragments }))
        setExpression(validateExpression(newData, { operators, fragments }))
      }}
      showArrayIndices={false}
      customNodeDefinitions={[
        {
          condition: ({ key, value }) =>
            key === 'operator' && customFunctionAliases.includes(value as string),
          element: Operator,
          name: 'Custom Functions',
          props: { figTree, isCustomFunctions: true },
          hideKey: true,
          defaultValue: { operator: 'function' },
          showInTypesSelector: false,
          // customNodeProps:{},
          showOnEdit: true,
          showOnView: true,
          showEditTools: true,
        },
        {
          condition: ({ key }) => key === 'operator',
          element: Operator,
          name: 'Operator',
          props: { figTree },
          hideKey: true,
          showInTypesSelector: true,
          defaultValue: { operator: '+', values: [2, 2] },
        },
        {
          condition: ({ key }) => key === 'fragment',
          element: Fragment,
          name: 'Fragment',
          props: { figTree },
          hideKey: true,
          showInTypesSelector: true,
          defaultValue: { fragment: '' },
        },
      ]}
    />
  )
}

export default FigTreeEditor

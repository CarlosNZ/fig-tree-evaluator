import React, { useMemo, useState } from 'react'
import { EvaluatorNode, FigTreeEvaluator, OperatorMetadata } from 'fig-tree-evaluator'
// import { JsonEditor } from './json-edit-react'
// import { JsonEditor } from './package'
import { JsonEditor } from 'json-edit-react'
import './styles.css'
import { Operator } from './Operator'
import { Fragment } from './Fragment'
import { validateExpression } from './validator'

interface FigTreeEditorProps {
  figTree: FigTreeEvaluator
  expression: EvaluatorNode
  onEvaluate: (value: unknown) => void
  evaluateComponent: React.FC
}

const FigTreeEditor: React.FC<FigTreeEditorProps> = ({
  figTree,
  expression: expressionInit,
  onEvaluate,
}) => {
  const operators = useMemo(() => figTree.getOperators(), [figTree])
  const fragments = useMemo(() => figTree.getFragments(), [figTree])

  const [expression, setExpression] = useState(
    validateExpression(expressionInit, { operators, fragments })
  )

  const customFunctionData = operators.find(
    (op) => op.name === 'CUSTOM_FUNCTIONS'
  ) as OperatorMetadata

  const customFunctionAliases = [customFunctionData?.name, ...customFunctionData.aliases]

  const propertyCountReplace = ({
    value,
  }: {
    key: string | number
    path: (string | number)[]
    level: number
    value: unknown
    size: number | null
  }) => {
    if (!(value instanceof Object)) return null
    if ('operator' in value) return `Operator: ${value.operator}`
    if ('fragment' in value) return `Fragment: ${value.fragment}`
    return null
  }

  return (
    <JsonEditor
      className="ft-editor"
      rootName="parameterName"
      showCollectionCount="when-closed"
      data={expression as object}
      onUpdate={({ newData }) => {
        console.log('newData', newData)
        setExpression(validateExpression(newData, { operators, fragments }))
      }}
      showArrayIndices={false}
      indent={3}
      theme={{
        styles: {
          container: {
            // backgroundColor: '#f6f6f6',
            // fontFamily: 'monospace',
          },
          // property: '#292929',
          // bracket: { color: 'rgb(0, 43, 54)', fontWeight: 'bold' },
          // itemCount: { color: 'rgba(0, 0, 0, 0.3)', fontStyle: 'italic' },
          // string: 'rgb(203, 75, 22)',
          // number: 'rgb(38, 139, 210)',
          // boolean: 'green',
          // null: { color: 'rgb(220, 50, 47)', fontVariant: 'small-caps', fontWeight: 'bold' },
          // input: ['#292929', { fontSize: '90%' }],
          // inputHighlight: '#b3d8ff',
          // error: { fontSize: '0.8em', color: 'red', fontWeight: 'bold' },
          // iconCollection: { display: 'none' },
          // iconEdit: 'edit',
          // iconDelete: 'rgb(203, 75, 22)',
          // iconAdd: 'edit',
          // iconCopy: 'rgb(38, 139, 210)',
          // iconOk: 'green',
          // iconCancel: 'rgb(203, 75, 22)',
        },
      }}
      translations={{
        ITEM_SINGLE: '{{count}} property',
        ITEMS_MULTIPLE: '{{count}} properties',
        // KEY_NEW: 'Enter new key',
        // ERROR_KEY_EXISTS: 'Key already exists',
        // ERROR_INVALID_JSON: 'Invalid JSON',
        // ERROR_UPDATE: 'Update unsuccessful',
        // ERROR_DELETE: 'Delete unsuccessful',
        // ERROR_ADD: 'Adding node unsuccessful',
        // DEFAULT_STRING: 'New data!',
        // DEFAULT_NEW_KEY: 'key',
      }}
      customNodeDefinitions={[
        {
          condition: ({ key }) => key === 'operator',
          element: Operator,
          name: 'Operator',
          customNodeProps: { figTree, onEvaluate },
          hideKey: true,
          // showOnView: false,
          showOnEdit: false,
          showEditTools: false,
          showInTypesSelector: true,
          defaultValue: { operator: '+', values: [2, 2] },
        },
        {
          condition: ({ key }) => key === 'fragment',
          element: Fragment,
          name: 'Fragment',
          customNodeProps: { figTree, onEvaluate },
          hideKey: true,
          showOnView: true,
          showOnEdit: false,
          showInTypesSelector: true,
          defaultValue: { fragment: '' },
        },
        {
          condition: ({ key, value }) =>
            key === 'operator' && customFunctionAliases.includes(value as string),
          element: Operator,
          name: 'Custom Functions',
          customNodeProps: { figTree, isCustomFunctions: true, onEvaluate },
          hideKey: true,
          defaultValue: { operator: 'function' },
          showInTypesSelector: false,
          // customNodeProps:{},
          showOnEdit: true,
          showOnView: true,
          showEditTools: true,
        },
      ]}
      customText={{ ITEMS_MULTIPLE: propertyCountReplace, ITEM_SINGLE: propertyCountReplace }}
    />
  )
}

export default FigTreeEditor

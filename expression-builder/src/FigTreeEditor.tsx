import React, { useMemo, useState } from 'react'
import {
  type EvaluatorNode,
  type FigTreeEvaluator,
  type Operator as OperatorName,
  type OperatorMetadata,
  isObject,
} from 'fig-tree-evaluator'
// import { JsonEditor } from './json-edit-react'
import { JsonEditor } from './package'
// import { JsonEditor } from 'json-edit-react'
import './styles.css'
import { Operator } from './Operator'
import { Fragment } from './Fragment'
import { validateExpression } from './validator'
import { type OperatorDisplay, operatorDisplay } from './operatorDisplay'

interface FigTreeEditorProps {
  figTree: FigTreeEvaluator
  expression: EvaluatorNode
  onEvaluate: (value) => void
  onStartEvaluate: () => void
  operatorDisplay: Partial<Record<OperatorName, OperatorDisplay>>
  theme: any // TO-DO
}

const FigTreeEditor: React.FC<FigTreeEditorProps> = ({
  figTree,
  expression: expressionInit,
  onStartEvaluate,
  onEvaluate,
  operatorDisplay: operatorDisplayProp,
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
        setExpression(validateExpression(newData, { operators, fragments }))
      }}
      showArrayIndices={false}
      indent={3}
      collapse={1}
      minWidth={600}
      theme={{
        styles: {
          container: {
            // backgroundColor: '#f6f6f6',
            // fontFamily: 'monospace',
          },
          bracket: ({ value }) => {
            if (!(isObject(value) && 'operator' in value)) return { display: 'inline' }
          },
          collectionInner: [
            {
              borderColor: 'transparent',
              transition: 'max-height 0.5s, border-color 0.5s, padding 1s',
              transitionDelay: 'padding 1s',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: '0.75em',
            },
            ({ collapsed, value }) => {
              if (isObject(value) && 'operator' in value) {
                const style = {
                  // paddingLeft: '0.5em',
                  paddingRight: '1em',
                }
                return collapsed
                  ? style
                  : {
                      ...style,
                      borderColor: '#dbdbdb',
                      paddingTop: '0.5em',
                      paddingBottom: '0.5em',
                      marginBottom: '0.5em',
                    }
              }
            },
          ],
          iconEdit: { color: 'rgb(42, 161, 152)' },
        },
      }}
      translations={
        {
          // ITEM_SINGLE: '{{count}} property',
          // ITEMS_MULTIPLE: '{{count}} properties',
          // KEY_NEW: 'Enter new key',
          // ERROR_KEY_EXISTS: 'Key already exists',
          // ERROR_INVALID_JSON: 'Invalid JSON',
          // ERROR_UPDATE: 'Update unsuccessful',
          // ERROR_DELETE: 'Delete unsuccessful',
          // ERROR_ADD: 'Adding node unsuccessful',
          // DEFAULT_STRING: 'New data!',
          // DEFAULT_NEW_KEY: 'key',
        }
      }
      customNodeDefinitions={[
        {
          condition: ({ key }) => key === 'operator',
          element: Operator,
          name: 'Operator',
          customNodeProps: {
            figTree,
            onEvaluate,
            onStartEvaluate,
            operatorDisplay: { ...operatorDisplay, ...operatorDisplayProp },
          },
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
          customNodeProps: { figTree, onEvaluate, onStartEvaluate },
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
          customNodeProps: {
            figTree,
            isCustomFunctions: true,
            onEvaluate,
            onStartEvaluate,
            operatorDisplay: { ...operatorDisplay, ...operatorDisplayProp },
          },
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

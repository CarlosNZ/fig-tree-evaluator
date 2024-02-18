import React, { useMemo, useState } from 'react'
import {
  type EvaluatorNode,
  type FigTreeEvaluator,
  type Operator as OperatorName,
  isObject,
} from 'fig-tree-evaluator'
// import { JsonEditor, updateFunction } from './json-edit-react'
import { JsonEditor, JsonEditorProps, UpdateFunction } from './package'
// import { JsonEditor } from 'json-edit-react'
import './styles.css'
import { Operator } from './Operator'
import { Fragment } from './Fragment'
import { validateExpression } from './validator'
import { type OperatorDisplay, operatorDisplay } from './operatorDisplay'

interface FigTreeEditorProps extends Omit<JsonEditorProps, 'data'> {
  figTree: FigTreeEvaluator
  expression: EvaluatorNode
  objectData: object
  onUpdate: UpdateFunction
  onEvaluate: (value: unknown) => void
  onEvaluateStart?: () => void
  onEvaluateError?: (err: unknown) => void
  operatorDisplay?: Partial<Record<OperatorName, OperatorDisplay>>

  // TO-DO: Plus all other JSON EDIT REACT PROPS...
}

const FigTreeEditor: React.FC<FigTreeEditorProps> = ({
  figTree,
  expression: expressionInit,
  objectData,
  onUpdate,
  onEvaluate,
  onEvaluateStart,
  onEvaluateError,
  operatorDisplay: operatorDisplayProp,
  ...props
}) => {
  const operators = useMemo(() => figTree.getOperators(), [figTree])
  const fragments = useMemo(() => figTree.getFragments(), [figTree])

  const [expression, setExpression] = useState(
    validateExpression(expressionInit, { operators, fragments })
  )
  const [isEvaluating, setIsEvaluating] = useState(false)

  // const customFunctionData = operators.find(
  //   (op) => op.name === 'CUSTOM_FUNCTIONS'
  // ) as OperatorMetadata

  // const customFunctionAliases = [customFunctionData?.name, ...customFunctionData.aliases]

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

  const evaluateNode = async (expression: EvaluatorNode) => {
    setIsEvaluating(true)
    onEvaluateStart && onEvaluateStart()
    try {
      const result = await figTree.evaluate(expression, { data: objectData })
      onEvaluate(result)
    } catch (err) {
      onEvaluateError && onEvaluateError(err)
    }
    setIsEvaluating(false)
  }

  return (
    <JsonEditor
      className="ft-editor"
      rootName="parameterName"
      showCollectionCount="when-closed"
      data={expression as object}
      onUpdate={({ newData, ...rest }) => {
        const validated = validateExpression(newData, { operators, fragments })
        setExpression(validated)
        onUpdate({ newData: validated, ...rest })
      }}
      showArrayIndices={false}
      indent={3}
      collapse={1}
      {...props}
      theme={{
        styles: {
          container: {
            // backgroundColor: '#f6f6f6',
            // fontFamily: 'monospace',
          },
          bracket: ({ value }) => {
            if (!(isObject(value) && ('operator' in value || 'fragment' in value)))
              return { display: 'inline' }
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
              if (isObject(value) && ('operator' in value || 'fragment' in value)) {
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
      customNodeDefinitions={[
        {
          condition: ({ key }) => key === 'operator',
          element: Operator,
          name: 'Operator',
          customNodeProps: {
            figTree,
            evaluateNode,
            isEvaluating,
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
          customNodeProps: { figTree, isEvaluating, evaluateNode },
          hideKey: true,
          showOnEdit: false,
          showEditTools: false,
          showInTypesSelector: true,
          defaultValue: { fragment: '' },
        },
      ]}
      customText={{ ITEMS_MULTIPLE: propertyCountReplace, ITEM_SINGLE: propertyCountReplace }}
    />
  )
}

export default FigTreeEditor

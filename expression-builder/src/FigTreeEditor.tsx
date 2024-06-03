import React, { useMemo, useState, useEffect } from 'react'
import extract from 'object-property-extractor'
import {
  type EvaluatorNode,
  type FigTreeEvaluator,
  type Operator as OperatorName,
  isObject,
  isAliasString,
  OperatorNode,
} from './exports/figTreeImport'
import {
  CustomNodeDefinition,
  JsonEditor,
  JsonEditorProps,
  UpdateFunction,
  isCollection,
} from './exports/JsonEditReactImport'
import './styles.css'
import { Operator } from './Operator'
import { Fragment } from './Fragment'
import { validateExpression } from './validator'
import { type OperatorDisplay, operatorDisplay } from './operatorDisplay'
import {
  getCurrentOperator,
  isFirstAliasNode,
  isShorthandWrapper as shorthandWrapperTester,
  isShorthandNode as shorthandNodeTester,
  isShorthandString as shorthandStringTester,
  isShorthandStringNode as shorthandStringNodeTester,
  propertyCountReplace,
} from './helpers'
import { ShorthandNode, ShorthandNodeWrapper, ShorthandStringNode } from './Shorthand'

const nodeBaseStyles = {
  borderColor: 'transparent',
  transition: 'max-height 0.5s, border-color 0.5s, padding 0.5s',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderRadius: '0.75em',
}

const nodeRoundedBorder = {
  borderColor: '#dbdbdb',
  paddingTop: '0.5em',
  paddingBottom: '0.5em',
  marginBottom: '0.5em',
  paddingRight: '1em',
}

interface FigTreeEditorProps extends Omit<JsonEditorProps, 'data'> {
  figTree: FigTreeEvaluator
  expression: EvaluatorNode
  objectData: object
  onUpdate: UpdateFunction
  onEvaluate: (value: unknown) => void
  onEvaluateStart?: () => void
  onEvaluateError?: (err: unknown) => void
  operatorDisplay?: Partial<Record<OperatorName, OperatorDisplay>>
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
  if (!figTree) return null
  const operators = useMemo(() => figTree.getOperators(), [figTree])
  const fragments = useMemo(() => figTree.getFragments(), [figTree])

  const allOpAliases = useMemo(() => {
    const all = operators.map((op) => [op.name, ...op.aliases]).flat()
    return new Set(all)
  }, [])
  const allFragments = useMemo(() => new Set(fragments.map((f) => f.name)), [])

  const [expression, setExpression] = useState(
    (() => {
      try {
        return validateExpression(expressionInit, { operators, fragments })
      } catch (err) {
        console.log(`Error: ${err.message}`)
        return {}
      }
    })()
  )
  const [isEvaluating, setIsEvaluating] = useState(false)

  useEffect(() => {
    try {
      const exp = validateExpression(expressionInit, { operators, fragments })
      setExpression(exp)
    } catch {
      // onUpdate('Invalid expression')
    }
  }, [expressionInit])

  // const customFunctionData = operators.find(
  //   (op) => op.name === 'CUSTOM_FUNCTIONS'
  // ) as OperatorMetadata

  // const customFunctionAliases = [customFunctionData?.name, ...customFunctionData.aliases]

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

  // const isAliasNode = (nodeData) => aliasNodeTester(nodeData, allOpAliases, allFragments)

  const isShorthandWrapper = (nodeData) =>
    shorthandWrapperTester(nodeData, allOpAliases, allFragments)
  const isShorthandNode = (nodeData) => shorthandNodeTester(nodeData, allOpAliases, allFragments)

  const isShorthandStringNode = (nodeData) =>
    shorthandStringNodeTester(nodeData, allOpAliases, allFragments)
  const isShorthandString = (value) => shorthandStringTester(value, allOpAliases, allFragments)

  return (
    <JsonEditor
      className="ft-editor"
      showCollectionCount="when-closed"
      data={expression as object}
      onUpdate={({ newData, ...rest }) => {
        try {
          const validated = validateExpression(newData, { operators, fragments })
          setExpression(validated)
          onUpdate({ newData: validated, ...rest })
        } catch (err) {
          return err.message
        }
      }}
      restrictDelete={({ key, path }) => {
        // Unable to delete required properties
        if (path.length === 0) return true
        const parentPath = path.slice(0, -1)
        const parentData = extract(
          expression,
          parentPath.length === 0 ? '' : parentPath,
          {}
        ) as OperatorNode
        if (!isObject(parentData) || !('operator' in parentData)) return false
        const required = getCurrentOperator(parentData.operator, operators)
          ?.parameters.filter((param) => param.required)
          .map((param) => [param.name, ...param.aliases])
          .flat()

        return required?.includes(key as string) ?? false
      }}
      showArrayIndices={false}
      indent={3}
      collapse={2}
      stringTruncate={100}
      {...props}
      theme={{
        styles: {
          container: {},
          property: (nodeData) => {
            if (isAliasString(String(nodeData.key))) return { fontStyle: 'italic' }
          },
          string: ({ value }) => {
            if (isAliasString(String(value))) return { fontStyle: 'italic' }
          },
          bracket: (nodeData) => {
            const { value, collapsed } = nodeData
            if (
              !(
                isObject(value) &&
                ('operator' in value || 'fragment' in value || isShorthandNode(nodeData))
              )
            )
              return { display: 'inline' }
            if (!collapsed) return { display: 'none' }
          },
          itemCount: ({ value }) => {
            if (
              isObject(value) &&
              ('operator' in value || 'fragment' in value || isShorthandStringNode(value))
            )
              return { fontSize: '1.1em' }
          },
          collectionInner: [
            nodeBaseStyles,
            (nodeData) => {
              const { value, collapsed } = nodeData
              // Rounded border for Operator/Fragment nodes
              if (
                isObject(value) &&
                ('operator' in value || 'fragment' in value || isShorthandNode(nodeData))
              ) {
                const style = {
                  // paddingLeft: '0.5em',
                  paddingRight: '1em',
                }
                return collapsed ? style : nodeRoundedBorder
              }
            },
          ],
          collectionElement: ({ value }) => {
            if (isShorthandString(value))
              return {
                ...nodeBaseStyles,
                ...nodeRoundedBorder,
                marginLeft: '1.5em',
              }
          },
          iconEdit: { color: 'rgb(42, 161, 152)' },
        },
      }}
      customNodeDefinitions={
        [
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
            defaultValue: { fragment: fragments[0].name },
          },
          {
            condition: (nodeData) => {
              return isShorthandWrapper(nodeData)
            },
            hideKey: true,
            wrapperElement: ShorthandNodeWrapper,
            wrapperProps: { figTree, isEvaluating, evaluateNode },
          },
          {
            condition: (nodeData) => {
              return (
                isShorthandNode(nodeData) && !isCollection(Object.values(nodeData.value ?? {})[0])
              )
            },
            element: ShorthandNode,
            customNodeProps: { figTree, isEvaluating, evaluateNode },
          },
          {
            condition: ({ value }) => {
              return isShorthandString(value)
            },
            element: ShorthandStringNode,
            customNodeProps: { figTree, isEvaluating, evaluateNode },
          },
          {
            condition: (nodeData) => isFirstAliasNode(nodeData, allOpAliases, allFragments),
            showOnEdit: true,
            wrapperElement: ({ children }) => (
              <div>
                <p className="ft-alias-header-text">
                  <strong>Alias definitions:</strong>
                </p>
                {children}
              </div>
            ),
          },
        ] as CustomNodeDefinition[]
      }
      customText={{
        ITEMS_MULTIPLE: (nodeData) => propertyCountReplace(nodeData, allOpAliases, allFragments),
        ITEM_SINGLE: (nodeData) => propertyCountReplace(nodeData, allOpAliases, allFragments),
      }}
    />
  )
}

export default FigTreeEditor

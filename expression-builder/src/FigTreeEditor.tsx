import React, { useMemo, useEffect, useRef } from 'react'
import { JsonData, extract } from 'json-edit-react'
import {
  type EvaluatorNode,
  type FigTreeEvaluator,
  type Operator as OperatorName,
  isObject,
  isAliasString,
  OperatorNode,
  isFigTreeError,
} from 'fig-tree-evaluator'
import {
  // json-edit-react
  CustomNodeDefinition,
  JsonEditor,
  JsonEditorProps,
  NodeData,
  UpdateFunction,
  isCollection,
} from './_imports'
import './styles.css'
import { Operator } from './Operator'
import { Fragment } from './Fragment'
import { CustomOperator } from './CustomOperator'
import { TopLevelContainer } from './TopLevel'
import { validateExpression } from './validator'
import { type OperatorDisplay } from './operatorDisplay'
import {
  getCurrentOperator,
  isFirstAliasNode,
  isShorthandNodeCollection as shorthandWithCollectionTester,
  isShorthandNodeWithSimpleValue as shorthandSimpleNodeTester,
  propertyCountReplace,
  getAliases,
} from './helpers'
import { ShorthandNodeWithSimpleValue, ShorthandNodeCollection } from './Shorthand'

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
  setExpression: (data: EvaluatorNode) => void
  objectData?: Record<string, unknown>
  onUpdate?: UpdateFunction
  onEvaluate: (value: unknown) => void
  onEvaluateStart?: () => void
  onEvaluateError?: (err: unknown) => void
  operatorDisplay?: Partial<Record<OperatorName | 'FRAGMENT', OperatorDisplay>>
  styles?: Partial<any>
}

const FigTreeEditor: React.FC<FigTreeEditorProps> = ({
  figTree,
  expression,
  setExpression,
  objectData = {},
  onUpdate = () => {},
  onEvaluate,
  onEvaluateStart,
  onEvaluateError,
  operatorDisplay,
  styles = {},
  ...props
}) => {
  const operators = useMemo(() => figTree.getOperators(), [figTree])
  const fragments = useMemo(() => figTree.getFragments(), [figTree])
  const functions = useMemo(() => figTree.getCustomFunctions(), [figTree])

  const allOpAliases = useMemo(() => {
    const all = operators.map((op) => [op.name, ...op.aliases]).flat()
    return new Set(all)
  }, [])
  const allFragments = useMemo(() => new Set(fragments.map((f) => f.name)), [])
  const allFunctions = useMemo(() => new Set(functions.map((f) => f.name)), [])

  // Used when switching between different types of nodes (e.g. Operator ->
  // Fragment) -- this allows us to know whether we should start in "editing"
  // mode
  const initialEdit = useRef(false)

  // Deeper nodes don't have access to higher-level alias definitions when
  // evaluating them on their own (only when evaluated from above), so we
  // collect all top-level aliases and pass them down to all child components
  // (Limitation: aliases defined part-way down the tree, i.e. lower than the
  // root, but higher than where they're used, won't be picked up for evaluation
  // at the inner nodes. But this is not a common scenario, and isn't a big deal
  // for the editor)
  const topLevelAliases = getAliases(expression)

  useEffect(() => {
    initialEdit.current = false
    try {
      const exp = validateExpression(expression, { operators, fragments, functions })
      setExpression(exp)
    } catch {
      // onUpdate('Invalid expression')
    }
  }, [expression])

  if (!figTree) return null

  const evaluateNode = async (expression: EvaluatorNode, e: React.MouseEvent) => {
    onEvaluateStart && onEvaluateStart()
    try {
      const result = await figTree.evaluate(expression, { data: objectData })
      if (e.getModifierState('Shift')) navigator.clipboard.writeText(String(result))
      onEvaluate(result)
    } catch (err) {
      if (isFigTreeError(err)) console.error(err.prettyPrint)
      onEvaluateError && onEvaluateError(err)
    }
  }

  const isShorthandNodeCollection = (nodeData: NodeData) =>
    shorthandWithCollectionTester(nodeData, allOpAliases, allFragments, allFunctions)
  const isShorthandNodeWithSimpleValue = (nodeData: NodeData) =>
    shorthandSimpleNodeTester(nodeData, allOpAliases, allFragments, allFunctions)

  return (
    <JsonEditor
      className="ft-editor"
      showCollectionCount="when-closed"
      data={expression as JsonData}
      onUpdate={({ newData, ...rest }) => {
        try {
          const validated = validateExpression(newData, {
            operators,
            fragments,
            functions,
          }) as object
          // setExpression(validated)
          onUpdate({ newData: validated, ...rest })
        } catch (err: any) {
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
      // Prevent operator nodes being edited using this component, as they have
      // their own editing functionality
      restrictEdit={({ key }) => key === 'operator' || key === 'fragment'}
      showArrayIndices={false}
      indent={3}
      collapse={2}
      stringTruncate={100}
      {...props}
      setData={setExpression}
      theme={[
        {
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
                ('operator' in value ||
                  'fragment' in value ||
                  isShorthandNodeWithSimpleValue(nodeData))
              )
            )
              return { display: 'inline' }
            if (!collapsed) return { display: 'none' }
          },
          itemCount: (nodeData) => {
            if (
              isObject(nodeData.value) &&
              ('operator' in nodeData.value ||
                'fragment' in nodeData.value ||
                isShorthandNodeWithSimpleValue(nodeData))
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
                ('operator' in value ||
                  'fragment' in value ||
                  isShorthandNodeWithSimpleValue(nodeData))
              ) {
                const style = {
                  // paddingLeft: '0.5em',
                  paddingRight: '1em',
                }
                return collapsed ? style : nodeRoundedBorder
              }
            },
          ],
          iconEdit: { color: 'rgb(42, 161, 152)' },
        },
        styles,
      ]}
      customNodeDefinitions={
        [
          {
            condition: ({ key, value }) => {
              return key === 'operator' && allFunctions.has(String(value))
            },
            element: CustomOperator,
            customNodeProps: {
              figTree,
              evaluateNode,
              operatorDisplay,
              topLevelAliases,
              initialEdit,
            },
            hideKey: true,
            showOnEdit: false,
            showEditTools: false,
            showInTypesSelector: true,
            defaultValue: { operator: '+', values: [2, 2] },
          },
          {
            condition: ({ key }) => key === 'operator',
            element: Operator,
            name: 'Operator',
            customNodeProps: {
              figTree,
              evaluateNode,
              operatorDisplay,
              topLevelAliases,
              initialEdit,
            },
            hideKey: true,
            showOnEdit: false,
            showEditTools: false,
            showInTypesSelector: true,
            defaultValue: { operator: '+', values: [2, 2] },
          },
          {
            condition: ({ key }) => key === 'fragment',
            element: Fragment,
            name: 'Fragment',
            customNodeProps: {
              figTree,
              evaluateNode,
              operatorDisplay,
              topLevelAliases,
              initialEdit,
            },
            hideKey: true,
            showOnEdit: false,
            showEditTools: false,
            showInTypesSelector: true,
            defaultValue: fragments?.[0] ? { fragment: fragments?.[0].name } : null,
          },
          {
            condition: (nodeData) => isShorthandNodeCollection(nodeData),
            hideKey: true,
            wrapperElement: ShorthandNodeCollection,
            wrapperProps: { figTree, evaluateNode, topLevelAliases },
          },
          {
            condition: (nodeData) =>
              isShorthandNodeWithSimpleValue(nodeData) &&
              !isCollection(Object.values(nodeData.value ?? {})[0]),
            element: ShorthandNodeWithSimpleValue,
            customNodeProps: { figTree, evaluateNode, operatorDisplay, topLevelAliases },
            showEditTools: true,
          },
          {
            condition: (nodeData) =>
              isFirstAliasNode(nodeData, allOpAliases, allFragments, allFunctions),
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
          {
            condition: (nodeData: any) => nodeData.path.length === 0 && isCollection(nodeData.data),
            element: TopLevelContainer,
            customNodeProps: {
              figTree,
              evaluateNode,
              isShorthandNode: isShorthandNodeWithSimpleValue,
              // evaluateFullObject,
            },
          },
        ] as CustomNodeDefinition[]
      }
      customText={{
        ITEMS_MULTIPLE: (nodeData) =>
          propertyCountReplace(nodeData, allOpAliases, allFragments, allFunctions),
        ITEM_SINGLE: (nodeData) =>
          propertyCountReplace(nodeData, allOpAliases, allFragments, allFunctions),
      }}
    />
  )
}

export default FigTreeEditor

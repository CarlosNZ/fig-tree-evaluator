import React, { useState } from 'react'
// import { FigTreeProvider } from './FigTreeContext'
import { EvaluatorNode, FigTreeEvaluator } from 'fig-tree-evaluator'
import JsonEditor from './json-edit-react/index.esm'

interface FigTreeEditorProps {
  figTree: FigTreeEvaluator
  expression?: EvaluatorNode
}

const FigTreeEditor: React.FC<FigTreeEditorProps> = ({ figTree, expression: expressionInit }) => {
  const [expression, setExpression] = useState(expressionInit)
  return (
    <>
      <JsonEditor
        data={expression as object}
        onUpdate={({ newData }) => {
          setExpression(newData)
        }}
        customNodes={[
          {
            condition: isFigTreeNode,
            element: <FigTreeNode expression={expression} path={[]} />,
          },
        ]}
      />
      {/* <FigTreeProvider figTree={figTree} expression={expression}> */}
      {/* <FigTreeNode /> */}
      {/* </FigTreeProvider> */}
    </>
  )
}

const getNodeType = (expression: EvaluatorNode) => {
  if (expression && typeof expression === 'object' && !Array.isArray(expression)) {
    if ('operator' in expression) return 'operator'
    if ('fragment' in expression) return 'fragment'
  }
  return 'value'
}

const nodeTypeOptions = [
  { key: 'operator', text: 'Operator', value: 'operator' },
  { key: 'fragment', text: 'Fragment', value: 'fragment' },
  { key: 'value', text: 'Value', value: 'value' },
]

const FigTreeNode: React.FC<{ expression: EvaluatorNode; path: (string | number)[] }> = ({
  expression,
  path,
}) => {
  const [collapsed, setCollapsed] = useState(false)
  // Allows us to delay the overflow visibility of the collapsed element until
  // the animation has completed
  const [isAnimating, setIsAnimating] = useState(false)

  const nodeType = getNodeType(expression)

  const handleCollapse = () => {
    setIsAnimating(true)
    // hasBeenOpened.current = true
    setCollapsed(!collapsed)
    setTimeout(() => setIsAnimating(false), 500)
  }

  const handleNodeTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as NodeType
    // updateNode(getDefaultValue(value))
    // setNodeType(value)
    console.log('pathArray', path)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'row', marginLeft: 20 * path.length, gap: 10 }}>
      <div onClick={() => setCollapsed(!collapsed)}>
        <p>{collapsed ? '>' : '^'}</p>
      </div>
      {!collapsed ? (
        <div>
          <p>{'{'}</p>
          <div style={{ marginLeft: 10 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              <p>Node type: </p>
              <select value={nodeType} onChange={handleNodeTypeChange}>
                {nodeTypeOptions.map(({ key, text, value }) => (
                  <option key={key} value={value}>
                    {text}
                  </option>
                ))}
              </select>
              <button
                style={{ border: '1px solid black', maxWidth: 200 }}
                onClick={() => {
                  // evaluate(path).then((result) => console.log(result))
                }}
              >
                Evaluate
              </button>
            </div>
            {/* {nodeType === 'operator' && <OperatorNode path={path} />} */}
            {/* {nodeType === 'fragment' && <FragmentNode path={path} />} */}
          </div>
          <p>{'}'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <p>{'{'}</p>
          {nodeType === 'operator' ? (
            <p>Operator: {expression?.operator ?? ''}</p>
          ) : (
            <p>Fragment</p>
          )}
          <p>{'}'}</p>
        </div>
      )}
    </div>
  )
}

export default FigTreeEditor

const isFigTreeNode = (data: unknown) => {
  if (!data) return false
  if (typeof data !== 'object' || Array.isArray(data)) return false
  return 'operator' in data || 'fragment' in data
}

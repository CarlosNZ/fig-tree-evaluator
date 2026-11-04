import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import JSON5 from 'json5'
import type { FigTree, ListingMap } from 'fig-tree-evaluator'
import { JsonEditor, type JsonData, type TextEditorProps } from 'json-edit-react'
import { FigTreeEditor, type Evaluation } from 'fig-tree-editor-react'
import 'fig-tree-editor-react/style.css'
import { toJson5 } from '../../lib/json5'
import { Json5Editor } from './Json5Editor'
import { EvaluationToast, type ToastState } from './EvaluationToast'
import { editorColours, editorStyles } from './editorTheme'

/** An Evaluate in the tree that takes longer than this shows a running toast. */
const RUNNING_TOAST_DELAY = 300
/** How many levels of the data start open. */
const DATA_COLLAPSE = 2

/**
 * The box json-edit-react opens to edit an object or array as text: the
 * site's JSON5 pane. CodeMirror hands on its native key events, and
 * json-edit-react's key handler reads only the key, its modifiers and
 * `preventDefault()`, which a native event has too.
 */
const TextEditor = ({ value, onChange, onKeyDown }: TextEditorProps) => (
  <Json5Editor
    value={value}
    onChange={onChange}
    onKeyDown={(event) => onKeyDown(event as unknown as ReactKeyboardEvent)}
    label="Edit as JSON5"
    lineNumbers={false}
    autoFocus
  />
)

/**
 * The Playground's tree editors read and write JSON5, as the rest of the site
 * shows it, and edit an object or array as text in the site's JSON5 pane.
 */
export const json5Props = {
  jsonParse: JSON5.parse,
  jsonStringify: (value: JsonData) => toJson5(value),
  TextEditor,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export interface PlaygroundEditorsProps {
  /** The element id, which "open in editor" links target. */
  id?: string
  expression: unknown
  data: JsonData
  figTree: FigTree
  /** How the expression editor presents operators and fragments the package doesn't list. */
  operatorListings?: ListingMap
  /**
   * How many levels of the expression start open; deeper ones start
   * collapsed. The editor's own default if not given.
   */
  collapse?: number
}

/**
 * The Playground page's two editors, side by side where there's room: the
 * data on the left, and the expression on the right, which evaluates against
 * it. An Evaluate in the expression reports in a toast at the foot of the
 * window. The editors start from the props, and a new example remounts them.
 */
export default function PlaygroundEditors(props: PlaygroundEditorsProps) {
  const [data, setData] = useState(props.data)
  const [expression, setExpression] = useState(props.expression)
  const [toast, setToast] = useState<ToastState | null>(null)

  // An Evaluate in the tree: a toast once it has run, and one while it runs
  // if that takes a moment. Each press gets a new id, so its toast replaces
  // the last one visibly, even with the same result.
  const toastId = useRef(0)
  const runningTimer = useRef<ReturnType<typeof setTimeout>>()
  const onEvaluateStart = ({ path }: { path: Evaluation['path'] }) => {
    const id = ++toastId.current
    clearTimeout(runningTimer.current)
    runningTimer.current = setTimeout(
      () => setToast({ id, status: 'running', path }),
      RUNNING_TOAST_DELAY
    )
  }
  const onEvaluate = (evaluation: Evaluation) => {
    clearTimeout(runningTimer.current)
    setToast({ id: toastId.current, status: 'finished', evaluation })
  }
  useEffect(() => () => clearTimeout(runningTimer.current), [])

  return (
    <div className="fds-playground-editors not-content" id={props.id}>
      <section className="fds-widget" aria-label="Data">
        <div className="fds-playground-pane">
          <JsonEditor
            data={data}
            setData={setData}
            rootName="data"
            collapse={DATA_COLLAPSE}
            showCollectionCount="when-collapsed"
            theme={editorStyles}
            minWidth="100%"
            maxWidth="100%"
            {...json5Props}
          />
        </div>
      </section>
      <section className="fds-widget" aria-label="Expression">
        <div className="fds-playground-pane">
          <FigTreeEditor
            figTree={props.figTree}
            operatorListings={props.operatorListings}
            expression={expression}
            setExpression={setExpression}
            // The data's root can be edited into something other than an
            // object, which evaluation can't take
            evaluationData={isRecord(data) ? data : undefined}
            rootName="expression"
            collapse={props.collapse}
            theme={editorStyles}
            editorTheme={editorColours}
            onEvaluateStart={onEvaluateStart}
            onEvaluate={onEvaluate}
            minWidth="100%"
            maxWidth="100%"
            {...json5Props}
          />
        </div>
      </section>
      <EvaluationToast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

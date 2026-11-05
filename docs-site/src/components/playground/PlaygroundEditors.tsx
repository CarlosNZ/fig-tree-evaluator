import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import JSON5 from 'json5'
import type {
  FallbackCoverage,
  FallbackCoverageOptions,
  FigTree,
  ListingMap,
} from 'fig-tree-evaluator'
import { JsonEditor, type JsonData, type TextEditorProps } from 'json-edit-react'
import { useUndo } from '@json-edit-react/utils'
import { FigTreeEditor, type Evaluation, type FigTreeEditorHandle } from 'fig-tree-editor-react'
import 'fig-tree-editor-react/style.css'
import { toJson5 } from '../../lib/json5'
import { customAnalyses } from '../../lib/operators'
import { Json5Editor } from './Json5Editor'
import { EvaluationToast, type ToastState } from './EvaluationToast'
import CoverageBadge from './CoverageBadge'
import { useFallbackCoverage, type CoverageRefresh } from './useFallbackCoverage'
import type { Work } from './playgroundWork'
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

/** Whether a write is one the reader made, or one the editor made itself. */
export type WriteOptions = { autoUpdate?: boolean }

/**
 * A value with its undo history, `useUndo`'s, whose every change, an undo
 * included, reaches `onChange`. A write the reader didn't make (the editor
 * filling in an expression it was given, marked `autoUpdate`) replaces the
 * current state rather than recording a step, so undo never lands on the
 * incomplete version.
 */
const useHistory = <Value,>(
  initial: Value,
  onChange: (value: Value, options: WriteOptions) => void
) => {
  const [value, setValue] = useState(initial)
  const writing = useRef<WriteOptions>({})
  // The latest, whichever render's setter useUndo calls
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const history = useUndo(value, (next) => {
    setValue(next)
    onChangeRef.current(next, writing.current)
  })
  const write = (next: Value, options: WriteOptions = {}) => {
    if (JSON.stringify(next) === JSON.stringify(value)) return
    writing.current = options
    if (options.autoUpdate) history.replace(next)
    else history.set(next)
    writing.current = {}
  }
  return { value, write, ...history }
}

const HistoryButtons = ({
  history,
}: {
  history: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }
}) => (
  <div className="fds-playground-history">
    <button
      className="fds-widget-action fds-widget-action--accent"
      disabled={!history.canUndo}
      onClick={history.undo}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6 3.5L3 6.5l3 3M3.5 6.5h6a3.5 3.5 0 010 7H7" />
      </svg>
      Undo
    </button>
    <button
      className="fds-widget-action fds-widget-action--accent"
      disabled={!history.canRedo}
      onClick={history.redo}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10 3.5l3 3-3 3M12.5 6.5h-6a3.5 3.5 0 000 7H9" />
      </svg>
      Redo
    </button>
  </div>
)

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
  /** A toast of the page's own, stacked above the evaluation toast. */
  notice?: ReactNode
  /** The options of the analysis behind the "Fully covered" badge. */
  coverageOptions?: FallbackCoverageOptions
  /** For a host that changes the instance in place, which the badge can't see. */
  handle?: Ref<PlaygroundEditorsHandle>
  /**
   * Each change of the expression or the data, an undo included, with
   * `autoUpdate` set for one the editor made itself, filling in what it was
   * given.
   */
  onChange?: (work: Work, options: WriteOptions) => void
}

export interface PlaygroundEditorsHandle {
  /** Works out the expression's coverage again, as after a change of the instance's options. */
  refreshCoverage: (refresh?: CoverageRefresh) => Promise<FallbackCoverage | null>
}

/**
 * The Playground page's two editors, side by side where there's room: the
 * data on the left, and the expression on the right, which evaluates against
 * it, with a badge saying whether it's fully covered. Each has its own undo
 * history, with Undo and Redo below it. An Evaluate in the expression
 * reports in a toast at the foot of the window. The editors start from the
 * props, and a new example remounts them.
 */
export default function PlaygroundEditors(props: PlaygroundEditorsProps) {
  const [toast, setToast] = useState<ToastState | null>(null)

  // Both values as they stand, for reporting a change of either
  const work = useRef<Work>({ expression: props.expression, data: props.data })
  const report = (change: Partial<Work>, options: WriteOptions) => {
    work.current = { ...work.current, ...change }
    props.onChange?.(work.current, options)
  }
  const expressionHistory = useHistory(props.expression, (expression, options) => {
    refreshCoverage({ expression })
    report({ expression }, options)
  })
  const dataHistory = useHistory(props.data, (data, options) => report({ data }, options))
  const expression = expressionHistory.value
  const data = dataHistory.value

  // The docs pages' custom operators' analyses: the Playground's own have none
  const { coverage, refreshCoverage } = useFallbackCoverage(
    props.figTree,
    expression,
    customAnalyses,
    props.coverageOptions
  )
  useImperativeHandle(props.handle, () => ({ refreshCoverage }), [refreshCoverage])
  const editor = useRef<FigTreeEditorHandle>(null)

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
            setData={(next) => dataHistory.write(next)}
            rootName="data"
            collapse={DATA_COLLAPSE}
            showCollectionCount="when-collapsed"
            theme={editorStyles}
            minWidth="100%"
            maxWidth="100%"
            {...json5Props}
          />
        </div>
        <HistoryButtons history={dataHistory} />
      </section>
      <section className="fds-widget" aria-label="Expression">
        <div className="fds-playground-pane">
          <CoverageBadge
            coverage={coverage}
            onReveal={(path) => editor.current?.reveal({ path })}
          />
          <FigTreeEditor
            figTree={props.figTree}
            operatorListings={props.operatorListings}
            expression={expression}
            setExpression={expressionHistory.write}
            editorRef={editor}
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
        <HistoryButtons history={expressionHistory} />
      </section>
      <div className="fds-playground-toasts">
        {props.notice}
        <EvaluationToast toast={toast} onClose={() => setToast(null)} />
      </div>
    </div>
  )
}

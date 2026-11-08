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
import {
  FigTreeEditor,
  FragmentDefinitionEditor,
  FragmentSelect,
  type Evaluation,
  type FigTreeEditorHandle,
  type useFragmentEditor,
} from 'fig-tree-editor-react'
import 'fig-tree-editor-react/style.css'
import { toJson5 } from '../../lib/json5'
import { showTrace } from '../../lib/trace'
import { customAnalyses } from '../../lib/operators'
import { Json5Editor } from './Json5Editor'
import { EvaluationToast, type ToastState } from './EvaluationToast'
import CoverageBadge from './CoverageBadge'
import { FormPreview } from './FormPreview'
import { useFallbackCoverage, type CoverageRefresh } from './useFallbackCoverage'
import type { Work } from './playgroundWork'
import { editorColours, editorStyles } from './editorTheme'

/** An Evaluate in the tree that takes longer than this shows a running toast. */
const RUNNING_TOAST_DELAY = 300
/** How many levels of the data start open, unless the example says. */
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

type History = { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }

const HistoryActions = ({ history }: { history: History }) => (
  <>
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
  </>
)

const HistoryButtons = ({ history }: { history: History }) => (
  <div className="fds-playground-history">
    <HistoryActions history={history} />
  </div>
)

export type FragmentEditor = ReturnType<typeof useFragmentEditor>

/** What the editors are given in fragment mode. */
export interface FragmentMode {
  editor: FragmentEditor
  /** Back to the expression, from the bar's button. */
  onLeave: () => void
}

/**
 * The bar across both panes in fragment mode: which fragment is being edited,
 * the one undo history its definition has, body and declarations together,
 * its Save, and the way back to the expression.
 */
const FragmentBar = ({ editor, onLeave }: FragmentMode) => (
  <div className="fds-widget fds-playground-fragment-bar">
    <div className="fds-widget-toolbar">
      <div className="fds-picker">
        <span className="fds-picker-label">Fragment</span>
        <FragmentSelect {...editor.selectProps} />
      </div>
      <div className="fds-playground-fragment-actions">
        <HistoryActions history={editor} />
        <button
          className="fds-widget-action fds-widget-action--primary"
          disabled={!editor.canSave}
          onClick={editor.save}
        >
          Save
        </button>
      </div>
      <button className="fds-widget-action" onClick={onLeave}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
        Back to expression
      </button>
    </div>
  </div>
)

/** One of the left pane's views. */
interface PaneView {
  key: string
  label: string
  content: ReactNode
}

/**
 * The left pane: its views, with a switch above them where there's more than
 * one. It shows the chosen one, or the first while none is, or the one chosen
 * has gone, as the trace does when Trace is turned off.
 */
const SwitchedPane = ({
  views,
  chosen,
  onChoose,
}: {
  views: PaneView[]
  chosen: string | null
  onChoose: (key: string) => void
}) => {
  const view = views.find(({ key }) => key === chosen) ?? views[0]
  return (
    <>
      {views.length > 1 && (
        <div className="fds-widget-toolbar">
          <div className="fds-segmented" role="group" aria-label="Show">
            {views.map(({ key, label }) => (
              <button
                key={key}
                className="fds-segmented-option"
                aria-pressed={view.key === key}
                onClick={() => onChoose(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {view.content}
    </>
  )
}

/** The last Evaluate's, and whether an edit since could change its result. */
interface Traced {
  evaluation: Evaluation
  outdated: boolean
}

/**
 * The trace of the last Evaluate, with each entry's time, or how to get one,
 * with a badge in its corner once an edit could have changed its result. A
 * refused evaluation has none.
 */
const TraceView = ({ traced }: { traced: Traced | null }) => (
  <div className="fds-playground-pane fds-playground-trace">
    {traced === null ? (
      <p className="fds-playground-trace-note">Evaluate any node to see its trace here.</p>
    ) : traced.evaluation.trace ? (
      <div className="fds-playground-trace-code">
        <Json5Editor
          value={showTrace(traced.evaluation.trace, { elapsed: true })}
          label="Trace (JSON5)"
          readOnly
        />
        {traced.outdated && (
          <span
            className="fds-playground-trace-outdated"
            title="From before your last edit: evaluate again to update it"
          >
            Out of date
          </span>
        )}
      </div>
    ) : (
      <p className="fds-playground-trace-note">
        No trace: a static error stops the expression before any of it runs
      </p>
    )}
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
  /** How many levels of the data start open; 2 if not given. */
  dataCollapse?: number
  /** A toast of the page's own, stacked above the evaluation toast. */
  notice?: ReactNode
  /** The options of the analysis behind the "Fully covered" badge. */
  coverageOptions?: FallbackCoverageOptions
  /**
   * Present in fragment mode, where the expression editor edits the
   * fragment's body, the left pane its declarations or the data, and a bar
   * above both says which fragment it is. The coverage badge is hidden, since
   * a body's failures are its callers' to catch.
   */
  fragmentMode?: FragmentMode
  /**
   * Whether the left pane offers the trace of the last Evaluate, by a switch
   * above it, the footer's Trace being on. Turning it on shows the trace.
   */
  trace?: boolean
  /**
   * Whether the expression pane shows the coverage badge. Its coverage is
   * worked out either way, so it's current the moment the badge shows.
   */
  coverage?: boolean
  /**
   * A live view of the expression's result, as the left pane's first view,
   * outside fragment mode: `'form'` draws the form it configures, which
   * edits the data.
   */
  preview?: 'form'
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
  /** The expression and the data as they stand. */
  work: () => Work
  /** Marks the trace out of date, as after a change of the instance's options or fragments. */
  outdateTrace: () => void
}

/**
 * The Playground page's two editors, side by side where there's room: the
 * data on the left, and the expression on the right, which evaluates against
 * it, with a badge saying whether it's fully covered. Each has its own undo
 * history, with Undo and Redo below it. An Evaluate in the expression
 * reports in a toast at the foot of the window. The editors start from the
 * props, and a new example remounts them. In fragment mode they edit a
 * fragment instead (`fragmentMode`), keeping the expression and its history
 * for the switch back.
 *
 * With `trace`, the left pane can show the trace of the last Evaluate, which
 * each Evaluate replaces, and does when it's turned on. An edit that could change its result marks it out
 * of date, and a switch of mode clears it.
 */
export default function PlaygroundEditors(props: PlaygroundEditorsProps) {
  const { fragmentMode } = props
  const [toast, setToast] = useState<ToastState | null>(null)

  const mode = fragmentMode ? 'fragment' : 'expression'
  const [traced, setTraced] = useState<Traced | null>(null)
  const [tracedMode, setTracedMode] = useState(mode)
  // The left pane's view, by key, which each mode starts without, so it
  // opens on its first. Trace turned on shows the trace.
  const [paneView, setPaneView] = useState<string | null>(null)
  if (tracedMode !== mode) {
    setTracedMode(mode)
    setTraced(null)
    setPaneView(null)
  }
  const [traceOn, setTraceOn] = useState(props.trace)
  if (traceOn !== props.trace) {
    setTraceOn(props.trace)
    if (props.trace) setPaneView('trace')
  }
  const outdateTrace = () =>
    setTraced((current) =>
      current && !current.outdated ? { ...current, outdated: true } : current
    )
  // A write the editor made itself, filling in what it was given, changes no
  // result
  const outdating =
    <Args extends unknown[]>(write: (...args: Args) => void) =>
    (...args: Args) => {
      const options = args[1] as WriteOptions | undefined
      if (!options?.autoUpdate) outdateTrace()
      write(...args)
    }

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
  useImperativeHandle(
    props.handle,
    () => ({ refreshCoverage, work: () => work.current, outdateTrace }),
    [refreshCoverage]
  )
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
    if (evaluation.status !== 'cancelled') setTraced({ evaluation, outdated: false })
  }
  useEffect(() => () => clearTimeout(runningTimer.current), [])

  const setData = (next: JsonData) => {
    outdateTrace()
    dataHistory.write(next)
  }
  const dataPane = (
    <>
      <div className="fds-playground-pane">
        <JsonEditor
          data={data}
          setData={setData}
          rootName="data"
          collapse={props.dataCollapse ?? DATA_COLLAPSE}
          showCollectionCount="when-collapsed"
          theme={editorStyles}
          minWidth="100%"
          maxWidth="100%"
          {...json5Props}
        />
      </div>
      <HistoryButtons history={dataHistory} />
    </>
  )
  // The body is a fragment definition's, with its own collapse
  const fragmentEditor = fragmentMode?.editor
  const source = fragmentEditor
    ? {
        ...fragmentEditor.editorProps,
        setFragmentDefinition: outdating(fragmentEditor.editorProps.setFragmentDefinition),
      }
    : {
        expression,
        setExpression: outdating(expressionHistory.write),
        collapse: props.collapse,
      }

  const views: PaneView[] = [
    ...(props.preview === 'form' && !fragmentMode
      ? [
          {
            key: 'form',
            label: 'Form',
            content: (
              <>
                <FormPreview
                  figTree={props.figTree}
                  expression={expression}
                  // As for the tree's Evaluate, a root that isn't an object
                  // can't be evaluated against
                  data={isRecord(data) ? data : {}}
                  setData={setData}
                />
                <HistoryButtons history={dataHistory} />
              </>
            ),
          },
        ]
      : []),
    ...(fragmentEditor
      ? [
          {
            key: 'definition',
            label: 'Definition',
            content: (
              <div className="fds-playground-pane">
                <FragmentDefinitionEditor
                  figTree={props.figTree}
                  {...fragmentEditor.definitionProps}
                  setDefinition={outdating(fragmentEditor.definitionProps.setDefinition)}
                  theme={editorStyles}
                  minWidth="100%"
                  maxWidth="100%"
                  {...json5Props}
                />
              </div>
            ),
          },
        ]
      : []),
    { key: 'data', label: 'Data', content: dataPane },
    ...(props.trace
      ? [{ key: 'trace', label: 'Trace', content: <TraceView traced={traced} /> }]
      : []),
  ]

  return (
    <div className="fds-playground-editors not-content" id={props.id}>
      {fragmentMode && <FragmentBar {...fragmentMode} />}
      <div className="fds-playground-panes">
        <section className="fds-widget" aria-label={fragmentMode ? 'Fragment definition' : 'Data'}>
          <SwitchedPane views={views} chosen={paneView} onChoose={setPaneView} />
        </section>
        <section className="fds-widget" aria-label={fragmentMode ? 'Fragment body' : 'Expression'}>
          <div className="fds-playground-pane">
            {props.coverage && !fragmentMode && (
              <CoverageBadge
                coverage={coverage}
                onReveal={(path) => editor.current?.reveal({ path })}
              />
            )}
            <FigTreeEditor
              // A switch of mode starts the tree afresh
              key={fragmentMode ? 'fragment' : 'expression'}
              figTree={props.figTree}
              operatorListings={props.operatorListings}
              {...source}
              editorRef={editor}
              // The data's root can be edited into something other than an
              // object, which evaluation can't take
              evaluationData={isRecord(data) ? data : undefined}
              rootName="expression"
              theme={editorStyles}
              editorTheme={editorColours}
              onEvaluateStart={onEvaluateStart}
              onEvaluate={onEvaluate}
              minWidth="100%"
              maxWidth="100%"
              {...json5Props}
            />
          </div>
          {!fragmentMode && <HistoryButtons history={expressionHistory} />}
        </section>
      </div>
      <div className="fds-playground-toasts">
        {props.notice}
        <EvaluationToast toast={toast} onClose={() => setToast(null)} />
      </div>
    </div>
  )
}

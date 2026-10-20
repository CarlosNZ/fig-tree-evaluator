import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import JSON5 from 'json5'
import { deepEqual, isFigTreeError } from 'fig-tree-evaluator'
import { FigTreeEditor, type Evaluation, type SetExpressionOptions } from 'fig-tree-editor-react'
import 'fig-tree-editor-react/style.css'
import { exampleFigTree } from '../../lib/figTree'
import { parseJson5, toJson5 } from '../../lib/json5'
import { inlineMarkdown } from '../../lib/inlineMarkdown'
import { readPlaygroundSeed } from '../../lib/playgroundLink'
import { Json5Editor, hasComments } from './Json5Editor'
import { EvaluationToast, type ToastState } from './EvaluationToast'
import { ResultValue } from './ResultValue'
import type { PlaygroundProps } from './Playground'

/** The editor's own colours that need a dark-mode variant (custom.css). */
const editorColours = {
  refData: 'var(--fds-tree-ref-data)',
  refVars: 'var(--fds-tree-ref-vars)',
  refParams: 'var(--fds-tree-ref-params)',
}

/** Below this width the inline widget leaves out the tree preview. */
const PREVIEW_MIN_WIDTH = 468
/** Typing in the expression or data text applies once it pauses this long. */
const INPUT_DELAY = 300
/** Evaluation waits this long, so a burst of changes runs once. */
const EVALUATE_DELAY = 50
/** An Evaluate in the tree that takes longer than this shows a running toast. */
const RUNNING_TOAST_DELAY = 300

/**
 * The tree editor's layer of json-edit-react's theme. Its container is
 * transparent, so the docs' CSS sets the pane's background, and its padding
 * lines its first row up with the code pane's first line. Colours are CSS
 * variables (custom.css), so the editor follows the site's light and dark
 * themes.
 */
const editorStyles = {
  container: { backgroundColor: 'transparent', padding: '0.1em 0.5em 1em 1.5em' },
  property: 'var(--fds-code-key)',
  string: 'var(--fds-tree-string)',
  input: 'var(--fds-tree-input)',
  inputHighlight: 'var(--fds-tree-highlight)',
  bracket: 'var(--fds-tree-bracket)',
  itemCount: 'var(--fds-tree-item-count)',
  iconCollection: 'var(--fds-tree-chevron)',
}

type Outcome =
  | { status: 'done'; value: unknown }
  | { status: 'failed'; code: string; message: string }
  | { status: 'blocked'; reason: string }

const useNarrow = (element: React.RefObject<HTMLElement | null>) => {
  const [narrow, setNarrow] = useState(false)
  useLayoutEffect(() => {
    if (!element.current) return
    const observer = new ResizeObserver(([entry]) =>
      setNarrow(entry.contentRect.width < PREVIEW_MIN_WIDTH)
    )
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [element])
  return narrow
}

/**
 * The two-pane widget: JSON5 text and the FigTree editor, both reading and
 * writing one expression, with the evaluation data and the result below. The
 * result is the whole expression's, kept up to date as either pane changes
 * it; the tree's Evaluate buttons answer in a toast instead. On the page, the widget
 * keeps to the content column: the text pane, with a shrunken, read-only
 * preview of the tree beside it where there's room. Expanding it opens an
 * overlay with the two panes side by side at full size, and an optional
 * caption at its foot. A static example's editor is the overlay alone
 * (`overlayOnly`).
 *
 * The text pane keeps its own text, because half-typed JSON5 doesn't parse.
 * Once typing pauses, text that parses updates the shared expression, and
 * text that doesn't shows the parse error and leaves the expression alone. An
 * edit in the tree regenerates the text only if the text doesn't already
 * parse to the new value, which avoids update loops and keeps the cursor
 * where it is. The tree's own completion of what it's given (its fill-in
 * step, marked `autoUpdate`) never does: half-typed text that happens to
 * parse would otherwise be rewritten under the cursor. Regenerated text has
 * no comments, so an edit in the tree that drops them says so.
 */
export default function PlaygroundWidget(props: PlaygroundProps) {
  const seed = useMemo(
    () => (props.readFromUrl ? readPlaygroundSeed(window.location.search) : null),
    [props.readFromUrl]
  )
  const initialText = seed?.expression ?? props.expression
  const initialData = seed ? (seed.data ?? '{}') : (props.data ?? '{}')
  const figTree = exampleFigTree(seed ? seed.fragments : props.fragments)

  const initial = useMemo(() => parseJson5(initialText), [initialText])
  const [text, setText] = useState(initialText)
  const [parseError, setParseError] = useState(initial.ok ? null : initial.error)
  const [expression, setExpression] = useState(initial.ok ? initial.value : null)
  const textRef = useRef(text)
  textRef.current = text

  const [dataText, setDataText] = useState(initialData)
  const [dataError, setDataError] = useState<string | null>(null)
  const [data, setData] = useState<Record<string, unknown>>({})
  // The data's checks live in `applyData`, so the starting text goes through
  // it too
  useEffect(() => applyData(initialData), [initialData])

  // Typing in either text pane applies once it pauses; until then, the
  // result shows as out of date
  const textTimer = useRef<ReturnType<typeof setTimeout>>()
  const dataTimer = useRef<ReturnType<typeof setTimeout>>()
  const [inputPending, setInputPending] = useState(false)
  useEffect(
    () => () => {
      clearTimeout(textTimer.current)
      clearTimeout(dataTimer.current)
    },
    []
  )

  // The latest outcome stays on show, marked stale, while the next is worked
  // out, so the result doesn't flicker as someone types
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [stale, setStale] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [expanded, setExpanded] = useState(props.overlayOnly === true)
  const container = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(container)
  const overlay = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!expanded) return
    overlay.current?.showModal()
    props.onOpen?.()
  }, [expanded])

  // An "open in editor" link lands here; the page has grown since the
  // browser scrolled to the anchor, so scroll again now the widget is drawn
  useEffect(() => {
    if (seed && window.location.hash === `#${props.id}`)
      container.current?.scrollIntoView({ block: 'start' })
  }, [seed, props.id])

  const applyText = (next: string) => {
    const parsed = parseJson5(next)
    if (!parsed.ok) return setParseError(parsed.error)
    setParseError(null)
    setExpression(parsed.value)
  }

  const onTextChange = (next: string) => {
    setText(next)
    setNotice(null)
    setInputPending(true)
    clearTimeout(textTimer.current)
    textTimer.current = setTimeout(() => {
      setInputPending(false)
      applyText(next)
    }, INPUT_DELAY)
  }

  /** The text pane's text is about to be replaced, so its pending edit goes. */
  const dropPendingText = () => {
    clearTimeout(textTimer.current)
    setInputPending(false)
  }

  /** A write from the tree editor. */
  const replaceExpression = (next: unknown, options?: SetExpressionOptions) => {
    if (options?.autoUpdate) return
    dropPendingText()
    setExpression(next)
    const current = parseJson5(textRef.current)
    if (current.ok && deepEqual(current.value, next)) return
    if (hasComments(textRef.current))
      setNotice('The text was regenerated from the tree, which dropped its comments.')
    setText(toJson5(next))
    setParseError(null)
  }

  // Reset puts back the example as the page wrote it, comments and all
  const edited = text !== initialText || dataText !== initialData
  const reset = () => {
    dropPendingText()
    clearTimeout(dataTimer.current)
    setNotice(null)
    setText(initialText)
    applyText(initialText)
    setDataText(initialData)
    applyData(initialData)
  }

  const onDataChange = (next: string) => {
    setDataText(next)
    setInputPending(true)
    clearTimeout(dataTimer.current)
    dataTimer.current = setTimeout(() => {
      setInputPending(false)
      applyData(next)
    }, INPUT_DELAY)
  }

  const applyData = (next: string) => {
    const parsed = parseJson5(next)
    if (!parsed.ok) return setDataError(parsed.error)
    if (typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value))
      return setDataError('The data must be an object')
    setDataError(null)
    setData(parsed.value as Record<string, unknown>)
  }

  // Evaluation follows the shared state, debounced; a stale run's answer is
  // dropped
  const run = useRef(0)
  useEffect(() => {
    const id = ++run.current
    const settle = (next: Outcome) => {
      if (id !== run.current) return
      setOutcome(next)
      setStale(false)
    }
    if (parseError)
      return settle({ status: 'blocked', reason: 'The expression text has a syntax error' })
    if (dataError) return settle({ status: 'blocked', reason: 'The data has a syntax error' })
    setStale(true)
    const timer = setTimeout(async () => {
      try {
        settle({ status: 'done', value: await figTree.evaluate(expression, { data }) })
      } catch (error) {
        settle(
          isFigTreeError(error)
            ? { status: 'failed', code: error.code, message: error.message }
            : { status: 'failed', code: 'Error', message: String(error) }
        )
      }
    }, EVALUATE_DELAY)
    return () => clearTimeout(timer)
  }, [expression, data, parseError, dataError])

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

  const title = <div className="fds-widget-title">{props.title ?? 'Playground'}</div>

  const resetButton = (
    <button className="fds-widget-action" disabled={!edited} onClick={reset}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 8a6 6 0 1 0 6-6 6.5 6.5 0 0 0-4.5 1.8L2 5.3M2 2v3.3h3.3" />
      </svg>
      Reset
    </button>
  )

  const textPane = (
    <div className="fds-widget-pane">
      <div className="fds-widget-pane-label">JSON5</div>
      <Json5Editor value={text} onChange={onTextChange} label="Expression (JSON5)" />
      {parseError && <div className="fds-widget-error">{parseError}</div>}
    </div>
  )

  const treeEditor = (
    <FigTreeEditor
      figTree={figTree}
      expression={expression}
      setExpression={replaceExpression}
      evaluationData={data}
      rootName="expression"
      collapse={props.collapse}
      jsonParse={JSON5.parse}
      theme={editorStyles}
      editorTheme={editorColours}
      onEvaluateStart={onEvaluateStart}
      onEvaluate={onEvaluate}
      minWidth="100%"
      maxWidth="100%"
    />
  )

  const noticeBar = notice && <div className="fds-widget-notice">{notice}</div>

  /** The data and the result, in columns that line up with the panes above. */
  const output = (panes: string) => (
    <div className={`${panes} fds-widget-below`}>
      <div className="fds-widget-pane">
        <div className="fds-widget-pane-label">Data</div>
        <Json5Editor
          value={dataText}
          onChange={onDataChange}
          label="Evaluation data (JSON5)"
          lineNumbers={false}
        />
        {dataError && <div className="fds-widget-error">{dataError}</div>}
      </div>
      <div className="fds-widget-pane" aria-live="polite">
        <div className="fds-widget-pane-label">Result</div>
        <div
          className={`fds-widget-result${stale || inputPending ? ' fds-widget-result--stale' : ''}`}
        >
          <ResultView outcome={outcome} />
        </div>
      </div>
    </div>
  )

  const inlinePanes = `fds-widget-panes fds-widget-panes--${narrow ? 'stacked' : 'preview'}`

  const dialog = expanded && (
    <dialog
      className="fds-widget fds-overlay"
      ref={overlay}
      aria-label="Expression editor"
      onClose={() => {
        // The toast belongs to this visit to the overlay
        clearTimeout(runningTimer.current)
        setToast(null)
        setExpanded(false)
        if (props.overlayOnly) props.onClose?.()
      }}
    >
      <div className="fds-widget-toolbar">
        {title}
        {resetButton}
        <button className="fds-widget-action" onClick={() => overlay.current?.close()}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
          Close
        </button>
      </div>
      <div className="fds-widget-panes">
        {textPane}
        <div className="fds-widget-tree-cell">
          <div className="fds-widget-pane fds-widget-pane--tree">
            <div className="fds-widget-pane-label">Editor</div>
            {treeEditor}
          </div>
          <EvaluationToast toast={toast} onClose={() => setToast(null)} />
        </div>
      </div>
      {noticeBar}
      {output('fds-widget-panes')}
      {props.caption && (
        <p
          className="fds-overlay-caption"
          dangerouslySetInnerHTML={{ __html: inlineMarkdown(props.caption) }}
        />
      )}
    </dialog>
  )

  // Opened from a static example, the overlay is the whole widget
  if (props.overlayOnly) return <div ref={container}>{dialog}</div>

  return (
    <div className="fds-widget" ref={container}>
      <div className="fds-widget-toolbar">
        {title}
        {resetButton}
        <button className="fds-widget-action" onClick={() => setExpanded(true)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
          </svg>
          Expand editor
        </button>
      </div>

      <div className={inlinePanes}>
        {textPane}
        {!narrow && <TreePreview onOpen={() => setExpanded(true)}>{treeEditor}</TreePreview>}
      </div>

      {noticeBar}
      {output(inlinePanes)}

      {dialog}
    </div>
  )
}

/**
 * The inline widget's tree: the editor drawn shrunken and read-only, as a
 * button that opens the overlay. A scaled element keeps its full size in the
 * layout, so the frame is measured instead: its shrunken height is the most
 * the row needs for it (up to the pane's cap). Where the tree doesn't fit, at
 * the foot or on the right, that edge is cut off and fades out.
 */
const TreePreview = ({ onOpen, children }: { onOpen: () => void; children: React.ReactNode }) => {
  const frame = useRef<HTMLDivElement>(null)
  const scaled = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const [clipped, setClipped] = useState({ right: false, bottom: false })

  useLayoutEffect(() => {
    // React 18 has no `inert` prop, so it's set on the element
    frame.current!.setAttribute('inert', '')
    const measure = () => {
      const tree = scaled.current!.getBoundingClientRect()
      const box = frame.current!.getBoundingClientRect()
      setHeight(Math.ceil(tree.height))
      // A pixel's grace, for rounding
      setClipped({ right: tree.right > box.right + 1, bottom: tree.bottom > box.bottom + 1 })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(frame.current!)
    observer.observe(scaled.current!)
    return () => observer.disconnect()
  }, [])

  const frameClass = [
    'fds-widget-preview-frame',
    clipped.right && 'fds-widget-preview-frame--clip-right',
    clipped.bottom && 'fds-widget-preview-frame--clip-bottom',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className="fds-widget-preview"
      style={{ '--fds-preview-height': `${height}px` } as React.CSSProperties}
      role="button"
      tabIndex={0}
      aria-label="Open the tree editor"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen()
      }}
    >
      <div className="fds-widget-pane-label">Editor</div>
      <div className={frameClass} ref={frame}>
        <div className="fds-widget-preview-scaled" ref={scaled}>
          {children}
        </div>
      </div>
      <span className="fds-widget-preview-hint">Open editor</span>
    </div>
  )
}

const ResultView = ({ outcome }: { outcome: Outcome | null }) => {
  if (!outcome) return <div className="fds-widget-result-message">Evaluating…</div>
  switch (outcome.status) {
    case 'blocked':
      return <div className="fds-widget-result-message">{outcome.reason}</div>
    case 'failed':
      return (
        <pre className="fds-widget-result-failed">
          <strong>{outcome.code}</strong> {outcome.message}
        </pre>
      )
    case 'done':
      return <ResultValue value={outcome.value} />
  }
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import JSON5 from 'json5'
import { deepEqual, isFigTreeError } from 'fig-tree-evaluator'
import { toCanonical, toShorthand } from 'fig-tree-evaluator/format'
import { FigTreeEditor } from 'fig-tree-editor-react'
import 'fig-tree-editor-react/style.css'
import { figTree } from '../../lib/figTree'
import { parseJson5, toJson5 } from '../../lib/json5'
import { readPlaygroundSeed } from '../../lib/playgroundLink'
import { Json5Editor, hasComments } from './Json5Editor'
import type { PlaygroundProps } from './Playground'

/** Below this width the inline widget leaves out the tree preview. */
const PREVIEW_MIN_WIDTH = 468
const EVALUATE_DELAY = 250

type Outcome =
  | { status: 'pending' }
  | { status: 'done'; value: unknown }
  | { status: 'failed'; code: string; message: string }
  | { status: 'blocked'; reason: string }

type Form = 'shorthand' | 'full' | 'mixed'

/** Which form the whole expression is in, judged by whether converting changes it. */
const formOf = (expression: unknown): Form | null => {
  try {
    if (deepEqual(toShorthand(expression, figTree), expression)) return 'shorthand'
    if (deepEqual(toCanonical(expression, figTree), expression)) return 'full'
    return 'mixed'
  } catch {
    return null
  }
}

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
 * writing one expression, with its result below. On the page, the widget
 * keeps to the content column: the text pane, with a shrunken, read-only
 * preview of the tree beside it where there's room. Expanding it opens an
 * overlay with the two panes side by side at full size.
 *
 * The text pane keeps its own text, because half-typed JSON5 doesn't parse:
 * an edit that parses updates the shared expression, and one that doesn't
 * shows the parse error and leaves the expression alone. A change from the
 * right regenerates the text only if the text doesn't already parse to the
 * new value, which avoids update loops and keeps the cursor where it is while
 * someone types. Regenerated text has no comments, so a change that would
 * drop them asks first where it can (the form toggle) and says so where it
 * can't (an edit on the right).
 */
export default function PlaygroundWidget(props: PlaygroundProps) {
  const seed = useMemo(
    () => (props.readFromUrl ? readPlaygroundSeed(window.location.search) : null),
    [props.readFromUrl]
  )
  const initialText = seed?.expression ?? props.expression
  const initialData = seed ? (seed.data ?? '{}') : (props.data ?? '{}')

  const initial = useMemo(() => parseJson5(initialText), [initialText])
  const [text, setText] = useState(initialText)
  const [parseError, setParseError] = useState(initial.ok ? null : initial.error)
  const [expression, setExpression] = useState(initial.ok ? initial.value : null)
  const textRef = useRef(text)
  textRef.current = text

  const [dataText, setDataText] = useState(initialData)
  const [dataError, setDataError] = useState<string | null>(null)
  const [data, setData] = useState<Record<string, unknown>>({})
  // The data's checks live in its change handler, so the starting text goes
  // through it too
  useEffect(() => onDataChange(initialData), [initialData])

  const [outcome, setOutcome] = useState<Outcome>({ status: 'pending' })
  const [notice, setNotice] = useState<string | null>(null)
  const [below, setBelow] = useState<'result' | 'data'>('result')
  const [expanded, setExpanded] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(container)
  const overlay = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (expanded) overlay.current?.showModal()
  }, [expanded])

  // An "open in editor" link lands here; the page has grown since the
  // browser scrolled to the anchor, so scroll again now the widget is drawn
  useEffect(() => {
    if (seed && window.location.hash === `#${props.id}`)
      container.current?.scrollIntoView({ block: 'start' })
  }, [seed, props.id])

  const onTextChange = (next: string) => {
    setText(next)
    setNotice(null)
    const parsed = parseJson5(next)
    if (!parsed.ok) return setParseError(parsed.error)
    setParseError(null)
    setExpression(parsed.value)
  }

  /** The shared expression changed from outside the text pane. */
  const replaceExpression = (next: unknown) => {
    setExpression(next)
    const current = parseJson5(textRef.current)
    if (current.ok && deepEqual(current.value, next)) return
    if (hasComments(textRef.current))
      setNotice('The text was regenerated from the tree, which dropped its comments.')
    setText(toJson5(next))
    setParseError(null)
  }

  const form = useMemo(() => (parseError ? null : formOf(expression)), [expression, parseError])

  const convert = (to: 'shorthand' | 'full') => {
    if (form === to) return
    if (
      hasComments(textRef.current) &&
      !window.confirm('Rewriting the expression drops the comments in its text. Continue?')
    )
      return
    try {
      const next =
        to === 'shorthand' ? toShorthand(expression, figTree) : toCanonical(expression, figTree)
      setNotice(null)
      setExpression(next)
      setText(toJson5(next))
    } catch (error) {
      setNotice(`Can't convert: ${(error as Error).message}`)
    }
  }

  const onDataChange = (next: string) => {
    setDataText(next)
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
    if (parseError)
      return setOutcome({ status: 'blocked', reason: 'The expression text has a syntax error' })
    if (dataError) return setOutcome({ status: 'blocked', reason: 'The data has a syntax error' })
    const id = ++run.current
    setOutcome({ status: 'pending' })
    const timer = setTimeout(async () => {
      try {
        const value = await figTree.evaluate(expression, { data })
        if (id === run.current) setOutcome({ status: 'done', value })
      } catch (error) {
        if (id !== run.current) return
        setOutcome(
          isFigTreeError(error)
            ? { status: 'failed', code: error.code, message: error.message }
            : { status: 'failed', code: 'Error', message: String(error) }
        )
      }
    }, EVALUATE_DELAY)
    return () => clearTimeout(timer)
  }, [expression, data, parseError, dataError])

  const formSwitch = (
    <>
      <div className="fds-segmented" role="group" aria-label="Form">
        <button
          aria-pressed={form === 'shorthand'}
          disabled={!form}
          onClick={() => convert('shorthand')}
        >
          Shorthand
        </button>
        <button aria-pressed={form === 'full'} disabled={!form} onClick={() => convert('full')}>
          Full
        </button>
      </div>
      {form === 'mixed' && <span className="fds-widget-hint">mixed forms</span>}
    </>
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
      jsonParse={JSON5.parse}
      minWidth="100%"
      maxWidth="100%"
    />
  )

  const noticeBar = notice && <div className="fds-widget-notice">{notice}</div>

  const output = (
    <div className="fds-widget-below">
      <div className="fds-segmented" role="tablist" aria-label="Output">
        <button role="tab" aria-selected={below === 'result'} onClick={() => setBelow('result')}>
          Result
        </button>
        <button role="tab" aria-selected={below === 'data'} onClick={() => setBelow('data')}>
          Data
        </button>
      </div>
      {below === 'result' ? (
        <ResultView outcome={outcome} />
      ) : (
        <div className="fds-widget-data">
          <Json5Editor value={dataText} onChange={onDataChange} label="Evaluation data (JSON5)" />
          {dataError && <div className="fds-widget-error">{dataError}</div>}
        </div>
      )}
    </div>
  )

  return (
    <div className="fds-widget" ref={container}>
      <div className="fds-widget-toolbar">
        {formSwitch}
        <button className="fds-widget-action" onClick={() => setExpanded(true)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
          </svg>
          Expand editor
        </button>
      </div>

      <div className={`fds-widget-panes${narrow ? '' : ' fds-widget-panes--preview'}`}>
        {textPane}
        {!narrow && <TreePreview onOpen={() => setExpanded(true)}>{treeEditor}</TreePreview>}
      </div>

      {noticeBar}
      {output}

      {expanded && (
        <dialog
          className="fds-widget fds-overlay"
          ref={overlay}
          aria-label="Expression editor"
          onClose={() => setExpanded(false)}
        >
          <div className="fds-widget-toolbar">
            {formSwitch}
            <button className="fds-widget-action" onClick={() => overlay.current?.close()}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
              Close
            </button>
          </div>
          <div className="fds-widget-panes">
            {textPane}
            <div className="fds-widget-pane fds-widget-pane--tree">
              <div className="fds-widget-pane-label">Editor</div>
              {treeEditor}
            </div>
          </div>
          {noticeBar}
          {output}
        </dialog>
      )}
    </div>
  )
}

/**
 * The inline widget's tree: the editor drawn shrunken and read-only, as a
 * button that opens the overlay. Where the column is too narrow for it, its
 * right side is cut off, and fades out as its foot does.
 */
const TreePreview = ({ onOpen, children }: { onOpen: () => void; children: React.ReactNode }) => {
  const frame = useRef<HTMLDivElement>(null)
  const scaled = useRef<HTMLDivElement>(null)
  const [clipped, setClipped] = useState(false)

  useLayoutEffect(() => {
    // React 18 has no `inert` prop, so it's set on the element
    frame.current!.setAttribute('inert', '')
    const observer = new ResizeObserver(() =>
      setClipped(
        scaled.current!.getBoundingClientRect().right > frame.current!.getBoundingClientRect().right
      )
    )
    observer.observe(frame.current!)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className="fds-widget-preview"
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
      <div
        className={`fds-widget-preview-frame${clipped ? ' fds-widget-preview-frame--clipped' : ''}`}
        ref={frame}
      >
        <div className="fds-widget-preview-scaled" ref={scaled}>
          {children}
        </div>
      </div>
      <span className="fds-widget-preview-hint">Open editor</span>
    </div>
  )
}

const ResultView = ({ outcome }: { outcome: Outcome }) => {
  switch (outcome.status) {
    case 'pending':
      return <pre className="fds-widget-result fds-widget-result--pending">Evaluating…</pre>
    case 'blocked':
      return <pre className="fds-widget-result fds-widget-result--pending">{outcome.reason}</pre>
    case 'failed':
      return (
        <pre className="fds-widget-result fds-widget-result--failed">
          <strong>{outcome.code}</strong> {outcome.message}
        </pre>
      )
    case 'done':
      return <pre className="fds-widget-result">{toJson5(outcome.value)}</pre>
  }
}

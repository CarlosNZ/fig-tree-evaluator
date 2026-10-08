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

/** Below this width the two panes become tabs. */
const NARROW = 760
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
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < NARROW))
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [element])
  return narrow
}

/**
 * The two-pane widget: JSON5 text on the left, the FigTree editor on the
 * right, both reading and writing one expression, with its result below.
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
  const [pane, setPane] = useState<'text' | 'tree'>('text')
  const [below, setBelow] = useState<'result' | 'data'>('result')
  const container = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(container)

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

  const showText = !narrow || pane === 'text'
  const showTree = !narrow || pane === 'tree'

  return (
    <div className={`fds-widget${narrow ? ' fds-widget--narrow' : ''}`} ref={container}>
      <div className="fds-widget-toolbar">
        {narrow && (
          <div className="fds-segmented" role="tablist" aria-label="Pane">
            <button role="tab" aria-selected={pane === 'text'} onClick={() => setPane('text')}>
              Text
            </button>
            <button role="tab" aria-selected={pane === 'tree'} onClick={() => setPane('tree')}>
              Tree
            </button>
          </div>
        )}
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
      </div>

      <div className="fds-widget-panes">
        {showText && (
          <div className="fds-widget-pane">
            <div className="fds-widget-pane-label">JSON5</div>
            <Json5Editor value={text} onChange={onTextChange} label="Expression (JSON5)" />
            {parseError && <div className="fds-widget-error">{parseError}</div>}
          </div>
        )}
        {showTree && (
          <div className="fds-widget-pane fds-widget-pane--tree">
            <div className="fds-widget-pane-label">Editor</div>
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
          </div>
        )}
      </div>

      {notice && <div className="fds-widget-notice">{notice}</div>}

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

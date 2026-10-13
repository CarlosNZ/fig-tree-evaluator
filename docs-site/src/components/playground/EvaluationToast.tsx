import { useEffect, useRef, useState } from 'react'
import type { Evaluation } from 'fig-tree-editor-react'
import { ResultValue, copyText } from './ResultValue'

type Path = Evaluation['path']

/**
 * What the toast shows: an evaluation still running, or one finished. Each
 * press of an Evaluate button has its own `id`, which its running and
 * finished toasts share.
 */
export type ToastState = { id: number } & (
  { status: 'running'; path: Path } | { status: 'finished'; evaluation: Evaluation }
)

/** How long a finished toast stays, by its status; a failure stays until closed. */
const DURATION: Record<Evaluation['status'], number | null> = {
  done: 5000,
  cancelled: 3000,
  failed: null,
}

/** A row's path as the toast names it: the root is the expression. */
const describePath = (path: Path): string =>
  path.length === 0
    ? 'expression'
    : path.reduce<string>(
        (text, part) =>
          typeof part === 'number' ? `${text}[${part}]` : text ? `${text}.${part}` : part,
        ''
      )

const Icon = ({ path }: { path: string }) => (
  <svg className="fds-toast-icon" viewBox="0 0 16 16" aria-hidden="true">
    <path d={path} />
  </svg>
)

const TICK = 'M3.5 8.5l3 3 6-7'
const CROSS = 'M4 4l8 8M12 4l-8 8'
const DASH = 'M4 8h8'

/**
 * The tree editor's Evaluate buttons answer here: a toast at the foot of the
 * tree pane with the row it ran, and its result or failure, and any
 * fallbacks that caught a failure on the way. One shows at a time, a new
 * evaluation replacing it: the old one goes, and the new one slides in, even
 * when it says the same again. A result leaves after a few seconds (not
 * while the pointer is over it), and a failure stays until it's closed. The
 * region stays in the page, so a screen reader announces what lands in it.
 */
export const EvaluationToast = ({
  toast,
  onClose,
}: {
  toast: ToastState | null
  onClose: () => void
}) => (
  <div className="fds-toast-region" aria-live="polite">
    {toast && <Toast key={toast.id} toast={toast} onClose={onClose} />}
  </div>
)

const Toast = ({ toast, onClose }: { toast: ToastState; onClose: () => void }) => {
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const duration = toast.status === 'finished' ? DURATION[toast.evaluation.status] : null
  useEffect(() => {
    if (duration === null || hovered) return
    const timer = setTimeout(() => onCloseRef.current(), duration)
    return () => clearTimeout(timer)
  }, [toast, duration, hovered])

  return (
    <div
      className={`fds-toast fds-toast--${toastKind(toast)}`}
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {toast.status === 'running' ? (
        <div className="fds-toast-head">
          <span className="fds-toast-spinner" aria-hidden="true" />
          <code className="fds-toast-path">{describePath(toast.path)}</code>
          <span className="fds-toast-status">Running…</span>
        </div>
      ) : (
        <Finished
          evaluation={toast.evaluation}
          copied={copied}
          onCopy={() => {
            navigator.clipboard.writeText(copyText(toast.evaluation.result))
            setCopied(true)
          }}
        />
      )}
      <button className="fds-toast-close" aria-label="Dismiss" onClick={onClose}>
        <Icon path={CROSS} />
      </button>
    </div>
  )
}

const toastKind = (toast: ToastState): string => {
  if (toast.status === 'running') return 'running'
  const { status, fallbacks } = toast.evaluation
  if (status === 'done') return fallbacks.length > 0 ? 'fallback' : 'done'
  return status
}

const Finished = ({
  evaluation: { path, status, result, failure, fallbacks },
  copied,
  onCopy,
}: {
  evaluation: Evaluation
  copied: boolean
  onCopy: () => void
}) => (
  <>
    <div className="fds-toast-head">
      <Icon path={status === 'done' ? TICK : status === 'failed' ? CROSS : DASH} />
      <code className="fds-toast-path">{describePath(path)}</code>
      <span className="fds-toast-status">
        {status === 'done' ? 'Result' : status === 'failed' ? 'Failed' : 'Cancelled'}
      </span>
    </div>
    {status === 'done' && (
      <div className="fds-toast-body">
        <ResultValue value={result} />
      </div>
    )}
    {failure && (
      <pre className="fds-toast-body fds-toast-error">
        <strong>{failure.error.code}</strong> {failure.message}
        {failure.path.join() !== path.join() && <> (at {describePath(failure.path)})</>}
      </pre>
    )}
    {fallbacks.map((fallback) => (
      <div className="fds-toast-note" key={fallback.path.join()}>
        Fallback used at <code>{describePath(fallback.path)}</code>, after{' '}
        <code>{fallback.error.code}</code>
      </div>
    ))}
    {status === 'done' && (
      <button className="fds-toast-copy" onClick={onCopy}>
        {copied ? 'Copied' : 'Copy result'}
      </button>
    )}
  </>
)

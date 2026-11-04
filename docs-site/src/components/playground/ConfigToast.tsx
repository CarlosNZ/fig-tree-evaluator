import { useEffect, useRef, useState } from 'react'

/** What an example or a link changed, with an id each, so a new one slides in. */
export interface ConfigNotice {
  id: number
  source: 'example' | 'link'
  changes: string[]
}

/** How long the toast stays, unless the pointer is over it. */
const DURATION = 8000

/**
 * Says what opening an example, or an "open in editor" link, changed in the
 * Configuration, with a button that opens the panel. Like an evaluation's
 * toast it leaves after a while, not while the pointer is over it, and its
 * region stays in the page so a screen reader announces what lands in it.
 */
export const ConfigToast = ({
  notice,
  onConfigure,
  onClose,
}: {
  notice: ConfigNotice | null
  onConfigure: () => void
  onClose: () => void
}) => (
  <div className="fds-toast-region" aria-live="polite">
    {notice && (
      <Toast key={notice.id} notice={notice} onConfigure={onConfigure} onClose={onClose} />
    )}
  </div>
)

const Toast = ({
  notice,
  onConfigure,
  onClose,
}: {
  notice: ConfigNotice
  onConfigure: () => void
  onClose: () => void
}) => {
  const [hovered, setHovered] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (hovered) return
    const timer = setTimeout(() => onCloseRef.current(), DURATION)
    return () => clearTimeout(timer)
  }, [notice, hovered])

  return (
    <div
      className="fds-toast fds-toast--config"
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="fds-toast-head">
        <svg className="fds-toast-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 4.5h4M9.5 4.5h4M2.5 11.5h6M11.5 11.5h2" />
          <circle cx="8" cy="4.5" r="1.5" />
          <circle cx="10" cy="11.5" r="1.5" />
        </svg>
        <span className="fds-toast-status">This {notice.source} changed your configuration</span>
      </div>
      <ul className="fds-toast-changes">
        {notice.changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
      <button className="fds-toast-copy" onClick={onConfigure}>
        Configuration
      </button>
      <button className="fds-toast-close" aria-label="Dismiss" onClick={onClose}>
        <svg className="fds-toast-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  )
}

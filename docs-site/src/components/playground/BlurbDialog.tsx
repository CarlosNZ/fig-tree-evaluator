import { useEffect, useRef } from 'react'
import type { Blurb } from './PlaygroundPage'

export interface BlurbDialogProps {
  blurb: Blurb
  onClose: () => void
}

/**
 * An example's blurb as a modal dialog, open from when it mounts. It closes
 * by its button, by Escape, or by a click on the backdrop.
 */
export default function BlurbDialog({ blurb, onClose }: BlurbDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  return (
    <dialog
      className="fds-dialog"
      ref={dialog}
      aria-labelledby="fds-blurb-dialog-title"
      onClose={onClose}
      // The dialog's content fills it, so a click on the dialog itself is
      // one on its backdrop
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current.close()
      }}
    >
      <div className="fds-dialog-content">
        <div className="fds-widget-toolbar not-content">
          <h2 id="fds-blurb-dialog-title" className="fds-dialog-title">
            {blurb.title}
          </h2>
          <button className="fds-widget-action" onClick={() => dialog.current?.close()}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
            Close
          </button>
        </div>
        <div className="fds-blurb-body" dangerouslySetInnerHTML={{ __html: blurb.html }} />
      </div>
    </dialog>
  )
}

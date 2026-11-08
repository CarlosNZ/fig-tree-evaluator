import { useEffect, useRef } from 'react'
import type { ConfirmDialogState } from '@json-edit-react/utils'

/**
 * The dialog for a question `useJsonEditorConfirm` asks, such as the fragment
 * editor's before it discards unsaved edits, open while it's asked. A
 * question may name its own buttons, as `confirmLabel` and `cancelLabel`.
 * Escape answers as the cancel button does.
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Discard',
  cancelLabel = 'Cancel',
}: ConfirmDialogState) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (isOpen) dialog.current?.showModal()
    else dialog.current?.close()
  }, [isOpen])

  return (
    <dialog
      className="fds-dialog fds-confirm-dialog not-content"
      ref={dialog}
      aria-labelledby="fds-confirm-dialog-title"
      // Escape answers through onCancel, whose answer closes the dialog
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <div className="fds-dialog-content">
        <div className="fds-widget-toolbar">
          <h2 id="fds-confirm-dialog-title" className="fds-dialog-title">
            {title}
          </h2>
        </div>
        {message && <p className="fds-confirm-message">{message}</p>}
        <div className="fds-config-footer">
          <button className="fds-widget-action" onClick={onCancel}>
            {String(cancelLabel)}
          </button>
          <button className="fds-widget-action fds-widget-action--primary" onClick={onConfirm}>
            {String(confirmLabel)}
          </button>
        </div>
      </div>
    </dialog>
  )
}

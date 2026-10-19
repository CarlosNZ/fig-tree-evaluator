import { useEffect, useRef, useState } from 'react'
import Playground from './Playground'

interface Props {
  /** The example's title. */
  title?: string
  /** The expression and its data, as JSON5 source. */
  expression: string
  data?: string
  /** What to do or notice in the editor, at the foot of the overlay. */
  caption?: string
}

/**
 * The island inside each static example that can open in an editor: an
 * expression block (Expression.astro) or a tree (ExpressionTree.astro). The
 * example sits in an `.fds-editable` container with an `.fds-editor-link`.
 * The island renders nothing until the link is clicked, then opens the
 * editor as a full-size overlay over the page; closing it leaves the example
 * as it was, with focus back on the link. The overlay has room for more of
 * the tree than a page's widget, so one more level starts open.
 *
 * The link keeps its address, so a click that means something else (a new
 * tab, a copied link) still follows it, into the Playground page. While the
 * editor's code loads, the link shows that it's on its way.
 */
/** The editor's own default is 2. */
const OVERLAY_COLLAPSE = 3

export default function ExpressionEditor({ title, expression, data, caption }: Props) {
  const anchor = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const block = () => anchor.current!.closest<HTMLElement>('.fds-editable')!
  const link = () => block().querySelector<HTMLAnchorElement>('.fds-editor-link')!
  const loading = (on: boolean) => block().classList.toggle('fds-editable--loading', on)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return
      event.preventDefault()
      loading(true)
      setOpen(true)
    }
    const target = link()
    target.addEventListener('click', onClick)
    return () => target.removeEventListener('click', onClick)
  }, [])

  const close = () => {
    setOpen(false)
    // Back where the reader started: on the link that opened it
    requestAnimationFrame(() => link().focus({ preventScroll: true }))
  }

  return (
    <div ref={anchor}>
      {open && (
        <Playground
          overlayOnly
          title={title}
          expression={expression}
          data={data}
          caption={caption}
          collapse={OVERLAY_COLLAPSE}
          onOpen={() => loading(false)}
          onClose={close}
        />
      )}
    </div>
  )
}

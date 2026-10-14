import { useEffect, useRef, useState } from 'react'
import Playground from './Playground'

interface Props {
  /** The example's title, shown above the widget. */
  title?: string
  /** The expression and its data, as JSON5 source. */
  expression: string
  data?: string
  /** The label of the widget's button that turns it back. */
  closeLabel?: string
}

/**
 * The island inside each static example that can open in an editor: an
 * expression block (Expression.astro) or a tree (ExpressionTree.astro). The
 * example sits in a `.fds-swap` container, its static view marked
 * `.fds-swap-static` and its link `.fds-swap-open`. The island renders
 * nothing until the link is clicked, then turns the example into a widget
 * where it stands, and the widget's close button turns it back. Nothing
 * scrolls, and no other widget changes.
 *
 * The link keeps its address, so a click that means something else (a new
 * tab, a copied link) still follows it, into the Playground page. While the
 * widget's code loads, its placeholder takes the static view's height, so the
 * page below doesn't jump twice.
 */
export default function ExpressionEditor({ title, expression, data, closeLabel }: Props) {
  const anchor = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<{ height: number } | null>(null)

  const block = () => anchor.current!.closest<HTMLElement>('.fds-swap')!
  const link = () => block().querySelector<HTMLAnchorElement>('.fds-swap-open')!

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return
      event.preventDefault()
      const figure = block().querySelector<HTMLElement>('.fds-swap-static')!
      setOpen({ height: figure.offsetHeight })
    }
    const target = link()
    target.addEventListener('click', onClick)
    return () => target.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    block().classList.toggle('fds-swap--editing', open !== null)
  }, [open])

  const close = () => {
    setOpen(null)
    // Back where the reader started: on the link that opened it
    requestAnimationFrame(() => link().focus({ preventScroll: true }))
  }

  return (
    <div ref={anchor}>
      {open && (
        <Playground
          title={title}
          expression={expression}
          data={data}
          placeholderHeight={open.height}
          onClose={close}
          closeLabel={closeLabel}
        />
      )}
    </div>
  )
}

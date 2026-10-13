import { useEffect, useRef, useState } from 'react'
import Playground from './Playground'

interface Props {
  /** The example's title, shown in the widget's toolbar. */
  title: string
  /** The expression and its data, as JSON5 source. */
  expression: string
  data?: string
}

/**
 * The island inside each static expression block (Expression.astro). It
 * renders nothing until the block's "Open in editor" link is clicked, then
 * turns the block into a widget where it stands, with the example in it, and
 * "Close editor" turns it back. Nothing scrolls, and no other widget changes.
 *
 * The link keeps its address, so a click that means something else (a new
 * tab, a copied link) still follows it, into the page's main widget. While the
 * widget's code loads, its placeholder takes the static block's height, so
 * the page below doesn't jump twice.
 */
export default function ExpressionEditor({ title, expression, data }: Props) {
  const anchor = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<{ height: number } | null>(null)

  const block = () => anchor.current!.closest<HTMLElement>('.fds-expression-block')!
  const link = () => block().querySelector<HTMLAnchorElement>('.fds-expression-open')!

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return
      event.preventDefault()
      const figure = block().querySelector<HTMLElement>('.fds-expression')!
      setOpen({ height: figure.offsetHeight })
    }
    const target = link()
    target.addEventListener('click', onClick)
    return () => target.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    block().classList.toggle('fds-expression-block--editing', open !== null)
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
        />
      )}
    </div>
  )
}

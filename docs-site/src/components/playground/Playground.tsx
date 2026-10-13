import { Suspense, lazy, useEffect, useState } from 'react'
import { dedent } from '../../lib/dedent'

/**
 * The island an MDX page mounts, with `client:visible`. It renders only a
 * placeholder on the server and on first hydration, then loads the widget —
 * CodeMirror and the FigTree editor — as a separate chunk, so a page pays
 * for them only once a reader scrolls to a widget.
 */
const PlaygroundWidget = lazy(() => import('./PlaygroundWidget'))

export interface PlaygroundProps {
  /** The element id, which "open in editor" links target. */
  id?: string
  /** A title above the widget, for one standing in for an example. */
  title?: string
  /** The starting expression, as JSON5 source. */
  expression: string
  /** The starting evaluation data, as JSON5 source. */
  data?: string
  /** Load an example from the page URL, if one is there, in place of the above. */
  readFromUrl?: boolean
  /** The placeholder's height while the widget loads, where it's known. */
  placeholderHeight?: number
  /** Given, the toolbar has "Close editor", which calls it. */
  onClose?: () => void
}

const Placeholder = ({ height }: { height?: number }) => (
  <div className="fds-playground-placeholder" style={height ? { minHeight: height } : undefined}>
    Loading editor…
  </div>
)

export default function Playground(props: PlaygroundProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="fds-playground not-content" id={props.id}>
      {props.title && <div className="fds-playground-title">{props.title}</div>}
      {mounted ? (
        <Suspense fallback={<Placeholder height={props.placeholderHeight} />}>
          <PlaygroundWidget
            {...props}
            expression={dedent(props.expression)}
            data={props.data === undefined ? undefined : dedent(props.data)}
          />
        </Suspense>
      ) : (
        <Placeholder height={props.placeholderHeight} />
      )}
    </div>
  )
}

import { Suspense, lazy, useEffect, useState } from 'react'
import { dedent } from '../../lib/dedent'

/**
 * The island an MDX page mounts, with `client:visible`. It renders only a
 * placeholder on the server and on first hydration, then loads the widget —
 * CodeMirror and the FigTree editor — as a separate chunk, so a page pays
 * for them only once a reader scrolls to a widget.
 *
 * With `overlayOnly` it is the editor a static example opens
 * (ExpressionEditor.tsx): no placeholder and no inline widget, just the
 * full-size overlay, opened as soon as the widget loads.
 */
const PlaygroundWidget = lazy(() => import('./PlaygroundWidget'))

export interface PlaygroundProps {
  /** The element id, which "open in editor" links target. */
  id?: string
  /** The title at the left of the widget's toolbar; "Playground" if not given. */
  title?: string
  /** The starting expression, as JSON5 source. */
  expression: string
  /** The starting evaluation data, as JSON5 source. */
  data?: string
  /** Evaluate with the Fragments page's fragments registered (lib/fragments.ts). */
  fragments?: boolean
  /**
   * How many levels of the tree start open; deeper ones start collapsed.
   * The editor's own default if not given.
   */
  collapse?: number
  /** Load an example from the page URL, if one is there, in place of the above. */
  readFromUrl?: boolean
  /**
   * A sentence or two at the foot of the overlay: what to do or notice in
   * the editor. Inline Markdown: `code`, **strong**, *emphasis*, [links](url).
   */
  caption?: string
  /** Show only the overlay, open from the start, in place of the widget. */
  overlayOnly?: boolean
  /** Called once the overlay is open. */
  onOpen?: () => void
  /** Called when the overlay closes, in `overlayOnly` mode. */
  onClose?: () => void
}

const Placeholder = () => <div className="fds-playground-placeholder">Loading editor…</div>

export default function Playground(props: PlaygroundProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const widget = (
    <PlaygroundWidget
      {...props}
      expression={dedent(props.expression)}
      data={props.data === undefined ? undefined : dedent(props.data)}
    />
  )

  // The link that opened it shows that it's loading
  if (props.overlayOnly) return mounted && <Suspense fallback={null}>{widget}</Suspense>

  return (
    <div className="fds-playground not-content" id={props.id}>
      {mounted ? <Suspense fallback={<Placeholder />}>{widget}</Suspense> : <Placeholder />}
    </div>
  )
}

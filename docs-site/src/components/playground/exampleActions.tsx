import type { ReactNode } from 'react'
import type { FigTree } from 'fig-tree-evaluator'

/**
 * An extra button an example can put in its widget's toolbar, beside Reset.
 * An example names one (`action="clearCache"`) rather than passing it, since
 * an island's props have to be serialisable, so each action lives here.
 */
interface ExampleAction {
  label: string
  /** What the button says for a moment after it's pressed. */
  doneLabel: string
  /** An SVG path, drawn on the same 16×16 grid as the toolbar's other icons. */
  icon: ReactNode
  run: (figTree: FigTree) => void
}

export const exampleActions = {
  clearCache: {
    label: 'Clear cache',
    doneLabel: 'Cache cleared',
    icon: <path d="M2.5 4.5h11M6.5 4.5V2.5h3v2M4 4.5l.75 9h6.5l.75-9" />,
    run: (figTree) => figTree.clearCache(),
  },
} satisfies Record<string, ExampleAction>

export type ExampleActionName = keyof typeof exampleActions

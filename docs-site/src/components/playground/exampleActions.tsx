import type { ReactNode } from 'react'
import type { FigTree } from 'fig-tree-evaluator'

/**
 * An extra button an example can put in its widget's toolbar, beside Reset.
 * An example names one (`action="clearCache"`) rather than passing it, since
 * an island's props have to be serialisable, so each action lives here.
 *
 * There are two kinds. One does something once, and says so for a moment
 * after it's pressed. The other switches a view of the widget on and off,
 * and says which way it's set.
 */
interface CommonAction {
  label: string
  /** An SVG path, drawn on the same 16×16 grid as the toolbar's other icons. */
  icon: ReactNode
}

export interface RunAction extends CommonAction {
  /** What the button says for a moment after it's pressed. */
  doneLabel: string
  run: (figTree: FigTree) => void
}

export interface ViewAction extends CommonAction {
  /** What the button says while its view is on. */
  activeLabel: string
  /**
   * What it shows in the tree's place: the evaluation's trace, or the
   * expression's fallbackCoverage() report.
   */
  view: 'trace' | 'coverage'
}

export type ExampleAction = RunAction | ViewAction

export const exampleActions = {
  clearCache: {
    label: 'Clear cache',
    doneLabel: 'Cache cleared',
    icon: <path d="M2.5 4.5h11M6.5 4.5V2.5h3v2M4 4.5l.75 9h6.5l.75-9" />,
    run: (figTree) => figTree.clearCache(),
  },
  showTrace: {
    label: 'Show trace',
    activeLabel: 'Hide trace',
    icon: <path d="M2.5 3h3M2.5 3v10M2.5 8h3.5M2.5 13h3.5M8 3h5.5M8.5 8h5M8.5 13h5" />,
    view: 'trace',
  },
  showCoverage: {
    label: 'Show coverage',
    activeLabel: 'Hide coverage',
    icon: (
      <path d="M8 1.5l5.5 2v4c0 3.5-2.4 6-5.5 7-3.1-1-5.5-3.5-5.5-7v-4zM5.5 8l1.75 1.75L10.5 6.5" />
    ),
    view: 'coverage',
  },
} satisfies Record<string, ExampleAction>

export type ExampleActionName = keyof typeof exampleActions

/** The action an example names, as either kind. */
export const exampleAction = (name: ExampleActionName): ExampleAction => exampleActions[name]

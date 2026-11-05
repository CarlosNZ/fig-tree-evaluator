import { useEffect, useMemo, useRef, useState } from 'react'
import type { JsonData } from 'json-edit-react'
import { useJsonEditorConfirm } from '@json-edit-react/utils'
import { Select, useFragmentEditor, type FragmentDraft } from 'fig-tree-editor-react'
import { parseJson5 } from '../../lib/json5'
import { readPlaygroundSeed, type PlaygroundSeed } from '../../lib/playgroundLink'
import { examples } from '../../playground/examples'
import { operatorListings } from '../../playground/operators'
import BlurbDialog from './BlurbDialog'
import ConfigDialog from './ConfigDialog'
import ConfirmDialog from './ConfirmDialog'
import { ConfigToast, type ConfigNotice } from './ConfigToast'
import PlaygroundEditors, {
  type PlaygroundEditorsHandle,
  type WriteOptions,
} from './PlaygroundEditors'
import {
  discardWork,
  editedExamples,
  keepWork,
  sameWork,
  savedWork,
  type Work,
} from './playgroundWork'
import {
  applyConfig,
  applySetup,
  initialConfig,
  isOn,
  playgroundFigTree,
  recordFragments,
  seedSetup,
  setSwitch,
  type PlaygroundConfig,
  type PlaygroundSetup,
} from './playgroundSetup'

/** An example's blurb, rendered at build time (PlaygroundPage.astro). */
export interface Blurb {
  title: string
  html: string
}

export interface PlaygroundPageProps {
  /** By example id. */
  blurbs: Record<string, Blurb>
  /** What a reader's first visit opens with, above the example's blurb. */
  welcome: Blurb
}

/** The query parameter naming an example, so a picked example can be linked to. */
const PARAM = 'example'
/** Where the reader's last pick is remembered. */
const STORAGE_KEY = 'fds-playground-example'
/** Where the examples whose blurbs the reader has seen are remembered. */
const VISITED_KEY = 'fds-playground-visited'

const remembered = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const remember = (id: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Nothing remembered, then
  }
}

const visited = (): Record<string, true> => {
  try {
    return JSON.parse(localStorage.getItem(VISITED_KEY) ?? '{}')
  } catch {
    return {}
  }
}

const markVisited = (id: string) => {
  try {
    localStorage.setItem(VISITED_KEY, JSON.stringify({ ...visited(), [id]: true }))
  } catch {
    // Its blurb opens again next time, then
  }
}

/** Where it's remembered that the reader has had the welcome. */
const WELCOMED_KEY = 'fds-playground-welcomed'

const welcomed = (): boolean => {
  try {
    return localStorage.getItem(WELCOMED_KEY) !== null
  } catch {
    return false
  }
}

const markWelcomed = () => {
  try {
    localStorage.setItem(WELCOMED_KEY, 'true')
  } catch {
    // It welcomes the reader again next time, then
  }
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The welcome, with the example's blurb after it, under the blurb's own title. */
const withWelcome = (welcome: Blurb, blurb: Blurb | undefined): Blurb => ({
  title: welcome.title,
  html: blurb
    ? `${welcome.html}<h2 class="fds-blurb-example-title">${escapeHtml(blurb.title)}</h2>${blurb.html}`
    : welcome.html,
})

/** Where the fragment editor's draft is kept, unsaved edits and all. */
const DRAFT_KEY = 'fds-playground-fragment-draft'

const keptDraft = (): FragmentDraft | undefined => {
  try {
    const text = localStorage.getItem(DRAFT_KEY)
    return text === null ? undefined : JSON.parse(text)
  } catch {
    return undefined
  }
}

const keepDraft = (draft: FragmentDraft) => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Kept until the page closes, then
  }
}

/** Plain data, so its serialisation is enough to compare it. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The picker's entry for an expression from an "open in editor" link, and
 * its key among the edited ones. Not an example id, which is a slug.
 */
const SEED = '~seed'

const isExample = (id: string | null): id is string =>
  id !== null && examples.some((example) => example.id === id)

/**
 * What an "open in editor" link carries, ready for the editors. Comments in
 * its JSON5 are lost, since the trees can't hold them, and so is its
 * example's extra button, which the editors have no place for.
 */
const fromSeed = (seed: PlaygroundSeed) => {
  const expression = parseJson5(seed.expression)
  const data = parseJson5(seed.data ?? '{}')
  return {
    expression: expression.ok ? expression.value : null,
    data: data.ok ? (data.value as JsonData) : {},
  }
}

/**
 * What the page opens with: an expression an "open in editor" link carries,
 * else the example the URL names, else the reader's last pick, else the
 * first example.
 */
const initialSelection = (): string | null => {
  const search = window.location.search
  if (readPlaygroundSeed(search)) return null
  const named = new URLSearchParams(search).get(PARAM)
  if (isExample(named)) return named
  const last = remembered()
  return isExample(last) ? last : examples[0].id
}

let notices = 0

/**
 * Merges what an example or a link needs into the configuration, with the
 * toast saying what that changed, or none if nothing did.
 */
const openSetup = (setup: PlaygroundSetup, source: ConfigNotice['source']) => {
  const { config, changes } = applySetup(setup)
  const notice: ConfigNotice | null = changes.length > 0 ? { id: ++notices, source, changes } : null
  return { config, notice }
}

interface Opening {
  selected: string | null
  seed: PlaygroundSeed | null
  /** The URL's query that carried the seed, to name it again on going back to it. */
  seedSearch: string
  config: PlaygroundConfig
  notice: ConfigNotice | null
}

let opening: Opening | undefined

/**
 * What the page opens with: the example or link it shows (initialSelection),
 * and the configuration kept from last time, with what that example or link
 * needs merged in. Worked out once, however often React asks, so the merge
 * and its toast happen once.
 */
const open = (): Opening => {
  if (opening) return opening
  const seed = readPlaygroundSeed(window.location.search)
  const selected = initialSelection()
  const example = examples.find(({ id }) => id === selected)
  let config = initialConfig()
  let notice: ConfigNotice | null = null
  if (example) ({ config, notice } = openSetup(example, 'example'))
  else if (seed) ({ config, notice } = openSetup(seedSetup(seed), 'link'))
  if (selected !== null) remember(selected)
  opening = { selected, seed, seedSearch: window.location.search, config, notice }
  return opening
}

/**
 * The Playground page: the data and expression editors, which evaluate with
 * the Playground's own instance (playgroundSetup.ts), and a bar fixed to the
 * foot of the window with the example picker, the version, and buttons for
 * the picked example's blurb, fragment mode, the trace and the Configuration
 * panel. A blurb opens as a dialog the first time the reader opens its
 * example, and again from Info. The reader's first visit opens with a welcome
 * in its place, the blurb following it, unless they came by an "open in
 * editor" link. Picking an example remounts the editors with its expression
 * and data. An expression from an "open in editor" link has an entry of its
 * own at the top of the picker, so the reader can go back to it.
 *
 * The reader's edits to an example are kept, one set per example, and come
 * back when it's opened again, and the picker marks the examples that have
 * them. While what the editors show differs from the example as written,
 * Reset puts it back. Edits to an expression from a link are kept only until
 * the page closes, since the link still carries it.
 *
 * Opening an example, or a link, merges the options and fragments it needs
 * into the configuration, and a toast says what that changed, if anything.
 *
 * The bar's Trace adds the trace of the last Evaluate to the left pane's
 * views, and shows it. An example, or a link from a docs page's example that
 * shows its trace, can turn it on for itself, which only adds the view; the
 * reader turning it on turns it on for every one. The coverage badge, which
 * the Configuration panel turns on, works the same way.
 *
 * The bar's Fragments switches the editors to fragment mode, which edits a
 * fragment's body and declarations. It starts a new fragment from the
 * expression, unless the draft has unsaved edits, which are kept, as the
 * draft is, from one visit to the next. Leaving fragment mode with unsaved
 * edits, or picking an example while in it, asks whether to discard them.
 *
 * Mounted `client:only`, since what it shows depends on the URL and on what
 * the reader last picked.
 */
export default function PlaygroundPage({ blurbs, welcome }: PlaygroundPageProps) {
  const unseen = (id: string | null): boolean => id !== null && !!blurbs[id] && !visited()[id]

  const [selected, setSelected] = useState(() => open().selected)
  const [seeded] = useState(() => {
    const { seed } = open()
    return seed && fromSeed(seed)
  })
  const example = examples.find(({ id }) => id === selected)
  // Not for a reader who came to try an expression from a docs page
  const [showWelcome, setShowWelcome] = useState(() => open().selected !== null && !welcomed())
  const [showBlurb, setShowBlurb] = useState(() => !showWelcome && unseen(open().selected))
  const [config, setConfig] = useState(() => open().config)
  const [showConfig, setShowConfig] = useState(false)
  const [notice, setNotice] = useState(() => open().notice)
  const editors = useRef<PlaygroundEditorsHandle>(null)
  // What the editors show: an example, by its id, or the link's expression
  const current = example?.id ?? SEED
  // The examples the reader has edits to, and the link's expression if they
  // have edits to that
  const [edited, setEdited] = useState(() => new Set(editedExamples()))
  const markEdited = (key: string, isEdited: boolean) =>
    setEdited((previous) => {
      const next = new Set(previous)
      if (isEdited) next.add(key)
      else next.delete(key)
      return next
    })
  // The reader's edits to the link's expression, for this page only
  const seedWork = useRef<Work | null>(null)
  // Each Reset remounts the editors, with the example as written
  const [resets, setResets] = useState(0)

  const [fragmentMode, setFragmentMode] = useState(false)
  const { confirm, dialog: confirmDialog } = useJsonEditorConfirm()
  const [initialDraft] = useState(keptDraft)
  // It holds the fragments too, and registers on the instance what it saves,
  // which the configuration takes in. Every other change of the fragments
  // reaches it through adopt().
  const fragmentEditor = useFragmentEditor({
    figTree: playgroundFigTree,
    initialFragments: config.fragments,
    initialDraft,
    onFragmentsChange: (fragments) => {
      const next = recordFragments(fragments)
      setConfig(next)
      editors.current?.refreshCoverage({ options: next.options.coverage })
      editors.current?.outdateTrace()
    },
    confirmDiscard: () =>
      confirm({
        title: 'Discard changes?',
        message: "This fragment has changes that haven't been saved.",
      }),
  })
  useEffect(() => keepDraft(fragmentEditor.draft), [fragmentEditor.draft])
  // The hook as last rendered, for a handler that reads it after waiting for
  // an answer
  const latestFragmentEditor = useRef(fragmentEditor)
  latestFragmentEditor.current = fragmentEditor

  // A configuration now on the instance, with the fragment editor told if its
  // fragments changed
  const adopt = (next: PlaygroundConfig) => {
    setConfig(next)
    if (!same(next.fragments, fragmentEditor.fragments)) fragmentEditor.setFragments(next.fragments)
  }

  const enterFragmentMode = () => {
    fragmentEditor.startFromExpression(editors.current?.work().expression ?? null)
    setFragmentMode(true)
  }

  // Unsaved edits are discarded, or kept for the next visit. The discard is
  // the hook's as rendered since the question, which a change of the
  // fragments may have changed.
  const leaveFragmentMode = async () => {
    if (
      fragmentEditor.hasUnsavedEdits &&
      (await confirm({
        title: 'Discard changes?',
        message: "This fragment has changes that haven't been saved. Discard them?",
        confirmLabel: 'Discard',
        cancelLabel: 'Keep them',
      }))
    )
      latestFragmentEditor.current.discard()
    setFragmentMode(false)
  }

  // What the editors start from: the reader's edits, else the example
  const original: Work | null = example
    ? { expression: example.expression, data: example.data ?? {} }
    : seeded
  const start = useMemo(
    () => (example ? savedWork(example.id) : seedWork.current) ?? original,
    [current, resets]
  )

  // The example as written, as the editor fills it in once it's mounted;
  // what the reader's edits are compared with
  const baseline = useRef<Work | null>(null)
  const changeWork = (work: Work, { autoUpdate }: WriteOptions) => {
    if (autoUpdate && !edited.has(current)) {
      baseline.current = work
      return
    }
    const base = (baseline.current ??= original!)
    const differs = !sameWork(work, base)
    if (!example) seedWork.current = differs ? work : null
    else if (differs) keepWork(example.id, work, base)
    else discardWork(example.id)
    markEdited(current, differs)
  }

  const reset = () => {
    if (example) discardWork(example.id)
    else seedWork.current = null
    baseline.current = null
    markEdited(current, false)
    setResets((count) => count + 1)
  }

  // Back to the link's expression: its query in the URL again, and what it
  // needs merged into the configuration again
  const pickSeed = () => {
    const url = new URL(window.location.href)
    url.search = open().seedSearch
    url.hash = ''
    window.history.replaceState(null, '', url)
    const opened = openSetup(seedSetup(open().seed!), 'link')
    adopt(opened.config)
    setNotice(opened.notice)
    setShowBlurb(false)
    baseline.current = null
    setSelected(null)
  }

  // The example's configuration is in place before its editors mount, so
  // they work out its coverage under it
  const pick = async (id: string) => {
    if (fragmentMode) await leaveFragmentMode()
    if (id === SEED) return pickSeed()
    // The URL names the example in place of whatever it held
    const url = new URL(window.location.href)
    url.search = new URLSearchParams({ [PARAM]: id }).toString()
    url.hash = ''
    window.history.replaceState(null, '', url)
    const opened = openSetup(
      examples.find((example) => example.id === id)!,
      'example'
    )
    adopt(opened.config)
    // The last example's notice, if still up, goes, since it's about that one
    setNotice(opened.notice)
    remember(id)
    setShowBlurb(unseen(id))
    baseline.current = null
    setSelected(id)
  }

  // The instance changes in place, which the editors can't see, so their
  // coverage is worked out again here. A change of the fragments, Reset
  // Fragments' included, can take away the fragment being edited, so it ends
  // fragment mode. A draft of a fragment it removed, with no edits to keep,
  // starts afresh from the expression, as entering fragment mode does: after
  // adopt(), so it replaces the draft the hook keeps of a removed fragment,
  // unregistered under its old name. One with edits is asked about, as
  // leaving always asks.
  const save = (next: PlaygroundConfig) => {
    applyConfig(next)
    const { draft, hasUnsavedEdits } = fragmentEditor
    const removed = draft.registered && draft.name !== undefined && !(draft.name in next.fragments)
    adopt(next)
    editors.current?.refreshCoverage({ options: next.options.coverage })
    editors.current?.outdateTrace()
    if (removed && !hasUnsavedEdits)
      fragmentEditor.startFromExpression(editors.current?.work().expression ?? null)
    if (fragmentMode && !same(next.fragments, config.fragments)) void leaveFragmentMode()
  }

  const blurb = example && blurbs[example.id]

  // The room the page leaves below the editors, and where the toasts sit,
  // follow the bar's height, which is however many rows its buttons wrap
  // onto (custom.css)
  const footer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = document.documentElement
    const observer = new ResizeObserver(([entry]) =>
      root.style.setProperty(
        '--fds-playground-footer-height',
        `${entry.borderBoxSize[0].blockSize}px`
      )
    )
    observer.observe(footer.current!)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--fds-playground-footer-height')
    }
  }, [])

  // An edited one is marked in the list by its hint, and in the closed box
  // by the picker's `data-edited` (custom.css)
  const option = (label: string, value: string) => ({
    label,
    value,
    ...(edited.has(value) && { hint: 'edited' }),
  })
  const pickerOptions = [
    ...(seeded ? [option('From a docs page', SEED)] : []),
    ...examples.map(({ id, name }) => option(name, id)),
  ]

  const configToast = (
    <ConfigToast
      notice={notice}
      onConfigure={() => {
        setNotice(null)
        setShowConfig(true)
      }}
      onClose={() => setNotice(null)}
    />
  )

  return (
    <div className="fds-playground-page">
      {showWelcome && (
        <BlurbDialog
          blurb={withWelcome(welcome, blurb)}
          onClose={() => {
            markWelcomed()
            if (example) markVisited(example.id)
            setShowWelcome(false)
          }}
        />
      )}

      {blurb && showBlurb && (
        <BlurbDialog
          key={`blurb-${example.id}`}
          blurb={blurb}
          onClose={() => {
            markVisited(example.id)
            setShowBlurb(false)
          }}
        />
      )}

      {showConfig && (
        <ConfigDialog config={config} onSave={save} onClose={() => setShowConfig(false)} />
      )}

      {start && (
        <PlaygroundEditors
          key={`${example?.id ?? 'seed'}:${resets}`}
          id="playground"
          {...start}
          collapse={example?.collapse}
          dataCollapse={example?.dataCollapse}
          preview={example?.preview}
          figTree={playgroundFigTree}
          operatorListings={operatorListings}
          notice={configToast}
          coverageOptions={config.options.coverage}
          handle={editors}
          onChange={changeWork}
          fragmentMode={
            fragmentMode ? { editor: fragmentEditor, onLeave: leaveFragmentMode } : undefined
          }
          trace={isOn(config.switches.trace)}
          coverage={isOn(config.switches.coverage)}
        />
      )}

      <ConfirmDialog {...confirmDialog} />

      <div className="fds-playground-footer not-content" ref={footer}>
        <div className="fds-playground-footer-start">
          {/*
            The editor's select, not a native one: a browser places a native
            select's list where it likes, and at the foot of the screen that
            can be far from the box. This one opens upward (custom.css).
          */}
          <div className="fds-picker" data-edited={edited.has(current) || undefined}>
            <span className="fds-picker-label">Example</span>
            <Select
              className="fds-example-select"
              options={pickerOptions}
              selected={current}
              highlighted={current}
              setSelected={({ value }) => void pick(value)}
              placeholder="From a docs page"
            />
          </div>
          <button
            className="fds-widget-action fds-widget-action--accent"
            title="Info"
            disabled={!blurb}
            onClick={() => setShowBlurb(true)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M8 7.5v3.5M8 5h.01" />
            </svg>
            <span className="fds-action-label">Info</span>
          </button>
          {edited.has(current) && (
            <button
              className="fds-widget-action fds-widget-action--accent"
              title="Reset example"
              onClick={reset}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 3.5v3.5h3.5M3.4 7A5 5 0 1 1 4.5 11.5" />
              </svg>
              <span className="fds-action-label">Reset example</span>
            </button>
          )}
        </div>
        <div className="fds-playground-footer-end">
          <span className="fds-playground-version">
            fig-tree-evaluator v{playgroundFigTree.version}
          </span>
          <button
            className="fds-widget-action fds-widget-action--accent"
            title="Fragments"
            aria-pressed={fragmentMode}
            onClick={() => (fragmentMode ? void leaveFragmentMode() : enterFragmentMode())}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 2.5c-1.4 0-2 .6-2 2v1.6c0 .9-.5 1.6-1.5 1.9 1 .3 1.5 1 1.5 1.9v1.6c0 1.4.6 2 2 2M10 2.5c1.4 0 2 .6 2 2v1.6c0 .9.5 1.6 1.5 1.9-1 .3-1.5 1-1.5 1.9v1.6c0 1.4-.6 2-2 2" />
            </svg>
            <span className="fds-action-label">Fragments</span>
          </button>
          <button
            className="fds-widget-action fds-widget-action--accent"
            title={
              config.switches.trace.pinned || !config.switches.trace.fromExample
                ? 'Trace'
                : 'Trace: on for this example'
            }
            aria-pressed={isOn(config.switches.trace)}
            onClick={() => setConfig(setSwitch('trace', !isOn(config.switches.trace)))}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 3.5h10M5.5 8H13M8 12.5h5M3 3.5v9h2.5M3 8h2.5" />
            </svg>
            <span className="fds-action-label">Trace</span>
          </button>
          <button
            className="fds-widget-action fds-widget-action--primary"
            title="Configuration"
            onClick={() => setShowConfig(true)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 4.5h4M9.5 4.5h4M2.5 11.5h6M11.5 11.5h2" />
              <circle cx="8" cy="4.5" r="1.5" />
              <circle cx="10" cy="11.5" r="1.5" />
            </svg>
            <span className="fds-action-label">Configuration</span>
          </button>
        </div>
      </div>
    </div>
  )
}

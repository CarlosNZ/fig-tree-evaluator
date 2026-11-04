import { useRef, useState } from 'react'
import type { JsonData } from 'json-edit-react'
import { Select } from 'fig-tree-editor-react'
import { parseJson5 } from '../../lib/json5'
import { readPlaygroundSeed, type PlaygroundSeed } from '../../lib/playgroundLink'
import { examples } from '../../playground/examples'
import { operatorListings } from '../../playground/operators'
import BlurbDialog from './BlurbDialog'
import ConfigDialog from './ConfigDialog'
import { ConfigToast, type ConfigNotice } from './ConfigToast'
import PlaygroundEditors, { type PlaygroundEditorsHandle } from './PlaygroundEditors'
import {
  applyConfig,
  applySetup,
  initialConfig,
  playgroundFigTree,
  seedSetup,
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

const exampleOptions = examples.map(({ id, name }) => ({ label: name, value: id }))

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
  opening = { selected, seed, config, notice }
  return opening
}

/**
 * The Playground page: the data and expression editors, which evaluate with
 * the Playground's own instance (playgroundSetup.ts), and a bar fixed to the
 * foot of the window with the example picker, the version, and buttons for
 * the picked example's blurb and the Configuration panel. A blurb opens as a
 * dialog the first time the reader opens its example, and again from Info.
 * Picking an example remounts the editors with its expression and data. An
 * expression from an "open in editor" link has no example picked until the
 * reader picks one.
 *
 * Opening an example, or a link, merges the options and fragments it needs
 * into the configuration, and a toast says what that changed, if anything.
 *
 * Mounted `client:only`, since what it shows depends on the URL and on what
 * the reader last picked.
 */
export default function PlaygroundPage({ blurbs }: PlaygroundPageProps) {
  const unseen = (id: string | null): boolean => id !== null && !!blurbs[id] && !visited()[id]

  const [selected, setSelected] = useState(() => open().selected)
  const [seeded] = useState(() => {
    const { seed } = open()
    return seed && fromSeed(seed)
  })
  const example = examples.find(({ id }) => id === selected)
  const [showBlurb, setShowBlurb] = useState(() => unseen(open().selected))
  const [config, setConfig] = useState(() => open().config)
  const [showConfig, setShowConfig] = useState(false)
  const [notice, setNotice] = useState(() => open().notice)
  const editors = useRef<PlaygroundEditorsHandle>(null)

  // The example's configuration is in place before its editors mount, so
  // they work out its coverage under it
  const pick = (id: string) => {
    // The URL names the example in place of whatever it held
    const url = new URL(window.location.href)
    url.search = new URLSearchParams({ [PARAM]: id }).toString()
    url.hash = ''
    window.history.replaceState(null, '', url)
    const opened = openSetup(
      examples.find((example) => example.id === id)!,
      'example'
    )
    setConfig(opened.config)
    if (opened.notice) setNotice(opened.notice)
    remember(id)
    setShowBlurb(unseen(id))
    setSelected(id)
  }

  // The instance changes in place, which the editors can't see, so their
  // coverage is worked out again here
  const save = (next: PlaygroundConfig) => {
    applyConfig(next)
    setConfig(next)
    editors.current?.refreshCoverage({ options: next.options.coverage })
  }

  const blurb = example && blurbs[example.id]

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

      {example ? (
        <PlaygroundEditors
          key={example.id}
          id="playground"
          expression={example.expression}
          data={example.data ?? {}}
          collapse={example.collapse}
          figTree={playgroundFigTree}
          operatorListings={operatorListings}
          notice={configToast}
          coverageOptions={config.options.coverage}
          handle={editors}
        />
      ) : (
        seeded && (
          <PlaygroundEditors
            key="seed"
            id="playground"
            {...seeded}
            figTree={playgroundFigTree}
            operatorListings={operatorListings}
            notice={configToast}
            coverageOptions={config.options.coverage}
            handle={editors}
          />
        )
      )}

      <div className="fds-playground-footer not-content">
        <div className="fds-playground-footer-start">
          {/*
            The editor's select, not a native one: a browser places a native
            select's list where it likes, and at the foot of the screen that
            can be far from the box. This one opens upward (custom.css).
          */}
          <div className="fds-picker">
            <span className="fds-picker-label">Example</span>
            <Select
              className="fds-example-select"
              options={exampleOptions}
              selected={selected}
              highlighted={selected}
              setSelected={({ value }) => pick(value)}
              placeholder="From a docs page"
            />
          </div>
          <button
            className="fds-widget-action fds-widget-action--accent"
            disabled={!blurb}
            onClick={() => setShowBlurb(true)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M8 7.5v3.5M8 5h.01" />
            </svg>
            Info
          </button>
        </div>
        <div className="fds-playground-footer-end">
          <span className="fds-playground-version">
            fig-tree-evaluator v{playgroundFigTree.version}
          </span>
          <button
            className="fds-widget-action fds-widget-action--primary"
            onClick={() => setShowConfig(true)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 4.5h4M9.5 4.5h4M2.5 11.5h6M11.5 11.5h2" />
              <circle cx="8" cy="4.5" r="1.5" />
              <circle cx="10" cy="11.5" r="1.5" />
            </svg>
            Configuration
          </button>
        </div>
      </div>
    </div>
  )
}

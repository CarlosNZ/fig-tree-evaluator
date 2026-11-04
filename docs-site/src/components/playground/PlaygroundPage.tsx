import { useEffect, useState } from 'react'
import type { JsonData } from 'json-edit-react'
import { exampleFigTree, figTree, siteOperators } from '../../lib/figTree'
import { parseJson5 } from '../../lib/json5'
import { readPlaygroundSeed, type PlaygroundSeed } from '../../lib/playgroundLink'
import { examples } from '../../playground/examples'
import { fragments } from '../../playground/fragments'
import { customOperators, operatorListings } from '../../playground/operators'
import BlurbDialog from './BlurbDialog'
import PlaygroundEditors from './PlaygroundEditors'

/** An example's blurb, rendered at build time (PlaygroundPage.astro). */
export interface Blurb {
  title: string
  html: string
}

export interface PlaygroundPageProps {
  /** By example id. */
  blurbs: Record<string, Blurb>
}

/** The Playground's examples' fragments and custom operators registered. */
const playgroundFigTree = figTree.with({
  operators: [...siteOperators, ...customOperators],
  fragments,
})

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

const isExample = (id: string | null): id is string =>
  id !== null && examples.some((example) => example.id === id)

/**
 * What an "open in editor" link carries, ready for the editors, with the
 * instance its page used. Comments in its JSON5 are lost, since the trees
 * can't hold them, and so is its example's extra button, which the editors
 * have no place for.
 */
const fromSeed = (seed: PlaygroundSeed) => {
  const expression = parseJson5(seed.expression)
  const data = parseJson5(seed.data ?? '{}')
  return {
    expression: expression.ok ? expression.value : null,
    data: data.ok ? (data.value as JsonData) : {},
    figTree: exampleFigTree(seed),
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

/**
 * The Playground page: the example picker, the picked example's blurb, and
 * the data and expression editors, which evaluate with the examples'
 * fragments and custom operators. A blurb opens as a dialog the first time
 * the reader opens its example. Picking an example remounts the editors with
 * its expression and data. An expression from an "open in editor" link keeps
 * the instance its page used, and has no example picked until the reader
 * picks one.
 *
 * Mounted `client:only`, since what it shows depends on the URL and on what
 * the reader last picked.
 */
export default function PlaygroundPage({ blurbs }: PlaygroundPageProps) {
  const [selected, setSelected] = useState(initialSelection)
  const [seeded] = useState(() => {
    const seed = readPlaygroundSeed(window.location.search)
    return seed && fromSeed(seed)
  })
  const example = examples.find(({ id }) => id === selected)
  const [showBlurb, setShowBlurb] = useState(false)

  useEffect(() => {
    if (selected === null) return
    remember(selected)
    if (blurbs[selected] && !visited()[selected]) setShowBlurb(true)
  }, [selected])

  const pick = (id: string) => {
    // The URL names the example in place of whatever it held
    const url = new URL(window.location.href)
    url.search = new URLSearchParams({ [PARAM]: id }).toString()
    url.hash = ''
    window.history.replaceState(null, '', url)
    setSelected(id)
  }

  const blurb = example && blurbs[example.id]

  return (
    <div className="fds-playground-page">
      <label className="fds-picker">
        <span className="fds-picker-label">Example</span>
        <select value={selected ?? ''} onChange={(event) => pick(event.target.value)}>
          {selected === null && (
            <option value="" disabled>
              From a docs page
            </option>
          )}
          {examples.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>

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

      {example ? (
        <PlaygroundEditors
          key={example.id}
          id="playground"
          expression={example.expression}
          data={example.data ?? {}}
          collapse={example.collapse}
          figTree={playgroundFigTree}
          operatorListings={operatorListings}
        />
      ) : (
        seeded && <PlaygroundEditors key="seed" id="playground" {...seeded} />
      )}
    </div>
  )
}

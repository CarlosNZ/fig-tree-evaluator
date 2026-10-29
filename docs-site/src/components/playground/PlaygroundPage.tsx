import { useEffect, useState } from 'react'
import { figTree, siteOperators } from '../../lib/figTree'
import { toJson5 } from '../../lib/json5'
import { readPlaygroundSeed } from '../../lib/playgroundLink'
import { examples } from '../../playground/examples'
import { fragments } from '../../playground/fragments'
import { customOperators, operatorListings } from '../../playground/operators'
import Playground from './Playground'

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

const isExample = (id: string | null): id is string =>
  id !== null && examples.some((example) => example.id === id)

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
 * the widget, which evaluates with the examples' fragments and custom
 * operators. Picking an example remounts the widget with its expression and
 * data. An expression from an "open in editor" link keeps the instance its
 * page used, and has no example picked until the reader picks one.
 *
 * Mounted `client:only`, since what it shows depends on the URL and on what
 * the reader last picked.
 */
export default function PlaygroundPage({ blurbs }: PlaygroundPageProps) {
  const [selected, setSelected] = useState(initialSelection)
  const example = examples.find(({ id }) => id === selected)

  useEffect(() => {
    if (selected !== null) remember(selected)
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

      {blurb && (
        <details className="fds-blurb" open>
          <summary>{blurb.title}</summary>
          <div className="fds-blurb-body" dangerouslySetInnerHTML={{ __html: blurb.html }} />
        </details>
      )}

      {example ? (
        <Playground
          key={example.id}
          id="playground"
          title={example.name}
          expression={toJson5(example.expression)}
          data={toJson5(example.data ?? {})}
          collapse={example.collapse}
          figTree={playgroundFigTree}
          operatorListings={operatorListings}
        />
      ) : (
        <Playground key="seed" id="playground" readFromUrl expression="{}" />
      )}
    </div>
  )
}

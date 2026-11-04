import { FigTree, type FigTreeOptions, type OptionsUpdate } from 'fig-tree-evaluator'
import { siteOperators } from '../../lib/figTree'
import { fragments } from '../../playground/fragments'
import { customOperators } from '../../playground/operators'

/**
 * The options the Playground's Configuration panel sets on its instance.
 * They're plain data, so they can be kept in local storage. The fragments are
 * kept apart from them, and the operators never change.
 */
export type PlaygroundOptions = Pick<
  FigTreeOptions,
  'http' | 'graphQL' | 'operatorDefaults' | 'strictDataPaths' | 'timeout' | 'maxDepth' | 'maxNodes'
> & { cache?: { maxSize?: number; maxTime?: number } }

export type OperatorDefaults = NonNullable<PlaygroundOptions['operatorDefaults']>

/** Where the options are kept. */
const OPTIONS_KEY = 'fds-playground-options'

/** FigTree's own defaults, which the panel's empty cache fields mean. */
export const DEFAULT_CACHE_SIZE = 50
export const DEFAULT_CACHE_TIME = 1800

/**
 * The result cache's store, so the panel can show how many entries it holds,
 * which FigTree doesn't report. FigTree's `maxSize` bounds only its built-in
 * store, so this one evicts the least recently used entry itself. An entry
 * that has expired still counts until FigTree next looks it up and deletes
 * it.
 */
class CountingStore {
  private readonly entries = new Map<string, unknown>()

  constructor(private maxSize: number) {}

  get size() {
    return this.entries.size
  }

  /** Changes the bound, evicting the least recently used entries past a shrink. */
  resize(maxSize: number) {
    this.maxSize = maxSize
    while (this.entries.size > this.maxSize) this.evictOldest()
  }

  get(key: string) {
    if (!this.entries.has(key)) return undefined
    const value = this.entries.get(key)
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: string, value: unknown) {
    this.entries.delete(key)
    this.entries.set(key, value)
    if (this.entries.size > this.maxSize) this.evictOldest()
  }

  delete(key: string) {
    this.entries.delete(key)
  }

  clear() {
    this.entries.clear()
  }

  private evictOldest() {
    this.entries.delete(this.entries.keys().next().value!)
  }
}

export const cacheStore = new CountingStore(DEFAULT_CACHE_SIZE)

/** Every operator the Playground can use: the site's, and its examples' own. */
const operators = [...siteOperators, ...customOperators]

/**
 * The Playground's one instance, for as long as the page is open, so its
 * result cache outlives every change of options. It's its own, not the
 * site's: the docs pages' examples never see the panel's options. The
 * operators are given here, and everything else goes through
 * `applyOptions()`.
 */
export const playgroundFigTree = new FigTree({ operators, fragments, cache: { store: cacheStore } })

/**
 * The operators that cache: what the panel's "Use cache?" turns off, each by
 * name, since FigTree has no one switch.
 */
const cachingOperators = playgroundFigTree
  .getOperators()
  .filter(({ cache }) => cache)
  .map(({ name }) => name)

/** Whether the options leave caching on: some operator that caches isn't turned off. */
export const usesCache = (operatorDefaults: OperatorDefaults = {}) =>
  cachingOperators.some((name) => operatorDefaults[name]?.noCache !== true)

/**
 * The operator defaults with caching on or off for every operator that
 * caches, keeping whatever else they set.
 */
export const setCaching = (defaults: OperatorDefaults = {}, on: boolean): OperatorDefaults => {
  const result = { ...defaults }
  for (const name of cachingOperators) {
    const rest = Object.fromEntries(
      Object.entries(result[name] ?? {}).filter(([key]) => key !== 'noCache')
    )
    if (!on) result[name] = { ...rest, noCache: true }
    else if (Object.keys(rest).length > 0) result[name] = rest
    else delete result[name]
  }
  return result
}

/**
 * What FigTree finds wrong with these operator defaults, if anything: an
 * operator or parameter it doesn't have, or a value of the wrong type.
 */
export const checkOperatorDefaults = (operatorDefaults: OperatorDefaults) => {
  try {
    new FigTree({ operators, operatorDefaults })
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** A block of options as an update over `previous`: each key it drops is null, which removes it. */
const replacing = <Block extends object>(previous?: Block, next?: Block) => ({
  ...Object.fromEntries(Object.keys(previous ?? {}).map((key) => [key, null])),
  ...next,
})

/**
 * The update that makes the instance's options `options`, given that they're
 * `previous`. `updateOptions()` merges what it's given into what the
 * instance has, and removes what's null, so each setting `options` leaves
 * out is given as null, and FigTree's default applies. The cache keeps its
 * store.
 */
const prepareOptions = (
  previous: PlaygroundOptions,
  options: PlaygroundOptions
): OptionsUpdate => ({
  http: replacing(previous.http, options.http),
  graphQL: replacing(previous.graphQL, options.graphQL),
  operatorDefaults: replacing(previous.operatorDefaults, options.operatorDefaults),
  cache: {
    maxSize: options.cache?.maxSize ?? DEFAULT_CACHE_SIZE,
    maxTime: options.cache?.maxTime ?? DEFAULT_CACHE_TIME,
  },
  strictDataPaths: options.strictDataPaths ?? null,
  timeout: options.timeout ?? null,
  maxDepth: options.maxDepth ?? null,
  maxNodes: options.maxNodes ?? null,
})

let applied: PlaygroundOptions = {}

/**
 * Makes `options` the instance's options, and keeps them. It throws on
 * options FigTree refuses, leaving the instance and what's kept as they were.
 */
export const applyOptions = (options: PlaygroundOptions) => {
  playgroundFigTree.updateOptions(prepareOptions(applied, options))
  cacheStore.resize(options.cache?.maxSize ?? DEFAULT_CACHE_SIZE)
  applied = options
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options))
  } catch {
    // Not kept, then: they apply until the page closes
  }
}

/** The kept options if FigTree still accepts them, else none, applied to the instance. */
export const initialOptions = (): PlaygroundOptions => {
  try {
    const kept = localStorage.getItem(OPTIONS_KEY)
    if (kept) {
      const options = JSON.parse(kept) as PlaygroundOptions
      applyOptions(options)
      return options
    }
  } catch {
    // Unreadable, or refused since they were kept
  }
  return {}
}

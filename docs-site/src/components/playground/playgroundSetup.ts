import {
  FigTree,
  type FigTreeOptions,
  type FragmentDefinition,
  type OptionsUpdate,
} from 'fig-tree-evaluator'
import { siteOperators } from '../../lib/figTree'
import { fragments } from '../../playground/fragments'
import { customOperators } from '../../playground/operators'

/**
 * The options the Playground's Configuration panel sets on its instance,
 * besides its fragments. They're plain data, so they can be kept in local
 * storage. The operators never change.
 */
export type PlaygroundOptions = Pick<
  FigTreeOptions,
  'http' | 'graphQL' | 'operatorDefaults' | 'strictDataPaths' | 'timeout' | 'maxDepth' | 'maxNodes'
> & { cache?: { maxSize?: number; maxTime?: number } }

export type OperatorDefaults = NonNullable<PlaygroundOptions['operatorDefaults']>

export type Fragments = Record<string, FragmentDefinition>

/** Everything the Configuration panel sets: the options, and the fragments. */
export interface PlaygroundConfig {
  options: PlaygroundOptions
  fragments: Fragments
}

/**
 * Where the options and the fragments are kept: apart, so a change to the
 * shape of one never loses the other.
 */
const OPTIONS_KEY = 'fds-playground-options'
const FRAGMENTS_KEY = 'fds-playground-fragments'

/** The fragments the Playground starts with, and Reset Fragments puts back. */
export const defaultFragments: Fragments = fragments

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
export const playgroundFigTree = new FigTree({
  operators,
  fragments: defaultFragments,
  cache: { store: cacheStore },
})

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

let applied: PlaygroundConfig = { options: {}, fragments: defaultFragments }

/**
 * Makes `config` the instance's, in one update: it throws on options or
 * fragments FigTree refuses, leaving the instance as it was.
 */
const install = (config: PlaygroundConfig) => {
  playgroundFigTree.updateOptions({
    ...prepareOptions(applied.options, config.options),
    fragments: replacing(applied.fragments, config.fragments),
  })
  cacheStore.resize(config.options.cache?.maxSize ?? DEFAULT_CACHE_SIZE)
  applied = config
}

const keep = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not kept, then: it applies until the page closes
  }
}

const kept = <Value>(key: string): Value | undefined => {
  try {
    const text = localStorage.getItem(key)
    return text === null ? undefined : (JSON.parse(text) as Value)
  } catch {
    return undefined
  }
}

/**
 * Makes `config` the instance's, and keeps it. It throws on options or
 * fragments FigTree refuses, leaving the instance and what's kept as they
 * were.
 */
export const applyConfig = (config: PlaygroundConfig) => {
  install(config)
  keep(OPTIONS_KEY, config.options)
  keep(FRAGMENTS_KEY, config.fragments)
}

/**
 * What was kept, applied to the instance: the fragments, then the options,
 * each only if FigTree still accepts it, so one it refuses doesn't lose the
 * other. What it refuses stays kept until the reader next saves.
 */
export const initialConfig = (): PlaygroundConfig => {
  const tryInstall = (changes: Partial<PlaygroundConfig>) => {
    try {
      install({ ...applied, ...changes })
    } catch {
      // Refused since it was kept
    }
  }
  const fragments = kept<Fragments>(FRAGMENTS_KEY)
  if (fragments) tryInstall({ fragments })
  const options = kept<PlaygroundOptions>(OPTIONS_KEY)
  if (options) tryInstall({ options })
  return applied
}

import {
  FigTree,
  type FallbackCoverageOptions,
  type FigTreeOptions,
  type FragmentDefinition,
  type OptionsUpdate,
} from 'fig-tree-evaluator'
import { noCache, siteOperators } from '../../lib/figTree'
import { fragments as docsFragments } from '../../lib/fragments'
import { customOperators as docsOperators } from '../../lib/operators'
import type { PlaygroundSeed } from '../../lib/playgroundLink'
import type { PlaygroundExample } from '../../playground/examples'
import { fragments } from '../../playground/fragments'
import { customOperators } from '../../playground/operators'

/**
 * The options the Playground's Configuration panel sets on its instance,
 * besides its fragments, and `coverage`, the options of the coverage badge's
 * analysis. They're plain data, so they can be kept in local storage. The
 * operators never change.
 */
export type PlaygroundOptions = Pick<
  FigTreeOptions,
  'http' | 'graphQL' | 'operatorDefaults' | 'strictDataPaths' | 'timeout' | 'maxDepth' | 'maxNodes'
> & { cache?: { maxSize?: number; maxTime?: number }; coverage?: FallbackCoverageOptions }

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

/**
 * Every operator the Playground can use: the site's, its examples' own, and
 * the docs pages' custom operators, which their "open in editor" links can
 * call.
 */
const operators = [...siteOperators, ...customOperators, ...docsOperators]

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
 * Takes fragments the fragment editor has put on the instance itself
 * (`useFragmentEditor`, which registers what it saves) into the
 * configuration, and keeps them. It returns the configuration.
 */
export const recordFragments = (fragments: Fragments): PlaygroundConfig => {
  applied = { ...applied, fragments }
  keep(FRAGMENTS_KEY, fragments)
  return applied
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

/** What an example, or an "open in editor" link, asks of the configuration. */
export type PlaygroundSetup = Pick<PlaygroundExample, 'options' | 'fragments'>

/** What an "open in editor" link asks for: what its docs page's example evaluated with. */
export const seedSetup = (seed: PlaygroundSeed): PlaygroundSetup => ({
  ...(seed.fragments && { fragments: docsFragments }),
  ...(seed.noCache && { options: noCache }),
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * `previous` with `change` merged in, `levels` deep, below which a change
 * replaces whole. A null removes, at any level.
 */
const merge = (previous: unknown, change: unknown, levels: number): unknown => {
  if (change === null) return undefined
  if (levels === 0 || !isRecord(change)) return change
  const result: Record<string, unknown> = { ...(isRecord(previous) ? previous : {}) }
  for (const [key, value] of Object.entries(change)) {
    const next = merge(result[key], value, levels - 1)
    if (next === undefined) delete result[key]
    else result[key] = next
  }
  return result
}

/**
 * The configuration with a setup merged in. The options merge three levels
 * deep, an option, then a block's key, then an operator's default or a
 * header, so a link's `noCache` keeps the reader's other defaults for that
 * operator. A fragment replaces one of the same name, and none is removed.
 */
const withSetup = ({ options, fragments }: PlaygroundConfig, setup: PlaygroundSetup) => ({
  options: merge(options, setup.options ?? {}, 3) as PlaygroundOptions,
  fragments: { ...fragments, ...setup.fragments },
})

/** Plain data, so its serialisation is enough to compare it. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const list = (names: string[]) =>
  names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/** The names whose entries differ between two blocks. */
const changedIn = (before: Record<string, unknown> = {}, after: Record<string, unknown> = {}) =>
  Object.keys({ ...before, ...after }).filter((name) => !same(before[name], after[name]))

const LIMITS = [
  ['timeout', 'timeout', ' ms'],
  ['maxDepth', 'max depth', ''],
  ['maxNodes', 'max nodes', ''],
] as const

const BLOCKS = [
  ['http', 'HTTP settings'],
  ['graphQL', 'GraphQL settings'],
  ['cache', 'cache settings'],
] as const

/** What changed from one configuration to another, as the toast lists it. */
const describeChanges = (before: PlaygroundConfig, after: PlaygroundConfig): string[] => {
  const [was, now] = [before.options, after.options]
  const changes: string[] = []
  if (!same(was.strictDataPaths, now.strictDataPaths))
    changes.push(`strict data paths ${now.strictDataPaths ? 'on' : 'off'}`)
  for (const [key, label, unit] of LIMITS)
    if (!same(was[key], now[key]))
      changes.push(now[key] === undefined ? `no ${label}` : `${label} ${now[key]}${unit}`)
  for (const [key, label] of BLOCKS) if (!same(was[key], now[key])) changes.push(label)
  const operators = changedIn(was.operatorDefaults, now.operatorDefaults)
  if (operators.length > 0) {
    const caching = usesCache(now.operatorDefaults)
    const flipped = caching !== usesCache(was.operatorDefaults)
    changes.push(
      `operator defaults for ${list(operators)}${flipped ? `, caching ${caching ? 'on' : 'off'}` : ''}`
    )
  }
  const names = changedIn(before.fragments, after.fragments)
  const added = names.filter((name) => !(name in before.fragments))
  const replaced = names.filter((name) => name in before.fragments)
  if (added.length > 0)
    changes.push(`${added.length === 1 ? 'fragment' : 'fragments'} ${list(added)} added`)
  if (replaced.length > 0)
    changes.push(`${replaced.length === 1 ? 'fragment' : 'fragments'} ${list(replaced)} replaced`)
  return changes
}

/**
 * Merges what an example or a link asks for into the configuration, then
 * applies and keeps it. It returns the configuration, and what changed,
 * which is nothing if all of it was in place already. FigTree refusing it is
 * a mistake in the example, so it's logged, and the configuration stays as
 * it was.
 */
export const applySetup = (
  setup: PlaygroundSetup
): { config: PlaygroundConfig; changes: string[] } => {
  const next = withSetup(applied, setup)
  if (same(applied, next)) return { config: applied, changes: [] }
  const changes = describeChanges(applied, next)
  try {
    applyConfig(next)
  } catch (error) {
    console.error("The Playground's instance refused this setup:", setup, error)
    return { config: applied, changes: [] }
  }
  return { config: next, changes }
}

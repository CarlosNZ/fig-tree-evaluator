import {
  FetchClient,
  FigTree,
  coreOperators,
  httpOperators,
  sqlFailure,
  sqlOperators,
  type SqlConnection,
} from 'fig-tree-evaluator'
import { fallbackCoverage } from 'fig-tree-evaluator/authoring'
import { siteFetch } from './http'
import { fragments } from './fragments'
import { customAnalyses, customOperators } from './operators'

/**
 * The site's database, Northwind in SQLite (./sqlite.ts). It's imported on
 * the first query, so a page loads none of it until an example runs one.
 */
const siteDatabase: SqlConnection = {
  query: async (request) => {
    try {
      const { query } = await import('./sqlite')
      return await query(request)
    } catch (error) {
      throw sqlFailure('sqlite', error)
    }
  },
}

export const siteOperators = [
  coreOperators,
  httpOperators(new FetchClient(siteFetch)),
  sqlOperators(siteDatabase),
]

/**
 * The one instance the site evaluates with: at build time for the static
 * examples, and in the browser for the widgets, so both give the same answer.
 * HTTP requests are real in the browser and recorded at build time
 * (./http.ts).
 */
export const figTree = new FigTree({ operators: siteOperators })

/**
 * Turns off caching for every operator that caches, for the examples whose
 * point is the requests they send: a reader who runs one again sees its
 * requests sent again in the network tab.
 */
export const noCache = {
  operatorDefaults: {
    http: { noCache: true },
    graphQL: { noCache: true },
    sql: { noCache: true },
  },
} as const

/** What an example asks of the instance it evaluates with. */
export interface ExampleSetup {
  /** The Fragments page's fragments registered (./fragments.ts). */
  fragments?: boolean
  /** The Custom operators pages' operators registered (./operators/). */
  customOperators?: boolean
  /** Nothing cached, so every run sends its requests. */
  noCache?: boolean
}

/**
 * Each setup's instance, made the first time an example asks for it: the
 * widgets ask on every render, and must keep getting the same one.
 */
const instances = new Map<string, FigTree>()

/** The instance an example evaluates with. */
export const exampleFigTree = (setup: ExampleSetup = {}): FigTree => {
  const key = [setup.fragments, setup.customOperators, setup.noCache].map(Boolean).join()
  let instance = instances.get(key)
  if (instance === undefined) {
    instance = figTree
    if (setup.customOperators)
      instance = instance.with({ operators: [...siteOperators, ...customOperators] })
    if (setup.fragments) instance = instance.with({ fragments })
    if (setup.noCache) instance = instance.with(noCache)
    instances.set(key, instance)
  }
  return instance
}

/**
 * An expression's fallbackCoverage() report, with the custom operators'
 * analyses. fallbackCoverage() ignores those of operators the instance
 * doesn't register, so every instance can be given all of them.
 */
export const exampleCoverage = (instance: FigTree, expression: unknown) =>
  fallbackCoverage(instance, expression, customAnalyses)

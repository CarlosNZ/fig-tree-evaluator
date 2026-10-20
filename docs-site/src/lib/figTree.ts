import {
  FetchClient,
  FigTree,
  coreOperators,
  httpOperators,
  sqlFailure,
  sqlOperators,
  type SqlConnection,
} from 'fig-tree-evaluator'
import { siteFetch } from './http'
import { fragments } from './fragments'

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

/**
 * The one instance the site evaluates with: at build time for the static
 * examples, and in the browser for the widgets, so both give the same answer.
 * HTTP requests are real in the browser and recorded at build time
 * (./http.ts).
 */
export const figTree = new FigTree({
  operators: [coreOperators, httpOperators(new FetchClient(siteFetch)), sqlOperators(siteDatabase)],
})

/** The same instance with the Fragments page's fragments registered. */
export const figTreeWithFragments = figTree.with({ fragments })

/**
 * Turns off caching for every operator that caches, for the examples whose
 * point is the requests they send: a reader who runs one again sees its
 * requests sent again in the network tab.
 */
const noCache = {
  operatorDefaults: {
    http: { noCache: true },
    graphQL: { noCache: true },
    sql: { noCache: true },
  },
} as const

const uncached = {
  figTree: figTree.with(noCache),
  figTreeWithFragments: figTreeWithFragments.with(noCache),
}

/** What an example asks of the instance it evaluates with. */
export interface ExampleSetup {
  /** The Fragments page's fragments registered (./fragments.ts). */
  fragments?: boolean
  /** Nothing cached, so every run sends its requests. */
  noCache?: boolean
}

/** The instance an example evaluates with. */
export const exampleFigTree = ({ fragments, noCache }: ExampleSetup = {}): FigTree => {
  const set = noCache ? uncached : { figTree, figTreeWithFragments }
  return fragments ? set.figTreeWithFragments : set.figTree
}

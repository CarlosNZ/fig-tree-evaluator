import {
  FetchClient,
  FigTree,
  coreOperators,
  httpOperators,
  sqlOperators,
  type SqlConnection,
} from 'fig-tree-evaluator'
import { siteFetch } from './http'
import { fragments } from './fragments'

/**
 * The site has no database, but the operator reference lists every operator
 * a host can register, so `sql` is registered against a connection that
 * refuses every query.
 */
const noDatabase: SqlConnection = {
  query: async () => {
    throw new Error("this site has no database, so 'sql' can't run here")
  },
}

/**
 * The one instance the site evaluates with: at build time for the static
 * examples, and in the browser for the widgets, so both give the same answer.
 * HTTP requests are real in the browser and recorded at build time
 * (./http.ts).
 *
 * Results are cached for 3 seconds rather than the default 30 minutes, so a
 * reader who runs an HTTP example again sees its requests sent again in the
 * network tab.
 */
export const figTree = new FigTree({
  operators: [coreOperators, httpOperators(new FetchClient(siteFetch)), sqlOperators(noDatabase)],
  cache: { maxTime: 3 },
})

/** The same instance with the Fragments page's fragments registered. */
export const figTreeWithFragments = figTree.with({ fragments })

/** The instance an example evaluates with: with fragments only if it asks. */
export const exampleFigTree = (withFragments = false): FigTree =>
  withFragments ? figTreeWithFragments : figTree

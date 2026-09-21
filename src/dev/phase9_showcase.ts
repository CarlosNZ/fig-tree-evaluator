/**
 * Phase 9 showcase — `pnpm dev phase9_showcase`. Result caching and I/O:
 * the two caches pulling in opposite directions, requests keyed on what
 * they actually ask for rather than how they were spelled, and per-node
 * deadlines. Every phase closes with one of these (implementation-plan
 * working rule 7).
 *
 * Like Phase 8's, most of this phase does not show up in a result: a cache
 * hit looks exactly like a miss from outside. So each line prints the
 * thing that moved — the number of requests that actually went out.
 *
 * Runs offline. The client is a stub in this file, which is also the
 * shape a host's own client takes: one `request()` method, a resolved
 * request in, a parsed body out.
 */
import { FigTree, coreOperators, httpOperators, sqlOperators } from '../index'
import type { HttpClient, SqlConnection } from '../index'
import { block, outcome, print, section } from './showcase'

/** A scripted client that counts what it was asked to fetch. */
const makeClient = () => {
  const calls: string[] = []
  const client: HttpClient = {
    request: async (req) => {
      calls.push(`${req.method.toUpperCase()} ${req.url}`)
      if (req.url.includes('slow')) return new Promise(() => {}) // never settles
      if (req.url.includes('rates')) return { rate: req.url.includes('AUD') ? 0.73 : 0.61 }
      if (req.url.includes('graphql')) return { data: { countries: [{ name: 'Fiji' }] } }
      return { ok: true }
    },
  }
  return { client, calls }
}

const connection: SqlConnection = {
  query: async () => [{ name: 'Ada' }, { name: 'Grace' }],
}

const main = async () => {
  section('One request, however it is spelled')

  const { client, calls } = makeClient()
  const fig = new FigTree({
    operators: [coreOperators, httpOperators(client), sqlOperators(connection)],
    http: { baseEndpoint: 'https://api.example.com' },
    graphQL: { endpoint: 'https://api.example.com/graphql' },
  })

  const spellings = [
    { $http: 'https://api.example.com/rates' },
    { $http: { url: '/rates' } },
    { operator: 'http', url: '/rates', method: 'get' },
  ]
  for (const expression of spellings) {
    print(
      'spelled differently, resolved the same',
      expression,
      await outcome(() => fig.evaluate(expression)),
      `requests so far: ${calls.length}`
    )
  }

  section('Shaping the answer never costs a second request')

  for (const path of ['rate', undefined]) {
    const expression = { $http: { url: '/rates', ...(path ? { returnPath: path } : {}) } }
    print(
      path === undefined ? 'the whole response' : `drilled to '${path}'`,
      expression,
      await outcome(() => fig.evaluate(expression)),
      `requests so far: ${calls.length}`
    )
  }

  section('But a different question is a different request')

  const byCurrency = { $http: { url: '/rates', query: { currency: '$data.c' } } }
  for (const c of ['NZD', 'AUD', 'NZD']) {
    print(
      `currency: ${c}`,
      byCurrency,
      await outcome(() => fig.evaluate(byCurrency, { data: { c } })),
      `requests so far: ${calls.length}`
    )
  }
  console.log(`  every request that went out:\n      ${block(calls)}\n`)

  section('A null query value omits its pair, rather than sending "null"')

  const optional = { $http: { url: '/search', query: { status: 'open', owner: '$data.owner' } } }
  await fig.evaluate(optional, { data: {} })
  print('owner is missing', optional, `→ ${calls[calls.length - 1]}`)

  section('The two caches invalidate in opposite directions')

  const requestsIn = async (act: () => Promise<unknown>) => {
    const before = calls.length
    await act()
    const fired = calls.length - before
    return `${fired} request${fired === 1 ? '' : 's'}`
  }

  console.log(
    `  updateOptions() drops every compiled artifact, and the result store\n` +
      `  is untouched:                    ${await requestsIn(async () => {
        fig.updateOptions({ operatorDefaults: { join: { delimiter: ' | ' } } })
        await fig.evaluate({ $http: '/rates' })
      })} (recompiled, but nothing refetched)\n`
  )
  console.log(
    `  clearCache() is the mirror image — nothing recompiles, and the next\n` +
      `  evaluation goes back to the wire:  ${await requestsIn(async () => {
        fig.clearCache()
        await fig.evaluate({ $http: '/rates' })
      })}\n`
  )

  section('GraphQL and SQL, on the same machinery')

  const gql = {
    $graphQL: { query: 'query { countries { name } }', returnPath: 'countries[*].name' },
  }
  print('the data field, projected', gql, await outcome(() => fig.evaluate(gql)))

  for (const shape of ['rows', 'firstRow', 'column', 'firstValue']) {
    const expression = { $sql: { query: 'SELECT name FROM people', shape } }
    print(`shape: '${shape}'`, expression, await outcome(() => fig.evaluate(expression)))
  }

  section('A per-request deadline is an ordinary failure')

  const slow = { operator: 'http', url: '/slow/endpoint', timeout: 50 }
  print('uncaught', slow, await outcome(() => fig.evaluate(slow)))
  print(
    'caught by the node’s own fallback',
    { ...slow, fallback: 'degraded' },
    await outcome(() => fig.evaluate({ ...slow, fallback: 'degraded' }))
  )

  section('An instance without a client cannot reach the network at all')

  const bare = new FigTree()
  const report = bare.validate({ operator: 'http', url: 'https://api.example.com/rates' })
  print(
    'validate(), on a clientless instance',
    { operator: 'http', url: '…' },
    `→ ${block(report.issues.map((issue) => `${issue.severity}: ${issue.code}`))}`
  )
}

void main()

/**
 * On-demand: `http` and `graphQL` against real endpoints
 * (`pnpm test:live`). Hand-migrated from the live cases in
 * test/v2-working/10_API.test.ts and the GraphQL half of
 * 12_database.test.ts — against jsonplaceholder rather than v2's
 * restcountries, which now answers a bare name lookup with a redirect.
 *
 * Never part of CI — the mock client is the primary oracle, and these
 * exist to catch the things a mock cannot: that `FetchClient` speaks to a
 * real server, that a real JSON body parses, and that a real 404 produces
 * the `errorData` the operators promise.
 */
import { FigTree, FigTreeError, coreOperators, httpOperators } from '../../src'
import { rejection } from '../helpers/rejection'
import { gate } from './gate'

const online = gate('the network')
const fig = new FigTree({
  operators: [coreOperators, httpOperators()],
  graphQL: { endpoint: 'https://countries.trevorblades.com/' },
  timeout: 20000,
})

const BASE = 'https://jsonplaceholder.typicode.com'

beforeAll(() => online.open(() => fetch(`${BASE}/posts/1`)))

it('fetches and drills a real JSON response', async () => {
  if (!online.ok()) return
  expect(await fig.evaluate({ $http: { url: `${BASE}/posts/1`, returnPath: 'userId' } })).toBe(1)
})

it('sends a query string the server actually reads', async () => {
  if (!online.ok()) return
  // Every post in the filtered set belongs to the user asked for, which
  // only holds if the pair reached the server
  const result = await fig.evaluate({
    $http: { url: `${BASE}/posts`, query: { userId: 2 }, returnPath: '[*].userId' },
  })
  expect(new Set(result as number[])).toEqual(new Set([2]))
})

it('omits a null query pair rather than sending the word', async () => {
  if (!online.ok()) return
  // With the pair omitted the filter is absent and every user comes back;
  // sending `?userId=null` would have returned nothing
  const result = (await fig.evaluate(
    { $http: { url: `${BASE}/posts`, query: { userId: '$data.who' }, returnPath: '[*].userId' } },
    { data: {} }
  )) as number[]
  expect(new Set(result).size).toBeGreaterThan(1)
})

it('carries a real non-2xx into errorData', async () => {
  if (!online.ok()) return
  const error = await rejection<FigTreeError>(fig.evaluate({ $http: `${BASE}/posts/99999` }))
  expect(error.errorData).toMatchObject({ status: 404 })
})

it('POSTs a real JSON body', async () => {
  if (!online.ok()) return
  expect(
    await fig.evaluate({
      $http: {
        url: `${BASE}/posts`,
        method: 'post',
        body: { title: 'fig', userId: 1 },
        returnPath: 'title',
      },
    })
  ).toBe('fig')
})

it('runs a real GraphQL query and projects out of data', async () => {
  if (!online.ok()) return
  expect(
    await fig.evaluate({
      $graphQL: ['query ($code: ID!) { country(code: $code) { name } }', { code: 'NZ' }],
    })
  ).toEqual({ country: { name: 'New Zealand' } })
})

it('serves the second identical request from the cache, not the wire', async () => {
  if (!online.ok()) return
  const expression = { $http: { url: `${BASE}/posts/2`, returnPath: 'id' } }
  const first = Date.now()
  await fig.evaluate(expression)
  const wire = Date.now() - first

  const second = Date.now()
  await fig.evaluate(expression)
  // Not a timing assertion so much as a sanity one: a cache hit cannot
  // take as long as a round trip
  expect(Date.now() - second).toBeLessThan(Math.max(wire, 50))
})

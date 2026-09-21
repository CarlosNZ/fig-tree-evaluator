/**
 * Chunk 9.3 — `graphQL` ("Batch 8 — I/O" in
 * docs-dev/v3-specs/v3-operator-parameters-2.md). `http`'s core wearing
 * the protocol's vocabulary: a POST of `{ query, variables }` to one
 * endpoint, answering with the response's `data` field.
 *
 * Hand-migrated from the GraphQL half of
 * test/v2-working/12_database.test.ts. Register row 30 is discharged here.
 */
import { FigTree, FigTreeError, coreOperators, httpOperators } from '../src'
import { MockHttpClient } from './helpers'
import { rejection } from './helpers/rejection'

const ENDPOINT = 'https://countries.test/graphql'

const withClient = (client: MockHttpClient, options: object = {}) =>
  new FigTree({
    operators: [coreOperators, httpOperators(client)],
    graphQL: { endpoint: ENDPOINT },
    ...options,
  })

const client = (payload: unknown = { data: { countries: [{ name: 'Fiji' }] } }) =>
  new MockHttpClient({ defaultResponse: payload })

describe('the call', () => {
  it('POSTs the document to the configured endpoint', async () => {
    const http = client()
    await withClient(http).evaluate({ $graphQL: 'query { countries { name } }' })
    expect(http.calls[0]).toMatchObject({
      method: 'post',
      url: ENDPOINT,
      body: { query: 'query { countries { name } }' },
    })
  })

  it('takes the standard pair positionally — document, then variables', async () => {
    const http = client()
    await withClient(http).evaluate(
      { $graphQL: ['query ($code: ID!) { country(code: $code) { name } }', { code: '$data.code' }] },
      { data: { code: 'FJ' } }
    )
    expect(http.calls[0].body).toEqual({
      query: 'query ($code: ID!) { country(code: $code) { name } }',
      variables: { code: 'FJ' },
    })
  })

  it('omits variables entirely when there are none', async () => {
    const http = client()
    await withClient(http).evaluate({ $graphQL: 'query { a }' })
    expect(http.calls[0].body).toEqual({ query: 'query { a }' })
  })

  it('carries a null variable through, unlike a null query pair', async () => {
    const http = client()
    await withClient(http).evaluate(
      { $graphQL: ['query ($f: String) { a(f: $f) }', { f: '$data.filter' }] },
      { data: {} }
    )
    // A nullable GraphQL argument is meaningful, so the wire rule carries
    // it — the deliberate contrast with http.query, which omits the pair
    expect(http.calls[0].body).toEqual({
      query: 'query ($f: String) { a(f: $f) }',
      variables: { f: null },
    })
  })
})

describe('the endpoint', () => {
  it('takes a per-node url as the override', async () => {
    const http = client()
    await withClient(http).evaluate({
      $graphQL: { query: 'query { a }', url: 'https://other.test/gql' },
    })
    expect(http.calls[0].url).toBe('https://other.test/gql')
  })

  it('fails when neither the node nor the option supplies one', async () => {
    const fig = new FigTree({ operators: [coreOperators, httpOperators(client())] })
    const error = await rejection<FigTreeError>(fig.evaluate({ $graphQL: 'query { a }' }))
    expect(error.message).toMatch(/no endpoint/)
  })

  it('has no magic placeholder — omission is how you mean the option', async () => {
    const http = client()
    // v2 read the literal string 'graphQLEndpoint' as "use the option"
    await withClient(http).evaluate({
      $graphQL: { query: 'query { a }', url: 'https://base.test/graphQLEndpoint' },
    })
    expect(http.calls[0].url).toBe('https://base.test/graphQLEndpoint')
  })
})

describe('the header chain', () => {
  it('runs http.headers, then graphQL.headers, then the node', async () => {
    const http = client()
    await withClient(http, {
      http: { headers: { Authorization: 'shared', 'X-A': 'a' } },
      graphQL: { endpoint: ENDPOINT, headers: { Authorization: 'graphql', 'X-B': 'b' } },
    }).evaluate({ $graphQL: { query: 'query { a }', headers: { 'X-C': 'c' } } })
    expect(http.calls[0].headers).toMatchObject({
      Authorization: 'graphql',
      'X-A': 'a',
      'X-B': 'b',
      'X-C': 'c',
    })
  })
})

describe('the response', () => {
  it('answers with the data field, not the envelope', async () => {
    expect(await withClient(client()).evaluate({ $graphQL: 'query { countries { name } }' })).toEqual(
      { countries: [{ name: 'Fiji' }] }
    )
  })

  it('drills within data, projections included', async () => {
    const http = client({ data: { countries: [{ name: 'Fiji' }, { name: 'NZ' }] } })
    expect(
      await withClient(http).evaluate({
        $graphQL: { query: 'query { countries { name } }', returnPath: 'countries[*].name' },
      })
    ).toEqual(['Fiji', 'NZ'])
  })

  it('fails on a non-empty errors array — register row 30', async () => {
    const http = client({
      data: { partial: true },
      errors: [{ message: 'Cannot query field "nope"' }],
    })
    const error = await rejection<FigTreeError>(
      withClient(http).evaluate({ $graphQL: 'query { nope }' })
    )
    expect(error.message).toMatch(/carried 1 error: Cannot query field "nope"/)
    expect(error.errorData).toEqual({ errors: [{ message: 'Cannot query field "nope"' }] })
  })

  it('is caught by a fallback, like any other failure', async () => {
    const http = client({ errors: [{ message: 'nope' }] })
    expect(
      await withClient(http).evaluate({
        operator: 'graphQL',
        query: 'query { a }',
        fallback: 'degraded',
      })
    ).toBe('degraded')
  })

  it('treats data: null with no errors as a successful null', async () => {
    expect(await withClient(client({ data: null })).evaluate({ $graphQL: 'query { a }' })).toBeNull()
  })

  it('fails a response that is neither data nor errors', async () => {
    const error = await rejection<FigTreeError>(
      withClient(client({ unexpected: true })).evaluate({ $graphQL: 'query { a }' })
    )
    expect(error.message).toMatch(/neither data nor errors/)
  })

  it('fails a response that is not an object at all', async () => {
    const error = await rejection<FigTreeError>(
      withClient(client('plain text')).evaluate({ $graphQL: 'query { a }' })
    )
    expect(error.message).toMatch(/was not an object/)
  })

  it('never caches a response that carried errors', async () => {
    const http = client({ errors: [{ message: 'nope' }] })
    const fig = withClient(http)
    await rejection<FigTreeError>(fig.evaluate({ $graphQL: 'query { a }' }))
    await rejection<FigTreeError>(fig.evaluate({ $graphQL: 'query { a }' }))
    // The check lives inside the memo unit precisely so this holds
    expect(http.callCount).toBe(2)
  })
})

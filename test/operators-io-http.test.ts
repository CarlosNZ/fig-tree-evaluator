/**
 * Chunk 9.3 — `http` ("Batch 8 — I/O" in
 * docs-dev/v3-specs/v3-operator-parameters-2.md). GET and POST behind one
 * `method`, with the operator owning URL assembly and the header chain.
 *
 * Hand-migrated from test/v2-working/10_API.test.ts. What it tested
 * against a mocked `node-fetch` module, this tests against an injected
 * mock client — so nothing here intercepts a module, and the same
 * assertions run against any client.
 *
 * Register rows 27 and 28 are discharged here.
 */
import { FigTree, FigTreeError, coreOperators, httpOperators } from '../src'
import { MockHttpClient } from './helpers'
import { rejection } from './helpers/rejection'

const withClient = (client: MockHttpClient, options: object = {}) =>
  new FigTree({ operators: [coreOperators, httpOperators(client)], ...options })

const client = (responses: Record<string, unknown> = {}) =>
  new MockHttpClient({ responses, defaultResponse: { ok: true } })

describe('the everyday face', () => {
  it('takes a bare URL as its single positional payload', async () => {
    const http = client({ 'api.test/rates': { rate: 0.61 } })
    expect(await withClient(http).evaluate({ $http: 'https://api.test/rates' })).toEqual({
      rate: 0.61,
    })
    expect(http.calls[0]).toMatchObject({ url: 'https://api.test/rates', method: 'get' })
  })

  it('defaults to GET and announces that it wants JSON', async () => {
    const http = client()
    await withClient(http).evaluate({ $http: 'https://api.test/x' })
    expect(http.calls[0].method).toBe('get')
    expect(http.calls[0].headers).toEqual({ Accept: 'application/json' })
  })
})

describe('URL assembly', () => {
  it('uses a full http(s) URL verbatim, base or no base', async () => {
    const http = client()
    await withClient(http, { http: { baseEndpoint: 'https://base.test/api' } }).evaluate({
      $http: 'https://other.test/thing',
    })
    expect(http.calls[0].url).toBe('https://other.test/thing')
  })

  it('joins anything else onto the base, tolerating slashes on both sides', async () => {
    const http = client()
    const fig = withClient(http, { http: { baseEndpoint: 'https://base.test/api/' } })
    await fig.evaluate({ $http: '/users' })
    expect(http.calls[0].url).toBe('https://base.test/api/users')

    // The other spelling resolves to the same effective request, so the
    // result cache serves it — which is the keying rule demonstrating
    // itself: two spellings of one request share one entry
    await fig.evaluate({ $http: 'users' })
    expect(http.callCount).toBe(1)
  })

  it("treats '' as the base itself — a deliberate address, never a manufactured one", async () => {
    const http = client()
    await withClient(http, { http: { baseEndpoint: 'https://base.test/api' } }).evaluate({
      $http: '',
    })
    expect(http.calls[0].url).toBe('https://base.test/api')
  })

  it('fails a relative URL when no base is configured', async () => {
    const error = await rejection<FigTreeError>(withClient(client()).evaluate({ $http: '/users' }))
    expect(error.message).toMatch(/relative URL and no http.baseEndpoint/)
  })

  it('fails a resolved value that is not a URL at all', async () => {
    const error = await rejection<FigTreeError>(
      withClient(client()).evaluate({ $http: 'http://' })
    )
    expect(error.message).toMatch(/is not a valid URL/)
  })

  it('rejects a null url rather than manufacturing the base', async () => {
    const error = await rejection<FigTreeError>(
      withClient(client(), { http: { baseEndpoint: 'https://base.test' } }).evaluate(
        { $http: '$data.detailsUrl' },
        { data: {} }
      )
    )
    expect(error.code).toBe('type-check')
  })
})

describe('the query string', () => {
  it('renders scalars through the stringification table', async () => {
    const http = client()
    await withClient(http).evaluate({
      $http: { url: 'https://api.test/s', query: { active: true, page: 2, q: 'ada' } },
    })
    expect(http.calls[0].url).toBe('https://api.test/s?active=true&page=2&q=ada')
  })

  it('omits the pair for a null value — register row 28', async () => {
    const http = client()
    await withClient(http).evaluate(
      { $http: { url: 'https://api.test/t', query: { status: 'open', assignee: '$data.userId' } } },
      { data: {} }
    )
    expect(http.calls[0].url).toBe('https://api.test/t?status=open')
  })

  it('fires unfiltered when the whole query is null — the honest cell of row 28', async () => {
    const http = client()
    await withClient(http).evaluate(
      { $http: { url: 'https://api.test/t', query: '$data.filters' } },
      { data: {} }
    )
    expect(http.calls[0].url).toBe('https://api.test/t')
  })

  it('appends to a query string already in the URL', async () => {
    const http = client()
    await withClient(http).evaluate({
      $http: { url: 'https://api.test/c?fields=name', query: { page: 2 } },
    })
    expect(http.calls[0].url).toBe('https://api.test/c?fields=name&page=2')
  })

  it('refuses a composite value rather than guessing a convention', async () => {
    const error = await rejection<FigTreeError>(
      withClient(client()).evaluate({
        $http: { url: 'https://api.test/x', query: { tags: ['a', 'b'] } },
      })
    )
    expect(error.code).toBe('type-check')
    expect(error.message).toMatch(/must be a string, number or boolean/)
  })

  it("never sends the string 'null', which is v2's coercion bug", async () => {
    const http = client()
    await withClient(http).evaluate(
      { $http: { url: 'https://api.test/x', query: { a: '$data.missing' } } },
      { data: {} }
    )
    expect(http.calls[0].url).not.toContain('null')
  })
})

describe('the header chain', () => {
  it('merges the node over the option, per key', async () => {
    const http = client()
    await withClient(http, {
      http: { headers: { Authorization: 'Bearer base', 'X-Env': 'prod' } },
    }).evaluate({ $http: { url: 'https://api.test/x', headers: { Authorization: 'Bearer node' } } })
    expect(http.calls[0].headers).toMatchObject({
      Authorization: 'Bearer node',
      'X-Env': 'prod',
    })
  })

  it('removes an inherited pair when the node supplies null', async () => {
    const http = client()
    await withClient(http, { http: { headers: { Authorization: 'Bearer base' } } }).evaluate(
      { $http: { url: 'https://api.test/x', headers: { Authorization: '$data.token' } } },
      { data: {} }
    )
    expect(http.calls[0].headers).not.toHaveProperty('Authorization')
  })

  it('lets a node drop the content type the operator supplies', async () => {
    const http = client()
    await withClient(http).evaluate({
      $http: {
        url: 'https://api.test/x',
        method: 'post',
        body: { a: 1 },
        headers: { 'Content-Type': null },
      },
    })
    expect(http.calls[0].headers).not.toHaveProperty('Content-Type')
  })

  it('merges exact-key, without normalising case', async () => {
    const http = client()
    await withClient(http, { http: { headers: { 'x-key': 'lower' } } }).evaluate({
      $http: { url: 'https://api.test/x', headers: { 'X-Key': 'upper' } },
    })
    expect(http.calls[0].headers).toMatchObject({ 'x-key': 'lower', 'X-Key': 'upper' })
  })
})

describe('the body', () => {
  it('goes out with a POST, under a JSON content type', async () => {
    const http = client()
    await withClient(http).evaluate({
      $http: { url: 'https://api.test/s', method: 'post', body: { term: '$data.term' } },
    }, { data: { term: 'ada' } })
    expect(http.calls[0]).toMatchObject({ method: 'post', body: { term: 'ada' } })
    expect(http.calls[0].headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('is absent, not null, when the whole body resolves null — register row 27', async () => {
    const http = client()
    await withClient(http).evaluate(
      { $http: { url: 'https://api.test/s', method: 'post', body: '$data.payload' } },
      { data: {} }
    )
    expect(http.calls[0].body).toBeUndefined()
    expect(http.calls[0].headers).not.toHaveProperty('Content-Type')
  })

  it('carries nulls INSIDE a present body as JSON nulls', async () => {
    const http = client()
    await withClient(http).evaluate(
      { $http: { url: 'https://api.test/s', method: 'post', body: { a: 1, b: '$data.gone' } } },
      { data: {} }
    )
    expect(http.calls[0].body).toEqual({ a: 1, b: null })
  })

  it('refuses a body on a literal GET at authoring time', () => {
    const literal = withClient(client()).validate({
      $http: { url: 'https://api.test/x', method: 'get', body: { a: 1 } },
    })
    expect(literal.valid).toBe(false)
    expect(literal.issues[0].message).toMatch(/GET carries no body/)
  })

  it('refuses it at runtime too, which is where a dynamic method lands', async () => {
    // A hook sees literal values only, so a dynamic `method` is
    // indistinguishable from an absent one — linting it would refuse a
    // legal expression. The runtime check is what covers both
    const dynamic = await rejection<FigTreeError>(
      withClient(client()).evaluate(
        { $http: { url: 'https://api.test/x', method: '$data.verb', body: { a: 1 } } },
        { data: { verb: 'get' } }
      )
    )
    expect(dynamic.code).toBe('type-check')
    expect(dynamic.message).toMatch(/GET carries no body/)
  })
})

describe('the response', () => {
  it('drills with returnPath, using get.path’s grammar', async () => {
    const http = client({ 'api.test/r': { result: { items: [{ id: 7 }] } } })
    expect(
      await withClient(http).evaluate({
        $http: { url: 'https://api.test/r', returnPath: 'result.items[0].id' },
      })
    ).toBe(7)
  })

  it('projects with [*], which is what replaced v2’s collapse magic', async () => {
    const http = client({ 'api.test/c': { countries: [{ name: 'Fiji' }, { name: 'NZ' }] } })
    expect(
      await withClient(http).evaluate({
        $http: { url: 'https://api.test/c', returnPath: 'countries[*].name' },
      })
    ).toEqual(['Fiji', 'NZ'])
  })

  it('answers null for a path the response does not have', async () => {
    const http = client({ 'api.test/r': { a: 1 } })
    expect(
      await withClient(http).evaluate({ $http: { url: 'https://api.test/r', returnPath: 'b.c' } })
    ).toBeNull()
  })

  it('reports a malformed literal returnPath at authoring time', () => {
    const report = withClient(client()).validate({
      $http: { url: 'https://api.test/x', returnPath: 'a[[b' },
    })
    expect(report.valid).toBe(false)
  })

  it('carries the failure payload, and no header value with it', async () => {
    const http = new MockHttpClient({
      failStatus: 503,
      failMessage: 'Service Unavailable',
      failResponse: { detail: 'down' },
    })
    const error = await rejection<FigTreeError>(
      withClient(http, { http: { headers: { Authorization: 'Bearer SECRET' } } }).evaluate({
        $http: 'https://api.test/x',
      })
    )
    expect(error.errorData).toMatchObject({ status: 503, response: { detail: 'down' } })
    expect(JSON.stringify(error.errorData)).not.toContain('SECRET')
  })

  it('is caught by the node’s fallback like any other failure', async () => {
    const http = new MockHttpClient({ failStatus: 500, failMessage: 'Server Error' })
    expect(
      await withClient(http).evaluate({
        operator: 'http',
        url: 'https://api.test/x',
        fallback: 'degraded',
      })
    ).toBe('degraded')
  })
})

describe('authoring hints', () => {
  it("nudges a shouted verb towards the lowercase union", () => {
    const report = withClient(client()).validate({
      $http: { url: 'https://api.test/x', method: 'GET' },
    })
    expect(report.issues.map((issue) => issue.message).join(' ')).toMatch(/did you mean 'get'/)
  })
})

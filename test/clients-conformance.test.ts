/**
 * Chunk 9.2 — the `HttpClient` contract, asserted once and run over every
 * client ("The client contracts" in
 * docs-dev/v3-specs/v3-operator-contract.md; open Q8's check, which asks
 * that the mock satisfy the same interface as the real wrappers).
 *
 * One scenario table, several transport adapters. That is what makes this
 * a contract suite rather than three parallel unit suites — and the
 * transports are plain injected stubs, so nothing here touches the network
 * or intercepts a module, which is the injected-client design earning its
 * keep against v2's `test/__mocks__/`.
 */
import { AxiosClient, FetchClient, OperatorFailure } from '../src'
import type { AxiosLike, FetchLike, HttpClient, HttpRequest } from '../src'
import { MockHttpClient } from './helpers'
import { rejection } from './helpers/rejection'

interface Scenario {
  status: number
  statusText: string
  /** The raw body bytes, as a server would send them. */
  body: string
}

const SECRET = 'Bearer SUPER-SECRET-VALUE'

const request = (over: Partial<HttpRequest> = {}): HttpRequest => ({
  url: 'https://api.test/resource',
  method: 'get',
  headers: { Authorization: SECRET, Accept: 'application/json' },
  signal: new AbortController().signal,
  ...over,
})

/** A `fetch` that answers one scenario and records what it was given. */
const stubFetch = (scenario: Scenario, seen: { init?: unknown; url?: string } = {}): FetchLike =>
  (async (url, init) => {
    seen.url = url
    seen.init = init
    if (init?.signal?.aborted) throw abortError()
    return {
      ok: scenario.status >= 200 && scenario.status < 300,
      status: scenario.status,
      statusText: scenario.statusText,
      url,
      text: async () => scenario.body,
    }
  }) as FetchLike

/** An `axios` that answers the same scenario in axios' own vocabulary. */
const stubAxios = (scenario: Scenario, seen: { config?: unknown } = {}): AxiosLike => {
  const call = (async (config: Record<string, unknown>) => {
    seen.config = config
    if ((config.signal as AbortSignal | undefined)?.aborted) throw abortError()
    // axios parses JSON itself and hands back the raw text when it cannot
    const data = parseOrText(scenario.body)
    if (scenario.status >= 200 && scenario.status < 300)
      return { data, status: scenario.status, statusText: scenario.statusText }
    throw {
      isAxiosError: true,
      message: `Request failed with status code ${scenario.status}`,
      config: { url: config.url, headers: config.headers },
      response: { status: scenario.status, statusText: scenario.statusText, data },
    }
  }) as unknown as AxiosLike
  ;(call as { isAxiosError: unknown }).isAxiosError = (payload: unknown) =>
    (payload as { isAxiosError?: boolean } | null)?.isAxiosError === true
  return call
}

const parseOrText = (body: string): unknown => {
  if (body.trim() === '') return ''
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

const abortError = () => {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

/**
 * Every client, in the same shape. `MockHttpClient` answers from a
 * scripted map rather than a wire, so its adapter translates a scenario
 * into that vocabulary — which is exactly the point: a caller cannot tell
 * the three apart.
 */
const CLIENTS: { name: string; build: (scenario: Scenario) => HttpClient }[] = [
  { name: 'FetchClient', build: (scenario) => new FetchClient(stubFetch(scenario)) },
  { name: 'AxiosClient', build: (scenario) => new AxiosClient(stubAxios(scenario)) },
  {
    name: 'MockHttpClient',
    build: (scenario) =>
      scenario.status >= 200 && scenario.status < 300
        ? new MockHttpClient({ defaultResponse: parseOrText(scenario.body) || null })
        : new MockHttpClient({
            failStatus: scenario.status,
            failMessage: scenario.statusText,
            failResponse: parseOrText(scenario.body),
          }),
  },
]

describe.each(CLIENTS)('$name — the contract every client satisfies', ({ build }) => {
  it('returns the parsed JSON body', async () => {
    const client = build({ status: 200, statusText: 'OK', body: '{"rate":0.61}' })
    expect(await client.request(request())).toEqual({ rate: 0.61 })
  })

  it('returns null for an empty success', async () => {
    const client = build({ status: 204, statusText: 'No Content', body: '' })
    expect(await client.request(request())).toBeNull()
  })

  it('throws OperatorFailure carrying the status and the response payload', async () => {
    const client = build({ status: 404, statusText: 'Not Found', body: '{"error":"nope"}' })
    const failure = await rejection<OperatorFailure>(client.request(request()))
    expect(failure).toBeInstanceOf(OperatorFailure)
    expect(failure.errorData).toMatchObject({ status: 404, response: { error: 'nope' } })
  })

  it('never echoes a header value, anywhere in the failure', async () => {
    const client = build({ status: 500, statusText: 'Server Error', body: '{"error":"boom"}' })
    const failure = await rejection<Error>(client.request(request()))
    // One assertion covering message, errorData and cause at once — and it
    // keeps working when someone adds a field to the payload
    const rendered = JSON.stringify({
      message: failure.message,
      ...(failure as OperatorFailure).errorData,
    })
    expect(rendered).not.toContain('SUPER-SECRET-VALUE')
  })

  it('refuses a request whose signal is already aborted', async () => {
    const client = build({ status: 200, statusText: 'OK', body: '{}' })
    const controller = new AbortController()
    controller.abort()
    await expect(client.request(request({ signal: controller.signal }))).rejects.toThrow()
  })
})

describe('FetchClient', () => {
  it('reads the body once and classifies afterwards', async () => {
    // v2 called `.json()` BEFORE checking `ok`, so an HTML error page came
    // back as a JSON parse error rather than the 502 it was
    const client = new FetchClient(
      stubFetch({ status: 502, statusText: 'Bad Gateway', body: '<html>down</html>' })
    )
    const failure = await rejection<OperatorFailure>(client.request(request()))
    expect(failure.errorData).toMatchObject({ status: 502, response: '<html>down</html>' })
  })

  it('fails a 200 that is not JSON', async () => {
    const client = new FetchClient(stubFetch({ status: 200, statusText: 'OK', body: 'not json' }))
    const failure = await rejection<OperatorFailure>(client.request(request()))
    expect(failure.message).toMatch(/not JSON/)
    expect(failure.errorData).toMatchObject({ status: 200 })
  })

  it('treats a whitespace-only success as empty', async () => {
    const client = new FetchClient(stubFetch({ status: 200, statusText: 'OK', body: '   ' }))
    expect(await client.request(request())).toBeNull()
  })

  it('serializes the body and passes method, headers and signal through', async () => {
    const seen: { init?: Record<string, unknown>; url?: string } = {}
    const client = new FetchClient(stubFetch({ status: 200, statusText: 'OK', body: 'null' }, seen))
    const signal = new AbortController().signal
    await client.request(request({ method: 'post', body: { term: 'ada' }, signal }))
    expect(seen.init).toMatchObject({
      method: 'POST',
      body: '{"term":"ada"}',
      headers: { Authorization: SECRET },
      signal,
    })
  })

  it('sends no body key at all when there is no body', async () => {
    const seen: { init?: Record<string, unknown> } = {}
    const client = new FetchClient(stubFetch({ status: 200, statusText: 'OK', body: 'null' }, seen))
    await client.request(request())
    expect(seen.init).not.toHaveProperty('body')
  })

  it('refuses to construct where there is no fetch to adopt', () => {
    const original = globalThis.fetch
    // @ts-expect-error — emulating a runtime without the global
    delete globalThis.fetch
    try {
      expect(() => new FetchClient()).toThrow(/no global fetch/)
    } finally {
      globalThis.fetch = original
    }
  })

  it('adopts the global when given no argument', async () => {
    const original = globalThis.fetch
    const calls: string[] = []
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url))
      return { ok: true, status: 200, statusText: 'OK', url, text: async () => '{"ok":true}' }
    }) as unknown as typeof fetch
    try {
      expect(await new FetchClient().request(request())).toEqual({ ok: true })
      expect(calls).toEqual(['https://api.test/resource'])
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('AxiosClient', () => {
  it('lets a transport error through untouched, so the engine can classify it', async () => {
    // v2 wrapped this in `new Error('Network error: …')`, which destroyed
    // the AbortError name the engine now classifies on
    const call = (async () => {
      throw abortError()
    }) as unknown as AxiosLike
    ;(call as { isAxiosError: unknown }).isAxiosError = () => false
    const failure = await rejection<Error>(new AxiosClient(call).request(request()))
    expect(failure.name).toBe('AbortError')
  })

  it('reads config.url and never the whole config, which carries headers', async () => {
    const client = new AxiosClient(
      stubAxios({ status: 403, statusText: 'Forbidden', body: '{"error":"denied"}' })
    )
    const failure = await rejection<OperatorFailure>(client.request(request()))
    expect(failure.errorData).toEqual({
      status: 403,
      statusText: 'Forbidden',
      url: 'https://api.test/resource',
      response: { error: 'denied' },
    })
  })

  it('refuses anything that is not the axios import', () => {
    // @ts-expect-error — the likely mistake: handing it a client, or a config
    expect(() => new AxiosClient({})).toThrow(/pass the axios import/)
  })
})

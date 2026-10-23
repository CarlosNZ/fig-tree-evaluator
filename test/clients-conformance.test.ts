/**
 * Chunk 9.2 — the `HttpClient` contract, asserted once and run over every
 * client ("The client contracts" in
 * docs-dev/v3-specs/v3-operator-contract.md; open Q8's check, which asks
 * that the mock satisfy the same interface as the real wrappers).
 *
 * Two tables, several transport adapters: what each client returns for a
 * given response, and what it puts on the wire for a given request (#273).
 * That is what makes this a contract suite rather than three parallel unit
 * suites — and the transports are injected, so nothing here touches the
 * network, which is the injected-client design earning its keep against
 * v2's `test/__mocks__/`.
 *
 * `AxiosClient` runs over the real axios with only its transport swapped,
 * so axios' own request and response transforms are under test, not a
 * stub's idea of them: those transforms decide how a body goes out, so a
 * stub that skipped them would hide exactly the difference a request table
 * exists to find. `jest.requireActual` because `test/__mocks__/axios.ts`
 * stands in for axios across every suite rooted at `test/`.
 */
import type { AxiosStatic } from 'axios'
import { AxiosClient, ErrorCodes, FetchClient, OperatorFailure, isFigTreeError } from '../src'
import type { AxiosLike, FetchLike, FigTreeError, HttpClient, HttpRequest } from '../src'
import { MockHttpClient } from './helpers'
import { rejection } from './helpers/rejection'

const axios = jest.requireActual<{ default: AxiosStatic }>('axios').default

/** A constructor's throw, which has to be a `FigTreeError`. */
const refusal = (construct: () => unknown): FigTreeError => {
  try {
    construct()
  } catch (error) {
    if (isFigTreeError(error)) return error
    throw error
  }
  throw new Error('expected construction to throw')
}

interface Scenario {
  status: number
  statusText: string
  /** The raw body bytes, as a server would send them. */
  body: string
}

/** What a client handed its transport, as that transport would send it. */
interface Sent {
  url: string
  method: string
  headers: Record<string, string>
  /** The serialised bytes; absent when the client sent no body. */
  body?: string
  signal: AbortSignal
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
const stubFetch = (scenario: Scenario, seen: { sent?: Sent } = {}): FetchLike =>
  (async (url, init = {}) => {
    seen.sent = {
      url,
      method: (init.method ?? 'GET').toUpperCase(),
      headers: init.headers ?? {},
      ...('body' in init ? { body: init.body } : {}),
      signal: init.signal as AbortSignal,
    }
    if (init.signal?.aborted) throw abortError()
    return {
      ok: scenario.status >= 200 && scenario.status < 300,
      status: scenario.status,
      statusText: scenario.statusText,
      url,
      text: async () => scenario.body,
    }
  }) as FetchLike

/**
 * The real axios answering the same scenario. Its adapter is the one part
 * swapped out: it receives the request after axios' transforms, and hands
 * back raw text for axios to parse and to reject on, as a real transport
 * does.
 */
const realAxios = (scenario: Scenario, seen: { sent?: Sent } = {}): AxiosLike =>
  axios.create({
    adapter: async (config) => {
      seen.sent = {
        url: config.url as string,
        method: (config.method as string).toUpperCase(),
        headers: config.headers.toJSON(true),
        ...(config.data !== undefined ? { body: config.data } : {}),
        signal: config.signal as AbortSignal,
      }
      const response = {
        data: scenario.body,
        status: scenario.status,
        statusText: scenario.statusText,
        headers: {},
        config,
      }
      if (config.validateStatus?.(scenario.status) ?? true) return response
      throw new axios.AxiosError(
        `Request failed with status code ${scenario.status}`,
        axios.AxiosError.ERR_BAD_RESPONSE,
        config,
        undefined,
        response
      )
    },
  }) as unknown as AxiosLike

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

/** The mock's call log, read as the request it would have sent. */
const loggedRequest = (mock: MockHttpClient): Sent | undefined => {
  const call = mock.calls[0]
  if (call === undefined) return undefined
  return {
    url: call.url,
    method: call.method.toUpperCase(),
    headers: call.headers,
    ...('body' in call ? { body: JSON.stringify(call.body) } : {}),
    signal: call.signal,
  }
}

/**
 * Every client, in the same shape: built to answer one scenario, and able
 * to say what it sent. `MockHttpClient` answers from a scripted map rather
 * than a wire, so its adapter translates a scenario into that vocabulary,
 * and reads what it sent from its call log — which is exactly the point: a
 * caller cannot tell the three apart.
 */
const CLIENTS: {
  name: string
  build: (scenario: Scenario) => { client: HttpClient; sent: () => Sent | undefined }
}[] = [
  {
    name: 'FetchClient',
    build: (scenario) => {
      const seen: { sent?: Sent } = {}
      return { client: new FetchClient(stubFetch(scenario, seen)), sent: () => seen.sent }
    },
  },
  {
    name: 'AxiosClient',
    build: (scenario) => {
      const seen: { sent?: Sent } = {}
      return { client: new AxiosClient(realAxios(scenario, seen)), sent: () => seen.sent }
    },
  },
  {
    name: 'MockHttpClient',
    build: (scenario) => {
      const client =
        scenario.status >= 200 && scenario.status < 300
          ? new MockHttpClient({ defaultResponse: parseOrText(scenario.body) || null })
          : new MockHttpClient({
              failStatus: scenario.status,
              failMessage: scenario.statusText,
              failResponse: parseOrText(scenario.body),
            })
      return { client, sent: () => loggedRequest(client) }
    },
  },
]

const OK: Scenario = { status: 200, statusText: 'OK', body: 'null' }

const JSON_HEADERS = { Authorization: SECRET, 'Content-Type': 'application/json' }

/**
 * One outgoing request per row, and the body bytes every client must send
 * for it. `body` is a JSON value, so a string is a JSON string, whatever it
 * happens to contain.
 */
const REQUESTS: { name: string; req: Partial<HttpRequest>; wire: string | undefined }[] = [
  { name: 'no body', req: { method: 'get' }, wire: undefined },
  {
    name: 'an object, with nested nulls',
    req: { body: { term: 'ada', tags: ['x', null], meta: { a: null } } },
    wire: '{"term":"ada","tags":["x",null],"meta":{"a":null}}',
  },
  { name: 'an array', req: { body: [1, 'two', null] }, wire: '[1,"two",null]' },
  { name: 'a string', req: { body: 'hello' }, wire: '"hello"' },
  { name: 'an empty string', req: { body: '' }, wire: '""' },
  { name: 'a string of a JSON object', req: { body: '{"a":1}' }, wire: '"{\\"a\\":1}"' },
  { name: 'a string of a JSON number', req: { body: '123' }, wire: '"123"' },
  { name: 'a string with outer whitespace', req: { body: ' 123 ' }, wire: '" 123 "' },
  { name: 'a number', req: { body: 42 }, wire: '42' },
  { name: 'a boolean', req: { body: false }, wire: 'false' },
  { name: 'null', req: { body: null }, wire: 'null' },
  {
    // The node removed the header with `null`. Which `Content-Type` the
    // transport then supplies is its own default, not the client's choice
    name: 'a body without Content-Type',
    req: { body: { a: 1 }, headers: { Authorization: SECRET } },
    wire: '{"a":1}',
  },
]

describe.each(CLIENTS)('$name — the request every client sends', ({ build }) => {
  it.each(REQUESTS)('$name', async ({ req, wire }) => {
    const { client, sent } = build(OK)
    const full = request({
      url: 'https://api.test/search?q=ada%20lovelace&page=2',
      method: 'post',
      headers: JSON_HEADERS,
      ...req,
    })
    await client.request(full)
    const { signal, headers, ...rest } = sent() as Sent
    expect(rest).toStrictEqual({
      url: full.url,
      method: full.method.toUpperCase(),
      ...(wire !== undefined ? { body: wire } : {}),
    })
    // Every header the request names arrives with its value. A transport
    // may add its own besides (axios an `Accept`, say), which are not the
    // client's to send or withhold
    expect(headers).toMatchObject(full.headers)
    expect(signal).toBe(full.signal)
  })
})

describe.each(CLIENTS)('$name — the contract every client satisfies', ({ build }) => {
  it('returns the parsed JSON body', async () => {
    const { client } = build({ status: 200, statusText: 'OK', body: '{"rate":0.61}' })
    expect(await client.request(request())).toEqual({ rate: 0.61 })
  })

  it('returns null for an empty success', async () => {
    const { client } = build({ status: 204, statusText: 'No Content', body: '' })
    expect(await client.request(request())).toBeNull()
  })

  it('throws http-status carrying the status and the response payload', async () => {
    const { client } = build({ status: 404, statusText: 'Not Found', body: '{"error":"nope"}' })
    const failure = await rejection<OperatorFailure>(client.request(request()))
    expect(failure).toBeInstanceOf(OperatorFailure)
    expect(failure.code).toBe('http-status')
    // Exactly the promised fields: nothing a reader might come to rely on
    expect(failure.errorData).toEqual({
      status: 404,
      statusText: 'Not Found',
      url: 'https://api.test/resource',
      response: { error: 'nope' },
    })
  })

  it('never echoes a header value, anywhere in the failure', async () => {
    const { client } = build({ status: 500, statusText: 'Server Error', body: '{"error":"boom"}' })
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
    const { client } = build({ status: 200, statusText: 'OK', body: '{}' })
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

  it('fails a 200 that is not JSON, with invalid-response', async () => {
    const client = new FetchClient(stubFetch({ status: 200, statusText: 'OK', body: 'not json' }))
    const failure = await rejection<OperatorFailure>(client.request(request()))
    expect(failure.message).toMatch(/not JSON \(200\)/)
    expect(failure.code).toBe('invalid-response')
    expect(failure.errorData).toEqual({ url: 'https://api.test/resource', response: 'not json' })
  })

  it('treats a whitespace-only success as empty', async () => {
    const client = new FetchClient(stubFetch({ status: 200, statusText: 'OK', body: '   ' }))
    expect(await client.request(request())).toBeNull()
  })

  it('refuses to construct where there is no fetch to adopt', () => {
    const original = globalThis.fetch
    // @ts-expect-error — emulating a runtime without the global
    delete globalThis.fetch
    try {
      expect(refusal(() => new FetchClient())).toMatchObject({
        code: ErrorCodes.invalidOptions,
        path: [],
        message: expect.stringMatching(/no global fetch/),
      })
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
    const failure = await rejection<Error>(new AxiosClient(call).request(request()))
    expect(failure.name).toBe('AbortError')
  })

  it('reads config.url and never the whole config, which carries headers', async () => {
    const client = new AxiosClient(
      realAxios({ status: 403, statusText: 'Forbidden', body: '{"error":"denied"}' })
    )
    const failure = await rejection<OperatorFailure>(client.request(request()))
    expect(failure.errorData).toEqual({
      status: 403,
      statusText: 'Forbidden',
      url: 'https://api.test/resource',
      response: { error: 'denied' },
    })
  })

  it('refuses anything that is not callable, as axios and its instances are', () => {
    // @ts-expect-error — the likely mistake: handing it a client, or a config
    expect(refusal(() => new AxiosClient({}))).toMatchObject({
      code: ErrorCodes.invalidOptions,
      path: [],
      message: expect.stringMatching(/pass the axios import/),
    })
  })
})

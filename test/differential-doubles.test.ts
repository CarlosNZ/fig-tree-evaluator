/**
 * The differential's I/O doubles ("I/O" in
 * docs-dev/v3-specs/v3-converter.md): the HTTP mocks answer v2's clients
 * and v3's alike, the Postgres stand-in answers both engines' wrappers from
 * recordings, and the recorder writes recordings the stand-in can replay.
 * Every double reports a request it cannot answer, which the runner turns
 * into a runner error.
 */
import { isDeepStrictEqual } from 'node:util'
import {
  AxiosClient as AxiosClientV2,
  FetchClient as FetchClientV2,
  SQLNodePostgres,
} from 'fig-tree-evaluator-v2'
import { AxiosClient, FetchClient, PostgresConnection } from '../src'
import { mockAxios } from '../differential/mocks/axios'
import { mockFetch } from '../differential/mocks/fetch'
import { PostgresStandIn, type SqlRecording } from '../differential/mocks/postgres'
import { onSent, type SentRequest } from '../differential/mocks/sent'
import { onUnanswered } from '../differential/mocks/unanswered'
import { recordingClient, renderRecordings } from '../differential/recordSql'
import { evaluateRecordings } from './helpers/evaluateRecordings'

const outcome = async (request: () => Promise<unknown>) => {
  try {
    return { value: await request() }
  } catch {
    return { error: true }
  }
}

/** Collects what the doubles report, as the runner does */
const listen = () => {
  const reported: string[] = []
  onUnanswered((message) => reported.push(message))
  return reported
}

afterEach(() => onUnanswered(undefined))

describe('the HTTP mocks', () => {
  // v2's FetchClient logs every failed response
  beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => undefined))
  afterAll(() => jest.restoreAllMocks())

  const clients = {
    fetch: {
      v2: FetchClientV2(mockFetch as unknown as Parameters<typeof FetchClientV2>[0]),
      v3: new FetchClient(mockFetch),
    },
    axios: {
      v2: AxiosClientV2(mockAxios as unknown as Parameters<typeof AxiosClientV2>[0]),
      v3: new AxiosClient(mockAxios),
    },
  }

  interface Request {
    method: 'get' | 'post'
    url: string
    params?: Record<string, string>
    headers?: Record<string, string>
    body?: Record<string, unknown>
  }

  const restCountries = 'https://restcountries.com/v3.1'
  const trevorblades = 'https://countries.trevorblades.com/'
  const oceania = { query: '{countries(filter: {continent: {eq: "OC"}}) {name}}' }
  const requests: [keyof typeof clients, Request][] = [
    ['fetch', { method: 'get', url: `${restCountries}/name/zealand` }],
    ['fetch', { method: 'get', url: `${restCountries}/name/New%20Zealand` }],
    ['fetch', { method: 'get', url: `${restCountries}/name/zealands` }],
    ['fetch', { method: 'get', url: `${restCountries}/alpha`, params: { codes: 'nz' } }],
    ['fetch', { method: 'get', url: 'https://jsonplaceholder.typicode.com/albums' }],
    ['fetch', { method: 'get', url: 'https://httpbin.org/get', headers: { Authorization: 'x' } }],
    ['fetch', { method: 'get', url: 'https://httpbingo.org/status/403' }],
    ['fetch', { method: 'get', url: 'http://there-is-no-f-ing-site.com' }],
    [
      'fetch',
      { method: 'post', url: 'https://jsonplaceholder.typicode.com/posts', body: { a: 1 } },
    ],
    ['fetch', { method: 'post', url: 'https://reqres.in/api/login', body: { email: 'e' } }],
    ['fetch', { method: 'post', url: 'https://reqres.in/api/login', body: { password: 'p' } }],
    ['fetch', { method: 'post', url: trevorblades, body: oceania }],
    [
      'fetch',
      {
        method: 'post',
        url: trevorblades,
        body: { query: 'query capital {countries {capital}}', variables: { code: 'NP' } },
      },
    ],
    ['axios', { method: 'get', url: `${restCountries}/name/zealand` }],
    ['axios', { method: 'get', url: `${restCountries}/name/zealands` }],
    ['axios', { method: 'get', url: `${restCountries}/alpha`, params: { codes: 'nz' } }],
    ['axios', { method: 'get', url: 'https://jsonplaceholder.typicode.com/comments' }],
    ['axios', { method: 'get', url: 'https://httpbin.org/get', headers: { Authorization: 'x' } }],
    ['axios', { method: 'get', url: 'http://httpstat.us/429' }],
    ['axios', { method: 'get', url: 'http://there-is-no-f-ing-site.com' }],
    [
      'axios',
      {
        method: 'post',
        url: 'https://countriesnow.space/api/v0.1/countries/population/cities',
        body: { city: 'lagos' },
      },
    ],
    ['axios', { method: 'post', url: 'https://reqres.in/api/login', body: { email: 'e' } }],
    ['axios', { method: 'post', url: trevorblades, body: oceania }],
    [
      'axios',
      { method: 'post', url: 'https://api.github.com/graphql', body: { query: '{repository}' } },
    ],
  ]

  // Each client called as its engine calls it: v2's operators hand the query
  // parameters to the client, and v3's render them into the URL
  it.each(requests)('%s %j answers v2 and v3 alike', async (client, request) => {
    const { method, url, params, headers = {}, body } = request
    const { v2, v3 } = clients[client]
    const query = params ? `?${new URLSearchParams(params)}` : ''
    const { signal } = new AbortController()
    const [fromV2, fromV3] = [
      await outcome(() => v2[method]({ url, params, headers, data: body })),
      await outcome(() => v3.request({ method, url: url + query, headers, body, signal })),
    ]
    expect(isDeepStrictEqual(fromV2, fromV3)).toBe(true)
  })

  it('reports a request no route answers, and still fails it', async () => {
    const reported = listen()
    await expect(mockFetch('https://nowhere.test/a')).rejects.toThrow('Unmocked fetch: GET')
    await expect(mockAxios({ method: 'post', url: 'https://nowhere.test/b' })).rejects.toThrow(
      'Unmocked POST URL'
    )
    expect(reported).toEqual([
      'Unmocked fetch: GET https://nowhere.test/a',
      'Unmocked POST URL: https://nowhere.test/b',
    ])
  })
})

const orders = {
  text: 'SELECT * FROM orders WHERE customer_id = $1',
  values: ['FAMIA'],
  rows: [{ order_id: 10347, order_date: new Date('1996-11-06T00:00:00.000Z'), n: null }],
}
const count = { text: 'SELECT COUNT(*) FROM employees', values: [], rows: [{ count: '9' }] }
const picture = {
  text: 'SELECT picture FROM categories',
  values: [],
  rows: [{ picture: Buffer.from([0, 1, 254, 255]) }],
}
const missing = {
  text: 'SELECT * FROM employee_table',
  values: [],
  error: { message: 'relation "employee_table" does not exist', code: '42P01' },
}
const recordings: SqlRecording[] = [orders, count, picture, missing]

describe('the Postgres stand-in', () => {
  const standIn = new PostgresStandIn(recordings)

  it("answers both engines' wrappers with the recorded rows", async () => {
    const v2 = SQLNodePostgres(standIn as unknown as Parameters<typeof SQLNodePostgres>[0])
    const v3 = new PostgresConnection(standIn)
    expect(await v2.query({ query: orders.text, values: ['FAMIA'] })).toEqual(orders.rows)
    expect(await v3.query({ text: orders.text, values: ['FAMIA'] })).toEqual(orders.rows)
    // v2 always sends `values`, and v3 only when there are binds
    expect(await v2.query({ query: count.text })).toEqual(count.rows)
    expect(await v3.query({ text: count.text })).toEqual(count.rows)
  })

  it('answers each query with its own copy, types kept', async () => {
    const first = await standIn.query({ text: picture.text })
    first.rows[0].picture = null
    const second = await standIn.query({ text: picture.text })
    expect(isDeepStrictEqual(second.rows, picture.rows)).toBe(true)
  })

  it('rejects with the recorded error, a new one each time', async () => {
    const failure = () => standIn.query({ text: missing.text }).catch((error: unknown) => error)
    const [first, second] = [await failure(), await failure()]
    expect(first).toBeInstanceOf(Error)
    expect(first).toMatchObject(missing.error)
    expect(second).not.toBe(first)
    await expect(
      new PostgresConnection(standIn).query({ text: missing.text })
    ).rejects.toMatchObject({ errorData: { driver: 'postgres', code: '42P01' } })
  })

  it('reports a query it has no recording for', async () => {
    const reported = listen()
    await expect(standIn.query({ text: 'SELECT 2' })).rejects.toThrow('No recording')
    await expect(standIn.query({ text: orders.text, values: ['ALFKI'] })).rejects.toThrow()
    expect(reported).toHaveLength(2)
  })

  it('refuses any call but query({ text, values }), at once', () => {
    const reported = listen()
    const refused: unknown[][] = [
      ['SELECT 1'],
      [{ text: count.text, rowMode: 'array' }],
      [{ text: count.text }, () => undefined],
      [{ text: count.text, values: 'x' }],
    ]
    for (const args of refused)
      expect(() => (standIn.query as (...a: unknown[]) => unknown)(...args)).toThrow(
        'query({ text, values })'
      )
    expect(reported).toHaveLength(refused.length)
  })
})

describe('what the doubles are sent', () => {
  afterEach(() => onSent(undefined))

  it('the fetch mock and the Postgres stand-in report each request, answered or not', async () => {
    const heard: SentRequest[] = []
    onSent((request) => heard.push(request))
    await mockFetch('https://restcountries.com/v3.1/name/zealand', { headers: { a: 'b' } })
    await mockFetch('https://nowhere.test/', { method: 'post', body: '{"x":1}' }).catch(() => null)
    const stand = new PostgresStandIn([{ text: 'SELECT 1', values: [], rows: [] }])
    await stand.query({ text: 'SELECT 1' })
    await stand.query({ text: 'SELECT 2', values: [2] }).catch(() => null)
    expect(heard).toEqual([
      {
        kind: 'http',
        method: 'GET',
        url: 'https://restcountries.com/v3.1/name/zealand',
        headers: { a: 'b' },
      },
      { kind: 'http', method: 'POST', url: 'https://nowhere.test/', headers: {}, body: '{"x":1}' },
      { kind: 'sql', text: 'SELECT 1' },
      { kind: 'sql', text: 'SELECT 2', values: [2] },
    ])
  })
})

describe('recording', () => {
  /** A `pg` client that answers from the fixtures, as the real one would */
  const live = {
    query: async ({ text }: { text: string; values?: unknown[] }) => {
      if (text === missing.text)
        throw Object.assign(new Error(missing.error.message), {
          code: '42P01',
          detail: 'a row value',
          severity: 'ERROR',
        })
      const found = [orders, count, picture].find((recording) => recording.text === text)
      return { rows: (found?.rows ?? []).map((row) => ({ ...row })), rowCount: 1 }
    },
  }

  it('saves what the client gave, and passes it on', async () => {
    const saved = new Map<string, SqlRecording>()
    const client = recordingClient(live, saved)
    const result = await client.query({ text: orders.text, values: ['FAMIA'] })
    expect(result).toMatchObject({ rowCount: 1 })
    result.rows[0].order_id = 0
    await client.query({ text: count.text })
    const error = await client.query({ text: missing.text }).catch((e: unknown) => e)
    expect(error).toMatchObject({ detail: 'a row value' })
    // Only the fields v3's failure reads: `detail` quotes row values
    expect([...saved.values()]).toStrictEqual([orders, count, missing])
  })

  it('writes a module that evaluates to the same recordings, in key order', () => {
    const written = evaluateRecordings(renderRecordings([...recordings].reverse()))
    expect(isDeepStrictEqual(written, [missing, orders, count, picture])).toBe(true)
  })

  it('refuses a value it cannot write as what it is', () => {
    class Interval {
      days = 1
    }
    for (const value of [new Interval(), new Map(), new Uint8Array(1), 5n, new Date(NaN)])
      expect(() =>
        renderRecordings([{ text: 'SELECT x', values: [], rows: [{ x: [value] }] }])
      ).toThrow(/rows\[0\]\.x\[0\]/)
  })
})

/**
 * `AxiosClient` over a real axios instance from `axios.create()` (#260).
 *
 * axios attaches its statics, `isAxiosError` among them, to the default
 * export alone, so an instance has none of them. A stub can only copy one
 * shape or the other, which is how a client that required the statics got
 * past every stub in the suite. This suite therefore runs the real package,
 * against a server on the loopback interface, so it still needs no network.
 *
 * `jest.requireActual` because `test/__mocks__/axios.ts` stands in for
 * axios across every suite rooted at `test/`.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { AxiosStatic } from 'axios'
import { AxiosClient, FigTree, coreOperators, httpOperators } from '../src'
import type { FallbackError } from '../src'

const axios = jest.requireActual<{ default: AxiosStatic }>('axios').default

let server: Server
let base: string

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/ok') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"name":"Ada"}')
    } else if (req.url === '/missing') {
      res.writeHead(404, 'Not Found', { 'Content-Type': 'application/json' })
      res.end('{"error":"no such user"}')
    }
    // `/slow` never answers, so only the instance's own timeout ends it
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

const over = (instance: AxiosStatic | ReturnType<AxiosStatic['create']>) =>
  new FigTree({ operators: [coreOperators, httpOperators(new AxiosClient(instance))] })

/** What the node's fallback receives. */
const caught = async (fig: FigTree, url: string): Promise<FallbackError> =>
  (await fig.evaluate({ operator: 'http', url, fallback: '$error' })) as FallbackError

test("an instance has none of the default export's statics", () => {
  expect(axios.create()).not.toHaveProperty('isAxiosError')
  expect(axios).toHaveProperty('isAxiosError')
})

test('an instance constructs, and a request through it answers', async () => {
  const fig = over(axios.create({ timeout: 5000 }))
  expect(await fig.evaluate({ operator: 'http', url: `${base}/ok` })).toEqual({ name: 'Ada' })
})

test('the import itself still does', async () => {
  expect(await over(axios).evaluate({ operator: 'http', url: `${base}/ok` })).toEqual({
    name: 'Ada',
  })
})

test('a non-2xx response through an instance is http-status, with its errorData', async () => {
  const url = `${base}/missing`
  expect(await caught(over(axios.create({ timeout: 5000 })), url)).toMatchObject({
    code: 'http-status',
    operator: 'http',
    errorData: {
      status: 404,
      statusText: 'Not Found',
      url,
      response: { error: 'no such user' },
    },
  })
})

test("the instance's own timeout is request-failure, a transport error", async () => {
  expect(await caught(over(axios.create({ timeout: 50 })), `${base}/slow`)).toStrictEqual({
    code: 'request-failure',
    message: 'http – timeout of 50ms exceeded',
    path: [],
    operator: 'http',
  })
})

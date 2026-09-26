// Jest's `node-fetch` for `pnpm test:v2`, which never reaches the network.
// The routes are a plain function in differential/mocks/fetch.ts, which the
// differential calls too; this wraps it in a `jest.fn`, with the rest of
// node-fetch's shape beside it.
import { mockFetch } from '../../differential/mocks/fetch'

export default Object.assign(jest.fn(mockFetch), {
  isRedirect: jest.fn(),
  Response: class Response {},
  Headers: class Headers {},
  Request: class Request {},
})

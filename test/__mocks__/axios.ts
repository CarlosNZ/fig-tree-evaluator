// Jest's `axios` for `pnpm test:v2`, which never reaches the network. The
// routes are plain functions in differential/mocks/axios.ts, which the
// differential calls too; this wraps them in `jest.fn`s, with the rest of
// axios' shape beside them.
import { get, isAxiosError, post, request, type AxiosConfig } from '../../differential/mocks/axios'

const routes = { get: jest.fn(get), post: jest.fn(post) }

const mockAxios = Object.assign(
  jest.fn((config: AxiosConfig) => request(config, routes)),
  routes,
  {
    // Other axios methods (not used in tests but added for completeness)
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    head: jest.fn(),
    options: jest.fn(),
    request: jest.fn(),

    // Axios static properties
    defaults: {
      headers: {
        common: {},
        get: {},
        post: {},
        put: {},
        patch: {},
        delete: {},
      },
    },

    interceptors: {
      request: {
        use: jest.fn(),
        eject: jest.fn(),
      },
      response: {
        use: jest.fn(),
        eject: jest.fn(),
      },
    },

    isAxiosError: jest.fn(isAxiosError),
    Cancel: jest.fn(),
    CancelToken: {
      source: jest.fn(() => ({
        token: {},
        cancel: jest.fn(),
      })),
    },
    isCancel: jest.fn(),
    all: jest.fn(Promise.all.bind(Promise)),
    spread: jest.fn(<T>(callback: T) => callback),
  }
)

export default Object.assign(mockAxios, { create: jest.fn(() => mockAxios) })

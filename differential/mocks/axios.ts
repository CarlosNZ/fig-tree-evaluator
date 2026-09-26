/**
 * The axios mock's routes: a canned response for every URL the v2 tests
 * request through `axios` ("I/O" in docs-dev/v3-specs/v3-converter.md).
 * `test/__mocks__/axios.ts` wraps them in `jest.fn`s for `pnpm test:v2`,
 * and the differential hands `mockAxios` to v2's `AxiosClient` and v3's
 * alike.
 *
 * v2's client hands the query parameters to axios in `config.params`, which
 * no route reads, and v3's renders them into the URL. Every route matches on
 * the URL without them, so both land on the same route.
 */
import { albums, comments, oceaniaCountries, type RequestBody } from './data'
import { unanswered } from './unanswered'

export interface AxiosConfig {
  method?: string
  url?: string
  data?: unknown
  headers?: Record<string, string>
  params?: unknown
  signal?: AbortSignal
}

export interface AxiosResponse {
  data: unknown
  status: number
  statusText: string
  headers: Record<string, string>
  config?: AxiosConfig
}

interface AxiosError extends Error {
  response?: { status: number; statusText: string; data: unknown }
  config?: AxiosConfig
  isAxiosError?: boolean
}

interface Routes {
  get: typeof get
  post: typeof post
}

/**
 * `axios(config)`, the form both engines' clients call, sent to a route by
 * its method. The Jest mock passes its own `jest.fn` routes.
 */
export const request = (config: AxiosConfig, routes: Routes = { get, post }) => {
  // Handle axios(config) style calls
  const method = (config.method || 'get').toUpperCase()
  const url = config.url || ''

  if (method === 'GET') {
    return routes.get(url, config)
  } else if (method === 'POST') {
    return routes.post(url, config.data as RequestBody, config)
  }

  return Promise.reject(unanswered(`Unmocked axios call: ${method} ${url}`))
}

export const isAxiosError = (error: unknown): error is AxiosError =>
  (error as AxiosError | undefined)?.isAxiosError === true

/**
 * axios for the differential: callable, with the one static both clients
 * read
 */
export const mockAxios = Object.assign((config: AxiosConfig) => request(config), { isAxiosError })

// GET requests
export const get = (url: string, config?: AxiosConfig): Promise<AxiosResponse> => {
  // restcountries.com - New Zealand (exact match to avoid matching 'zealands')
  if (url.includes('restcountries.com/v3.1/name/zealand') && !url.includes('zealands')) {
    return Promise.resolve({
      data: [{ name: { common: 'New Zealand' } }],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }

  // restcountries.com - Typo URL (zealands) - 404 error
  if (url.includes('restcountries.com/v3.1/name/zealands')) {
    const error = Object.assign(new Error('Request failed with status code 404'), {
      name: 'AxiosError',
      response: {
        status: 404,
        statusText: 'Not Found',
        data: {
          status: 404,
          message: 'Not Found',
        },
        headers: {},
        config,
      },
      isAxiosError: true,
      config,
    })
    return Promise.reject(error)
  }

  // restcountries.com - India
  if (url.includes('restcountries.com/v3.1/name/india') || url.includes('/v3.1/name/india')) {
    return Promise.resolve({
      data: [
        {
          name: {
            nativeName: {
              hin: { official: 'भारत गणराज्य', common: 'भारत' },
            },
          },
        },
      ],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }

  // restcountries.com - Cuba
  if (url.includes('restcountries.com/v3.1/name/cuba')) {
    return Promise.resolve({
      data: [
        {
          name: {
            common: 'Cuba',
            official: 'Republic of Cuba',
            nativeName: {
              spa: {
                official: 'República de Cuba',
                common: 'Cuba',
              },
            },
          },
          capital: ['Havana'],
          flag: '🇨🇺',
        },
      ],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }

  // restcountries.com - Nepal
  if (url.includes('restcountries.com/v3.1/name/nepal')) {
    return Promise.resolve({
      data: [
        {
          cca2: 'NP',
          name: {
            common: 'Nepal',
            official: 'Federal Democratic Republic of Nepal',
          },
        },
      ],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }

  // restcountries.com - Alpha codes (NZ)
  if (url.includes('restcountries.com/v3.1/alpha')) {
    return Promise.resolve({
      data: [
        {
          name: {
            common: 'New Zealand',
            official: 'New Zealand',
            nativeName: {
              eng: {
                official: 'New Zealand',
                common: 'New Zealand',
              },
              mri: {
                official: 'Aotearoa',
                common: 'Aotearoa',
              },
            },
          },
          capital: ['Wellington'],
        },
      ],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }

  // jsonplaceholder.typicode.com - Albums
  if (url.includes('jsonplaceholder.typicode.com/albums')) {
    return Promise.resolve({
      data: albums(),
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }

  // jsonplaceholder.typicode.com - Comments
  if (url.includes('jsonplaceholder.typicode.com/comments')) {
    return Promise.resolve({
      data: comments(),
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }

  // httpbin.org - GET with headers
  if (url.includes('httpbin.org/get')) {
    return Promise.resolve({
      data: {
        headers: {
          Authorization: config?.headers?.Authorization || '',
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }

  // httpbingo.org - 403 error
  if (url.includes('httpbingo.org/status/403')) {
    const error = Object.assign(new Error('Request failed with status code 403'), {
      name: 'AxiosError',
      response: {
        status: 403,
        statusText: 'Forbidden',
        data: {},
        headers: {},
        config,
      },
      isAxiosError: true,
      config,
    })
    return Promise.reject(error)
  }

  // httpbingo.org - 404 error
  if (url.includes('httpbingo.org/hidden-basic-auth')) {
    const error = Object.assign(new Error('Request failed with status code 404'), {
      name: 'AxiosError',
      response: {
        status: 404,
        statusText: 'Not Found',
        data: {
          status_code: 404,
          error: 'Not Found',
        },
        headers: {},
        config,
      },
      isAxiosError: true,
      config,
    })
    return Promise.reject(error)
  }

  // httpstat.us - 429 error
  if (url.includes('httpstat.us/429')) {
    const error = Object.assign(new Error('Request failed with status code 429'), {
      response: {
        status: 429,
        statusText: 'Too Many Requests',
        data: {},
        headers: {},
        config,
      },
      isAxiosError: true,
      config,
    })
    return Promise.reject(error)
  }

  // Bad URL - network error
  if (url.includes('there-is-no-f-ing-site.com')) {
    const error = Object.assign(new Error('getaddrinfo ENOTFOUND there-is-no-f-ing-site.com'), {
      isAxiosError: true,
      config,
      code: 'ENOTFOUND',
    })
    return Promise.reject(error)
  }

  return Promise.reject(unanswered(`Unmocked GET URL: ${url}`))
}

// POST requests
export const post = (
  url: string,
  data?: RequestBody,
  config?: AxiosConfig
): Promise<AxiosResponse> => {
  // jsonplaceholder.typicode.com - Posts
  if (url.includes('jsonplaceholder.typicode.com/posts')) {
    return Promise.resolve({
      data: {
        id: 101,
        ...data,
      },
      status: 201,
      statusText: 'Created',
      headers: {},
      config,
    })
  }

  // countriesnow.space - Population cities
  if (url.includes('countriesnow.space/api/v0.1/countries/population/cities')) {
    return Promise.resolve({
      data: {
        data: {
          populationCounts: [
            {
              year: '2013',
              value: '204000',
              sex: 'Both Sexes',
              reliabilty: 'Final figure, complete',
            },
          ],
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }

  // reqres.in - Login (failure - missing password)
  if (url.includes('reqres.in/api/login') && (!data || !data.password)) {
    const error = Object.assign(new Error('Request failed with status code 400'), {
      name: 'AxiosError',
      response: {
        status: 400,
        statusText: 'Bad Request',
        data: {
          error: 'Missing password',
        },
        headers: {},
        config,
      },
      isAxiosError: true,
      config,
    })
    return Promise.reject(error)
  }

  // reqres.in - Login (success)
  if (url.includes('reqres.in/api/login') && data?.password) {
    return Promise.resolve({
      data: {
        token: 'QpwL5tke4Pnpja7X4',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }

  // GraphQL - countries.trevorblades.com
  if (url.includes('countries.trevorblades.com')) {
    const query = data?.query || ''

    // Get list of Oceania countries
    if (query.includes('continent: {eq: "OC"}')) {
      return Promise.resolve({
        data: {
          data: {
            countries: oceaniaCountries(),
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      })
    }

    // Get single country by code (with emoji)
    if (query.includes('getCountry') || (query.includes('code: {eq:') && query.includes('emoji'))) {
      const code = data?.variables?.code || 'NZ'
      const countryData: Record<string, { name: string; emoji: string }> = {
        NZ: { name: 'New Zealand', emoji: '🇳🇿' },
        NP: { name: 'Nepal', emoji: '🇳🇵' },
      }

      return Promise.resolve({
        data: {
          data: {
            countries: [countryData[code] || countryData.NZ],
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      })
    }

    // Get capital query
    if (query.includes('capital')) {
      const code = data?.variables?.code || 'NZ'
      const capitalData: Record<string, string[]> = {
        NZ: ['Wellington'],
        NP: ['Kathmandu'],
      }

      return Promise.resolve({
        data: {
          data: {
            countries: capitalData[code] || capitalData.NZ,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      })
    }
  }

  // GraphQL - api.github.com
  if (url.includes('api.github.com/graphql')) {
    const query = data?.query || ''

    // Get repository info
    if (query.includes('repository')) {
      return Promise.resolve({
        data: {
          data: {
            viewer: {
              login: 'CarlosNZ',
              repository: {
                description: 'A highly configurable custom expression tree evaluator',
              },
            },
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      })
    }
  }

  return Promise.reject(unanswered(`Unmocked POST URL: ${url}`))
}

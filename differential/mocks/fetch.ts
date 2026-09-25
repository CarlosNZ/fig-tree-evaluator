/**
 * The fetch mock's routes: a canned response for every URL the v2 tests
 * request through `node-fetch` ("I/O" in docs-dev/v3-specs/v3-converter.md).
 * `test/__mocks__/node-fetch.ts` wraps them in a `jest.fn` for
 * `pnpm test:v2`, and the differential hands them to v2's `FetchClient` and
 * v3's alike.
 *
 * v2's client reads a response with `json()` and v3's with `text()`, which
 * agree because `text()` is `json()`'s data serialised.
 *
 * The fakerapi.it route answers at random, since v2's cache test needs two
 * uncached calls to differ. Only 24_cache's cases request it, and those
 * compare two results with each other rather than one with an expected
 * value.
 */
import { albums, comments, oceaniaCountries, type RequestBody } from './data'
import { unanswered } from './unanswered'

export interface FetchInit {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  signal?: AbortSignal
}

export type MockResponse = ReturnType<typeof createResponse>

// Helper to create Response-like object
const createResponse = (data: unknown, status = 200, statusText = 'OK', url = '') => ({
  ok: status >= 200 && status < 300,
  status,
  statusText,
  headers: new Map(),
  url,
  redirected: false,
  type: 'basic' as const,
  json: async () => data,
  text: async () => JSON.stringify(data),
  blob: async () => new Blob([JSON.stringify(data)]),
  arrayBuffer: async () => new ArrayBuffer(0),
  clone: function () {
    return this
  },
})

const createErrorResponse = (status: number, statusText: string, data: unknown = {}, url = '') => {
  const response = createResponse(data, status, statusText, url)
  return Promise.resolve(response)
}

export const mockFetch = (
  url: string | { url: string },
  options?: FetchInit
): Promise<MockResponse> => {
  const urlString = typeof url === 'string' ? url : url.url
  const method = options?.method?.toUpperCase() || 'GET'

  if (method === 'GET') {
    // restcountries.com - New Zealand (exact match, to avoid 'zealands')
    if (
      (urlString.includes('restcountries.com/v3.1/name/zealand') ||
        urlString.includes('restcountries.com/v3.1/name/New%20Zealand') ||
        urlString.includes('restcountries.com/v3.1/name/New Zealand')) &&
      !urlString.includes('zealands')
    ) {
      return Promise.resolve(
        createResponse([
          {
            name: { common: 'New Zealand' },
            capital: ['Wellington'],
            tld: ['.nz'],
            region: 'Oceania',
            flag: '🇳🇿',
          },
        ])
      )
    }

    // restcountries.com - Brazil
    if (
      urlString.includes('restcountries.com/v3.1/name/brazil') ||
      urlString.includes('restcountries.com/v3.1/name/Brazil')
    ) {
      return Promise.resolve(
        createResponse([
          {
            name: { common: 'Brazil' },
            capital: ['Brasília'],
            tld: ['.br'],
            region: 'Americas',
            flag: '🇧🇷',
          },
        ])
      )
    }

    // restcountries.com - Australia
    if (
      urlString.includes('restcountries.com/v3.1/name/australia') ||
      urlString.includes('restcountries.com/v3.1/name/Australia')
    ) {
      return Promise.resolve(
        createResponse([
          {
            name: { common: 'Australia' },
            capital: ['Canberra'],
            tld: ['.au'],
            region: 'Oceania',
            flag: '🇦🇺',
          },
        ])
      )
    }

    // restcountries.com - Morocco
    if (
      urlString.includes('restcountries.com/v3.1/name/morocco') ||
      urlString.includes('restcountries.com/v3.1/name/Morocco')
    ) {
      return Promise.resolve(
        createResponse([
          {
            name: { common: 'Morocco' },
            capital: ['Rabat'],
            tld: ['.ma'],
            region: 'Africa',
            flag: '🇲🇦',
          },
        ])
      )
    }

    // restcountries.com - Russia
    if (
      urlString.includes('restcountries.com/v3.1/name/russia') ||
      urlString.includes('restcountries.com/v3.1/name/Russia')
    ) {
      return Promise.resolve(
        createResponse([
          {
            name: { common: 'Russia' },
            capital: ['Moscow'],
            tld: ['.ru'],
            region: 'Europe',
            flag: '🇷🇺',
          },
        ])
      )
    }

    // restcountries.com - Typo URL (zealands) - 404 error
    if (urlString.includes('restcountries.com/v3.1/name/zealands')) {
      return createErrorResponse(
        404,
        'Not Found',
        {
          status: 404,
          message: 'Not Found',
        },
        'https://restcountries.com/v3.1/name/zealands'
      )
    }

    // restcountries.com - India
    if (
      urlString.includes('restcountries.com/v3.1/name/india') ||
      urlString.includes('/v3.1/name/india')
    ) {
      return Promise.resolve(
        createResponse([
          {
            name: {
              nativeName: {
                hin: { official: 'भारत गणराज्य', common: 'भारत' },
              },
            },
          },
        ])
      )
    }

    // restcountries.com - Cuba
    if (urlString.includes('restcountries.com/v3.1/name/cuba')) {
      return Promise.resolve(
        createResponse([
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
        ])
      )
    }

    // restcountries.com - Nepal
    if (urlString.includes('restcountries.com/v3.1/name/nepal')) {
      return Promise.resolve(
        createResponse([
          {
            cca2: 'NP',
            name: {
              common: 'Nepal',
              official: 'Federal Democratic Republic of Nepal',
            },
          },
        ])
      )
    }

    // restcountries.com - Alpha codes (NZ)
    if (urlString.includes('restcountries.com/v3.1/alpha')) {
      return Promise.resolve(
        createResponse([
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
        ])
      )
    }

    // jsonplaceholder.typicode.com - Albums
    if (urlString.includes('jsonplaceholder.typicode.com/albums')) {
      return Promise.resolve(createResponse(albums()))
    }

    // jsonplaceholder.typicode.com - Comments
    if (urlString.includes('jsonplaceholder.typicode.com/comments')) {
      return Promise.resolve(createResponse(comments()))
    }

    // httpbin.org - GET with headers
    if (urlString.includes('httpbin.org/get')) {
      const authHeader = options?.headers?.Authorization || ''
      return Promise.resolve(
        createResponse({
          headers: { Authorization: authHeader },
        })
      )
    }

    // fakerapi.it - Random person data
    if (urlString.includes('fakerapi.it/api/v1/persons')) {
      const match = urlString.match(/_quantity=(\d+)/)
      const quantity = match ? parseInt(match[1], 10) : 1

      const firstNames = [
        'John',
        'Jane',
        'Michael',
        'Sarah',
        'David',
        'Emily',
        'James',
        'Emma',
        'Robert',
        'Olivia',
      ]
      const lastNames = [
        'Smith',
        'Johnson',
        'Williams',
        'Brown',
        'Jones',
        'Garcia',
        'Miller',
        'Davis',
        'Rodriguez',
        'Martinez',
      ]
      const genders = ['male', 'female']

      const persons = Array.from({ length: quantity }, () => ({
        id: Math.floor(Math.random() * 10000) + 1,
        firstname: firstNames[Math.floor(Math.random() * firstNames.length)],
        lastname: lastNames[Math.floor(Math.random() * lastNames.length)],
        email: `user${Math.floor(Math.random() * 10000)}@example.com`,
        phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        birthday: `19${50 + Math.floor(Math.random() * 50)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
        gender: genders[Math.floor(Math.random() * genders.length)],
        address: {
          street: `${Math.floor(Math.random() * 9999) + 1} Main St`,
          city: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'][
            Math.floor(Math.random() * 5)
          ],
          zipcode: String(Math.floor(Math.random() * 90000) + 10000),
        },
        website: `https://example${Math.floor(Math.random() * 1000)}.com`,
      }))

      return Promise.resolve(
        createResponse({
          status: 'OK',
          code: 200,
          total: quantity,
          data: persons,
        })
      )
    }

    // httpbingo.org - 403 error
    if (urlString.includes('httpbingo.org/status/403')) {
      return createErrorResponse(403, 'Forbidden', {}, 'https://httpbingo.org/status/403')
    }

    // httpbingo.org - 404 error
    if (urlString.includes('httpbingo.org/hidden-basic-auth')) {
      return createErrorResponse(
        404,
        'Not Found',
        {
          status_code: 404,
          error: 'Not Found',
        },
        'https://httpbingo.org/hidden-basic-auth/user/password'
      )
    }

    // httpstat.us - 429 error
    if (urlString.includes('httpstat.us/429')) {
      return createErrorResponse(429, 'Too Many Requests', {}, 'http://httpstat.us/429')
    }

    // Bad URL - network error
    if (urlString.includes('there-is-no-f-ing-site.com')) {
      const error = Object.assign(
        new Error(
          `request to http://there-is-no-f-ing-site.com/ failed, reason: getaddrinfo ENOTFOUND there-is-no-f-ing-site.com`
        ),
        { type: 'system', code: 'ENOTFOUND', errno: 'ENOTFOUND' }
      )
      return Promise.reject(error)
    }
  }

  if (method === 'POST') {
    // Parse body if it's a string
    let bodyData: RequestBody = {}
    if (options?.body) {
      try {
        bodyData =
          typeof options.body === 'string'
            ? JSON.parse(options.body)
            : (options.body as RequestBody)
      } catch {
        bodyData = {}
      }
    }

    // jsonplaceholder.typicode.com - Posts
    if (urlString.includes('jsonplaceholder.typicode.com/posts')) {
      return Promise.resolve(
        createResponse(
          {
            id: 101,
            ...bodyData,
          },
          201,
          'Created'
        )
      )
    }

    // countriesnow.space - Population cities
    if (urlString.includes('countriesnow.space/api/v0.1/countries/population/cities')) {
      return Promise.resolve(
        createResponse({
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
        })
      )
    }

    // reqres.in - Login (failure - missing password)
    if (urlString.includes('reqres.in/api/login') && (!bodyData || !bodyData.password)) {
      return createErrorResponse(
        400,
        'Bad Request',
        {
          error: 'Missing password',
        },
        'https://reqres.in/api/login'
      )
    }

    // reqres.in - Login (success)
    if (urlString.includes('reqres.in/api/login') && bodyData?.password) {
      return Promise.resolve(
        createResponse({
          token: 'QpwL5tke4Pnpja7X4',
        })
      )
    }

    // GraphQL - countries.trevorblades.com
    if (urlString.includes('countries.trevorblades.com')) {
      const query = bodyData?.query || ''

      // Get list of Oceania countries
      if (query.includes('continent: {eq: "OC"}')) {
        return Promise.resolve(
          createResponse({
            data: {
              countries: oceaniaCountries(),
            },
          })
        )
      }

      // Get single country by code (with emoji)
      if (
        query.includes('getCountry') ||
        (query.includes('code: {eq:') && query.includes('emoji'))
      ) {
        const code = bodyData?.variables?.code || 'NZ'
        const countryData: Record<string, { name: string; emoji: string }> = {
          NZ: { name: 'New Zealand', emoji: '🇳🇿' },
          NP: { name: 'Nepal', emoji: '🇳🇵' },
        }

        return Promise.resolve(
          createResponse({
            data: {
              countries: [countryData[code] || countryData.NZ],
            },
          })
        )
      }

      // Get capital query, answered as the axios mock answers it: only
      // 17_complexExpressions asks it, through axios in the v2 tests, and
      // the differential sends every request through this mock
      if (query.includes('capital')) {
        const code = bodyData?.variables?.code || 'NZ'
        const capitalData: Record<string, string[]> = {
          NZ: ['Wellington'],
          NP: ['Kathmandu'],
        }

        return Promise.resolve(
          createResponse({
            data: {
              countries: capitalData[code] || capitalData.NZ,
            },
          })
        )
      }
    }

    // GraphQL - api.github.com, which only the axios mock answered in the v2
    // tests; the differential sends every request through this mock
    if (urlString.includes('api.github.com/graphql')) {
      const query = bodyData?.query || ''

      // Get repository info
      if (query.includes('repository')) {
        return Promise.resolve(
          createResponse({
            data: {
              viewer: {
                login: 'CarlosNZ',
                repository: {
                  description: 'A highly configurable custom expression tree evaluator',
                },
              },
            },
          })
        )
      }
    }
  }

  return Promise.reject(unanswered(`Unmocked fetch: ${method} ${urlString}`))
}

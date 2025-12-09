// Mock implementation of node-fetch for testing
// This prevents actual HTTP requests and returns predefined responses

const albumTitles = [
  'quidem molestiae enim',
  'sunt qui excepturi placeat culpa',
  'omnis laborum odio',
  'non esse culpa molestiae omnis sed optio',
  'eaque aut omnis a',
  'natus impedit quibusdam illo est',
  'quibusdam autem aliquid et et quia',
  'qui fuga est a eum',
  'saepe unde necessitatibus rem',
  'distinctio laborum qui',
  'quam nostrum impedit mollitia quod et dolor',
  'consequatur autem doloribus natus consectetur',
  'ab rerum non rerum consequatur ut ea unde',
  'ducimus molestias eos animi atque nihil',
  'ut pariatur rerum ipsum natus repellendus praesentium',
  'voluptatem aut maxime inventore autem magnam atque repellat',
  'aut minima voluptatem ut velit',
  'nesciunt quia et doloremque',
  'velit pariatur quaerat similique libero omnis quia',
  'voluptas rerum iure ut enim',
  'repudiandae voluptatem optio est consequatur rem in temporibus et',
  'et rem non provident vel ut',
  'incidunt quisquam hic adipisci sequi',
  'dolores ut et facere placeat',
  'vero maxime id possimus sunt neque et consequatur',
  'quibusdam saepe ipsa vel harum',
  'id non nostrum expedita',
  'omnis neque exercitationem sed dolor atque maxime aut cum',
  'inventore ut quasi magnam itaque est fugit',
  'tempora assumenda et similique odit distinctio error',
  'adipisci laborum fuga laboriosam',
  'reiciendis dolores a ut qui debitis non quo labore',
  'iste eos nostrum',
  'cumque voluptatibus rerum architecto blanditiis',
  'et impedit nisi quae magni necessitatibus sed aut pariatur',
  'nihil cupiditate voluptate neque',
  'est placeat dicta ut nisi rerum iste',
  'unde a sequi id',
  'ratione porro illum labore eum aperiam sed',
  'voluptas neque et sint aut quo odit',
  'ea voluptates maiores eos accusantium officiis tempore mollitia consequatur',
  'tenetur explicabo ea',
  'aperiam doloremque nihil',
  'sapiente cum numquam officia consequatur vel natus quos suscipit',
  'tenetur quos ea unde est enim corrupti qui',
  'molestiae voluptate non',
  'temporibus molestiae aut',
  'modi consequatur culpa aut quam soluta alias perspiciatis laudantium',
  'ut aut vero repudiandae voluptas ullam voluptas at consequatur',
  'sed qui sed quas sit ducimus dolor',
  'odit laboriosam sint quia cupiditate animi quis',
  'necessitatibus quas et sunt at voluptatem',
  'est vel sequi voluptatem nemo quam molestiae modi enim',
  'aut non illo amet perferendis',
  'qui culpa itaque omnis in nesciunt architecto error',
  'omnis qui maiores tempora officiis omnis rerum sed repellat',
  'libero excepturi voluptatem est architecto quae voluptatum officia tempora',
  'nulla illo consequatur aspernatur veritatis aut error delectus et',
  'eligendi similique provident nihil',
  'omnis mollitia sunt aliquid eum consequatur fugit minus laudantium',
  'delectus iusto et',
  'eos ea non recusandae iste ut quasi',
  'velit est quam',
  'autem voluptatem amet iure quae',
  'voluptates delectus iure iste qui',
  'velit sed quia dolor dolores delectus',
  'ad voluptas nostrum et nihil',
  'qui quasi nihil aut voluptatum sit dolore minima',
  'qui aut est',
  'et deleniti unde',
  'et vel corporis',
  'unde exercitationem ut',
  'quos omnis officia',
  'quia est eius vitae dolor',
  'aut quia expedita non',
  'dolorem magnam facere itaque ut reprehenderit tenetur corrupti',
  'cupiditate sapiente maiores iusto ducimus cum excepturi veritatis quia',
  'est minima eius possimus ea ratione velit et',
  'ipsa quae voluptas natus ut suscipit soluta quia quidem',
  'id nihil reprehenderit',
  'quibusdam sapiente et',
  'recusandae consequatur vel amet unde',
  'aperiam odio fugiat',
  'est et at eos expedita',
  'qui voluptatem consequatur aut ab quis temporibus praesentium',
  'eligendi mollitia alias aspernatur vel ut iusto',
  'aut aut architecto',
  'quas perspiciatis optio',
  'sit optio id voluptatem est eum et',
  'est vel dignissimos',
  'repellendus praesentium debitis officiis',
  'incidunt et et eligendi assumenda soluta quia recusandae',
  'nisi qui dolores perspiciatis',
  'quisquam a dolores et earum vitae',
  'consectetur vel rerum qui aperiam modi eos aspernatur ipsa',
  'unde et ut molestiae est molestias voluptatem sint',
  'est quod aut',
  'omnis quia possimus nesciunt deleniti assumenda sed autem',
  'consectetur ut id impedit dolores sit ad ex aut',
  'enim repellat iste',
]

// Helper to create Response-like object
const createResponse = (data: any, status = 200, statusText = 'OK', url = '') => ({
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

const createErrorResponse = (status: number, statusText: string, data: any = {}, url = '') => {
  const response = createResponse(data, status, statusText, url)
  return Promise.resolve(response)
}

const mockFetch: any = jest.fn((url: string | Request, options?: any) => {
  const urlString = typeof url === 'string' ? url : url.url
  const method = options?.method?.toUpperCase() || 'GET'

  if (method === 'GET') {
    // restcountries.com - New Zealand (exact match to avoid matching 'zealands')
    if (
      urlString.includes('restcountries.com/v3.1/name/zealand') &&
      !urlString.includes('zealands')
    ) {
      return Promise.resolve(createResponse([{ name: { common: 'New Zealand' } }]))
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

    // jsonplaceholder.typicode.com - Albums
    if (urlString.includes('jsonplaceholder.typicode.com/albums')) {
      return Promise.resolve(
        createResponse(
          albumTitles.map((title, index) => ({ id: index + 1, userId: (index % 10) + 1, title }))
        )
      )
    }

    // jsonplaceholder.typicode.com - Comments
    if (urlString.includes('jsonplaceholder.typicode.com/comments')) {
      return Promise.resolve(
        createResponse([
          {
            postId: 1,
            id: 1,
            name: 'id labore ex et quam laborum',
            email: 'Eliseo@gardner.biz',
            body: 'laudantium enim quasi est quidem magnam voluptate ipsam eos\ntempora quo necessitatibus\ndolor quam autem quasi\nreiciendis et nam sapiente accusantium',
          },
          {
            postId: 1,
            id: 2,
            name: 'quo vero reiciendis velit similique earum',
            email: 'Jayne_Kuhic@sydney.com',
            body: 'est natus enim nihil est dolore omnis voluptatem numquam\net omnis occaecati quod ullam at\nvoluptatem error expedita pariatur\nnihil sint nostrum voluptatem reiciendis et',
          },
          {
            postId: 1,
            id: 3,
            name: 'odio adipisci rerum aut animi',
            email: 'Nikita@garfield.biz',
            body: 'quia molestiae reprehenderit quasi aspernatur\naut expedita occaecati aliquam eveniet laudantium\nomnis quibusdam delectus saepe quia accusamus maiores nam est\ncum et ducimus et vero voluptates excepturi deleniti ratione',
          },
          {
            postId: 1,
            id: 4,
            name: 'alias odio sit',
            email: 'Lew@alysha.tv',
            body: 'non et atque\noccaecati deserunt quas accusantium unde odit nobis qui voluptatem\nquia voluptas consequuntur itaque dolor\net qui rerum deleniti ut occaecati',
          },
          {
            postId: 1,
            id: 5,
            name: 'vero eaque aliquid doloribus et culpa',
            email: 'Hayden@althea.biz',
            body: 'harum non quasi et ratione\ntempore iure ex voluptates in ratione\nharum architecto fugit inventore cupiditate\nvoluptates magni quo et',
          },
        ])
      )
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
      const error: any = new Error(
        `request to http://there-is-no-f-ing-site.com/ failed, reason: getaddrinfo ENOTFOUND there-is-no-f-ing-site.com`
      )
      error.type = 'system'
      error.code = 'ENOTFOUND'
      error.errno = 'ENOTFOUND'
      return Promise.reject(error)
    }
  }

  if (method === 'POST') {
    // Parse body if it's a string
    let bodyData: any = {}
    if (options?.body) {
      try {
        bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : options.body
      } catch (e) {
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
  }

  return Promise.reject(new Error(`Unmocked fetch: ${method} ${urlString}`))
})

// Add fetch-related properties that might be used
mockFetch.isRedirect = jest.fn()
mockFetch.Response = class Response {}
mockFetch.Headers = class Headers {}
mockFetch.Request = class Request {}

export default mockFetch

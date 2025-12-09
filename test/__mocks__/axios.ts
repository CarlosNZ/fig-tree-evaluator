// Mock implementation of axios for testing
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

const mockAxios: any = jest.fn((config: any) => {
  // Handle axios(config) style calls
  const method = (config.method || 'get').toUpperCase()
  const url = config.url || ''

  if (method === 'GET') {
    return mockAxios.get(url, config)
  } else if (method === 'POST') {
    return mockAxios.post(url, config.data, config)
  }

  return Promise.reject(new Error(`Unmocked axios call: ${method} ${url}`))
})

// GET requests
mockAxios.get = jest.fn((url: string, config?: any) => {
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
    const error: any = new Error('Request failed with status code 404')
    error.name = 'AxiosError'
    error.response = {
      status: 404,
      statusText: 'Not Found',
      data: {
        status: 404,
        message: 'Not Found',
      },
      headers: {},
      config,
    }
    error.isAxiosError = true
    error.config = config
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
      data: albumTitles.map((title, index) => ({ id: index + 1, userId: (index % 10) + 1, title })),
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }

  // jsonplaceholder.typicode.com - Comments
  if (url.includes('jsonplaceholder.typicode.com/comments')) {
    return Promise.resolve({
      data: [
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
      ],
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
    const error: any = new Error('Request failed with status code 403')
    error.name = 'AxiosError'
    error.response = {
      status: 403,
      statusText: 'Forbidden',
      data: {},
      headers: {},
      config,
    }
    error.isAxiosError = true
    error.config = config
    return Promise.reject(error)
  }

  // httpbingo.org - 404 error
  if (url.includes('httpbingo.org/hidden-basic-auth')) {
    const error: any = new Error('Request failed with status code 404')
    error.name = 'AxiosError'
    error.response = {
      status: 404,
      statusText: 'Not Found',
      data: {
        status_code: 404,
        error: 'Not Found',
      },
      headers: {},
      config,
    }
    error.isAxiosError = true
    error.config = config
    return Promise.reject(error)
  }

  // httpstat.us - 429 error
  if (url.includes('httpstat.us/429')) {
    const error: any = new Error('Request failed with status code 429')
    error.response = {
      status: 429,
      statusText: 'Too Many Requests',
      data: {},
      headers: {},
      config,
    }
    error.isAxiosError = true
    error.config = config
    return Promise.reject(error)
  }

  // Bad URL - network error
  if (url.includes('there-is-no-f-ing-site.com')) {
    const error: any = new Error('getaddrinfo ENOTFOUND there-is-no-f-ing-site.com')
    error.isAxiosError = true
    error.config = config
    error.code = 'ENOTFOUND'
    return Promise.reject(error)
  }

  return Promise.reject(new Error(`Unmocked GET URL: ${url}`))
})

// POST requests
mockAxios.post = jest.fn((url: string, data?: any, config?: any) => {
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
    const error: any = new Error('Request failed with status code 400')
    error.name = 'AxiosError'
    error.response = {
      status: 400,
      statusText: 'Bad Request',
      data: {
        error: 'Missing password',
      },
      headers: {},
      config,
    }
    error.isAxiosError = true
    error.config = config
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
            countries: [
              { name: 'American Samoa' },
              { name: 'Australia' },
              { name: 'Cook Islands' },
              { name: 'Fiji' },
              { name: 'Micronesia' },
              { name: 'Guam' },
              { name: 'Kiribati' },
              { name: 'Marshall Islands' },
              { name: 'Northern Mariana Islands' },
              { name: 'New Caledonia' },
              { name: 'Norfolk Island' },
              { name: 'Nauru' },
              { name: 'Niue' },
              { name: 'New Zealand' },
              { name: 'French Polynesia' },
              { name: 'Papua New Guinea' },
              { name: 'Pitcairn Islands' },
              { name: 'Palau' },
              { name: 'Solomon Islands' },
              { name: 'Tokelau' },
              { name: 'East Timor' },
              { name: 'Tonga' },
              { name: 'Tuvalu' },
              { name: 'U.S. Minor Outlying Islands' },
              { name: 'Vanuatu' },
              { name: 'Wallis and Futuna' },
              { name: 'Samoa' },
            ],
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

  return Promise.reject(new Error(`Unmocked POST URL: ${url}`))
})

// Other axios methods (not used in tests but added for completeness)
mockAxios.put = jest.fn()
mockAxios.patch = jest.fn()
mockAxios.delete = jest.fn()
mockAxios.head = jest.fn()
mockAxios.options = jest.fn()
mockAxios.request = jest.fn()

// Axios static properties
mockAxios.defaults = {
  headers: {
    common: {},
    get: {},
    post: {},
    put: {},
    patch: {},
    delete: {},
  },
}

mockAxios.interceptors = {
  request: {
    use: jest.fn(),
    eject: jest.fn(),
  },
  response: {
    use: jest.fn(),
    eject: jest.fn(),
  },
}

mockAxios.create = jest.fn(() => mockAxios)
mockAxios.isAxiosError = jest.fn((error: any) => error?.isAxiosError === true)
mockAxios.Cancel = jest.fn()
mockAxios.CancelToken = {
  source: jest.fn(() => ({
    token: {},
    cancel: jest.fn(),
  })),
}
mockAxios.isCancel = jest.fn()
mockAxios.all = jest.fn(Promise.all.bind(Promise))
mockAxios.spread = jest.fn((callback: any) => callback)

export default mockAxios

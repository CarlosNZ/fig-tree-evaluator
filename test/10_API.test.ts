import axios from 'axios'
import fetch from 'node-fetch'
import { FigTreeEvaluator } from './evaluator'
import { FetchClient, AxiosClient } from '../src'

const exp = new FigTreeEvaluator({ returnErrorAsString: true, httpClient: AxiosClient(axios) })

const expFetch = new FigTreeEvaluator({
  returnErrorAsString: true,
  httpClient: FetchClient(fetch),
})

// GET

test.concurrent('GET: Fetch a country', async () => {
  const expression = {
    operator: 'GET',
    children: ['https://restcountries.com/v3.1/name/zealand', [], 'name.common'],
    type: 'string',
  }
  const result = await exp.evaluate(expression)
  expect(result).toBe('New Zealand')

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toBe('New Zealand')
})

test.concurrent('GET: Fetch a country, using properties', async () => {
  const expression = {
    operator: 'GET',
    url: 'https://restcountries.com/v3.1/name/zealand',
    returnProperty: 'name.common',
    type: 'string',
  }
  const result = await exp.evaluate(expression)
  expect(result).toBe('New Zealand')

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toBe('New Zealand')
})

test.concurrent('GET: Fetch a country with params', async () => {
  const expression = {
    operator: 'Get',
    children: [
      { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'india'] },
      ['fullText'],
      'true',
      '[0].name.nativeName.hin',
    ],
  }
  const result = await exp.evaluate(expression)
  expect(result).toStrictEqual({
    official: 'भारत गणराज्य',
    common: 'भारत',
  })

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toStrictEqual({
    official: 'भारत गणराज्य',
    common: 'भारत',
  })
})

test.concurrent('GET: Fetch a country with params, using props', async () => {
  const expression = {
    operator: 'get',
    endpoint: { operator: '+', values: ['https://restcountries.com/v3.1/name/', 'india'] },
    parameters: { fullText: true },
    outputProperty: '[0].name.nativeName.hin',
  }
  const result = await exp.evaluate(expression)
  expect(result).toStrictEqual({ official: 'भारत गणराज्य', common: 'भारत' })

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toStrictEqual({ official: 'भारत गणराज्य', common: 'भारत' })
})

test.concurrent('GET: Return an array of titles plucked from inside array of objects', async () => {
  const expression = {
    operator: 'api',
    children: ['https://jsonplaceholder.typicode.com/albums', [], 'title'],
  }
  const expectedResult = [
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
  const result = await exp.evaluate(expression)
  expect(result).toStrictEqual(expectedResult)

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toStrictEqual(expectedResult)
})

test.concurrent('GET: Fetch comments by post ID, no return prop', async () => {
  const expression = {
    operator: 'API',
    url: 'https://jsonplaceholder.typicode.com/comments',
    parameters: { postId: 1 },
  }
  const expectedResult = [
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
  ]
  const result = await exp.evaluate(expression)
  expect(result).toStrictEqual(expectedResult)

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toStrictEqual(expectedResult)
})

test.concurrent('GET: Fetch a country with multiple params', async () => {
  const expression = {
    operator: 'get',
    children: [
      { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'cuba'] },
      ['fullText', 'fields'],
      'true',
      'name,capital,flag',
    ],
  }
  const expectedResult = [
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
      // altSpellings: ['CU', 'Republic of Cuba', 'República de Cuba'],
      flag: '🇨🇺',
    },
  ]
  const result = await exp.evaluate(expression)
  expect(result).toStrictEqual(expectedResult)

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toStrictEqual(expectedResult)
})

test.concurrent('GET: Fetch a country with multiple params, using props', async () => {
  const expression = {
    operator: 'API',
    url: { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'cuba'] },
    parameters: { fullText: true, fields: 'name,capital,flag' },
  }
  const expectedResult = [
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
      // altSpellings: ['CU', 'Republic of Cuba', 'República de Cuba'],
      flag: '🇨🇺',
    },
  ]
  const result = await exp.evaluate(expression)
  expect(result).toStrictEqual(expectedResult)

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toStrictEqual(expectedResult)
})

test.concurrent(
  'GET: Fetch a country with multiple params, with nested buildObject for parameters',
  async () => {
    const expression = {
      operator: 'API',
      url: { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'cuba'] },
      parameters: {
        operator: 'buildObject',
        properties: [
          { key: 'fullText', value: true },
          { key: 'fields', value: 'name,capital,flag' },
        ],
      },
    }
    const expectedResult = [
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
        // altSpellings: ['CU', 'Republic of Cuba', 'República de Cuba'],
        flag: '🇨🇺',
      },
    ]
    const result = await exp.evaluate(expression)
    expect(result).toStrictEqual(expectedResult)

    const resultFetch = await expFetch.evaluate(expression)
    expect(resultFetch).toStrictEqual(expectedResult)
  }
)

test.concurrent('POST: Fetch city data with city param as FigTree expression', async () => {
  const expression = {
    operator: 'post',
    url: 'https://countriesnow.space/api/v0.1/countries/population/cities',
    returnProperty: 'data.populationCounts[0]',
    parameters: {
      city: {
        $getData: 'country.city',
      },
    },
  }
  const expectedResult = {
    year: '2013',
    value: '204000',
    sex: 'Both Sexes',
    reliabilty: 'Final figure, complete',
  }
  const result = await exp.evaluate(expression, {
    data: { country: { city: 'Wellington' } },
    // evaluateFullObject: true,
  })
  expect(result).toStrictEqual(expectedResult)
})

test.concurrent('GET: Inspect authorization headers', async () => {
  const expression = {
    operator: 'API',
    url: 'https://httpbin.org/get',
    returnProperty: 'headers.Authorization',
  }
  const options = {
    headers: {
      Authorization:
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJwb3N0Z3JhcGhpbGUiLCJ1c2VySWQiOjEyLCJzZXNzaW9uSWQiOiJpVzZ5SmR4cE9DeG9yVTl2IiwiaXNBZG1pbiI6ZmFsc2UsInBwMiI6InQiLCJwcDJfdGVtcGxhdGVfaWRzIjoiMSw3LDgsMjgsMzcsMjcsMzAsMjUsMjksMzEsMzMsMzkiLCJpYXQiOjE2NTE4MDgxMDd9.hkYOWbL1pVY_gwQ0QEnK4LirKO180LqeeBQC-U9zeQE',
    },
  }
  const expectedResult =
    'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJwb3N0Z3JhcGhpbGUiLCJ1c2VySWQiOjEyLCJzZXNzaW9uSWQiOiJpVzZ5SmR4cE9DeG9yVTl2IiwiaXNBZG1pbiI6ZmFsc2UsInBwMiI6InQiLCJwcDJfdGVtcGxhdGVfaWRzIjoiMSw3LDgsMjgsMzcsMjcsMzAsMjUsMjksMzEsMzMsMzkiLCJpYXQiOjE2NTE4MDgxMDd9.hkYOWbL1pVY_gwQ0QEnK4LirKO180LqeeBQC-U9zeQE'

  const result = await exp.evaluate(expression, options)
  expect(result).toBe(expectedResult)

  const resultFetch = await expFetch.evaluate(expression, options)
  expect(resultFetch).toBe(expectedResult)
})

// POST
test.concurrent('POST: Publish a blog post', async () => {
  const expression = {
    operator: 'post',
    children: [
      'https://jsonplaceholder.typicode.com/posts',
      ['title', 'body', 'userId'],
      'Episode IV: A New Hope',
      'It is a period of civil war. Rebel spaceships, striking from a hidden base, have won their first victory against the evil Galactic Empire. During the battle, Rebel spies managed to steal secret plans to the Empire’s ultimate weapon, the DEATH STAR, an armored space station with enough power to destroy an entire planet...',
      2,
    ],
  }
  const expectedResult = {
    title: 'Episode IV: A New Hope',
    body: 'It is a period of civil war. Rebel spaceships, striking from a hidden base, have won their first victory against the evil Galactic Empire. During the battle, Rebel spies managed to steal secret plans to the Empire’s ultimate weapon, the DEATH STAR, an armored space station with enough power to destroy an entire planet...',
    userId: 2,
    id: 101,
  }

  const result = await exp.evaluate(expression)
  expect(result).toStrictEqual(expectedResult)

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toStrictEqual(expectedResult)
})

test.concurrent('POST: Unsuccessful login, using properties', async () => {
  const expression = {
    operator: 'POST',
    url: 'https://reqres.in/api/login',
    parameters: { email: 'eve.holt@reqres.in' },
    headers: { 'x-api-key': 'reqres-free-v1' },
  }
  const result = await exp.evaluate(expression)
  expect(result).toBe(`Operator: POST - AxiosError
Request failed with status code 400
{
  "status": 400,
  "error": "Bad Request",
  "url": "https://reqres.in/api/login",
  "response": {
    "error": "Missing password"
  }
}`)

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toBe(`Operator: POST - FetchError
Problem with POST request
{
  "status": 400,
  "error": "Bad Request",
  "url": "https://reqres.in/api/login",
  "response": {
    "error": "Missing password"
  }
}`)
})

test.concurrent('POST: Successful login, using parameters from (nested) buildObject', async () => {
  const expression = {
    operator: 'POST',
    url: 'https://reqres.in/api/login',
    parameters: {
      operator: 'buildObject',
      properties: [
        { key: 'email', value: 'eve.holt@reqres.in' },
        { key: { operator: '+', values: ['pass', 'word'] }, value: 'cityslicka' },
      ],
    },
  }

  const result = await exp.evaluate(expression, { headers: { 'x-api-key': 'reqres-free-v1' } })
  expect(result).toStrictEqual({ token: 'QpwL5tke4Pnpja7X4' })

  const resultFetch = await expFetch.evaluate(expression, {
    headers: { 'x-api-key': 'reqres-free-v1' },
  })
  expect(resultFetch).toStrictEqual({ token: 'QpwL5tke4Pnpja7X4' })
})

// HTTP Error codes using https://httpbingo.org etc.
test.concurrent('GET: 403 error', async () => {
  const expression = {
    operator: 'API',
    url: 'https://httpbingo.org/status/403',
  }
  const result = await exp.evaluate(expression)
  expect(result).toBe(`Operator: GET - AxiosError
Request failed with status code 403
{
  "status": 403,
  "error": "Forbidden",
  "url": "https://httpbingo.org/status/403",
  "response": {}
}`)

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toBe(`Operator: GET - FetchError
Problem with GET request
{
  "status": 403,
  "error": "Forbidden",
  "url": "https://httpbingo.org/status/403",
  "response": {}
}`)
})

test.concurrent('GET: 404 error', async () => {
  const expression = {
    operator: 'API',
    url: 'https://httpbingo.org/hidden-basic-auth/user/password',
  }
  const result = await exp.evaluate(expression)
  expect(result).toBe(`Operator: GET - AxiosError
Request failed with status code 404
{
  "status": 404,
  "error": "Not Found",
  "url": "https://httpbingo.org/hidden-basic-auth/user/password",
  "response": {
    "status_code": 404,
    "error": "Not Found"
  }
}`)

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toBe(`Operator: GET - FetchError
Problem with GET request
{
  "status": 404,
  "error": "Not Found",
  "url": "https://httpbingo.org/hidden-basic-auth/user/password",
  "response": {
    "status_code": 404,
    "error": "Not Found"
  }
}`)
})

test.concurrent('GET: 429 Error with fallback', async () => {
  const expression = {
    operator: 'API',
    url: 'http://httpstat.us/429',
    fallback: 'There was a problem',
  }
  const result = await exp.evaluate(expression)
  expect(result).toBe('There was a problem')

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toBe('There was a problem')
})

test.concurrent('GET: Bad url', async () => {
  const expression = {
    operator: 'API',
    url: 'http://there-is-no-f-ing-site.com',
  }
  const result = await exp.evaluate(expression)
  expect(result).toBe(
    'Operator: GET\nNetwork error: getaddrinfo ENOTFOUND there-is-no-f-ing-site.com'
  )

  const resultFetch = await expFetch.evaluate(expression)
  // This is different in browser vs node-fetch
  expect(resultFetch).toBe(
    'Operator: GET\nrequest to http://there-is-no-f-ing-site.com/ failed, reason: getaddrinfo ENOTFOUND there-is-no-f-ing-site.com'
  )
})

// Using baseUrl

test('GET: Fetch a country with params, using props', async () => {
  exp.updateOptions({ baseEndpoint: 'https://restcountries.com/' })
  expFetch.updateOptions({ baseEndpoint: 'https://restcountries.com/' })
  const expression = {
    operator: 'get',
    endpoint: { operator: '+', values: ['/v3.1/name/', 'india'] },
    parameters: { fullText: true },
    outputProperty: '[0].name.nativeName.hin',
  }

  const result = await exp.evaluate(expression)
  expect(result).toStrictEqual({ official: 'भारत गणराज्य', common: 'भारत' })

  const resultFetch = await expFetch.evaluate(expression)
  expect(resultFetch).toStrictEqual({ official: 'भारत गणराज्य', common: 'भारत' })
})

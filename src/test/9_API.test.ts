import fetch from 'node-fetch'
import ExpressionEvaluator, { evaluateExpression } from '../evaluator'

const exp = new ExpressionEvaluator({ APIfetch: fetch })

// GET

test.concurrent('GET: Fetch a country', () => {
  const expression = {
    operator: 'GET',
    children: ['https://restcountries.com/v3.1/name/zealand', [], 'name.common'],
    type: 'string',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('New Zealand')
  })
})

test.concurrent('GET: Fetch a country, using properties', () => {
  const expression = {
    operator: 'GET',
    url: 'https://restcountries.com/v3.1/name/zealand',
    returnProperty: 'name.common',
    type: 'string',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('New Zealand')
  })
})

test.concurrent('GET: Fetch a country with params', () => {
  const expression = {
    operator: 'Get',
    children: [
      { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'india'] },
      ['fullText'],
      'true',
      '[0].name.nativeName.hin',
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual({
      official: 'भारत गणराज्य',
      common: 'भारत',
    })
  })
})

test.concurrent('GET: Fetch a country with params, using props', () => {
  const expression = {
    operator: 'get',
    endpoint: { operator: '+', values: ['https://restcountries.com/v3.1/name/', 'india'] },
    parameters: { fullText: true },
    outputProperty: '[0].name.nativeName.hin',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual({ official: 'भारत गणराज्य', common: 'भारत' })
  })
})

test.concurrent('GET: Return an array of titles plucked from inside array of objects', () => {
  const expression = {
    operator: 'api',
    children: ['https://jsonplaceholder.typicode.com/albums', [], 'title'],
  }
  return exp.evaluate(expression).then((result: any) => {
    // prettier-ignore
    expect(result).toStrictEqual(["quidem molestiae enim", "sunt qui excepturi placeat culpa", "omnis laborum odio", "non esse culpa molestiae omnis sed optio", "eaque aut omnis a", "natus impedit quibusdam illo est", "quibusdam autem aliquid et et quia", "qui fuga est a eum", "saepe unde necessitatibus rem", "distinctio laborum qui", "quam nostrum impedit mollitia quod et dolor", "consequatur autem doloribus natus consectetur", "ab rerum non rerum consequatur ut ea unde", "ducimus molestias eos animi atque nihil", "ut pariatur rerum ipsum natus repellendus praesentium", "voluptatem aut maxime inventore autem magnam atque repellat", "aut minima voluptatem ut velit", "nesciunt quia et doloremque", "velit pariatur quaerat similique libero omnis quia", "voluptas rerum iure ut enim", "repudiandae voluptatem optio est consequatur rem in temporibus et", "et rem non provident vel ut", "incidunt quisquam hic adipisci sequi", "dolores ut et facere placeat", "vero maxime id possimus sunt neque et consequatur", "quibusdam saepe ipsa vel harum", "id non nostrum expedita", "omnis neque exercitationem sed dolor atque maxime aut cum", "inventore ut quasi magnam itaque est fugit", "tempora assumenda et similique odit distinctio error", "adipisci laborum fuga laboriosam", "reiciendis dolores a ut qui debitis non quo labore", "iste eos nostrum", "cumque voluptatibus rerum architecto blanditiis", "et impedit nisi quae magni necessitatibus sed aut pariatur", "nihil cupiditate voluptate neque", "est placeat dicta ut nisi rerum iste", "unde a sequi id", "ratione porro illum labore eum aperiam sed", "voluptas neque et sint aut quo odit", "ea voluptates maiores eos accusantium officiis tempore mollitia consequatur", "tenetur explicabo ea", "aperiam doloremque nihil", "sapiente cum numquam officia consequatur vel natus quos suscipit", "tenetur quos ea unde est enim corrupti qui", "molestiae voluptate non", "temporibus molestiae aut", "modi consequatur culpa aut quam soluta alias perspiciatis laudantium", "ut aut vero repudiandae voluptas ullam voluptas at consequatur", "sed qui sed quas sit ducimus dolor", "odit laboriosam sint quia cupiditate animi quis", "necessitatibus quas et sunt at voluptatem", "est vel sequi voluptatem nemo quam molestiae modi enim", "aut non illo amet perferendis", "qui culpa itaque omnis in nesciunt architecto error", "omnis qui maiores tempora officiis omnis rerum sed repellat", "libero excepturi voluptatem est architecto quae voluptatum officia tempora", "nulla illo consequatur aspernatur veritatis aut error delectus et", "eligendi similique provident nihil", "omnis mollitia sunt aliquid eum consequatur fugit minus laudantium", "delectus iusto et", "eos ea non recusandae iste ut quasi", "velit est quam", "autem voluptatem amet iure quae", "voluptates delectus iure iste qui", "velit sed quia dolor dolores delectus", "ad voluptas nostrum et nihil", "qui quasi nihil aut voluptatum sit dolore minima", "qui aut est", "et deleniti unde", "et vel corporis", "unde exercitationem ut", "quos omnis officia", "quia est eius vitae dolor", "aut quia expedita non", "dolorem magnam facere itaque ut reprehenderit tenetur corrupti", "cupiditate sapiente maiores iusto ducimus cum excepturi veritatis quia", "est minima eius possimus ea ratione velit et", "ipsa quae voluptas natus ut suscipit soluta quia quidem", "id nihil reprehenderit", "quibusdam sapiente et", "recusandae consequatur vel amet unde", "aperiam odio fugiat", "est et at eos expedita", "qui voluptatem consequatur aut ab quis temporibus praesentium", "eligendi mollitia alias aspernatur vel ut iusto", "aut aut architecto", "quas perspiciatis optio", "sit optio id voluptatem est eum et", "est vel dignissimos", "repellendus praesentium debitis officiis", "incidunt et et eligendi assumenda soluta quia recusandae", "nisi qui dolores perspiciatis", "quisquam a dolores et earum vitae", "consectetur vel rerum qui aperiam modi eos aspernatur ipsa", "unde et ut molestiae est molestias voluptatem sint", "est quod aut", "omnis quia possimus nesciunt deleniti assumenda sed autem", "consectetur ut id impedit dolores sit ad ex aut", "enim repellat iste"])
  })
})

test.concurrent('GET: Fetch comments by post ID, no return prop', () => {
  const expression = {
    operator: 'API',
    url: 'https://jsonplaceholder.typicode.com/comments',
    parameters: { postId: 1 },
  }
  return exp.evaluate(expression).then((result: any) => {
    //  prettier-ignore
    expect(result).toStrictEqual([{"postId":1,"id":1,"name":"id labore ex et quam laborum","email":"Eliseo@gardner.biz","body":"laudantium enim quasi est quidem magnam voluptate ipsam eos\ntempora quo necessitatibus\ndolor quam autem quasi\nreiciendis et nam sapiente accusantium"},{"postId":1,"id":2,"name":"quo vero reiciendis velit similique earum","email":"Jayne_Kuhic@sydney.com","body":"est natus enim nihil est dolore omnis voluptatem numquam\net omnis occaecati quod ullam at\nvoluptatem error expedita pariatur\nnihil sint nostrum voluptatem reiciendis et"},{"postId":1,"id":3,"name":"odio adipisci rerum aut animi","email":"Nikita@garfield.biz","body":"quia molestiae reprehenderit quasi aspernatur\naut expedita occaecati aliquam eveniet laudantium\nomnis quibusdam delectus saepe quia accusamus maiores nam est\ncum et ducimus et vero voluptates excepturi deleniti ratione"},{"postId":1,"id":4,"name":"alias odio sit","email":"Lew@alysha.tv","body":"non et atque\noccaecati deserunt quas accusantium unde odit nobis qui voluptatem\nquia voluptas consequuntur itaque dolor\net qui rerum deleniti ut occaecati"},{"postId":1,"id":5,"name":"vero eaque aliquid doloribus et culpa","email":"Hayden@althea.biz","body":"harum non quasi et ratione\ntempore iure ex voluptates in ratione\nharum architecto fugit inventore cupiditate\nvoluptates magni quo et"}])
  })
})

test.concurrent('GET: Fetch a country with multiple params', () => {
  const expression = {
    operator: 'get',
    children: [
      { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'cuba'] },
      ['fullText', 'fields'],
      'true',
      'name,capital,flag',
    ],
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual([
      {
        name: {
          common: 'Cuba',
          official: 'Republic of Cuba',
          nativeName: { spa: { official: 'República de Cuba', common: 'Cuba' } },
        },
        capital: ['Havana'],
        flag: '🇨🇺',
      },
    ])
  })
})

test.concurrent('GET: Fetch a country with multiple params, using props', () => {
  const expression = {
    operator: 'API',
    url: { operator: '+', children: ['https://restcountries.com/v3.1/name/', 'cuba'] },
    parameters: { fullText: true, fields: 'name,capital,flag' },
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual([
      {
        name: {
          common: 'Cuba',
          official: 'Republic of Cuba',
          nativeName: { spa: { official: 'República de Cuba', common: 'Cuba' } },
        },
        capital: ['Havana'],
        flag: '🇨🇺',
      },
    ])
  })
})

test.concurrent(
  'GET: Fetch a country with multiple params, with nested buildObject for parameters',
  () => {
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
    return exp.evaluate(expression).then((result: any) => {
      expect(result).toStrictEqual([
        {
          name: {
            common: 'Cuba',
            official: 'Republic of Cuba',
            nativeName: { spa: { official: 'República de Cuba', common: 'Cuba' } },
          },
          capital: ['Havana'],
          flag: '🇨🇺',
        },
      ])
    })
  }
)

test.concurrent('GET: Inspect authorization headers', () => {
  const expression = {
    operator: 'API',
    url: 'https://httpbin.org/get',
    returnProperty: 'headers.Authorization',
  }
  return exp
    .evaluate(expression, {
      headers: {
        Authorization:
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJwb3N0Z3JhcGhpbGUiLCJ1c2VySWQiOjEyLCJzZXNzaW9uSWQiOiJpVzZ5SmR4cE9DeG9yVTl2IiwiaXNBZG1pbiI6ZmFsc2UsInBwMiI6InQiLCJwcDJfdGVtcGxhdGVfaWRzIjoiMSw3LDgsMjgsMzcsMjcsMzAsMjUsMjksMzEsMzMsMzkiLCJpYXQiOjE2NTE4MDgxMDd9.hkYOWbL1pVY_gwQ0QEnK4LirKO180LqeeBQC-U9zeQE',
      },
    })
    .then((result: any) => {
      expect(result).toBe(
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJwb3N0Z3JhcGhpbGUiLCJ1c2VySWQiOjEyLCJzZXNzaW9uSWQiOiJpVzZ5SmR4cE9DeG9yVTl2IiwiaXNBZG1pbiI6ZmFsc2UsInBwMiI6InQiLCJwcDJfdGVtcGxhdGVfaWRzIjoiMSw3LDgsMjgsMzcsMjcsMzAsMjUsMjksMzEsMzMsMzkiLCJpYXQiOjE2NTE4MDgxMDd9.hkYOWbL1pVY_gwQ0QEnK4LirKO180LqeeBQC-U9zeQE'
      )
    })
})

// POST
test.concurrent('POST: Publish a blog post', () => {
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
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual({
      title: 'Episode IV: A New Hope',
      body: 'It is a period of civil war. Rebel spaceships, striking from a hidden base, have won their first victory against the evil Galactic Empire. During the battle, Rebel spies managed to steal secret plans to the Empire’s ultimate weapon, the DEATH STAR, an armored space station with enough power to destroy an entire planet...',
      userId: 2,
      id: 101,
    })
  })
})

test.concurrent('POST: Unsuccessful login, using properties', () => {
  const expression = {
    operator: 'POST',
    url: 'https://reqres.in/api/login',
    parameters: { email: 'eve.holt@reqres.in' },
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toThrow('400 Bad Request')
  })
})

test.concurrent('POST: Successful login, using parameters from (nested) buildObject', () => {
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
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toStrictEqual({ token: 'QpwL5tke4Pnpja7X4' })
  })
})

// HTTP Error codes using httpstat.us
test.concurrent('GET: 403 error', () => {
  const expression = {
    operator: 'API',
    url: 'http://httpstat.us/403',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toThrow('HTTP error: 403 Forbidden')
  })
})

test.concurrent('POST: 404 error', () => {
  const expression = {
    operator: 'API',
    url: 'http://httpstat.us/404',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toThrow('HTTP error: 404 Not found')
  })
})

test.concurrent('GET: 429 Error with fallback', () => {
  const expression = {
    operator: 'API',
    url: 'http://httpstat.us/429',
    fallback: 'There was a problem',
  }
  return exp.evaluate(expression).then((result: any) => {
    expect(result).toBe('There was a problem')
  })
})

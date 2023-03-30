import FigTreeEvaluator from '../src'
import FigTreeCache from '../src/cache'

const figTreeOptions = {
  graphQLConnection: {
    endpoint: 'https://countries.trevorblades.com/',
  },
  returnErrorAsString: true,
  objects: {
    myCountry: 'Brazil',
    otherCountry: 'France',
    deep: { p: 12 },
    user: { firstName: 'Bruce', lastName: 'Banner' },
  },
  functions: { random: () => Math.random(), concat: (a: string, b: string) => a + b },
  fragments: {
    getRandom: { $function: 'random' },
    getRandomAPI: {
      $GET: {
        url: { $plus: ['https://random-data-api.com/api/v2/users?size=', '$size'] },
        returnProperty: '$return',
      },
    },
    joinStrings: { $function: { path: 'concat', args: ['$first', '$second'] } },
  },
  useCache: true,
}

// Cache tests

// - Iterate lots to fill the cache (use a simple function)
test('Cache - fill cache with known results', async () => {
  const cache = new FigTreeCache(5)
  for (let i = 10; i < 50; i++) {
    await cache.useCache(true, (a: number, b: number) => a + b, i, i + 5)
  }
  await expect(cache['store']).toStrictEqual({ '5_10': 15 })
})

// - Check cache state after 20 entries

// - Check cache state after cache is over-full

// - Check items are removed in the correct order

// - Change size (and see what happens to existing entries) (need to add functionality to auto-purge the overflow)

//  - Access store directly after filling it:

// Evaluator with cache

// - With "Function" and random Math values (make a Fragment)

// - with API calls: https://random-data-api.com/

// Same as above expressions, but checking the actual evaluation result

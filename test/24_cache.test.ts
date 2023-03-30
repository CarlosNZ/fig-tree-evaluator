import FigTreeEvaluator from '../src'
import FigTreeCache from '../src/cache'

const figTreeOptions = {
  functions: {
    random: () => Math.random(),
    square: (n: number) => n * n,
  },
  fragments: {
    getRandom: { $function: 'random' },
    getRandomAPI: {
      $GET: {
        url: { $plus: ['https://random-data-api.com/api/v2/users?size=', '$size'] },
        returnProperty: '$return',
      },
    },
  },
}

// Test Cache directly

test('Cache - fill cache beyond size limit', async () => {
  const cache = new FigTreeCache(5)
  for (let i = 5; i <= 40; i += 5) {
    await cache.useCache(true, (a: number, b: number) => a + b, i, i + 5)
  }
  await expect(cache['store']).toStrictEqual({
    '20_25': 45,
    '25_30': 55,
    '30_35': 65,
    '35_40': 75,
    '40_45': 85,
  })
  await expect(cache['queue']).toStrictEqual(['40_45', '35_40', '30_35', '25_30', '20_25'])
})

test('Cache - fill cache to exactly size limit', async () => {
  const cache = new FigTreeCache(10)
  for (let i = 5; i <= 50; i += 5) {
    await cache.useCache(true, (a: number, b: number) => a + b, i, i + 5)
  }
  await expect(cache['store']).toStrictEqual({
    '5_10': 15,
    '10_15': 25,
    '15_20': 35,
    '20_25': 45,
    '25_30': 55,
    '30_35': 65,
    '35_40': 75,
    '40_45': 85,
    '45_50': 95,
    '50_55': 105,
  })
  await expect(cache['queue']).toStrictEqual([
    '50_55',
    '45_50',
    '40_45',
    '35_40',
    '30_35',
    '25_30',
    '20_25',
    '15_20',
    '10_15',
    '5_10',
  ])
})

test('Cache - check items get removed in correct order', async () => {
  const cache = new FigTreeCache(5)
  const func = (a: object, b: object) => ({ ...a, ...b })
  await cache.useCache(true, func, { one: 1, two: 2 }, { three: 3 })
  await cache.useCache(true, func, {}, { three: 3 })
  await cache.useCache(true, func, { a: 'a' }, { b: 'b' })
  await cache.useCache(true, func, { c: 'c' }, { d: 'd' })
  await cache.useCache(true, func, { one: 1, two: 2 }, { three: 3 })
  await cache.useCache(true, func, {}, { e: 'e' })
  await cache.useCache(true, func, { c: 'c' }, {})
  await expect(cache['store']).toStrictEqual({
    '{"one":1,"two":2}_{"three":3}': { one: 1, two: 2, three: 3 },
    '{"a":"a"}_{"b":"b"}': { a: 'a', b: 'b' },
    '{"c":"c"}_{"d":"d"}': { c: 'c', d: 'd' },
    '{}_{"e":"e"}': { e: 'e' },
    '{"c":"c"}_{}': { c: 'c' },
  })
  await expect(cache['queue']).toStrictEqual([
    '{"c":"c"}_{}',
    '{}_{"e":"e"}',
    '{"one":1,"two":2}_{"three":3}',
    '{"c":"c"}_{"d":"d"}',
    '{"a":"a"}_{"b":"b"}',
  ])
})

test('Cache - Reduce size limit below current contents', async () => {
  const cache = new FigTreeCache()
  const func = (a: string) => a.toUpperCase()
  for (const wd of [
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
  ]) {
    await cache.useCache(true, func, wd)
  }
  cache.setMax(5)
  await expect(cache['store']).toStrictEqual({
    six: 'SIX',
    seven: 'SEVEN',
    eight: 'EIGHT',
    nine: 'NINE',
    ten: 'TEN',
  })
  await expect(cache['queue']).toStrictEqual(['ten', 'nine', 'eight', 'seven', 'six'])
})

// Test Evaluator with cache
test('Cache - Random function returns either same or different depending on cache use', async () => {
  const fig = new FigTreeEvaluator(figTreeOptions)
  const result1 = await fig.evaluate('$getRandom()')
  const result2 = await fig.evaluate('$getRandom()')
  await expect(result1).not.toEqual(result2)

  fig.updateOptions({ useCache: true })
  const result3 = await fig.evaluate('$getRandom()')
  // Note different syntax for same expression
  const result4 = await fig.evaluate({ operator: 'function', path: 'random' })
  await expect(result3).toEqual(result4)
})

// - with API calls: https://random-data-api.com/
test('Cache - fetching random data from API', async () => {
  const fig = new FigTreeEvaluator(figTreeOptions)
  const expression = { $getRandomAPI: { $size: 50, $return: 'username' } }
  // Cache on by default for API operators
  const result1 = await fig.evaluate(expression)
  const result2 = await fig.evaluate(expression)
  await expect(result1).toEqual(result2)

  fig.updateOptions({ useCache: false })
  const result3 = await fig.evaluate(expression)
  const result4 = await fig.evaluate(expression)
  await expect(result3).not.toEqual(result4)
})

test('Cache - uncached result if original item has been dropped from cache', async () => {
  const fig = new FigTreeEvaluator(figTreeOptions)
  fig.updateOptions({ useCache: true })

  // First check that it *does* cache result
  const result1 = await fig.evaluate('$getRandom()')
  const result2 = await fig.evaluate('$getRandom()')
  await expect(result1).toEqual(result2)

  // Now fill the cache so original result gets dropped
  for (let i = 2; i <= 55; i++) {
    await fig.evaluate({ $function: ['square', i] })
  }
  const result3 = await fig.evaluate('$getRandom()')
  await expect(result3).not.toEqual(result1)
})

test('Cache - result not dropped as it has been used again before being dropped', async () => {
  const fig = new FigTreeEvaluator(figTreeOptions)
  fig.updateOptions({ useCache: true })

  const result1 = await fig.evaluate('$getRandom()')

  // Now part-fill the cache so original result doesn't get dropped
  for (let i = 2; i <= 40; i++) {
    await fig.evaluate({ $function: ['square', i] })
  }
  const result2 = await fig.evaluate('$getRandom()')
  await expect(result1).toEqual(result2)
  // Now keep filling, but result will be recent enough
  for (let i = 2; i <= 40; i++) {
    await fig.evaluate({ $function: ['square', i] })
  }
  const result3 = await fig.evaluate('$getRandom()')
  await expect(result3).toEqual(result1)
})

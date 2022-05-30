import { parseLocalStorage } from '../helpers'

test('Parse storage 1', () => {
  const obj = { pgConnection: {}, graphQLConnection: { endpoint: 'http://localhost:5000/graphql' } }
  expect(parseLocalStorage(obj)).toStrictEqual({
    pgConnection: {},
    graphQLConnection: { endpoint: 'http://localhost:5000/graphql' },
  })
})

test('Parse storage 2', () => {
  const obj = {
    key1: 'string',
    key2: 'null',
    key3: 'undefined',
    key4: '66',
    key5: 'true',
    key6: 'false',
  }
  expect(parseLocalStorage(obj)).toStrictEqual({
    key1: 'string',
    key2: null,
    key3: undefined,
    key4: 66,
    key5: true,
    key6: false,
  })
})

test('Parse storage nested', () => {
  const obj = {
    key1: { one: 'string', two: 'two' },
    key2: { one: 'null', two: 'false' },
    key3: { one: 'undefined', two: '999', three: { one: 'false', two: 'true' } },
    key4: '66',
    key5: 'true',
    key6: 'false',
  }
  expect(parseLocalStorage(obj)).toStrictEqual({
    key1: { one: 'string', two: 'two' },
    key2: { one: null, two: false },
    key3: { one: undefined, two: 999, three: { one: false, two: true } },
    key4: 66,
    key5: true,
    key6: false,
  })
})

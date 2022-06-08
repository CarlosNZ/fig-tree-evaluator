import { filterObjectRecursive, parseLocalStorage } from '../helpers'

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

test('Filter object basic', () => {
  const obj = {
    one: 'string',
    two: 33,
    three: [1, 2, 3],
    four: null,
    five: undefined,
    six: '',
    seven: false,
    eight: true,
  }
  expect(filterObjectRecursive(obj)).toStrictEqual({
    one: 'string',
    two: 33,
    three: [1, 2, 3],
    seven: false,
    eight: true,
  })
})

test('Filter object nested, custom filter function', () => {
  const obj = {
    one: 'string',
    two: 33,
    three: [1, 2, 3],
    four: null,
    five: undefined,
    six: '',
    seven: false,
    eight: true,
    nine: {
      one: 'string',
      two: undefined,
      three: [
        {
          one: 'string',
          three: [1, 2, 3],
          four: undefined,
          five: undefined,
          six: '',
          seven: false,
          eight: true,
        },
        {
          one: 'string',
          three: [1, null, undefined],
          four: undefined,
          five: undefined,
          six: '',
          seven: false,
          eight: true,
        },
      ],
      four: undefined,
      five: undefined,
      six: '',
      seven: false,
      eight: true,
    },
  }
  // console.log(filterObjectRecursive(obj, (x) => x !== undefined))
  expect(filterObjectRecursive(obj, (x) => x !== undefined)).toStrictEqual({
    one: 'string',
    two: 33,
    three: [1, 2, 3],
    four: null,
    six: '',
    seven: false,
    eight: true,
    nine: {
      one: 'string',
      three: [
        {
          one: 'string',
          three: [1, 2, 3],
          six: '',
          seven: false,
          eight: true,
        },
        {
          one: 'string',
          three: [1, null, undefined],
          six: '',
          seven: false,
          eight: true,
        },
      ],
      six: '',
      seven: false,
      eight: true,
    },
  })
})

test('Filter object, remove empty objects', () => {
  const obj = {
    one: 'string',
    empty: [],
    emptyWithEmpty: [{}],
    six: '',
    seven: { one: undefined, two: null, three: undefined },
    eight: true,
    nine: {
      one: 'string',
      two: undefined,
      three: [
        {
          one: 'string',
          three: [1, 2, 3],
          four: undefined,
          five: undefined,
          six: '',
          seven: false,
          eight: true,
        },
        {
          one: null,
          three: [],
          four: undefined,
          five: undefined,
        },
      ],
      other: {
        three: [],
      },
      four: undefined,
      five: undefined,
      six: '',
      seven: false,
      eight: true,
    },
  }
  // console.log(filterObjectRecursive(obj, (x) => x !== undefined))
  expect(filterObjectRecursive(obj)).toStrictEqual({
    one: 'string',
    eight: true,
    nine: {
      one: 'string',
      three: [
        {
          one: 'string',
          three: [1, 2, 3],
          seven: false,
          eight: true,
        },
      ],
      seven: false,
      eight: true,
    },
  })
})

test('Filter object, input is {}', () => {
  expect(filterObjectRecursive({})).toStrictEqual({})
})

test('Filter object, input is {one:{}}', () => {
  expect(filterObjectRecursive({ one: {} })).toStrictEqual({})
})

test('Filter object, input is {one:[]}', () => {
  expect(filterObjectRecursive({ one: [] })).toStrictEqual({})
})

test('Filter object, collapse inner object', () => {
  expect(filterObjectRecursive({ one: [{}] })).toStrictEqual({})
})

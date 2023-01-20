import { typeCheck } from '../src/typeCheck'

test('String - correct', () => {
  expect(typeCheck({ name: 'prop1', value: 'MyValue', expectedType: 'string' })).toBe(true)
})

test('String - incorrect', () => {
  expect(typeCheck({ name: 'prop1', value: 3, expectedType: 'string' })).toBe(
    '- Property "prop1" (value: 3) is not of type: string'
  )
})

test('Not String', () => {
  expect(typeCheck({ value: 10, not: true, expectedType: 'string' })).toBe(true)
})

test('Not String - false', () => {
  expect(
    typeCheck({ name: 'Test', value: 'Actually a string', not: true, expectedType: 'string' })
  ).toBe('- Property "Test" (value: "Actually a string") is not of type: !(string)')
})

test('Multiple type options', () => {
  expect(typeCheck({ value: 39.5, expectedType: ['string', 'number'] })).toBe(true)
})

test('Multiple type options 2', () => {
  expect(typeCheck({ value: 'A string', expectedType: ['string', 'number'] })).toBe(true)
})

test('Multiple type options false', () => {
  expect(typeCheck({ value: null, expectedType: ['string', 'number'] })).toBe(
    '- null is not of type: string|number'
  )
})

test('Array true', () => {
  expect(typeCheck({ value: [1, 2, 'three'], expectedType: 'array' })).toBe(true)
})

test('Array false', () => {
  expect(typeCheck({ value: { one: 1 }, expectedType: 'array' })).toBe(
    '- {"one":1} is not of type: array'
  )
})

test('Object true', () => {
  expect(typeCheck({ value: { one: 1, two: 2 }, expectedType: 'object' })).toBe(true)
})

test('Object false, truncated value', () => {
  expect(
    typeCheck({
      value: ['one long string', 'another long string', 'third long string'],
      expectedType: 'object',
    })
  ).toBe('- ["one long string","another long string","third... is not of type: object')
})

test('Number true', () => {
  expect(typeCheck({ value: 666, expectedType: 'number' })).toBe(true)
})

test('Number false', () => {
  expect(typeCheck({ value: { one: 1 }, expectedType: 'number' })).toBe(
    '- {"one":1} is not of type: number'
  )
})

test('Boolean true', () => {
  expect(typeCheck({ value: 5 < 6, expectedType: 'boolean' })).toBe(true)
})

test('Boolean false', () => {
  expect(typeCheck({ name: 'Undefined value', value: undefined, expectedType: 'boolean' })).toBe(
    '- Property "Undefined value" (value: undefined) is not of type: boolean'
  )
})

test('Undefined true', () => {
  const { value } = { noValue: 1 } as any
  expect(typeCheck({ value, expectedType: 'undefined' })).toBe(true)
})

test('Undefined false', () => {
  expect(typeCheck({ value: null, expectedType: 'boolean' })).toBe('- null is not of type: boolean')
})

test('Not undefined', () => {
  expect(typeCheck({ value: 'Anything else', not: true, expectedType: 'undefined' })).toBe(true)
})

test('Null true', () => {
  expect(typeCheck({ value: null, expectedType: 'null' })).toBe(true)
})

test('Null false, truncated output', () => {
  expect(
    typeCheck({
      value: {
        one: 'long string',
        two: 'even longer string',
        three: undefined,
        four: 'This should be truncated',
      },
      expectedType: 'null',
    })
  ).toBe('- {"one":"long string","two":"even longer string",... is not of type: null')
})

test('Neither array or object -- true', () => {
  expect(typeCheck({ value: false, not: true, expectedType: ['array', 'object'] })).toBe(true)
})

test('Neither array or object -- false', () => {
  expect(
    typeCheck({ value: ['three', 'two', 'one'], not: true, expectedType: ['array', 'object'] })
  ).toBe('- ["three","two","one"] is not of type: !(array|object)')
})

import { typeCheck } from '../src/typeCheck'

test('String - correct', () => {
  expect(typeCheck({ name: 'prop1', value: 'MyValue', expectedType: 'string' })).toBe(true)
})

test('String - incorrect', () => {
  expect(typeCheck({ name: 'prop1', value: 3, expectedType: 'string' })).toBe(
    '- Property "prop1" (value: 3) is not of type: string'
  )
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
    '- Missing required property "Undefined value" (type: boolean)'
  )
})

test('Undefined true', () => {
  const { value } = { noValue: 1 } as any
  expect(typeCheck({ value, expectedType: 'undefined' })).toBe(true)
})

test('Undefined false', () => {
  expect(typeCheck({ value: null, expectedType: 'boolean' })).toBe('- null is not of type: boolean')
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

test('String literals - correct', () => {
  expect(
    typeCheck({ name: 'prop1', value: 'one', expectedType: { literal: ['one', 'two', 'three'] } })
  ).toBe(true)
})

test('String literals - correct, different order', () => {
  expect(
    typeCheck({ name: 'prop1', value: 'three', expectedType: { literal: ['one', 'two', 'three'] } })
  ).toBe(true)
})

test('String literals - incorrect', () => {
  expect(
    typeCheck({ name: 'prop1', value: 'four', expectedType: { literal: ['one', 'two', 'three'] } })
  ).toBe('- Property "prop1" (value: "four") is not of type: Literal("one", "two", "three")')
})

test('Multiple checks -- all correct', () => {
  expect(
    typeCheck(
      { name: 'prop1', value: 'three', expectedType: { literal: ['one', 'two', 'three'] } },
      { value: 5 < 6, expectedType: 'boolean' },
      { name: 'prop1', value: 'MyValue', expectedType: 'string' }
    )
  ).toBe(true)
})

test('Multiple checks -- one required missing', () => {
  const obj: any = { one: 2, two: 'two' }
  const { one, two, three } = obj
  expect(
    typeCheck(
      { name: 'one', value: one, expectedType: 'number' },
      { name: 'two', value: two, expectedType: 'string' },
      { name: 'three', value: three, expectedType: 'boolean' }
    )
  ).toBe('- Missing required property "three" (type: boolean)')
})

test('Multiple checks -- one missing, one wrong (in array)', () => {
  const obj: any = { one: 2, two: 'two' }
  const { one, two, three } = obj
  expect(
    typeCheck(
      { name: 'one', value: one, expectedType: ['number', 'string'] },
      { name: 'two', value: two, expectedType: 'null' },
      { name: 'three', value: three, expectedType: 'array' }
    )
  ).toBe(
    '- Property "two" (value: "two") is not of type: null\n- Missing required property "three" (type: array)'
  )
})

test('String literals -- not required, wrong type', () => {
  expect(
    typeCheck({
      name: 'p1',
      value: 'wrong',
      expectedType: { literal: ['right', 'other'] },
    })
  ).toBe('- Property "p1" (value: "wrong") is not of type: Literal("right", "other")')
})

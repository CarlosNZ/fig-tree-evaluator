import { camelCase } from '../src/helpers'

// Camel case function

test('camelCase - hello-world', () => {
  expect(camelCase('hello-world')).toBe('helloWorld')
})

test('camelCase - Hello_world-test case', () => {
  expect(camelCase('Hello_world-test case')).toBe('helloWorldTestCase')
})

test('camelCase - alreadyCamelCase', () => {
  expect(camelCase('alreadyCamelCase')).toBe('alreadyCamelCase')
})

test('camelCase - ALLCAPS', () => {
  expect(camelCase('ALLCAPS')).toBe('allcaps')
})

test('camelCase - ALL CAPS WITH SPACES', () => {
  expect(camelCase('ALL CAPS WITH SPACES')).toBe('allCapsWithSpaces')
})

test('camelCase - ALL-CAPS__WITH VARIOUS-DELIMITERS', () => {
  expect(camelCase('ALL-CAPS__WITH VARIOUS-DELIMITERS')).toBe('allCapsWithVariousDelimiters')
})

test('camelCase - What about with "punctuation" huh?', () => {
  expect(camelCase('What about with "punctuation" huh?')).toBe('whatAboutWithPunctuationHuh')
})

test('camelCase - __AND__', () => {
  expect(camelCase('__AND__')).toBe('and')
})

test('camelCase - pgSQL', () => {
  expect(camelCase('pgSQL')).toBe('pgSql')
})

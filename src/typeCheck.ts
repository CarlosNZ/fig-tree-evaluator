/*
Simple run-time type-checking.

Used by each operator to ensure input is valid before evaluating, and reports
type errors in a structured fashion.
*/

import { isObject, truncateString } from './helpers'

export type BasicType =
  | 'any' // Anything except undefined
  | 'string'
  | 'boolean'
  | 'number'
  | 'array'
  | 'object'
  | 'null'
  | 'undefined'

export type LiteralType = { literal: (string | undefined)[] }

export type ExpectedType = BasicType | LiteralType | BasicType[]

export type TypeCheckInput = {
  name?: string
  value: unknown
  expectedType: ExpectedType
}

export const isLiteralType = (typeDefinition: ExpectedType): typeDefinition is LiteralType =>
  isObject(typeDefinition) && 'literal' in (typeDefinition as LiteralType)

const typeCheckItem = ({ value, name, expectedType }: TypeCheckInput): true | string => {
  // Literals
  if (isLiteralType(expectedType)) {
    const { literal } = expectedType
    return literal.includes(value as string | undefined)
      ? true
      : makeErrorString(
          name,
          value,
          `Literal(${literal
            .map((val) => (val === undefined ? `undefined` : `"${val}"`))
            .join(', ')})`
        )
  }

  // Multiple types
  if (Array.isArray(expectedType)) {
    return expectedType.some((type) => typeCheckItem({ value, name, expectedType: type }) === true)
      ? true
      : makeErrorString(name, value, expectedType.join('|'))
  }

  // Single basic type
  const checker = typeCheckMap[expectedType]
  return checker(value) ? true : makeErrorString(name, value, expectedType)
}

export const typeCheck = (...args: TypeCheckInput[]): true | string => {
  const errorStrings: string[] = []
  args.forEach((item) => {
    const result = typeCheckItem(item)
    if (result !== true) errorStrings.push(result)
  })
  return errorStrings.length > 0 ? errorStrings.join('\n') : true
}

const typeCheckMap = {
  any: (value: unknown) => value !== undefined,
  string: (value: unknown) => typeof value === 'string',
  number: (value: unknown) => typeof value === 'number',
  boolean: (value: unknown) => typeof value === 'boolean',
  array: (value: unknown) => Array.isArray(value),
  null: (value: unknown) => value === null,
  object: (value: unknown) => isObject(value),
  undefined: (value: unknown) => value === undefined,
}

const makeErrorString = (name: string | undefined, value: unknown, type: string): string => {
  if (value === undefined && !!name) return `- Missing required property "${name}" (type: ${type})`
  if (name !== undefined)
    return `- Property "${name}" (value: ${stringifyValue(value)}) is not of type: ${type}`
  return `- ${stringifyValue(value)} is not of type: ${type}`
}

const stringifyValue = (value: unknown) => {
  const stringValue =
    value === undefined || Number.isNaN(value) ? String(value) : JSON.stringify(value)

  return truncateString(stringValue, 50)
}

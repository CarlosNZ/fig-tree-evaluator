import t, { Schema } from 'typy'

type ExpectedType = 'string' | 'boolean' | 'number' | 'array'
//   | 'null' | 'array' | 'object' | 'schema'

type TypeCheckSingle = {
  value: unknown
  name: string
  expectedType: ExpectedType
}

type TypeCheckObject = {
  value: object
  name?: string
  schema: typeof Schema
}

type TypeCheckOr = {
  value: unknown
  name: string
  expectedTypes: ExpectedType[]
}

export type TypeCheckInput = TypeCheckSingle | TypeCheckObject | TypeCheckOr

const typeCheckItem = (input: TypeCheckInput): true | string => {
  if ('expectedTypes' in input) {
    // Do "OR"
    const { value, name, expectedTypes } = input
    const result = expectedTypes.some(
      (type) => typeCheckItem({ value, name, expectedType: type }) === true
    )
    return result ? true : makeErrorString(name, expectedTypes.join('|'))
  } else if ('schema' in input) {
    // Check against schema
    return true
  } else {
    const { value, name, expectedType } = input
    const checker = typeCheckMap[expectedType]
    return checker(value) ? true : makeErrorString(name, expectedType)
  }
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
  string: (value: unknown) => t(value).isString,
  number: (value: unknown) => t(value).isNumber,
  boolean: (value: unknown) => t(value).isBoolean,
  array: (value: unknown) => t(value).isArray,
}

const makeErrorString = (name: string, type: string) =>
  `- Property "${name}" is not of type: ${type}`

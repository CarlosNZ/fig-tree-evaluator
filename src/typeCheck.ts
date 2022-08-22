type ExpectedType = 'string' | 'boolean' | 'number' | 'array' | 'undefined' | 'null' | 'object'

export type TypeCheckInput = {
  value: unknown
  name?: string
  not?: boolean
  expectedType: ExpectedType | ExpectedType[]
}

const typeCheckItem = ({
  value,
  name,
  not = false,
  expectedType,
}: TypeCheckInput): true | string => {
  let result
  if (Array.isArray(expectedType)) {
    result = expectedType.some(
      (type) => typeCheckItem({ value, name, expectedType: type }) === true
    )
    if (not) result = !result
    return result ? true : makeErrorString(name, value, expectedType.join('|'), not)
  } else {
    const checker = typeCheckMap[expectedType]
    result = checker(value)
    if (not) result = !result
    return result ? true : makeErrorString(name, value, expectedType, not)
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
  string: (value: unknown) => typeof value === 'string',
  number: (value: unknown) => typeof value === 'number',
  boolean: (value: unknown) => typeof value === 'boolean',
  array: (value: unknown) => Array.isArray(value),
  undefined: (value: unknown) => value === undefined,
  null: (value: unknown) => value === null,
  object: (value: unknown) => typeof value === 'object' && !Array.isArray(value) && value !== null,
}

const makeErrorString = (
  name: string | undefined,
  value: unknown,
  type: string,
  not: boolean
): string => {
  if (name !== undefined)
    return `- Property "${name}" (value: ${stringifyValue(value)}) is not of type: ${
      not ? `!(${type})` : type
    }`
  return `- ${stringifyValue(value)} is not of type: ${not ? `!(${type})` : type}`
}

const stringifyValue = (value: unknown) => {
  const stringValue =
    value === undefined || Number.isNaN(value) ? String(value) : JSON.stringify(value)

  return stringValue.length < 50 ? stringValue : `${stringValue.slice(0, 48).trim()}...`
}

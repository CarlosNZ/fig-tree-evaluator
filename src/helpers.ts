/*
Functions used by the main "evaluatorFunction" (evaluate.ts)
*/
import { camelCase } from 'change-case'
import {
  OutputType,
  EvaluatorNode,
  EvaluatorOutput,
  FigTreeOptions,
  FigTreeConfig,
  OperatorReference,
  OperatorAliases,
  Operator,
  FragmentNode,
  OperatorNode,
  FigTreeError,
} from './types'

export const parseIfJson = (input: EvaluatorNode) => {
  if (typeof input !== 'string') return input
  try {
    const parsedInput = JSON.parse(input)
    return isOperatorNode(parsedInput) ? parsedInput : input
  } catch (err) {
    return input
  }
}

export const isOperatorNode = (input: EvaluatorNode) =>
  input instanceof Object && 'operator' in input

export const isFragmentNode = (input: EvaluatorNode): input is FragmentNode =>
  input instanceof Object && 'fragment' in input

// Convert to camelCase but *don't* remove stand-alone punctuation as they may
// be valid operators (e.g. "+", "?")
export const standardiseOperatorName = (name: string) => {
  const camelCaseName = camelCase(name)
  return camelCaseName ? camelCaseName : name
}

export const getOperatorName = (
  operator: string,
  operatorAliases: OperatorAliases
): Operator | undefined => operatorAliases[standardiseOperatorName(operator)]

export const filterOperators = (
  operators: OperatorReference,
  exclusions: string[],
  operatorAliases: OperatorAliases
): OperatorReference => {
  const filteredOperators = { ...operators }
  exclusions.forEach((exclusion) => {
    const operator = operatorAliases[standardiseOperatorName(exclusion)]
    if (!operator) console.warn(`Invalid operator exclusion: ${exclusion}`)
    delete filteredOperators[operatorAliases[standardiseOperatorName(exclusion)]]
  })
  return filteredOperators
}

/*
If `string` exceeds `length` (default: 200 chars), will return a truncated
version of the string, ending in "..."
*/
export const truncateString = (string: string, length = 200) =>
  string.length < length ? string : `${string.slice(0, length - 2).trim()}...`

/*
Will throw an error (with `errorMessage`) if no `fallback` is provided. If
`returnErrorAsString` is enabled, then it won't throw, but instead return a
string containing the error message. 
*/
interface ErrorInput {
  fallback?: EvaluatorOutput
  operator?: Operator
  name?: string
  error: Error | string
  expression: EvaluatorNode
  returnErrorAsString?: boolean
}
export const fallbackOrError = ({
  fallback,
  operator,
  name,
  error,
  expression,
  returnErrorAsString = false,
}: ErrorInput) => {
  if (fallback !== undefined) return fallback

  const err: FigTreeError = typeof error === 'string' ? new Error(error) : error
  if (name) err.name = name
  if (err.name === 'Error') err.name = 'FigTreeError'
  err.expression = expression
  err.operator = operator

  if (!returnErrorAsString) throw err

  const operatorText = operator ? 'Operator: ' + operator : ''
  const nameText = err.name === 'FigTreeError' ? '' : ` - ${err.name}`
  const topLine = operatorText + nameText
  const extraData = err.errorData ? '\n' + JSON.stringify(err.errorData, null, 2) : ''

  return `${topLine !== '' ? topLine + '\n' : ''}${err.message}${extraData}`
}

/*
Converts Evaluator node to one with canonical property names,
as per each operator's property aliases
*/
export const mapPropertyAliases = (
  propertyAliases: { [key: string]: string },
  expression: OperatorNode
) =>
  mapObjectKeys(expression, (key: string) =>
    key in propertyAliases ? propertyAliases[key] : key
  ) as OperatorNode

/*
Convert object to a new object with keys changed by mapFunction
Simplified version of lodash' `mapKeys` method
*/
const mapObjectKeys = <T>(
  inputObj: { [key: string]: T },
  mapFunction: (key: string) => string
): { [key: string]: T } => {
  const keyVals = Object.entries(inputObj)
  const mappedKeys = keyVals.map(([key, value]) => [mapFunction(key), value])
  return Object.fromEntries(mappedKeys)
}

// Returns true if value is of the form "$alias"
export const isAliasString = (value: string) => /^\$.+/.test(value)

/*
If passed-in value (probably a leaf node) is an "alias" key, then replace it
with its resolved value.
*/
export const replaceAliasNodeValues = (
  value: EvaluatorOutput,
  { resolvedAliasNodes }: FigTreeConfig
) => {
  if (typeof value !== 'string' || !isAliasString(value)) return value
  return resolvedAliasNodes?.[value] ?? value
}

/*
Mostly we can just merge the options objects, but for "data", "functions",
"fragments" and "headers", they might need merging separately so we preserve
proper deep merging.
*/
export const mergeOptions = (
  origOptions: FigTreeOptions,
  newOptions: FigTreeOptions
): FigTreeOptions => {
  const combinedOptions: FigTreeOptions = { ...origOptions, ...newOptions }
  if (origOptions.data || newOptions.data)
    combinedOptions.data = { ...origOptions.data, ...newOptions.data }
  if (origOptions.functions || newOptions.functions)
    combinedOptions.functions = { ...origOptions.functions, ...newOptions.functions }
  if (origOptions.fragments || newOptions.fragments)
    combinedOptions.fragments = { ...origOptions.fragments, ...newOptions.fragments }
  if (origOptions.headers || newOptions.headers)
    combinedOptions.headers = { ...origOptions.headers, ...newOptions.headers }

  return combinedOptions
}

export const convertOutputMethods: {
  [key in OutputType]: (value: EvaluatorOutput) => EvaluatorOutput | EvaluatorOutput[]
} = {
  number: (value: EvaluatorOutput) => extractNumber(value),
  string: (value: EvaluatorOutput) => String(value),
  array: (value: EvaluatorOutput) => (Array.isArray(value) ? value : [value]),
  boolean: (value: EvaluatorOutput) => Boolean(value),
  bool: (value: EvaluatorOutput) => Boolean(value),
}

// Workaround to prevent typescript errors for err.message
export const errorMessage = (err: unknown) => (err as Error).message

// Extracts numeric content from a string
const extractNumber = (input: EvaluatorOutput) => {
  if (typeof input !== 'string') return Number.isNaN(Number(input)) ? input : Number(input)

  // Optional negative sign, optional digit(s), optional decimal point, then 1
  // or more digits
  const pattern = new RegExp(/-?\d*\.?\d+/gm)

  const numberMatch = input.match(pattern)
  if (!numberMatch) return 0
  return Number(numberMatch[0])
}

/*
Returns `true` if input is an object ({}) (but not an array)
*/
export const isObject = (input: unknown): input is object =>
  typeof input === 'object' && input !== null && !Array.isArray(input)

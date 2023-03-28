/*
Functions used by the main "evaluatorFunction" (evaluate.ts)
*/

import { camelCase } from 'change-case'
import { evaluatorFunction } from './evaluate'
import { singleArrayToObject, zipArraysToObject } from './operators/_operatorUtils'
import {
  OutputType,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  FigTreeOptions,
  OperatorNodeUnion,
  FigTreeConfig,
  OperatorReference,
  OperatorAliases,
  OperatorAlias,
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

export const isFragmentNode = (input: EvaluatorNode) =>
  input instanceof Object && 'fragment' in input

// Convert to camelCase but *don't* remove stand-alone punctuation as they may
// be valid operators (e.g. "+", "?")
const standardiseOperatorName = (name: string) => {
  const camelCaseName = camelCase(name)
  return camelCaseName ? camelCaseName : name
}

export const getOperatorName = (operator: string, operatorAliases: OperatorAliases) =>
  operatorAliases[standardiseOperatorName(operator) as OperatorAlias]

export const filterOperators = (
  operators: OperatorReference,
  exclusions: string[],
  operatorAliases: OperatorAliases
) => {
  const filteredOperators = { ...operators }
  exclusions.forEach((exclusion) => {
    const operator = operatorAliases[standardiseOperatorName(exclusion) as OperatorAlias]
    if (!operator) console.warn(`Invalid operator exclusion: ${exclusion}`)
    delete filteredOperators[operatorAliases[standardiseOperatorName(exclusion) as OperatorAlias]]
  })
  return filteredOperators
}

/*
If `string` exceeds `length` (default: 200 chars), will return a truncated
version of the string, ending in "..."
*/
export const truncateString = (string: string, length: number = 200) =>
  string.length < length ? string : `${string.slice(0, length - 2).trim()}...`

/*
Will throw an error (with `errorMessage`) if no `fallback` is provided. If
`returnErrorAsString` is enabled, then it won't throw, but instead return a
string containing the error message. 
*/
export const fallbackOrError = (
  fallback: any,
  errorMessage: string,
  returnErrorAsString: boolean = false
) => {
  if (fallback !== undefined) return fallback
  if (returnErrorAsString) return truncateString(errorMessage)
  else throw new Error(truncateString(errorMessage))
}

/*
Converts Evaluator node to one with canonical property names,
as per each operator's property aliases
*/
export const mapPropertyAliases = (
  propertyAliases: { [key: string]: string },
  expression: CombinedOperatorNode
): CombinedOperatorNode =>
  mapObjectKeys(expression, (key: string) =>
    key in propertyAliases ? propertyAliases[key] : key
  ) as CombinedOperatorNode

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
Identify any properties in the expression that represent "alias" nodes (i.e of
the form `$alias`) and evaluate their values
*/
export const evaluateNodeAliases = async (expression: OperatorNodeUnion, config: FigTreeConfig) => {
  const aliasKeys = Object.keys(expression).filter(isAliasString)
  if (aliasKeys.length === 0) return {}

  const evaluations: Promise<EvaluatorOutput>[] = []
  aliasKeys.forEach((alias) => evaluations.push(evaluatorFunction(expression[alias], config)))

  return zipArraysToObject(aliasKeys, await Promise.all(evaluations))
}

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
Checks Evaluator node for missing required properties based on operator type
- Strict type checking done AFTER evaluation of child nodes within operator
  methods (typeCheck.ts)
*/
export const checkRequiredNodes = (
  requiredProps: readonly string[],
  expression: CombinedOperatorNode
): string | false => {
  const missingProps = requiredProps.filter((prop) => !(prop in expression))
  if (missingProps.length === 0) return false
  if (!('children' in expression)) return `Missing properties: ${missingProps}`
  return false
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
export const isObject = (input: unknown) =>
  typeof input === 'object' && input !== null && !Array.isArray(input)

/*
Check if an object has any "Operator Nodes" as values and evaluate them if so.
Doesn't need to be recursive or handle arrays, as the main "evaluatorFunction"
will handle that.
*/
export const evaluateObject = async (
  input: EvaluatorNode,
  config: FigTreeConfig
): Promise<EvaluatorOutput> => {
  if (!isObject(input)) return input

  const newObjectEntries: unknown[] = []
  const newAliases: unknown[] = []

  // First evaluate any Alias nodes we find and add them to config
  Object.entries(input as Object).forEach(([key, value]) => {
    if (isAliasString(key)) {
      newAliases.push(key, evaluatorFunction(value, config))
      delete (input as Record<string, any>)[key]
    }
  })
  const aliasArray = await Promise.all(newAliases)
  config.resolvedAliasNodes = { ...config.resolvedAliasNodes, ...singleArrayToObject(aliasArray) }

  // Then evaluate the rest
  Object.entries(input as Object).forEach(([key, value]) => {
    newObjectEntries.push(key, evaluatorFunction(value, config))
  })

  const results = await Promise.all(newObjectEntries)

  return replaceAliasNodeValues(singleArrayToObject(results), config)
}

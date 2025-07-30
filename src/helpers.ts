/*
Functions used by the main "evaluatorFunction" (evaluate.ts)
*/
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

export const isOperatorNode = (input: EvaluatorNode): input is OperatorNode =>
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
If a fragment has parameters defined in metadata, any *required* parameters
which are not provided but have a default value will be inserted into the
expression with their default value
*/
export const replaceMissingDefaultParameters = (fragment: FragmentNode, config: FigTreeConfig) => {
  console.log('Replace Missing Default Parameters', fragment)
  const requiredParameterDefinitions =
    config.options?.fragments?.[fragment.fragment]?.metadata?.parameters?.filter(
      (param) => param.required && param.default !== undefined
    ) ?? []
  if (requiredParameterDefinitions.length === 0) return fragment

  for (const param of requiredParameterDefinitions) {
    if (!(param.name in (fragment?.parameters ?? {}) && !(param.name in fragment))) {
      fragment[param.name] = param.default as EvaluatorNode
    }
  }
  console.log('After Replace Missing Default Parameters', fragment)
  return fragment
}

/*
Converts a custom function expressed as a "custom operator" into a standard
operator node
e.g. {
  "operator": "myFunction",
  "param1": "something",
  "param2": "another"
} => {
  "operator": "customFunctions",
  "function": "myFunction",
  "input": {
    "param1": "something",
    "param2": "another"
  }}
*/
export const replaceCustomOperator = async (expression: OperatorNode, config: FigTreeConfig) => {
  if (!(expression.operator in (config.options?.functions ?? {}))) return expression

  const { operator, fallback, outputType, type, useCache, input, args, ...rest } = expression

  const modifiedExpression: OperatorNode = { operator: 'CUSTOM_FUNCTIONS', function: operator }

  if (fallback !== undefined) modifiedExpression.fallback = fallback
  if (outputType !== undefined) modifiedExpression.outputType = outputType
  if (type !== undefined) modifiedExpression.type = type
  if (useCache !== undefined) modifiedExpression.useCache = useCache

  if (args !== undefined) modifiedExpression.args = args
  if (input !== undefined) modifiedExpression.input = input
  else if (Object.keys(rest).length > 0) modifiedExpression.input = rest

  return modifiedExpression
}

/*
Mostly we can just merge the options objects, but for "data", "functions",
"fragments" and "headers", they might need merging separately so we preserve
proper deep merging.
*/
export const mergeOptions = (
  origOptions: FigTreeOptions,
  newOptions: FigTreeOptions,
  deep: boolean
): FigTreeOptions => {
  const combinedOptions: FigTreeOptions = { ...origOptions, ...newOptions }
  if (!deep) return combinedOptions

  // We only do deep merging of the following for a specific evaluation, not
  // when performing ".updateOptions()"
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

// Convert to camelCase
export const camelCase = (str: string): string => {
  const words = str
    .replace(/[^A-Za-z\d _-]/g, '')
    .split(/[-_ ]/)
    .map((word) => (word.match(/[a-z]+|[A-Z]+[a-z]*/g) as string[]) ?? word)
    .flat()

  const camelCaseString = words
    .filter((word) => word !== '')
    .map((word, index) => {
      // First word should be in lowercase
      if (index === 0) {
        return word.toLowerCase()
      }
      // Capitalize the first letter of subsequent words
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join('')

  return camelCaseString
}

/*
Returns `true` if input is an object ({}) (but not an array)
*/
export const isObject = (input: unknown): input is object =>
  typeof input === 'object' && input !== null && !Array.isArray(input)

/**
 * The following is not used in FigTree itself, but might be a useful utility
 * methods for consumers in order to determine if some value should be displayed
 * as a FigTree expression or not
 */

export const isFigTreeExpression = (expression: EvaluatorNode) =>
  isOperatorNode(expression) ||
  isFragmentNode(expression) ||
  (typeof expression === 'string' && isAliasString(expression)) ||
  (isObject(expression) &&
    Object.keys(expression).length === 1 &&
    isAliasString(Object.keys(expression)[0]))

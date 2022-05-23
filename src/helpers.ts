import { OutputType, EvaluatorNode } from './types'
import { camelCase } from 'lodash'

export const fallbackOrError = (
  fallback: any,
  errorMessage: string,
  returnErrorAsString: boolean
) => {
  if (fallback !== undefined) return fallback
  if (returnErrorAsString) return errorMessage
  else throw new Error(errorMessage)
}

export const convertOutputMethods: {
  [key in OutputType]: <T>(val: T) => number | string | boolean | T[]
} = {
  number: (value: any) => (Number.isNaN(Number(value)) ? value : Number(value)),
  string: (value: any) => String(value),
  array: (value: any) => (Array.isArray(value) ? value : [value]),
  boolean: (value: any) => Boolean(value),
  bool: (value: any) => Boolean(value),
}

export const isOperatorNode = (input: EvaluatorNode) =>
  input instanceof Object && 'operator' in input

export const parseIfJson = (input: EvaluatorNode) => {
  if (typeof input !== 'string') return input
  try {
    const parsedInput = JSON.parse(input)
    return isOperatorNode(parsedInput) ? parsedInput : input
  } catch (err) {
    return input
  }
}

export const standardiseOperatorName = (name: string) => {
  const camelCaseName = camelCase(name)
  return camelCaseName ? camelCaseName : name
}

// Workaround to prevent typescript errors for err.message
export const errorMessage = (err: unknown) => (err as Error).message

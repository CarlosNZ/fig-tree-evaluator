import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import {
  EvaluatorNode,
  OperatorObject,
  EvaluateMethod,
  ParseChildrenMethod,
  EvaluatorOutput,
} from '../../types'
import operatorData, { propertyAliases } from './data'
import { isObject } from '../../helpers'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [query, values, single, flatten, useCache] = (await evaluateArray(
    [
      expression.query,
      expression.values || [],
      expression.single,
      expression.flatten,
      expression.useCache,
    ],
    config
  )) as [string, (string | number | boolean)[] | object, boolean, boolean, boolean]

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, { query, single, flatten, values, useCache })
  )

  const connection = config.options?.sqlConnection

  if (!connection) throw new Error('No SQL database connection provided')

  const shouldUseCache = expression.useCache ?? config.options.useCache ?? true

  {
    const result = config.cache.useCache(
      shouldUseCache,
      async (query: string, values?: (string | number)[], single?: boolean, flatten?: boolean) => {
        const result = ((await connection.query({ query, values, single, flatten })) ||
          []) as Record<string, QueryOutput>[]
        const returnValue = (single ? result[0] : result) ?? null
        if (flatten) {
          if (returnValue === null) return returnValue
          if (isObject(returnValue))
            return single ? Object.values(returnValue)[0] : Object.values(returnValue)
          if (Array.isArray(returnValue))
            return (returnValue as unknown[])
              .map((el) => (isObject(el) ? Object.values(el) : el))
              .flat()
        }
        return returnValue
      },
      query,
      values,
      single,
      flatten
    )

    return result
  }
}

const parseChildren: ParseChildrenMethod = (expression) => {
  const [query, ...values] = expression.children as EvaluatorNode[]
  return { ...expression, query, values }
}

export const PG_SQL: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}

// SQL Connection Type

export interface QueryInput {
  query: string
  values?: (string | number | boolean)[] | object
  single?: boolean
  flatten?: boolean
}

export type QueryOutput = Exclude<EvaluatorOutput, undefined>
export interface SQLConnection {
  query: (input: QueryInput) => Promise<QueryOutput>
}

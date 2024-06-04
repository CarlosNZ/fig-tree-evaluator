import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [query, type, values, useCache] = (await evaluateArray(
    [
      expression.query,
      expression.queryType ?? expression.type,
      expression.values || [],
      expression.useCache,
    ],
    config
  )) as [string, string | undefined, (string | number | boolean)[], boolean]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { query, type, values, useCache }))

  const connection = config.options?.sqlConnection

  if (!connection) throw new Error('No SQL database connection provided')

  const shouldUseCache = expression.useCache ?? config.options.useCache ?? true

  {
    const result = config.cache.useCache(
      shouldUseCache,
      async (query: string, type: 'array' | 'string' | undefined, values: (string | number)[]) => {
        return await connection.query({ text: query, values, resultType: type })
      },
      query,
      type,
      values
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

type ResultType = 'array' | 'string' | 'number' | undefined
export interface QueryInput {
  text: string
  values?: (string | number | boolean)[]
  resultType?: ResultType
}

export type QueryOutput =
  | Record<string, unknown>[]
  | Array<unknown>[]
  | string
  | number
  | { error: string }
export interface SQLConnection {
  query: (input: QueryInput) => Promise<QueryOutput>
}

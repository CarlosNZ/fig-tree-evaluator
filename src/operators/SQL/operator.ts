import { getTypeCheckInput } from '../operatorUtils'
import { evaluateArray } from '../../evaluate'
import {
  EvaluatorNode,
  OperatorObject,
  EvaluateMethod,
  ParseChildrenMethod,
  EvaluatorOutput,
  OutputType,
} from '../../types'
import operatorData, { propertyAliases } from './data'

const evaluate: EvaluateMethod = async (expression, config) => {
  const connection = config.options?.sqlConnection
  if (!connection) throw new Error('No SQL database connection provided')

  const [query, values, single, flatten, useCache, queryType] = (await evaluateArray(
    [
      expression.query,
      expression.values || [],
      expression.single,
      expression.flatten,
      expression.useCache,
      expression.type,
    ],
    config
  )) as [string, (string | number | boolean)[] | object, boolean, boolean, boolean, OutputType]

  config.typeChecker(
    getTypeCheckInput(operatorData.parameters, { query, single, flatten, values, useCache })
  )

  const shouldUseCache = expression.useCache ?? config.options.useCache ?? true

  {
    const result = config.cache.useCache(
      shouldUseCache,
      async (
        query: string,
        values?: (string | number)[],
        single?: boolean,
        flatten?: boolean,
        queryType?: OutputType
      ) => {
        const result = ((await connection.query({ query, values })) || []) as Record<
          string,
          QueryOutput
        >[]
        // NOTE: queryType only exists for backwards compatibility with <2.15.
        // Should remove completely at some point.
        if (['array', 'string', 'number'].includes(queryType ?? '')) flatten = true

        const structured = flatten
          ? result.map((record) => {
              const vals = Object.values(record)
              return vals.length <= 1 ? vals[0] : vals
            })
          : result

        return single ? structured[0] : structured
      },
      query,
      values,
      single,
      flatten,
      queryType
    )

    return result
  }
}

const parseChildren: ParseChildrenMethod = (expression) => {
  const [query, ...values] = expression.children as EvaluatorNode[]
  return { ...expression, query, values }
}

export const SQL: OperatorObject = {
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

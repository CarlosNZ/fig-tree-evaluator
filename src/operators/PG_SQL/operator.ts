import { getTypeCheckInput } from '../_operatorUtils'
import { evaluateArray } from '../../evaluate'
import { EvaluatorNode, OperatorObject, EvaluateMethod, ParseChildrenMethod } from '../../types'
import operatorData, { propertyAliases } from './data'
import { Client, QueryResult } from 'pg'

const evaluate: EvaluateMethod = async (expression, config) => {
  const [query, type, values, useCache] = (await evaluateArray(
    [expression.query, expression.type, expression.values || [], expression.useCache],
    config
  )) as [string, string, (string | number)[], boolean]

  config.typeChecker(getTypeCheckInput(operatorData.parameters, { query, type, values, useCache }))

  if (!config.options?.pgConnection) throw new Error('No Postgres database connection provided')

  const shouldUseCache = expression.useCache ?? config.options.useCache ?? true

  {
    const result = config.cache.useCache(
      shouldUseCache,
      async (query: string, type: string | undefined, values: (string | number)[]) => {
        return await processPgSQL(query, values, config.options.pgConnection as Client, type)
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

const processPgSQL = async (
  query: string,
  values: (string | number)[],
  connection: Client,
  queryType?: string
) => {
  const expression = {
    text: query,
    values: values,
    rowMode: queryType ? 'array' : '',
  }

  const res: QueryResult & { error?: string } = await connection.query(expression)
  // node-postgres doesn't throw, it just returns error object
  if (res?.error) throw new Error(res.error)

  switch (queryType) {
    case 'array':
      return res.rows.flat()
    case 'string':
      return res.rows.flat().join(' ')
    case 'number': {
      const result = res.rows.flat()
      return Number.isNaN(Number(result)) ? result : Number(result)
    }
    default:
      return res.rows
  }
}

export const PG_SQL: OperatorObject = {
  propertyAliases,
  operatorData,
  evaluate,
  parseChildren,
}

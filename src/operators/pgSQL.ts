import { evaluateArray } from './_operatorUtils'
import {
  BaseOperatorNode,
  EvaluatorNode,
  CombinedOperatorNode,
  EvaluatorOutput,
  FigTreeConfig,
  OperatorObject,
} from '../types'

const requiredProperties = ['query'] as const
const operatorAliases = ['pgSql', 'sql', 'postgres', 'pg', 'pgDb']
const propertyAliases = { replacements: 'values', queryType: 'type' }

export type PGNode = {
  [key in typeof requiredProperties[number]]: EvaluatorNode
} & BaseOperatorNode & { values?: EvaluatorNode[]; type?: 'string' }

const evaluate = async (expression: PGNode, config: FigTreeConfig): Promise<EvaluatorOutput> => {
  const [query, type, ...values] = (await evaluateArray(
    [expression.query, expression.type, ...(expression.values || ([] as EvaluatorNode[]))],
    config
  )) as [string, string, (string | number)[]]

  config.typeChecker(
    { name: 'query', value: query, expectedType: 'string' },
    { name: 'values', value: values, expectedType: 'array' },
    { name: 'type', value: type, expectedType: ['string', 'undefined'] }
  )

  if (!config.options?.pgConnection) throw new Error('No Postgres database connection provided')

  const shouldUseCache = expression.useCache ?? config.options.useCache ?? true

  try {
    const result = config.cache.useCache(
      shouldUseCache,
      async (query: string, type: string | undefined, ...values: (string | number)[]) => {
        return await processPgSQL(
          [query, ...values],
          config.options.pgConnection as PGConnection,
          type
        )
      },
      query,
      type,
      ...values
    )

    return result
  } catch (err) {
    throw err
  }
}

const parseChildren = (expression: CombinedOperatorNode): PGNode => {
  const [query, ...values] = expression.children as EvaluatorNode[]
  return { ...expression, query, values }
}

export interface PGConnection {
  query: (expression: { text: string; values?: any[]; rowMode?: string }) => Promise<QueryResult>
}

interface QueryRowResult {
  [columns: string]: any
}

export interface QueryResult {
  rows: QueryRowResult[]
  error?: string
}

const processPgSQL = async (queryArray: any[], connection: PGConnection, queryType?: string) => {
  const expression = {
    text: queryArray[0],
    values: queryArray.slice(1),
    rowMode: queryType ? 'array' : '',
  }

  try {
    const res = await connection.query(expression)
    // node-postgres doesn't throw, it just returns error object
    if (res?.error) throw new Error(res.error)

    switch (queryType) {
      case 'array':
        return res.rows.flat()
      case 'string':
        return res.rows.flat().join(' ')
      case 'number':
        const result = res.rows.flat()
        return Number.isNaN(Number(result)) ? result : Number(result)
      default:
        return res.rows
    }
  } catch (err) {
    throw err
  }
}

export const PG_SQL: OperatorObject = {
  requiredProperties,
  operatorAliases,
  propertyAliases,
  evaluate,
  parseChildren,
}

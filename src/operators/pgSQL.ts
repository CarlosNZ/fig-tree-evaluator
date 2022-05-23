import { allPropsOk } from './helpers'
import { BaseOperatorNode, EvaluatorNode, ValueNode, OperationInput, PGConnection } from '../types'

export interface PGNode extends BaseOperatorNode {
  query?: EvaluatorNode
  values?: EvaluatorNode[]
}

const parse = (expression: PGNode): EvaluatorNode[] => {
  const { query, values = [] } = expression
  allPropsOk(['query'], expression)
  return [query, ...values]
}

const operate = async ({ children, expression, options }: OperationInput): Promise<ValueNode> => {
  if (!options?.pgConnection) throw new Error('No Postgres database connection provided')
  try {
    return await processPgSQL(children, options.pgConnection, expression?.type)
  } catch (err) {
    throw err
  }
}

const processPgSQL = async (queryArray: any[], connection: PGConnection, queryType?: string) => {
  const expression = {
    text: queryArray[0],
    values: queryArray.slice(1),
    rowMode: queryType ? 'array' : '',
  }
  try {
    const res = await connection.query(expression)
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

export const pgSQL = { parse, operate }

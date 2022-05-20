import { EvaluateExpressionInstance, ValueNode, EvaluatorNode } from '../types'

export type BuildObjectQuery = {
  operator: 'buildObject'
  properties: {
    key: EvaluatorNode
    value: EvaluatorNode
  }[]
}

type BuildObject = (
  buildObjectQuery: BuildObjectQuery,
  evaluateExpressionInstance: EvaluateExpressionInstance
) => Promise<ValueNode>

const buildObject: BuildObject = async (buildObjectQuery, evaluateExpressionInstance) => {
  const result: { [key: string]: ValueNode } = {}

  const evaluateKeyValue = async (key: EvaluatorNode, value: EvaluatorNode) => {
    const [resultKey, resultValue] = await Promise.all<ValueNode>([
      evaluateExpressionInstance(key),
      evaluateExpressionInstance(value),
    ])
    if (resultKey && typeof value !== 'undefined') result[String(resultKey)] = resultValue
  }

  const evaluations = (buildObjectQuery?.properties || []).map(({ key, value }) =>
    evaluateKeyValue(key, value)
  )
  await Promise.all<ValueNode>(evaluations)

  return result
}

export default buildObject

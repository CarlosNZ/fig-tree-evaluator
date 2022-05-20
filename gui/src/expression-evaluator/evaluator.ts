import { EvaluatorNode, EvaluatorOptions } from './types'
import evaluateExpressionFunction from './evaluateExpression'

export class ExpressionEvaluator {
  options: EvaluatorOptions
  constructor(options: EvaluatorOptions) {
    this.options = options
  }

  public async evaluate(expression: EvaluatorNode, options: EvaluatorOptions) {
    // Update options from current instance if specified
    return await evaluateExpressionFunction(expression, { ...this.options, ...options })
  }
}

export const evaluateExpression = async (expression: EvaluatorNode, options: EvaluatorOptions) =>
  await evaluateExpressionFunction(expression, options)

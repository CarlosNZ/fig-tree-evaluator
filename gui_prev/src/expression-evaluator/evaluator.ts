import { EvaluatorNode, EvaluatorOptions } from './types'
import evaluateExpression from './evaluateExpression'

class ExpressionEvaluator {
  options: EvaluatorOptions
  constructor(options: EvaluatorOptions = {}) {
    this.options = options
  }

  public async evaluate(expression: EvaluatorNode, options: EvaluatorOptions = {}) {
    // Update options from current instance if specified
    return await evaluateExpression(expression, { ...this.options, ...options })
  }

  public updateOptions(options: EvaluatorOptions) {
    this.options = { ...this.options, ...options }
  }
}

export default ExpressionEvaluator

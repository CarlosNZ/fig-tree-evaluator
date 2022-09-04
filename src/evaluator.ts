import {
  OperatorNodeUnion,
  EvaluatorNode,
  EvaluatorOptions,
  Operator,
  OperatorReference,
} from './types'
import { evaluatorFunction } from './evaluate'
import { typeCheck, TypeCheckInput } from './typeCheck'
import operatorAliases from './operators/_operatorAliases.json'
import * as operators from './operators'

class ExpressionEvaluator {
  private options: EvaluatorOptions
  private operators: OperatorReference
  private operatorAliases: { [key: string]: Operator }
  constructor(options: EvaluatorOptions = {}) {
    this.options = options
    this.operators = operators
    this.operatorAliases = operatorAliases as { [key: string]: Operator }
  }

  private typeChecker = (...args: TypeCheckInput[]) => {
    const result = typeCheck(...args)
    if (result === true) return
    throw new Error(result)
  }

  public async evaluate(expression: EvaluatorNode, options: EvaluatorOptions = {}) {
    // Update options from current call if specified
    const instanceOptions = { ...this.options, ...options }
    return await evaluatorFunction(expression, {
      options: instanceOptions,
      operators: this.operators,
      operatorAliases: this.operatorAliases,
      typeChecker: instanceOptions.skipRuntimeTypeCheck ? () => {} : this.typeChecker,
    })
  }

  public getOptions() {
    return this.options
  }

  public updateOptions(options: EvaluatorOptions) {
    this.options = { ...this.options, ...options }
  }
}

export default ExpressionEvaluator

export const evaluateExpression = (expression: EvaluatorNode, options?: EvaluatorOptions) =>
  new ExpressionEvaluator(options).evaluate(expression)

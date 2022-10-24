import { EvaluatorNode, FigTreeOptions, Operator, OperatorReference } from './types'
import { evaluatorFunction } from './evaluate'
import { typeCheck, TypeCheckInput } from './typeCheck'
import operatorAliases from './operators/_operatorAliases.json'
import * as operators from './operators'
import { mergeOptions } from './helpers'

class FigTreeEvaluator {
  private options: FigTreeOptions
  private operators: OperatorReference
  private operatorAliases: { [key: string]: Operator }
  constructor(options: FigTreeOptions = {}) {
    this.options = options
    this.operators = operators
    this.operatorAliases = operatorAliases as { [key: string]: Operator }
  }

  private typeChecker = (...args: TypeCheckInput[]) => {
    const result = typeCheck(...args)
    if (result === true) return
    throw new Error(result)
  }

  public async evaluate(expression: EvaluatorNode, options: FigTreeOptions = {}) {
    // Update options from current call if specified
    const currentOptions = mergeOptions(this.options, options)

    return await evaluatorFunction(expression, {
      options: currentOptions,
      operators: this.operators,
      operatorAliases: this.operatorAliases,
      typeChecker: currentOptions.skipRuntimeTypeCheck ? () => {} : this.typeChecker,
    })
  }

  public getOptions() {
    return this.options
  }

  public updateOptions(options: FigTreeOptions) {
    this.options = { ...this.options, ...options }
  }
}

export default FigTreeEvaluator

// Stand-alone function for evaluating expressions without creating a
// FigTreeEvaluator object instance
export const evaluateExpression = (expression: EvaluatorNode, options?: FigTreeOptions) =>
  new FigTreeEvaluator(options).evaluate(expression)

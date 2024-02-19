/*
Core FigTreeEvaluator class
*/

import {
  EvaluatorNode,
  FigTreeOptions,
  OperatorAliases,
  OperatorMetadata,
  OperatorReference,
  CustomFunctionMetadata,
  FragmentMetadata,
} from './types'
import { evaluatorFunction } from './evaluate'
import { typeCheck, TypeCheckInput } from './typeCheck'
import { operatorAliases } from './operators/operatorAliases'
import * as operators from './operators'
import { filterOperators, mergeOptions } from './helpers'
import FigTreeCache, { Store } from './cache'
import { version } from './version'

class FigTreeEvaluator {
  private options: FigTreeOptions
  private operators: OperatorReference
  private operatorAliases: OperatorAliases
  private cache: FigTreeCache
  constructor(options: FigTreeOptions = {}) {
    this.options = standardiseOptionNames(options)
    this.operators = filterOperators(
      operators,
      this.options?.excludeOperators ?? [],
      operatorAliases
    )
    this.operatorAliases = operatorAliases
    this.cache = new FigTreeCache({ maxSize: options.maxCacheSize, maxTime: options.maxCacheTime })
  }

  private typeChecker = (...args: TypeCheckInput[] | [TypeCheckInput[]]) => {
    // Can accept args as either an array, or multiple parameters
    const inputArgs =
      args.length === 1 && Array.isArray(args[0]) ? args[0] : (args as TypeCheckInput[])
    const result = typeCheck(...inputArgs)
    if (result === true) return
    throw new Error(result)
  }

  public async evaluate(expression: EvaluatorNode, options: FigTreeOptions = {}) {
    // Update options from current call if specified
    const currentOptions = mergeOptions(this.options, standardiseOptionNames(options))

    // Update cache options
    if (currentOptions.maxCacheSize && currentOptions.maxCacheSize !== this.cache.getMax())
      this.cache.setMax(currentOptions.maxCacheSize)
    if (currentOptions.maxCacheTime && currentOptions.maxCacheTime !== this.cache.getMaxTime())
      this.cache.setMaxTime(currentOptions.maxCacheTime)

    return await evaluatorFunction(expression, {
      options: currentOptions,
      operators: options.excludeOperators
        ? filterOperators(operators, options.excludeOperators, operatorAliases)
        : this.operators,
      operatorAliases: this.operatorAliases,
      typeChecker: currentOptions.skipRuntimeTypeCheck
        ? () => {
            // Do nothing
          }
        : this.typeChecker,
      resolvedAliasNodes: {},
      cache: this.cache,
    })
  }

  public getOptions() {
    return this.options
  }

  public updateOptions(options: FigTreeOptions) {
    this.options = mergeOptions(this.options, standardiseOptionNames(options))
    if (this.options.excludeOperators)
      this.operators = filterOperators(operators, this.options.excludeOperators, operatorAliases)
  }

  public getCache = () => this.cache.getCache()

  public setCache = (cache: Store) => this.cache.setCache(cache)

  public getOperators() {
    const validOperators = this.options.excludeOperators
      ? filterOperators(operators, this.options.excludeOperators, operatorAliases)
      : this.operators
    const operatorList = Object.entries(validOperators).map(([key, value]) => ({
      name: key,
      ...value.operatorData,
    }))
    // Ensures we return operators in the order listed in "operatorAliases",
    // otherwise they're just ordered by the "import" order in
    // operators/index.ts, which is not stable through compilation
    const orderedOperators = [...new Set(Object.values(operatorAliases))] as string[]
    return operatorList.sort(
      (a, b) => orderedOperators.indexOf(a.name) - orderedOperators.indexOf(b.name)
    ) as readonly OperatorMetadata[]
  }

  public getFragments() {
    return Object.entries(this.options.fragments ?? {}).map(([key, value]) => ({
      name: key,
      ...value?.metadata,
    })) as readonly FragmentMetadata[]
  }

  public getCustomFunctions() {
    return Object.entries(this.options.functions ?? {}).map(([name, value]) => ({
      name,
      numRequiredArgs: value.length,
    })) as readonly CustomFunctionMetadata[]
  }

  public getVersion = () => version
}

export default FigTreeEvaluator

// Stand-alone function for evaluating expressions without creating a
// FigTreeEvaluator object instance
export const evaluateExpression = (expression: EvaluatorNode, options?: FigTreeOptions) =>
  new FigTreeEvaluator(options).evaluate(expression)

// Some option names may change over time, or we allow aliases. This function
// ensures backwards compatibility and keeps option names standardised.
const standardiseOptionNames = (options: FigTreeOptions & { objects?: object }) => {
  if ('objects' in options) {
    return { ...options, data: options.objects }
  }
  return options
}

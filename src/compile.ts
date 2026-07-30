/*
Pre-processing pass used by `FigTreeEvaluator.compile()`.

Bakes the purely *structural* transforms that `evaluatorFunction` (evaluate.ts)
would otherwise repeat on every node, on every evaluation, into the tree
ahead of time: shorthand expansion, operator alias resolution, property alias
mapping, and custom-function normalisation. None of these depend on runtime
`data`, only on the expression's static shape and the evaluator instance's
static config (operators, operatorAliases, options.functions/fragments).

This walk is generic (dives into every object/array value, regardless of
which operator would actually consume it), mirroring the existing
`evaluateObject` dive used by the `evaluateFullObject` option. That's safe
here because it only ever walks the expression tree, never `options.data`.
*/

import { EvaluatorNode, FigTreeConfig, OperatorNode } from './types'
import { preProcessShorthand } from './shorthandSyntax'
import {
  isObject,
  isOperatorNode,
  isFragmentNode,
  mapPropertyAliases,
  getOperatorName,
  replaceCustomOperatorSync,
} from './helpers'

const COMPILED_MARKER = Symbol('figTreeCompiled')

export const isCompiledNode = (node: unknown): boolean =>
  isObject(node) && (node as Record<symbol, unknown>)[COMPILED_MARKER] === true

export const compileNode = (node: EvaluatorNode, config: FigTreeConfig): EvaluatorNode => {
  if (Array.isArray(node)) return node.map((child) => compileNode(child, config))
  if (!isObject(node)) return node

  const functionNames = Object.keys(config.options?.functions ?? {})
  let expr = preProcessShorthand(
    node,
    config.options?.fragments,
    functionNames,
    !config.options?.noShorthand
  )

  if (Array.isArray(expr)) return compileNode(expr, config)
  if (!isObject(expr)) return expr as EvaluatorNode

  if (isOperatorNode(expr)) expr = replaceCustomOperatorSync(expr as OperatorNode, config)

  if (isOperatorNode(expr)) {
    const operatorKey = getOperatorName((expr as OperatorNode).operator, config.operatorAliases)
    if (operatorKey && config.operators[operatorKey]) {
      expr = {
        ...mapPropertyAliases(config.operators[operatorKey].propertyAliases, expr as OperatorNode),
        operator: operatorKey,
      }
    }
  }

  const isFragment = isFragmentNode(expr)
  const compiled: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(expr)) {
    // Fragment name may be a runtime-evaluated node -- leave the fragment
    // lookup itself dynamic, only compile its parameters
    compiled[key] =
      isFragment && key === 'fragment' ? value : compileNode(value as EvaluatorNode, config)
  }
  Object.defineProperty(compiled, COMPILED_MARKER, { value: true, enumerable: false })
  return compiled as EvaluatorNode
}

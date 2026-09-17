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

import { EvaluatorNode, FigTreeConfig, OperatorNode, OperatorObject, OutputType } from './types'
import { preProcessShorthand } from './shorthandSyntax'
import {
  isObject,
  isOperatorNode,
  isFragmentNode,
  isAliasString,
  mapPropertyAliases,
  getOperatorName,
  replaceCustomOperatorSync,
} from './helpers'

const COMPILED_MARKER = Symbol('figTreeCompiled')
// Precomputed list of this node's `$alias` property keys -- the key *set* is
// static (only the values need evaluating), so `evaluateNodeAliases` can skip
// re-scanning `Object.keys()` with a regex on every evaluate() call.
export const ALIAS_KEYS = Symbol('figTreeAliasKeys')
// Precomputed `outputType`/`type` value, when it's a plain literal string
// (the common case) rather than a node needing evaluation. Not set when the
// value is itself an alias reference (e.g. `$myType`) -- alias resolution is
// data-dependent per evaluate() call, so that case must stay dynamic.
export const RESOLVED_OUTPUT_TYPE = Symbol('figTreeResolvedOutputType')

export const isCompiledNode = (node: unknown): boolean =>
  isObject(node) && (node as Record<symbol, unknown>)[COMPILED_MARKER] === true

export const getCompiledAliasKeys = (node: unknown): string[] | undefined =>
  isObject(node) ? (node as Record<symbol, string[]>)[ALIAS_KEYS] : undefined

export const getCompiledOutputType = (node: unknown): OutputType | undefined =>
  isObject(node) ? (node as Record<symbol, OutputType>)[RESOLVED_OUTPUT_TYPE] : undefined

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

  let operatorObject: OperatorObject | undefined

  if (isOperatorNode(expr)) {
    const operatorKey = getOperatorName((expr as OperatorNode).operator, config.operatorAliases)
    if (operatorKey && config.operators[operatorKey]) {
      operatorObject = config.operators[operatorKey]
      expr = {
        ...mapPropertyAliases(operatorObject.propertyAliases, expr as OperatorNode),
        operator: operatorKey,
      }

      // `parseChildren` is a pure structural remap (positional `children`
      // array -> the operator's named properties) with no data dependency,
      // so it's safe to run once now instead of on every evaluate() call --
      // but only when `children` is already a literal array; if it's itself
      // an expression node, its shape isn't known until runtime.
      if (Array.isArray((expr as OperatorNode).children)) {
        expr = operatorObject.parseChildren(expr as OperatorNode, config)
        delete (expr as OperatorNode).children
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
  if (operatorObject) {
    const aliasKeys = Object.keys(compiled).filter(isAliasString)
    Object.defineProperty(compiled, ALIAS_KEYS, { value: aliasKeys, enumerable: false })

    const outputTypeValue = compiled.outputType ?? compiled.type
    if (typeof outputTypeValue === 'string' && !isAliasString(outputTypeValue)) {
      Object.defineProperty(compiled, RESOLVED_OUTPUT_TYPE, {
        value: outputTypeValue as OutputType,
        enumerable: false,
      })
    }
  }
  return compiled as EvaluatorNode
}

/*
Registry-aware backing implementation for `FigTreeEvaluator.isFigTreeExpression()`.

Unlike the stand-alone, purely-structural `isFigTreeExpression` in helpers.ts,
this mirrors what a *specific* evaluator instance would actually do with an
expression -- i.e. it answers "is it worth sending this to the evaluator?". It is
registry-aware (operators, fragments, custom functions) and follows the
instance's `evaluateFullObject` (and `noShorthand`) settings.

It lives in its own module rather than helpers.ts because it reuses
`preProcessShorthand`, and shorthandSyntax.ts already imports from helpers.ts --
keeping it here avoids a circular dependency.

See test/27_isFigTreeExpression.test.ts for the full behaviour spec.
*/

import { EvaluatorNode, Fragments } from './types'
import { isObject, isOperatorNode, isFragmentNode, isAliasString } from './helpers'
import { preProcessShorthand } from './shorthandSyntax'

interface CheckConfig {
  fragments: Fragments
  functionNames: string[]
  evaluateFullObject: boolean
  useShorthand: boolean
}

export const checkIsFigTreeExpression = (
  expression: EvaluatorNode,
  config: CheckConfig
): boolean => walk(expression, config, new Set())

/*
`scope` holds the alias definitions ("$name" keys) visible at this point -- i.e.
those declared on the current node or any ancestor. Definitions cascade *down*
the tree, so a reference resolves only if its definition is in scope; a
definition in a sibling branch or a descendant does not (matching the
evaluator's behaviour).
*/
const walk = (node: EvaluatorNode, config: CheckConfig, scope: Set<string>): boolean => {
  const { fragments, functionNames, evaluateFullObject, useShorthand } = config

  if (isObject(node)) {
    // An operator/fragment node, or an object whose shorthand keys promote it to
    // one -- the canonical "this is an expression" case. Delegating to
    // preProcessShorthand keeps registry resolution identical to the evaluator's.
    const processed = preProcessShorthand(node as EvaluatorNode, fragments, functionNames, useShorthand)
    if (isOperatorNode(processed) || isFragmentNode(processed)) return true

    // Otherwise it's a plain object; any "$" keys are alias *definitions*. The
    // evaluator only descends into plain objects when `evaluateFullObject` is on.
    if (!evaluateFullObject) return false

    // Bring this node's alias definitions into scope for all of its values
    // (including the definition values themselves), then recurse.
    const childScope = new Set([...scope, ...Object.keys(node).filter(isAliasString)])
    return Object.values(node as Record<string, EvaluatorNode>).some((value) =>
      walk(value, config, childScope)
    )
  }

  // Arrays are always evaluated element-wise, regardless of `evaluateFullObject`
  if (Array.isArray(node)) return node.some((element) => walk(element, config, scope))

  // A bare alias reference counts only if its definition is in scope
  if (typeof node === 'string' && isAliasString(node)) return scope.has(node)

  // Primitives, plain strings, unresolved references, etc.
  return false
}

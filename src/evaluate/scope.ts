/**
 * The lexical scope chain — `vars` at runtime ("$vars — lexical, lazy,
 * memoized" in docs-dev/v3-specs/v3-api.md).
 *
 * A scope instance holds one node's declared vars as thunks. `once()` gives
 * all three guarantees the spec asks for at a stroke: evaluated at most
 * once, shared by parallel branches (they await the one in-flight promise),
 * and memoized including the rejection — which is the corner fallback rule
 * 5 records, where a fallback referencing the var that failed re-receives
 * that rejection and fails too.
 *
 * Every name in a block exists before any of its definitions runs, and each
 * thunk captures the context with its OWN scope already pushed, so a var
 * may reference its siblings and its outer scopes. That mirrors the static
 * checker's frame handling exactly (src/parse/staticChecks.ts) — which is
 * what makes its cycle detection true of the runtime: `{ vars: { x:
 * '$vars.x' } }` resolves to the inner `x` in both, and is refused before
 * evaluation. There is no runtime cycle guard, and it could not be a simple
 * one: re-entrant demand and a legitimate parallel branch sharing the
 * in-flight promise are indistinguishable without async context tracking.
 * The static gate is the defence; the whole-evaluation timeout is the
 * backstop.
 *
 * A thunk is bound to the scope that DECLARED it, never to whichever node
 * demanded it first. The alternative loses: an `and` that resolved early
 * would cancel a var mid-flight, `once` would memoize that cancellation,
 * and a later legitimate demand from a live branch would inherit the
 * poison. A consumer that wants to stop waiting races the thunk at its own
 * demand site instead.
 */
import type { CompiledNode } from '../parse'
import { once } from '../utils'
import type { EvaluationContext } from './context'
import { evaluateNode } from './evaluate'

export interface Scope {
  readonly parent?: Scope
  /** Declared name → its evaluate-at-most-once thunk. */
  readonly vars: Map<string, () => Promise<unknown>>
}

/**
 * Derive the context a node's descendants evaluate in. Returns the context
 * unchanged when the node declares no vars, so the common case allocates
 * nothing.
 */
export const pushVars = (
  ctx: EvaluationContext,
  vars: Record<string, CompiledNode> | undefined
): EvaluationContext => {
  if (vars === undefined) return ctx
  const scope: Scope = { parent: ctx.scope, vars: new Map() }
  const scoped: EvaluationContext = { ...ctx, scope }
  for (const [name, node] of Object.entries(vars))
    scope.vars.set(name, once(() => evaluateNode(node, scoped)))
  return scoped
}

/** The nearest declaration of `name`, innermost out — lexical shadowing. */
export const lookupVar = (
  scope: Scope | undefined,
  name: string
): (() => Promise<unknown>) | undefined => {
  for (let current = scope; current !== undefined; current = current.parent) {
    const thunk = current.vars.get(name)
    if (thunk !== undefined) return thunk
  }
  return undefined
}

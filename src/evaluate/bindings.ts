/**
 * The iterator binding chain — `$element` / `$index` at runtime ("`$element`
 * / `$index` and `as`" in docs-dev/v3-specs/v3-api.md; "The iterators — one
 * contract, five operators" in
 * docs-dev/v3-specs/v3-operator-parameters-2.md).
 *
 * Deliberately the same shape as the vars chain next door (./scope): a
 * linked frame per enclosing scope, looked up innermost-out. The two are
 * separate chains because they have different lifetimes — one vars scope
 * spans a node's parameters and its fallback, while a binding frame exists
 * only for one element of one `each` subtree.
 *
 * Which frame answers a reference is `bindsReference` (src/parse/artifact),
 * the same predicate the static checker resolves through.
 */
import { bindsReference } from '../parse'
import type { EvaluationContext } from './context'

export interface Bindings {
  readonly parent?: Bindings
  /** The `as` name, or null for the default `$element` / `$index` pair. */
  readonly as: string | null
  readonly element: unknown
  readonly index: number
}

/** The context one element of an `each` subtree evaluates in. */
export const pushBinding = (
  ctx: EvaluationContext,
  as: string | null,
  element: unknown,
  index: number
): EvaluationContext => ({ ...ctx, bindings: { parent: ctx.bindings, as, element, index } })

/**
 * The innermost frame a reference resolves against. `binding` is the
 * as-name the reference was written under, or undefined for a bare
 * `$element` / `$index`, which only a frame with no `as` can answer.
 */
export const lookupBinding = (
  bindings: Bindings | undefined,
  namespace: 'element' | 'index',
  binding: string | undefined
): Bindings | undefined => {
  for (let current = bindings; current !== undefined; current = current.parent)
    if (bindsReference(current.as, namespace, binding)) return current
  return undefined
}

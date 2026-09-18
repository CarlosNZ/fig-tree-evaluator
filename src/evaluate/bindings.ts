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
 * The match rule mirrors the static checker exactly
 * (src/parse/staticChecks.ts), which is what makes its `unresolved-binding`
 * errors true of the runtime: a frame that was renamed with `as` does NOT
 * bind the default names — one way to refer to each thing.
 */
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
  for (let current = bindings; current !== undefined; current = current.parent) {
    if (binding === undefined) {
      if (current.as === null) return current
      continue
    }
    const name = namespace === 'element' ? current.as : `${current.as ?? ''}Index`
    if (name === binding) return current
  }
  return undefined
}

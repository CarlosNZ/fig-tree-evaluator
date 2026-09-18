/**
 * Reference resolution at evaluation ("References & scoping" in
 * docs-dev/v3-specs/v3-api.md).
 *
 * `$data`: bare → the merged data object by reference; drilled → the shared
 * path resolver, a miss yielding `null` (absence is not failure) unless
 * `strictDataPaths` turns it into an ordinary, fallback-catchable runtime
 * failure.
 *
 * `$vars`: the first segment names the var, the rest drills into whatever
 * it evaluated to, on the same rules.
 *
 * `strictDataPaths` governs every namespace's drill, not just `$data`
 * (ruled September 2026). The reasoning is the assessment's own ranking of
 * the three typo mitigations: checking paths against a schema or sample
 * data at authoring time is the strongest, and it is available for `$data`
 * alone — a var, element or param holds the output of the author's own
 * expression, which no schema describes. So the runtime throw is the only
 * protection the other namespaces can have, which is a reason to extend it
 * to them rather than withhold it. One strict-path rule, four namespaces.
 *
 * `$element` / `$index`: the innermost enclosing binding frame, found by
 * the same match rule the static checker used, so an `as`-renamed frame
 * does not answer to the default names. `$element` drills like the rest;
 * `$index` is bare-only by grammar and needs no resolution beyond the
 * frame.
 *
 * `$params` arrives with fragments (Phase 11).
 */
import { FigTreeError } from '../FigTreeError'
import { ErrorCodes } from '../errorCodes'
import { resolvePath, type PathSegment } from '../primitives'
import type { ReferenceNode } from '../parse'
import type { EvaluationContext } from './context'
import { lookupBinding } from './bindings'
import { internalError } from './internal'
import { lookupVar } from './scope'

/**
 * Returns the value, or a promise of it for a namespace that has to await
 * something. The one caller is `evaluateNode`, which is async and so
 * settles either shape — and a synchronous `$data` read stays free of a
 * microtask hop, which matters at the rate references are resolved.
 */
export const resolveReference = (node: ReferenceNode, ctx: EvaluationContext): unknown => {
  switch (node.namespace) {
    case 'data':
      return resolveData(node, ctx)
    case 'vars':
      return resolveVar(node, ctx)
    case 'element':
    case 'index':
      return resolveBinding(node, ctx)
    default:
      throw internalError(`'${node.raw}': the $${node.namespace} namespace is not evaluable yet`)
  }
}

const resolveData = (node: ReferenceNode, ctx: EvaluationContext): unknown => {
  if (node.segments.length === 0) return ctx.data
  return drill(ctx.data, node.segments, node, ctx, 'is absent from the evaluation data')
}

const resolveVar = async (node: ReferenceNode, ctx: EvaluationContext): Promise<unknown> => {
  const [name, ...rest] = node.segments
  // The var name is the first segment; the grammar admits nothing but an
  // identifier there, and an unresolvable one is a static error
  const thunk = typeof name === 'string' ? lookupVar(ctx.scope, name) : undefined
  if (typeof name !== 'string' || thunk === undefined)
    throw internalError(
      `'${node.raw}': no var named '${String(name)}' is in scope — the static gate should have refused it`
    )
  const value = await thunk()
  if (rest.length === 0) return normalize(value)
  return drill(value, rest as PathSegment[], node, ctx, `is absent from the value of '$vars.${name}'`)
}

/**
 * Resolve a drill path, with the one absence rule: `null`, unless
 * `strictDataPaths` makes it an ordinary runtime failure — which a
 * `fallback` catches like any other, references being unable to carry one
 * themselves.
 */
const resolveBinding = (node: ReferenceNode, ctx: EvaluationContext): unknown => {
  const namespace = node.namespace as 'element' | 'index'
  const frame = lookupBinding(ctx.bindings, namespace, node.binding)
  if (frame === undefined)
    throw internalError(
      `'${node.raw}': no enclosing iterator binds it — the static gate should have refused it`
    )
  if (namespace === 'index') return frame.index
  if (node.segments.length === 0) return normalize(frame.element)
  return drill(frame.element, node.segments, node, ctx, `is absent from '${node.raw.split('.')[0]}'`)
}

const drill = (
  source: unknown,
  segments: PathSegment[],
  node: ReferenceNode,
  ctx: EvaluationContext,
  absence: string
): unknown => {
  const result = resolvePath(source, segments)
  if (result.found) return normalize(result.value)
  if (!ctx.strictDataPaths) return null
  throw new FigTreeError({
    code: ErrorCodes.missingDataPath,
    message: `'${node.raw}' ${absence} (strictDataPaths)`,
    path: node.path,
  })
}

/** A stored `undefined` is not a value — JSON semantics at the boundary. */
const normalize = (value: unknown): unknown => (value === undefined ? null : value)

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
 * `$error` is the exception: a miss inside it is `null` whatever
 * `strictDataPaths` says. Its shape varies by error code, and a fallback
 * inspecting it must not fail on a field the code it caught does not carry.
 * It is built from the failure the innermost enclosing fallback caught on
 * each read, so a fallback that never reads it builds nothing.
 *
 * `$element` / `$index`: the innermost enclosing binding frame, found by
 * the same match rule the static checker used, so an `as`-renamed frame
 * does not answer to the default names. `$element` drills like the rest;
 * `$index` is bare-only by grammar and needs no resolution beyond the
 * frame.
 *
 * `$params`: the same shape as `$vars` — the first segment names the
 * parameter, the rest drills into its resolved value — with one deliberate
 * difference. An unresolvable var is an engine bug, because the static gate
 * refuses one; an unresolvable *parameter* cannot arise either, but a
 * DECLARED parameter with no argument is ordinary and yields null. Bare
 * `$params` is legal and materializes the declared set, which is why it
 * demands every argument.
 */
import { FigTreeError, type FallbackError } from '../FigTreeError'
import { ErrorCodes } from '../errorCodes'
import { resolvePath, type PathSegment } from '../primitives'
import { splice, toNodePath, type ReferenceNode, type StaticFallback } from '../compile'
import type { EvaluationContext, FragmentFrame } from './context'
import { lookupBinding } from './bindings'
import { fallbackError } from './fragment'
import { unrefused } from './internal'
import { lookupVar } from './scope'

/**
 * Returns the value, or a promise of it for a namespace that has to await
 * something. The one caller is the node dispatch, which hands either shape
 * back as it is — so a synchronous `$data` read costs no promise and no
 * microtask hop, which matters at the rate references are resolved.
 */
export const resolveReference = (node: ReferenceNode, ctx: EvaluationContext): unknown => {
  switch (node.namespace) {
    case 'data':
      return resolveData(node, ctx)
    case 'vars':
      return resolveVar(node, ctx)
    case 'params':
      return resolveParam(node, ctx)
    case 'element':
    case 'index':
      return resolveBinding(node, ctx)
    case 'error':
      return resolveError(node, ctx)
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
  if (typeof name !== 'string' || thunk === undefined) throw unrefused(`'${node.raw}'`)
  const value = await thunk()
  if (rest.length === 0) return normalize(value)
  return drill(
    value,
    rest as PathSegment[],
    node,
    ctx,
    `is absent from the value of '$vars.${name}'`
  )
}

const resolveParam = async (node: ReferenceNode, ctx: EvaluationContext): Promise<unknown> => {
  const params = ctx.params
  if (params === undefined) throw unrefused(`'${node.raw}'`)
  const [name, ...rest] = node.segments
  // Bare `$params`: the declared parameters with their resolved values.
  // Every one of them, so laziness is gone for this call — self-inflicted,
  // legible, and the same bargain as referencing a var
  if (name === undefined) {
    const resolved: Record<string, unknown> = {}
    await Promise.all(
      [...params].map(async ([declared, thunk]) => {
        resolved[declared] = normalize(await thunk())
      })
    )
    return resolved
  }
  const thunk = typeof name === 'string' ? params.get(name) : undefined
  if (thunk === undefined) throw unrefused(`'${node.raw}'`)
  const value = await thunk()
  if (rest.length === 0) return normalize(value)
  return drill(
    value,
    rest as PathSegment[],
    node,
    ctx,
    `is absent from the value of '$params.${String(name)}'`
  )
}

const resolveBinding = (node: ReferenceNode, ctx: EvaluationContext): unknown => {
  const namespace = node.namespace as 'element' | 'index'
  const frame = lookupBinding(ctx.bindings, namespace, node.binding)
  if (frame === undefined) throw unrefused(`'${node.raw}'`)
  if (namespace === 'index') return frame.index
  if (node.segments.length === 0) return normalize(frame.element)
  return drill(
    frame.element,
    node.segments,
    node,
    ctx,
    `is absent from '${node.raw.split('.')[0]}'`
  )
}

const resolveError = (node: ReferenceNode, ctx: EvaluationContext): unknown => {
  if (ctx.caught === undefined) throw unrefused(`'${node.raw}'`)
  return readError(fallbackError(ctx.caught, ctx.frame), node.segments)
}

/** A read of `$error`, where a miss is null whatever `strictDataPaths` says. */
const readError = (error: FallbackError, segments: PathSegment[]): unknown => {
  if (segments.length === 0) return error
  const result = resolvePath(error, segments)
  return result.found ? normalize(result.value) : null
}

/**
 * A static fallback's answer to the failure it caught (fallback rule 3):
 * its value, each `$error` read in it filled in from `caught`, which is
 * located by `frame` as a read of `$error` is. Nothing is evaluated, so it
 * can run where nothing may: past the deadline, for a shielded hole. A read
 * a fragment call lifted from its body is located where in the body the
 * timeout would have met it.
 */
export const fillFallback = (
  fallback: StaticFallback,
  caught: FigTreeError,
  frame: FragmentFrame | undefined
): unknown => {
  const { value, reads } = fallback
  if (reads === undefined) return value
  const error = fallbackError(caught, frame)
  const values = reads.map(({ segments, within }) =>
    readError(within === undefined ? error : { ...error, ...within }, segments)
  )
  // A read at the root is the whole fallback
  return reads[0].at.length === 0 ? values[0] : splice(value, reads, values)
}

/**
 * Resolve a drill path, with the one absence rule: `null`, unless
 * `strictDataPaths` makes it an ordinary runtime failure — which a
 * `fallback` catches like any other, references being unable to carry one
 * themselves.
 */
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
    path: toNodePath(node.path),
  })
}

/** A stored `undefined` is not a value — JSON semantics at the boundary. */
const normalize = (value: unknown): unknown => (value === undefined ? null : value)

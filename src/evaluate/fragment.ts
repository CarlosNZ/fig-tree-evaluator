/**
 * The fragment-call wrapper — the node machinery for a call, written
 * against `./operator.ts` so the two read as siblings ("Call-site
 * semantics" in the Fragments area of docs-dev/v3-specs/v3-api.md).
 *
 * Three things distinguish a call from an operator node.
 *
 * **Arguments are the vars mechanism.** A call instance is a scope: each
 * declared parameter enters it as an evaluate-at-most-once thunk closing
 * over the CALLER's context, so an argument expression reads the caller's
 * vars and bindings, evaluates at most once however often the body reads
 * it, is shared by parallel branches, and never evaluates at all if the
 * body's only reference sits in a branch that does not run. That is
 * `pushVars` with a different context substituted, and nothing more.
 *
 * It also inherits that mechanism's abort rule, and for the same reason:
 * an argument runs under the CALLER's signal, not the body's. A body
 * branch that resolves early would otherwise cancel an argument mid-flight
 * and memoize the cancellation, poisoning a later demand from a live
 * branch — the case ./scope.ts records for vars, unchanged by the fact
 * that a fragment sits in between.
 *
 * **The body is sealed.** It runs under a context with `scope` and
 * `bindings` dropped, so a body cannot reach a caller's var or a caller's
 * iterator binding — structurally, because both lookups walk a chain that
 * now starts empty. The static half of the same rule is already enforced
 * at registration, where a body compiles in isolation.
 *
 * **A failure carries two locations.** A body node's path resolves inside
 * the registered definition, not inside the input, so it cannot be the
 * `path` a host resolves. Anchoring rewrites it once, at the boundary the
 * failure crosses: `fragment` + `fragmentPath` say where in the body,
 * `path` says which call in the input. An argument's failure is anchored
 * by the thunk instead, with the caller's own frame — which is why an
 * argument failure points straight into the input and carries no
 * `fragmentPath`, and why an argument written inside an outer body is
 * attributed to that outer body.
 *
 * No caching: `useCache` is a parse error on a call node, and a
 * fragment-result cache would need its own key-derivation story
 * (parameters plus everything the body reads). Operator nodes inside the
 * body cache normally, on their own resolved parameters.
 */
import { FigTreeError, isFigTreeError } from '../FigTreeError'
import { ErrorCodes } from '../errorCodes'
import type { FragmentEntry, FragmentParameter } from '../fragments'
import type { CompiledNode, FragmentCallNode, NodePath } from '../parse'
import { checkConstraints, checkType, typeNamesNull } from '../typeCheck'
import { isPlainObject, once } from '../utils'
import { DeferredScope } from './abort'
import type { EvaluationContext, FragmentFrame, ParamsFrame } from './context'
import { evaluateNode } from './evaluate'
import {
  brand,
  hasBrand,
  internalError,
  isCancellation,
  isInternalError,
  isKillSwitch,
} from './internal'
import { pushVars } from './scope'

export const evaluateFragment = async (
  node: FragmentCallNode,
  ctx: EvaluationContext
): Promise<unknown> => {
  const { entry } = node
  if (entry === undefined)
    throw internalError(
      `fragment call '${node.name}' resolved to nothing — the static gate should have refused it`
    )

  // One scope over the arguments and the fallback alike, exactly as the
  // operator wrapper spans its attempt and its fallback (rule 5). These
  // vars belong to the CALLER's world: they scope the argument
  // expressions, and the body never sees them
  const scoped = pushVars(ctx, node.vars)
  // The abort scope covers the body only. A fallback runs after the body
  // has settled, so a fallback under this signal would be refused at its
  // first node boundary — and settling it here is what refuses an argument
  // demanded after the call returned
  const scope = new DeferredScope(scoped.abortScope)
  const frame: FragmentFrame = {
    fragment: node.name,
    // Inherited where there is an enclosing frame: a nested call node
    // lives inside a registered body, so its own path does not resolve in
    // the input, and the outermost call is the location a host can act on
    callPath: ctx.frame?.callPath ?? node.path,
  }
  const bodyCtx = { ...scoped, abortScope: scope }
  try {
    return await runBodyScoped(node, entry, bodyCtx, scoped, frame, scope)
  } catch (error) {
    if (isInternalError(error) || isCancellation(error) || isKillSwitch(error)) throw error
    const failure = anchor(error, frame)
    const { fallback } = node
    if (fallback === undefined) throw failure
    // The fallback runs outside the abort scope, which has settled by the
    // time this branch runs — it is not part of the attempt, and must not
    // be refused by the abort that ended it
    try {
      return await evaluateNode(fallback, scoped)
    } catch (fallbackError) {
      if (
        isInternalError(fallbackError) ||
        isCancellation(fallbackError) ||
        isKillSwitch(fallbackError)
      )
        throw fallbackError
      const wrapped = anchor(fallbackError, ctx.frame)
      if (isFigTreeError(wrapped) && wrapped.cause === undefined) wrapped.cause = failure
      throw wrapped
    }
  }
}

/**
 * Settle the call's abort scope the moment the body settles, not when the
 * whole wrapper returns — a fallback evaluating afterwards must not be
 * caught by the abort that ended the attempt. The same shape as
 * `attemptScoped` in ./operator.
 */
const runBodyScoped = async (
  node: FragmentCallNode,
  entry: FragmentEntry,
  bodyCtx: EvaluationContext,
  argumentCtx: EvaluationContext,
  frame: FragmentFrame,
  scope: { settle: () => void }
): Promise<unknown> => {
  try {
    return await runBody(node, entry, bodyCtx, argumentCtx, frame)
  } finally {
    scope.settle()
  }
}

/**
 * Build the call instance's params frame and run the body under it.
 * `argumentCtx` is the caller's context — where argument expressions
 * evaluate — and is deliberately NOT the body's.
 */
const runBody = async (
  node: FragmentCallNode,
  entry: FragmentEntry,
  bodyScope: EvaluationContext,
  argumentCtx: EvaluationContext,
  frame: FragmentFrame
): Promise<unknown> => {
  const params =
    node.argumentsMode === 'dynamic'
      ? await dynamicFrame(node, entry, argumentCtx)
      : staticFrame(node, entry, argumentCtx)
  const sealed: EvaluationContext = { ...bodyScope, params, frame }
  delete sealed.scope
  delete sealed.bindings
  const result = await evaluateNode(entry.body, sealed)
  // The body root already passed its own result boundary; all that is
  // left is the domain rule that there is no `undefined` in a result
  return result === undefined ? null : result
}

// ── The two argument modes ──────────────────────────────────────────

/**
 * Static mode: one lazy thunk per DECLARED parameter — not per supplied
 * argument, which is what makes bare `$params` and dynamic mode's ignored
 * extras fall out of the same structure. An unsupplied optional resolves
 * through the declaration like any other, so the body cannot tell "not
 * passed" from "passed null at a type that excludes null".
 */
const staticFrame = (
  node: FragmentCallNode,
  entry: FragmentEntry,
  ctx: EvaluationContext
): ParamsFrame => {
  const supplied = (node.parameters ?? {}) as Record<string, CompiledNode>
  const params = new Map<string, () => Promise<unknown>>()
  for (const [name, declared] of Object.entries(entry.parameters)) {
    const argument = supplied[name]
    const thunk = once(async () => {
      if (argument === undefined) return unsuppliedValue(node, name, declared, ctx)
      let value: unknown
      try {
        value = await evaluateNode(argument, ctx)
      } catch (error) {
        // Anchored HERE, in the CALLER's frame: the expression that failed
        // is the caller's, and its path already resolves where that frame
        // says it does
        throw anchor(error, ctx.frame)
      }
      return resolveArgument(node, name, declared, value, argument.path, ctx)
    })
    params.set(name, () => {
      const pending = thunk()
      // A demand the body then abandons — an `or` that resolved early, a
      // branch cancelled — must not surface as an unhandled rejection
      pending.catch(() => {})
      return pending
    })
  }
  return params
}

/**
 * Dynamic mode: the whole arguments object arrives from one evaluation, so
 * there is no per-argument expression to address lazily. The signature is
 * therefore checked whole, eagerly — the value already exists, so deferring
 * would buy nothing and hide a broken call behind an untaken branch.
 *
 * Extra keys are ignored, deliberately: declared parameters define
 * everything a body can read, so an unread key is inert, and erroring would
 * kill the case the mode exists for — a form response or a database row
 * forwarded whole.
 */
const dynamicFrame = async (
  node: FragmentCallNode,
  entry: FragmentEntry,
  ctx: EvaluationContext
): Promise<ParamsFrame> => {
  const source = node.parameters as CompiledNode
  let supplied: unknown
  try {
    supplied = await evaluateNode(source, ctx)
  } catch (error) {
    throw anchor(error, ctx.frame)
  }
  if (!isPlainObject(supplied))
    throw anchor(
      callFailure(
        node,
        ErrorCodes.typeCheck,
        `'parameters' must evaluate to an object, received ${describe(supplied)}`,
        source.path
      ),
      ctx.frame
    )

  const params = new Map<string, () => Promise<unknown>>()
  for (const [name, declared] of Object.entries(entry.parameters)) {
    // Extras are ignored: declared parameters define everything a body can
    // read, so an unread key is inert, and refusing one would kill the case
    // this mode exists for
    const resolved = Object.hasOwn(supplied, name)
      ? resolveArgument(node, name, declared, supplied[name], source.path, ctx)
      : unsuppliedValue(node, name, declared, ctx, source.path)
    params.set(name, () => Promise.resolve(resolved))
  }
  return params
}

/**
 * An unsupplied parameter: its default, or `null` where it declares none —
 * absence semantics, exactly as a missing `$data` path yields null.
 *
 * A required one has no answer. Static mode cannot reach this: the static
 * checker refused the call before evaluation. Dynamic mode can, and that
 * is one of the checks this mode moves to runtime — under the same code
 * and wording the static checker uses, because the condition is the same
 * and the mode is the author's choice, not the host's.
 */
const unsuppliedValue = (
  node: FragmentCallNode,
  name: string,
  declared: FragmentParameter,
  ctx: EvaluationContext,
  path: NodePath = node.path
): unknown => {
  if (!declared.required) return declared.default ?? null
  throw anchor(callFailure(node, ErrorCodes.missingRequired, `requires '${name}'`, path), ctx.frame)
}

/**
 * The declaration layers, applied where a value arrives: null-means-unset,
 * then the type check. The same two layers an operator parameter gets, in
 * the same order and with the same opt-outs — `type: ['string', 'null']`
 * receives a null as a value, and `runtimeTypeCheck: false` removes the
 * check while leaving the null reading alone, null policy being semantics
 * rather than validation.
 */
const resolveArgument = (
  node: FragmentCallNode,
  name: string,
  declared: FragmentParameter,
  value: unknown,
  path: NodePath,
  ctx: EvaluationContext
): unknown => {
  const normalized = value === undefined ? null : value
  // Null-means-unset: a null at an optional parameter whose type does not
  // name null behaves as if nothing had been passed. The opt-out is the
  // declaration itself — `type: ['string', 'null']` receives it as a value
  if (normalized === null && !declared.required && !typeNamesNull(declared.type))
    return declared.default ?? null
  if (!ctx.runtimeTypeCheck) return normalized

  const typed = checkType(normalized, declared.type)
  if (!typed.ok)
    throw anchor(
      callFailure(
        node,
        ErrorCodes.typeCheck,
        `parameter '${name}': expected ${typed.expected}, received ${typed.actual}`,
        path
      ),
      ctx.frame
    )
  if (declared.constraints !== undefined) {
    const constrained = checkConstraints(normalized, declared.constraints)
    if (!constrained.ok)
      throw anchor(
        callFailure(
          node,
          ErrorCodes.typeCheck,
          `parameter '${name}': expected ${constrained.expected}, received ${constrained.actual}`,
          path
        ),
        ctx.frame
      )
  }
  return normalized
}

/**
 * A failure of the CALL rather than of the body: the argument that arrived
 * is the caller's, so the path names the caller's own node and no
 * `fragmentPath` is involved.
 */
const callFailure = (
  node: FragmentCallNode,
  code: string,
  message: string,
  path: NodePath
): FigTreeError => new FigTreeError({ code, message: `fragment '${node.name}' – ${message}`, path })

const describe = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value

// ── Anchoring: the two-level pointer ────────────────────────────────

const ANCHORED: unique symbol = Symbol('fig-tree:anchored')

/**
 * Attribute a failure to a frame, once. The first frame the error crosses
 * owns it: a body failure is anchored by the call boundary it escapes
 * through, an argument failure by the thunk that ran it, and every frame
 * further out leaves it alone — which is what makes a nested call report
 * the INNERMOST body while `path` still names the outermost call in the
 * input.
 */
export const anchor = (error: unknown, frame: FragmentFrame | undefined): unknown => {
  if (!isFigTreeError(error) || hasBrand(error, ANCHORED)) return error
  brand(error, ANCHORED)
  if (frame === undefined) return error
  error.fragment = frame.fragment
  error.fragmentPath = error.path
  error.path = frame.callPath
  return error
}

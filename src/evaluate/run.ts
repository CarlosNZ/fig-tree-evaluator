/**
 * The top of an evaluation — the policy half of the kill switch (fallback
 * rule 3 in "fallback semantics", docs-dev/v3-specs/v3-api.md;
 * "Kill-switch shapes" in docs-dev/v3-specs/v3-evaluator-methods.md;
 * "Timeout shielding rides the compile artifact" in
 * docs-dev/v3-specs/v3-implementation-notes.md).
 *
 * Every evaluation runs under a root scope: the caller's `signal` (if any)
 * as its parent, the `timeout` (if any) as its timer, settled like any
 * node scope when the evaluation settles — so work still in flight after
 * an uncaught failure is cancelled through the same chain, kill switch or
 * not. The recursive evaluator is wrapped, not forked: every node still
 * goes through `evaluateNode`. What this module adds is what happens at
 * the root when the kill switch fires.
 *
 * Three cases. With neither option, the root evaluates as it always has.
 * With a kill switch and no shielding, the evaluation is raced against the
 * root's expiry, so the caller gets the call back on time however deaf a
 * driver inside it may be, and the error is the root's — code `timeout` or
 * `aborted`, path `[]`. With a `timeout` over a shielded artifact, the
 * holes are watched individually, and on the deadline the answer is
 * ASSEMBLED rather than thrown: real values where holes finished, the
 * precomputed static fallbacks where they did not, spliced into the
 * constant skeleton. The assembly runs synchronously inside the abort
 * dispatch, so the set of finished holes is exactly what had settled
 * before the timer's turn — a crisp cut, with no evaluation after it.
 *
 * Report mode and trace (Phase 12) attach here: the slot table already
 * knows which holes contributed a fallback.
 */
import type { EvaluationOptions } from '../options'
import type { ArtifactHole, ParseArtifact } from '../parse'
import type { ResultStore } from '../resultCache'
import { EVALUATION_TIMEOUT, SCOPE_SETTLED, deadline, type Deadline } from './abort'
import { createEvaluationContext, type EvaluationContext } from './context'
import { evaluateNode, splice } from './evaluate'
import { internalError, isCancellation, isKillSwitch, killSwitchError } from './internal'
import { pushVars } from './scope'

/**
 * Evaluate a compiled artifact under the merged options. The clock, when
 * there is one, starts here: the compile before it is synchronous and
 * could not be interrupted anyway, and the deadline bounds the part that
 * can take time.
 */
export const runEvaluation = async (
  artifact: ParseArtifact,
  options: EvaluationOptions,
  cache: ResultStore
): Promise<unknown> => {
  const { timeout, signal } = options
  const root = deadline(signal, timeout, EVALUATION_TIMEOUT)
  const ctx = createEvaluationContext(options, cache, root.signal)
  try {
    if (timeout === undefined && signal === undefined) return await evaluateNode(artifact.root, ctx)
    // A shielded artifact with no holes is a constant that merely was not
    // inert (a comment key, a vars block): nothing in it can time out
    if (timeout !== undefined && artifact.shielded && artifact.holes.length > 0)
      return await evaluateShielded(artifact, ctx, root)
    return await raced(artifact, ctx, root, timeout)
  } finally {
    root.settle()
  }
}

/**
 * The unshielded case: the evaluation against the root's expiry. The
 * expiry goes first so that when both are already settled — the caller's
 * signal aborted before the call — the root-level error wins
 * deterministically; in the live case the abort dispatch rejects it before
 * any node boundary can observe the signal, so the caller always receives
 * the root's error rather than whichever node happened to notice first.
 * `Promise.race` subscribes to both, so the loser's later rejection is
 * handled.
 */
const raced = (
  artifact: ParseArtifact,
  ctx: EvaluationContext,
  root: Deadline,
  ms: number | undefined
): Promise<unknown> => {
  const fired = root.expiry.catch((reason) => {
    throw killSwitchError(reason, [], { ms })
  })
  fired.catch(noop)
  return Promise.race([fired, evaluateNode(artifact.root, ctx)])
}

const noop = () => {}

/** A hole settled with a value; an empty slot is one still in flight. */
interface Slot {
  value: unknown
}

/**
 * The shielded case. The holes are the artifact's — for a literal root its
 * skeleton's holes, for a node root the node itself — evaluated under the
 * root's `vars` scope exactly as the skeleton path would evaluate them,
 * with one addition: each records its value in a slot as it lands.
 *
 * Two ways out. Every hole finishing resolves the all-real assembly, which
 * is what the ordinary path would have returned. The kill switch firing
 * first resolves the degraded assembly for a timeout, and rejects for the
 * caller's signal — which nothing may shape. A shielded hole cannot reject
 * with an ordinary failure, its static fallback having caught it; what can
 * still reach `Promise.all` is a kill-switch error or a cancellation from
 * a boundary crossed after the deadline, which the assembly has already
 * answered. Anything else is an engine bug, and surfaces rather than being
 * masked by a degraded answer arriving when the timer fires.
 */
const evaluateShielded = (
  artifact: ParseArtifact,
  ctx: EvaluationContext,
  root: Deadline
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const top = artifact.root
    const scoped = top.kind === 'skeleton' ? pushVars(ctx, top.vars) : ctx
    const slots: (Slot | undefined)[] = artifact.holes.map(() => undefined)
    const runs = artifact.holes.map((hole, i) =>
      evaluateNode(hole.node, scoped).then((value) => {
        slots[i] = { value }
      })
    )

    const onKill = () => {
      const { reason } = root.signal
      if (reason === SCOPE_SETTLED) return
      if (reason !== EVALUATION_TIMEOUT) return reject(killSwitchError(reason, []))
      try {
        resolve(assemble(artifact, slots).result)
      } catch (error) {
        reject(error)
      }
    }
    // A listener added to an already-aborted signal never fires — and a
    // caller's signal may well be aborted before the call begins
    if (root.signal.aborted) onKill()
    else root.signal.addEventListener('abort', onKill, { once: true })

    Promise.all(runs).then(
      () => {
        root.signal.removeEventListener('abort', onKill)
        try {
          resolve(assemble(artifact, slots).result)
        } catch (error) {
          reject(error)
        }
      },
      (error: unknown) => {
        if (isKillSwitch(error) || isCancellation(error)) return
        root.signal.removeEventListener('abort', onKill)
        reject(error)
      }
    )
  })

/**
 * The shielded assembly: settled slots contribute their values, the rest
 * their precomputed static fallbacks, spliced into the constant skeleton.
 * Pure constant work — no node is evaluated here, which is what lets the
 * deadline hold exactly. `degraded` names the holes that took their
 * fallback: the `shielded-fallback` trace event and the report row's
 * timeout error are built from it in Phase 12.
 */
const assemble = (
  artifact: ParseArtifact,
  slots: (Slot | undefined)[]
): { result: unknown; degraded: number[] } => {
  const degraded: number[] = []
  const values = artifact.holes.map((hole, i) => {
    const slot = slots[i]
    if (slot !== undefined) return slot.value
    degraded.push(i)
    return staticFallbackOf(hole)
  })
  const top = artifact.root
  if (top.kind !== 'skeleton') return { result: values[0], degraded }
  // The artifact's holes are the root skeleton's, in order, by
  // construction (rootHoles in src/parse/parse.ts)
  if (top.holes.length !== values.length)
    throw internalError('the artifact hole list and the root skeleton disagree')
  return { result: splice(top.skeleton, top.holes, values), degraded }
}

const staticFallbackOf = (hole: ArtifactHole): unknown => {
  if (hole.staticFallback === undefined)
    throw internalError('a shielded artifact has a hole with no static fallback')
  return hole.staticFallback.value
}

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
 * `aborted`, path `[]`. With a `timeout` over a shielded artifact, each
 * hole is raced against the expiry on its own, and on the deadline the
 * answer is ASSEMBLED rather than thrown: real values where the holes won,
 * the precomputed static fallbacks where the expiry did, spliced into the
 * constant skeleton.
 *
 * The race is what makes the cut exact. A hole that settled before the
 * timer fired has already won: its race's reaction is a microtask, and the
 * timer's callback is a macrotask that runs only once the queue has
 * drained. A hole that had not settled cannot win afterwards: `deadline()`
 * registers its abort listener before any node's scope does, so the
 * expiry's rejection is the first reaction queued in the dispatch, and the
 * fallback it hands back settles the race two hops later — long before a
 * node that only now notices the abort could reject through its wrapper.
 * Nothing is evaluated after the deadline; whatever is still in flight is
 * abandoned at its next node boundary.
 *
 * Report mode and trace (Phase 12) attach here: the expiry handler in
 * `evaluateShielded` is the one place a hole takes its fallback.
 */
import type { EvaluationOptions } from '../options'
import { splice, type ArtifactHole, type ParseArtifact } from '../parse'
import type { ResultStore } from '../resultCache'
import { EVALUATION_TIMEOUT, deadline, type Deadline } from './abort'
import { createEvaluationContext, type EvaluationContext } from './context'
import { evaluateNode } from './evaluate'
import { internalError, killSwitchError } from './internal'
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
    // A signal already aborted at entry is answered once, here: nothing
    // starts, and the error is the root's. Left to the races below, the
    // first node boundary to notice would win instead — a race between two
    // settled promises goes to the one with fewer hops, which is the node's
    if (root.signal.aborted) throw killSwitchError(root.signal.reason, [])
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
 * The unshielded case: the evaluation against the root's expiry. The abort
 * dispatch rejects the expiry before any node boundary can observe the
 * signal, so the caller receives the root's error — path `[]`, naming the
 * budget — rather than whichever node happened to notice first.
 * `Promise.race` subscribes to both, so the loser's later rejection is
 * handled.
 */
const raced = (
  artifact: ParseArtifact,
  ctx: EvaluationContext,
  root: Deadline,
  ms: number | undefined
): Promise<unknown> =>
  Promise.race([
    evaluateNode(artifact.root, ctx),
    root.expiry.catch((reason) => {
      throw killSwitchError(reason, [], { ms })
    }),
  ])

/**
 * The shielded case. The holes are the artifact's — for a literal root its
 * skeleton's holes, for a node root the node itself — evaluated under the
 * root's `vars` scope exactly as the skeleton path would evaluate them,
 * each raced against the root's expiry. A hole wins with its value. The
 * expiry wins with the hole's static fallback for a timeout, and with the
 * kill-switch error for the caller's signal, which nothing may shape.
 *
 * A shielded hole cannot reject with an ordinary failure, its static
 * fallback having caught it. What can still reach a race is a kill-switch
 * error or a cancellation from a boundary crossed after the deadline, which
 * the race has already settled — handled, and ignored — or an engine bug
 * before it, which wins its race and surfaces rather than being masked by
 * a degraded answer.
 */
const evaluateShielded = async (
  artifact: ParseArtifact,
  ctx: EvaluationContext,
  root: Deadline
): Promise<unknown> => {
  const top = artifact.root
  const scoped = top.kind === 'skeleton' ? pushVars(ctx, top.vars) : ctx
  const values = await Promise.all(
    artifact.holes.map((hole) =>
      Promise.race([
        evaluateNode(hole.node, scoped),
        root.expiry.catch((reason) => {
          if (reason !== EVALUATION_TIMEOUT) throw killSwitchError(reason, [])
          // Where a hole takes its fallback: the `shielded-fallback` trace
          // event and the report row's timeout error attach here (Phase 12)
          return staticFallbackOf(hole)
        }),
      ])
    )
  )
  // The artifact's holes are the root skeleton's, in order, by construction
  // (rootHoles in src/parse/parse.ts)
  return top.kind === 'skeleton' ? splice(top.skeleton, top.holes, values) : values[0]
}

const staticFallbackOf = (hole: ArtifactHole): unknown => {
  if (hole.staticFallback === undefined)
    throw internalError('a shielded artifact has a hole with no static fallback')
  return hole.staticFallback.value
}

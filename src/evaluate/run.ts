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
 * not. With neither option the root is a deferred scope — no controller
 * until something under it asks for a signal, its only abort its own
 * settling — because the deadline's expiry promise and listeners exist to
 * answer an abort from above, and nothing above can abort. The recursive
 * evaluator is wrapped, not forked: every
 * node still goes through `evaluateNode`, and the artifact root always
 * goes through it too, which is what gives `trace` one root entry whether
 * or not the root is shielded.
 *
 * What this module adds is the **hole boundary** of a shielded `timeout`:
 * one function wrapped around each of the artifact's holes, built here and
 * applied by the root skeleton (./evaluate.ts), which hands it down
 * through any nested skeleton a `vars` block kept — or, for a node root
 * whose single hole IS the root, applied here around the whole call. It
 * races the hole against the root's expiry, handing back the hole's
 * precomputed static fallback where the expiry wins, so the answer is
 * ASSEMBLED rather than thrown.
 *
 * The race is what makes the deadline's cut exact. A hole that settled
 * before the timer fired has already won: its race's reaction is a
 * microtask, and the timer's callback is a macrotask that runs only once
 * the queue has drained. A hole that had not settled cannot win
 * afterwards: `deadline()` registers its abort listener before any node's
 * scope does, so the expiry's rejection is the first reaction queued in
 * the dispatch, and the fallback it hands back settles the race two hops
 * later — long before a node that only now notices the abort could reject
 * through its wrapper. Nothing is evaluated after the deadline; whatever
 * is still in flight is abandoned at its next node boundary.
 */
import { isFigTreeError, type FigTreeError } from '../FigTreeError'
import type { EvaluationOptions } from '../options'
import { toNodePath, type ArtifactHole, type CompileArtifact } from '../compile'
import type { ResultStore } from '../resultCache'
import { DeferredScope, EVALUATION_TIMEOUT, deadline, signalScope, type Deadline } from './abort'
import { createEvaluationContext, type EvaluationContext, type HoleBoundary } from './context'
import { evaluateNode } from './evaluate'
import { killSwitchError } from './internal'
import type { TraceNode } from '../trace'
import { fillFallback } from './reference'
import { createTraceRecorder, type TraceRecorder } from './trace'
import type { MaybePromise } from '../utils'

/**
 * Evaluate a compiled artifact under the merged options. The clock, when
 * there is one, starts here: the compile before it is synchronous and
 * could not be interrupted anyway, and the deadline bounds the part that
 * can take time.
 *
 * The outcome is the public envelope's shape, `trace` present exactly when
 * it was asked for: the class hands it back whole under `trace` or unwraps
 * the bare value ("The envelope rule" in
 * docs-dev/v3-specs/v3-evaluator-methods.md).
 */
export const runEvaluation = async (
  artifact: CompileArtifact,
  options: EvaluationOptions,
  cache: ResultStore
): Promise<{ result: unknown; trace?: TraceNode }> => {
  const { timeout, signal } = options
  // A shielded artifact with no holes is a constant that merely was not
  // inert (a comment key, a vars block): nothing in it can time out, and
  // nothing in it can fail
  const evaluable = artifact.holes.length > 0

  // The kill switch, armed only where the caller supplied something that
  // can pull it. Everything that reads the expiry — the unshielded race,
  // the shielded boundary — sits behind `armed`; the root scope itself is
  // settled either way
  const armed =
    timeout !== undefined || signal !== undefined
      ? deadline(signal, timeout, EVALUATION_TIMEOUT)
      : undefined
  const root =
    armed !== undefined ? signalScope(armed.signal, armed.settle) : new DeferredScope(undefined)
  // `armed !== undefined` is implied by the `timeout` clause; it is spelled
  // out so the compiler narrows `armed` wherever `shielded` is tested below
  const shielded =
    armed !== undefined && timeout !== undefined && artifact.timeoutShielded && evaluable
  const recorder =
    options.trace === true
      ? createTraceRecorder(
          artifact.issues.map((s) => s.issue).filter((i) => i.severity !== 'error')
        )
      : undefined
  const base = createEvaluationContext(options, cache, root, recorder)
  const boundary = shielded ? holeBoundary(artifact, armed.expiry, timeout, recorder) : undefined
  // A skeleton root hands each of the artifact's holes to the boundary;
  // any other root IS its single hole, so the boundary wraps the whole call
  const atRoot = boundary !== undefined && artifact.root.kind !== 'skeleton'
  const ctx: EvaluationContext =
    boundary !== undefined && !atRoot ? { ...base, rootBoundary: boundary } : base

  try {
    // A signal already aborted at entry is answered once, here: nothing
    // starts, and the error is the root's. Left to the races below, the
    // first node boundary to notice would win instead — a race between two
    // settled promises goes to the one with fewer hops, which is the node's
    if (root.aborted) throw killSwitchError(root.reason, [])

    const evaluateRoot = () =>
      atRoot && boundary !== undefined
        ? boundary(() => evaluateNode(artifact.root, ctx), artifact.root)
        : evaluateNode(artifact.root, ctx)

    // Shielded: the per-hole races answer the deadline, so the assembly is
    // awaited plainly. Unshielded with a kill switch: the whole evaluation
    // is raced, so the caller gets the call back on time however deaf a
    // driver inside it may be, and the error is the root's
    const result = await (shielded || armed === undefined
      ? evaluateRoot()
      : raced(evaluateRoot, armed, timeout))

    return recorder !== undefined ? { result, trace: recorder.finish() } : { result }
  } catch (error) {
    // A failing run must not lose its diagnostics: the partial instance
    // tree rides the error it threw with
    if (recorder !== undefined && isFigTreeError(error) && error.trace === undefined)
      error.trace = recorder.finish()
    throw error
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
  evaluateRoot: () => MaybePromise<unknown>,
  root: Deadline,
  ms: number | undefined
): Promise<unknown> =>
  Promise.race([
    evaluateRoot(),
    root.expiry.catch((reason) => {
      throw killSwitchError(reason, [], { ms })
    }),
  ])

/**
 * The boundary itself: the hole raced against the root's `expiry`.
 *
 * A shielded hole's static fallback catches its ordinary failures, with
 * one exception: a fragment call with dynamic arguments evaluates them
 * before its body, outside the body-root fallback it lifts, so their
 * failure reaches the race and wins it, rejecting the evaluation as an
 * unshielded one would. Otherwise what can still reach the race is a
 * kill-switch error or a cancellation from a boundary crossed after the
 * deadline, which the race has already settled — handled, and ignored — or
 * an engine bug before it, which wins its race and surfaces rather than
 * being masked by a degraded answer.
 */
const holeBoundary = (
  artifact: CompileArtifact,
  expiry: Promise<never>,
  ms: number,
  recorder: TraceRecorder | undefined
): HoleBoundary => {
  const holes = new Map(artifact.holes.map((hole) => [hole.node, hole]))
  return (run, node) => {
    // Only the artifact's own holes are ever handed to the boundary
    const hole = holes.get(node)!
    // `Promise.race` does not unsubscribe the loser, so the expiry
    // handler below runs for EVERY hole when the deadline fires — the
    // ones that already won included, whose returned fallback is simply
    // discarded. That is harmless for a pure handler and wrong for one
    // with a side effect, so the winners are tracked and skipped. The
    // flag is reliable for the same reason the cut is exact: a hole that
    // settled first had its reaction run as a microtask, and the timer
    // is a macrotask that waits for the queue to drain
    let won = false
    // The boundary is shielding's alone, never the plain path, so a hole
    // that answered without a promise is wrapped here
    const answered = Promise.resolve(run()).then((value) => {
      won = true
      return value
    })
    return Promise.race([
      answered,
      expiry.catch((reason) => {
        if (reason !== EVALUATION_TIMEOUT) throw killSwitchError(reason, [])
        if (won) return undefined
        // The timeout is what the fallback caught, which its `$error`
        // reads, and which trace records
        const caught = holeTimeout(hole, reason, ms)
        const value = timeoutFallbackOf(hole, caught)
        // Which holes contributed a real value and which a static
        // fallback is timing-dependent and invisible in the result, so
        // trace is the only channel that can say. It says it as it would
        // for any caught failure
        recorder?.markShielded(hole.node, caught, value)
        return value
      }),
    ])
  }
}

/** The timeout as the hole met it, for its trace entry. */
const holeTimeout = (hole: ArtifactHole, reason: unknown, ms: number): FigTreeError => {
  const { node } = hole
  const operator = node.kind === 'operator' ? node.name : undefined
  return killSwitchError(reason, toNodePath(node.path), { operator, ms })
}

/**
 * A hole is the artifact's own, so outside every fragment body. Only a
 * shielded artifact times out this way, and each of its holes has a
 * static fallback.
 */
const timeoutFallbackOf = (hole: ArtifactHole, caught: FigTreeError): unknown =>
  fillFallback(hole.timeoutFallback!, caught, undefined)

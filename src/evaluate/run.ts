/**
 * The top of an evaluation — the policy half of the kill switch and of
 * report mode (fallback rule 3 in "fallback semantics",
 * docs-dev/v3-specs/v3-api.md; "Kill-switch shapes" and "mode: 'report'"
 * in docs-dev/v3-specs/v3-evaluator-methods.md; "Timeout shielding rides
 * the compile artifact" in docs-dev/v3-specs/v3-implementation-notes.md).
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
 * goes through it too, which is what gives `trace` one root entry in
 * every mode.
 *
 * What this module adds is the **hole boundary**: one function wrapped
 * around each of the artifact's root holes, composed here and applied by
 * the root skeleton (./evaluate.ts) — or, for a node root whose single
 * hole IS the root, applied here around the whole call. Two features want
 * the same wrapper and compose inside it:
 *
 *   - **report** catches an uncaught failure, records it against the hole
 *     it degraded, and resolves that hole to `null`;
 *   - **a shielded `timeout`** races the hole against the root's expiry,
 *     handing back the hole's precomputed static fallback where the
 *     expiry wins, so the answer is ASSEMBLED rather than thrown.
 *
 * The composition order is the whole of the semantics: the expiry race
 * sits OUTSIDE the report catch, because a kill switch ends the
 * evaluation where an ordinary failure only degrades a hole.
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
import { isFigTreeError } from '../FigTreeError'
import { ErrorCodes } from '../errorCodes'
import type { EvaluationOptions, EvaluationResult } from '../options'
import type { ArtifactHole, CompileArtifact } from '../compile'
import type { ResultStore } from '../resultCache'
import { DeferredScope, EVALUATION_TIMEOUT, deadline, signalScope, type Deadline } from './abort'
import { createEvaluationContext, type EvaluationContext, type HoleBoundary } from './context'
import { evaluateNode } from './evaluate'
import {
  internalError,
  isCancellation,
  isInternalError,
  isKillSwitch,
  killSwitchError,
} from './internal'
import { createErrorCollector, type ErrorCollector } from './report'
import { createTraceRecorder, type TraceRecorder } from './trace'
import type { MaybePromise } from '../utils'

/**
 * Evaluate a compiled artifact under the merged options. The clock, when
 * there is one, starts here: the compile before it is synchronous and
 * could not be interrupted anyway, and the deadline bounds the part that
 * can take time.
 *
 * The outcome is the public envelope, whatever the mode: the class hands
 * it back whole or unwraps the bare value ("The envelope rule" in
 * docs-dev/v3-specs/v3-evaluator-methods.md). `errors` is empty rather
 * than absent where nothing collected them — throw mode having thrown.
 */
export const runEvaluation = async (
  artifact: CompileArtifact,
  options: EvaluationOptions,
  cache: ResultStore
): Promise<EvaluationResult> => {
  const { timeout, signal } = options
  const reporting = options.mode === 'report'
  // A shielded artifact with no holes is a constant that merely was not
  // inert (a comment key, a vars block): nothing in it can time out, and
  // nothing in it can fail
  const evaluable = artifact.holes.length > 0

  // The kill switch, armed only where the caller supplied something that
  // can pull it. Everything that reads the expiry — the unshielded race,
  // the shielded boundary, the report row — sits behind `armed`; the root
  // scope itself is settled either way
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
  const collector = reporting ? createErrorCollector() : undefined
  const recorder =
    options.trace === true
      ? createTraceRecorder(
          artifact.issues.map((s) => s.issue).filter((i) => i.severity !== 'error')
        )
      : undefined
  const base = createEvaluationContext(options, cache, root, recorder)
  const boundary =
    evaluable && (collector !== undefined || shielded)
      ? holeBoundary(artifact, collector, shielded ? armed.expiry : undefined, recorder)
      : undefined
  // A skeleton root hands each of its holes to the boundary; any other
  // root IS its single hole, so the boundary wraps the whole call
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

    // Shielding returns the assembly silently in throw mode — rule 3 — so
    // report mode is the only channel that says the deadline fired at all
    if (collector !== undefined && shielded && expired(armed))
      collector.add(killSwitchError(EVALUATION_TIMEOUT, [], { ms: timeout }))

    return outcome(result, collector, recorder)
  } catch (error) {
    // The kill switch under report: a `timeout` becomes the last row of
    // the report, beside whatever holes had already degraded. A `signal`
    // does NOT — the caller cancelled, nobody is waiting for a result, and
    // resolving normally would invite code that treats cancellation as
    // data. "Never throws" scopes to expression errors
    if (collector !== undefined && isFigTreeError(error) && error.code === ErrorCodes.timeout) {
      collector.add(error)
      return outcome(null, collector, recorder)
    }
    // A failing run must not lose its diagnostics: the partial instance
    // tree rides the error it threw with
    if (recorder !== undefined && isFigTreeError(error) && error.trace === undefined)
      error.trace = recorder.finish()
    throw error
  } finally {
    root.settle()
  }
}

const outcome = (
  result: unknown,
  collector: ErrorCollector | undefined,
  recorder: TraceRecorder | undefined
): EvaluationResult => ({
  result,
  errors: collector?.emit() ?? [],
  ...(recorder !== undefined ? { trace: recorder.finish() } : {}),
})

/** Whether the root's own timer is what aborted it. Read before `settle()`. */
const expired = (root: Deadline): boolean =>
  root.signal.aborted && root.signal.reason === EVALUATION_TIMEOUT

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
 * The boundary itself: the report catch, the shielded race, or both. The
 * root's `expiry` is passed only where the artifact is shielded, so its
 * presence IS the shielded flag.
 *
 * A shielded hole cannot reject with an ordinary failure, its static
 * fallback having caught it. What can still reach the race is a
 * kill-switch error or a cancellation from a boundary crossed after the
 * deadline, which the race has already settled — handled, and ignored — or
 * an engine bug before it, which wins its race and surfaces rather than
 * being masked by a degraded answer.
 */
const holeBoundary = (
  artifact: CompileArtifact,
  collector: ErrorCollector | undefined,
  expiry: Promise<never> | undefined,
  recorder: TraceRecorder | undefined
): HoleBoundary => {
  const holes = new Map(artifact.holes.map((hole) => [hole.node, hole]))
  return (run, node) => {
    const hole = holes.get(node)
    if (hole === undefined)
      throw internalError(
        `the hole boundary was handed the node at ${JSON.stringify(node.path)}, which is not one of the artifact's holes`
      )
    // The boundary is report mode's and shielding's alone, never the plain
    // path, so a hole that answered without a promise is wrapped here
    const attempt: Promise<unknown> =
      collector === undefined ? Promise.resolve(run()) : degrade(run, hole, collector)
    if (expiry === undefined) return attempt
    // `Promise.race` does not unsubscribe the loser, so the expiry
    // handler below runs for EVERY hole when the deadline fires — the
    // ones that already won included, whose returned fallback is simply
    // discarded. That is harmless for a pure handler and wrong for one
    // with a side effect, so the winners are tracked and skipped. The
    // flag is reliable for the same reason the cut is exact: a hole that
    // settled first had its reaction run as a microtask, and the timer
    // is a macrotask that waits for the queue to drain
    let won = false
    const answered = attempt.then((value) => {
      won = true
      return value
    })
    return Promise.race([
      answered,
      expiry.catch((reason) => {
        if (reason !== EVALUATION_TIMEOUT) throw killSwitchError(reason, [])
        if (won) return undefined
        // Which holes contributed a real value and which a static
        // fallback is timing-dependent and invisible in the result, so
        // trace is the only channel that can say
        recorder?.noteOn(hole.node, { type: 'shielded-fallback' })
        return timeoutFallbackOf(hole)
      }),
    ])
  }
}

/**
 * Report mode's degradation, per hole. The three bail-outs are the node
 * wrapper's, for the same reasons: an engine bug, a cancellation and the
 * caller's kill switch are none of them expression failures, so none may
 * be served back as a degraded hole.
 */
const degrade = async (
  run: () => MaybePromise<unknown>,
  hole: ArtifactHole,
  collector: ErrorCollector
): Promise<unknown> => {
  try {
    return await run()
  } catch (error) {
    if (isInternalError(error) || isCancellation(error) || isKillSwitch(error)) throw error
    collector.record(error, hole)
    return null
  }
}

const timeoutFallbackOf = (hole: ArtifactHole): unknown => {
  if (hole.timeoutFallback === undefined)
    throw internalError('a shielded artifact has a hole with no static fallback')
  return hole.timeoutFallback.value
}

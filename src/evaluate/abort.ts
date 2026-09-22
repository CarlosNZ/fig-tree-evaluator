/**
 * Abort scopes — the mechanism half of cancellation ("Resolution is
 * cancellation" in docs-dev/v3-specs/v3-operator-contract.md; the kill
 * switch in "fallback semantics", docs-dev/v3-specs/v3-api.md).
 *
 * Controllers, timers, and the chain that forwards an abort downward:
 * nothing here knows what an abort MEANS to an evaluation. That
 * classification — kill switch, silent cancellation, per-request expiry —
 * is ./internal.ts, reading the reason markers defined here; the policy of
 * when a deadline is armed and what happens when it fires is ./run.ts and
 * the node wrapper. One concern per file, so a change to any of the three
 * stays in its file.
 *
 * Chained by hand rather than with `AbortSignal.any`: that is Node 22 and
 * a much more recent browser floor (Chrome 116, Safari 17.4) than this
 * package should ask for.
 *
 * Honest about reach: JS cannot interrupt code already running, so an
 * abandoned subtree runs to completion and has its result discarded. What
 * an abort does reliably is stop work that has not *started*, and stop
 * anything holding the signal — which is the I/O clients, and where the
 * time actually lives.
 *
 * Two kinds of scope, for two kinds of consumer. A node's scope
 * (`DeferredScope`) answers "am I cancelled?" at every node boundary and
 * hands out a real `AbortSignal` only to something that asks — an I/O
 * client, a per-request deadline, a body reading `context.signal` — and
 * on that first ask it materialises a controller and chains it upward,
 * exactly as an eager scope would have been built. Everything else
 * (`plus`, `get`, a fragment call over pure computation) never
 * materialises anything: a few field reads per boundary check and no
 * controller, no listener, no abort event. Nothing ever calls `abort()`
 * on a node scope; settling is the one thing that cancels, so a scope
 * nobody holds has nobody to tell. The eager controller-backed scopes
 * below remain for the deadlines, which need a timer and a real signal
 * regardless.
 */

import { noop } from '../utils'

/** The reason a settled scope carries: the work it covered has finished. */
export const SCOPE_SETTLED = 'fig-tree:scope-settled'

/** The reason a node's own per-request deadline carries (ledger #15). */
export const REQUEST_EXPIRED = 'fig-tree:request-expired'

/** The reason the whole-evaluation `timeout` carries — the kill switch. */
export const EVALUATION_TIMEOUT = 'fig-tree:evaluation-timeout'

/**
 * What a node holds of its cancellation state — the field a context
 * carries as `abortScope`. `aborted` and `reason` are answered without a
 * signal wherever possible; `signal` is the materialising read.
 */
export interface AbortScope {
  readonly aborted: boolean
  /** The reason the abort carries; meaningful only while `aborted`. */
  readonly reason: unknown
  /** A real signal composing everything above, built on first read. */
  readonly signal: AbortSignal
  /** The evaluation's abort clock, shared down the whole chain. */
  readonly clock: AbortClock
  /** Ends the scope: whatever it materialised aborts with `SCOPE_SETTLED`. */
  settle(): void
}

/**
 * Counts the aborts that can change a deferred scope's answer, within one
 * evaluation: created at the root, handed to every scope built under it,
 * and bumped by every `settle()` in the chain and by the armed root's real
 * signal aborting. A scope's memory of "no abort above me" is good while
 * the count has not moved. Owned by the evaluation rather than the module
 * so that concurrent evaluations, each settling a node at a time, never
 * cost each other a re-walk.
 */
export interface AbortClock {
  epoch: number
}

/**
 * A node's scope, or the root of an evaluation with no kill switch: a
 * parent (absent at the root), and a controller that exists only once
 * something asked for the signal. Cancellation state is read through the
 * chain — this scope's own settling, its controller if it has one, else
 * its parent's answer — so a boundary check on a pure CPU tree walks a few
 * fields to the nearest materialised ancestor or the root, and allocates
 * nothing.
 *
 * `signal` materialises the whole chain above it, since a real signal has
 * to hear the ancestors' aborts: each parent's `signal` is read in turn
 * and a forwarding listener registered, exactly the eager construction,
 * paid once by the node that wanted it. `settle()` then detaches and
 * aborts only what was built.
 *
 * The walk is amortised to one step by the evaluation's `AbortClock`: a
 * scope that walked to the top and found nothing remembers the epoch it
 * did so in, and answers from memory while no abort has landed in this
 * evaluation since. Every event that can turn an answer from "no" to
 * "yes" bumps the clock — a settle anywhere in the chain, or the armed
 * root's real signal aborting (`signalScope` listens for it) — so the
 * memory is never stale, and a chain of unmaterialised scopes costs each
 * boundary check a step to the nearest ancestor that remembers, not a walk
 * to the root. Without it a deep chain paid O(depth) per check, O(depth²)
 * in all, and the `nesting` bench regressed past ~70 levels.
 *
 * The node-level `reason` is not consulted by the engine — classification
 * reads the ROOT's (./internal.ts) — so a scope settled after an upstream
 * abort reports `SCOPE_SETTLED` rather than replaying which landed first.
 */
export class DeferredScope implements AbortScope {
  private controller: AbortController | undefined
  private upstream: AbortSignal | undefined
  private forward: (() => void) | undefined
  private settled = false
  /** The epoch in which this scope last walked up and found no abort. */
  private verified = -1
  readonly clock: AbortClock

  constructor(private readonly parent: AbortScope | undefined) {
    // The root of an unarmed evaluation starts the clock; every scope
    // under it shares its parent's
    this.clock = parent === undefined ? { epoch: 0 } : parent.clock
  }

  get aborted(): boolean {
    if (this.controller !== undefined) return this.controller.signal.aborted
    if (this.settled) return true
    if (this.verified === this.clock.epoch) return false
    if (this.parent !== undefined && this.parent.aborted) return true
    this.verified = this.clock.epoch
    return false
  }

  get reason(): unknown {
    if (this.controller !== undefined) return this.controller.signal.reason
    return this.settled ? SCOPE_SETTLED : this.parent?.reason
  }

  get signal(): AbortSignal {
    if (this.controller === undefined) {
      const controller = new AbortController()
      this.controller = controller
      if (this.settled) controller.abort(SCOPE_SETTLED)
      else if (this.parent !== undefined) {
        const upstream = this.parent.signal
        if (upstream.aborted) controller.abort(upstream.reason)
        else {
          this.upstream = upstream
          this.forward = () => controller.abort(upstream.reason)
          upstream.addEventListener('abort', this.forward, { once: true })
        }
      }
    }
    return this.controller.signal
  }

  settle(): void {
    if (this.settled) return
    this.settled = true
    this.clock.epoch += 1
    if (this.controller === undefined) return
    if (this.upstream !== undefined && this.forward !== undefined)
      this.upstream.removeEventListener('abort', this.forward)
    this.controller.abort(SCOPE_SETTLED)
  }
}

/**
 * The armed root of an evaluation — a `deadline()` with the caller's
 * `signal` and/or `timeout` — seen as a scope. It starts the evaluation's
 * clock, and bumps it when the real signal aborts so the deferred scopes
 * below stop trusting their memory; the listener is `once`, and the
 * signal is aborted when the deadline settles, so it never outlives the
 * evaluation. `settle` is the deadline's own.
 */
export const signalScope = (signal: AbortSignal, settle: () => void): AbortScope => {
  const clock: AbortClock = { epoch: 0 }
  signal.addEventListener(
    'abort',
    () => {
      clock.epoch += 1
    },
    { once: true }
  )
  return {
    get aborted() {
      return signal.aborted
    },
    get reason() {
      return signal.reason
    },
    signal,
    clock,
    settle,
  }
}

/**
 * A body's view of its own per-request deadline, in place of the node's
 * scope. Nothing is built under it — the node's children and lazy handles
 * run under the node's scope, not the body's — so it has no memory to
 * invalidate and registers no listener; it shares the node's clock only
 * to be a scope. The deadline settles itself, so `settle` is nothing.
 */
export const signalView = (signal: AbortSignal, node: AbortScope): AbortScope => ({
  get aborted() {
    return signal.aborted
  },
  get reason() {
    return signal.reason
  },
  signal,
  clock: node.clock,
  settle: noop,
})

/** An eager, controller-backed scope: its signal and two verbs. */
interface ControllerScope {
  signal: AbortSignal
  /** Aborts this scope alone, with the given reason; any parent is untouched */
  abort: (reason: unknown) => void
  /** Ends the scope: detaches from any parent, aborts with `SCOPE_SETTLED` */
  settle: () => void
}

/**
 * An eager scope with nothing above it: one controller, no listener, no
 * timer. The base a `deadline()` with no parent is built on.
 */
const rootScope = (): ControllerScope => {
  const controller = new AbortController()
  return {
    signal: controller.signal,
    abort: (reason) => controller.abort(reason),
    settle: () => controller.abort(SCOPE_SETTLED),
  }
}

/**
 * An eager scope chained to an enclosing signal: aborted when the parent
 * is, with the parent's reason, and independently abortable without
 * touching the parent. The deadlines are built on one of these; a node's
 * scope is a `DeferredScope`, which builds exactly this on first demand.
 * The listener is removed on settle, so a long-lived caller signal does
 * not accumulate one per scope.
 */
const childScope = (parent: AbortSignal): ControllerScope => {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const forward = () => controller.abort(parent.reason)
  parent.addEventListener('abort', forward, { once: true })
  return {
    signal: controller.signal,
    abort: (reason) => controller.abort(reason),
    settle: () => {
      parent.removeEventListener('abort', forward)
      controller.abort(SCOPE_SETTLED)
    },
  }
}

export interface Deadline {
  /**
   * The signal the work under this deadline sees. Its `reason` says which
   * abort landed: this deadline's own `reason` for its timer, the parent's
   * reason for anything upstream.
   */
  signal: AbortSignal
  /**
   * Rejects with the signal's reason the moment it aborts — for the timer
   * or for anything upstream, but never for this deadline's own settling.
   */
  expiry: Promise<never>
  /** Clears the timer, detaches from the parent, aborts `SCOPE_SETTLED`. */
  settle: () => void
}

/**
 * `setTimeout` counts milliseconds in a signed 32-bit integer — about 24.8
 * days — and fires at once when asked for more. A larger budget is held at
 * the ceiling instead.
 */
const TIMER_CEILING = 2 ** 31 - 1

/**
 * A scope with a timer on it: aborted with `reason` after `ms`, or by
 * anything upstream. Both deadlines in the engine are one of these — a
 * node's own per-request timer (`requestDeadline`) and the whole
 * evaluation's `timeout` at the root of the chain — differing only in
 * their parent and in the reason their timer aborts with.
 *
 * `expiry` exists because a signal alone cannot end a wait: a driver that
 * cannot abort (SQLite's synchronous API) would hold its caller past the
 * deadline forever. So the caller races the work against this promise,
 * which rejects on any abort of the composed signal — the timer, a
 * sibling's resolution forwarded from above, or the caller's own signal —
 * and a deaf driver is abandoned the moment any of them lands.
 * Cancellation is best-effort; the deadline is not.
 *
 * Either half may be absent: no parent makes this the root of a chain, no
 * `ms` arms no timer. Not both, though: with neither there is nothing for
 * `expiry` to wait on, and the caller wants a plain `rootScope()` — one
 * controller and no listeners, where this builds a promise and two
 * listeners that could never fire.
 */
export const deadline = (
  parent: AbortSignal | undefined,
  ms: number | undefined,
  reason: string
): Deadline => {
  // No parent makes this the root of a chain, so there is nothing to
  // listen to
  const scope = parent === undefined ? rootScope() : childScope(parent)
  const { signal } = scope
  let expire!: (reason: unknown) => void
  const expiry = new Promise<never>((_resolve, reject) => {
    expire = reject
  })
  // Attached where the promise is created, which is the only point early
  // enough: when the work wins the race nobody ever awaits this, and a
  // runtime reports an unhandled rejection at the microtask checkpoint
  expiry.catch(noop)
  const onAbort = () => expire(signal.reason)
  if (signal.aborted) onAbort()
  else signal.addEventListener('abort', onAbort, { once: true })

  // An undefined delay is not "no timer" to setTimeout — it fires at once
  const timer =
    ms === undefined
      ? undefined
      : setTimeout(() => scope.abort(reason), Math.min(ms, TIMER_CEILING))
  return {
    signal,
    expiry,
    settle: () => {
      if (timer !== undefined) clearTimeout(timer)
      // Settling is not expiring: detach first, so the abort below never
      // rejects `expiry` and nobody builds an error for a wait that ended
      signal.removeEventListener('abort', onAbort)
      scope.settle()
    },
  }
}

/**
 * A node's per-request deadline (ledger #15): its own `timeout` parameter,
 * composed onto the signal its body receives. Its expiry is an ORDINARY
 * failure — the per-node network-flakiness guard, caught by the node's
 * `fallback` — which is what the reason marker lets the wrapper tell apart
 * from a scope abort (silent abandonment) and the kill switch (cuts
 * through everything).
 */
export const requestDeadline = (parent: AbortSignal, ms: number): Deadline =>
  deadline(parent, ms, REQUEST_EXPIRED)

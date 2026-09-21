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
 */

/** The reason a settled scope carries: the work it covered has finished. */
export const SCOPE_SETTLED = 'fig-tree:scope-settled'

/** The reason a node's own per-request deadline carries (ledger #15). */
export const REQUEST_EXPIRED = 'fig-tree:request-expired'

/** The reason the whole-evaluation `timeout` carries — the kill switch. */
export const EVALUATION_TIMEOUT = 'fig-tree:evaluation-timeout'

/** A chained abort controller, seen from outside: its signal and two verbs. */
export interface AbortScope {
  signal: AbortSignal
  /** Aborts this scope alone, with the given reason; the parent is untouched */
  abort: (reason: unknown) => void
  /** Ends the scope: detaches from the parent, aborts with `SCOPE_SETTLED` */
  settle: () => void
}

/**
 * A scope chained to an enclosing signal: aborted when the parent is, with
 * the parent's reason, and independently abortable without touching the
 * parent. A node's own scope is one of these — the node wrapper settles it
 * once the body settles, so anything the body did not wait for stops. The
 * listener is removed on settle, so a long-lived caller signal does not
 * accumulate one per node evaluated.
 */
export const childScope = (parent: AbortSignal): AbortScope => {
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
 * `ms` arms no timer. With neither it is a plain scope whose only abort is
 * its own settling.
 */
export const deadline = (
  parent: AbortSignal | undefined,
  ms: number | undefined,
  reason: string
): Deadline => {
  // No parent makes this the root of a chain: a fresh signal that never
  // aborts stands in, so there is one scope constructor rather than two
  const scope = childScope(parent ?? new AbortController().signal)
  const { signal } = scope
  let expire!: (reason: unknown) => void
  const expiry = new Promise<never>((_resolve, reject) => {
    expire = reject
  })
  // Attached where the promise is created, which is the only point early
  // enough: when the work wins the race nobody ever awaits this, and a
  // runtime reports an unhandled rejection at the microtask checkpoint
  expiry.catch(() => {})
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

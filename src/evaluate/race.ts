/**
 * The `race` delivery: every element starts at once, and settlements reach
 * the body in completion order ("The runtime interface" in
 * docs-dev/v3-specs/v3-operator-contract.md; "and / or early resolution: a
 * race with error parking" in docs-dev/v3-specs/v3-implementation-notes.md).
 *
 * The shape does the reasoning for the bodies. A failure is delivered as a
 * settlement rather than thrown, so a body fails the node only if the
 * result actually depends on it — Kleene's rule falling out of control flow
 * instead of case analysis. And because an element's promise resolves to a
 * Settlement and never rejects, an element nobody waits for cannot become
 * an unhandled rejection. That is why the handler is attached where the
 * promise is created rather than where it is abandoned: Node reports an
 * unhandled rejection at the microtask checkpoint, so attaching later is
 * already too late.
 */
import type { CompiledNode } from '../parse'
import { LAZY_HANDLE, type Settlement, type SettlementStream } from '../runtimeInterface'
import type { EvaluationContext } from './context'
import { evaluateNode } from './evaluate'

/** What each element's value passes through before the body sees it. */
type Vet = (value: unknown) => unknown

/**
 * The general shape: `count` units of work, each addressed by index,
 * started at once. Every caller below is a way of naming what `run` does.
 *
 * It is the engine that starts them, not the body, and that is the whole
 * point — the non-rejecting settlement wrapper has to go on at the moment
 * each promise is created (see the file header), which only the creator
 * can guarantee.
 */
export const indexedStream = (
  count: number,
  run: (index: number) => Promise<unknown>,
  vet: Vet
): SettlementStream =>
  streamOf(
    Array.from({ length: count }, (_, index) => settlement(index, () => run(index), vet)),
    count
  )

/** Start every element of an authored list concurrently. */
export const raceStream = (
  nodes: CompiledNode[],
  ctx: EvaluationContext,
  vet: Vet
): SettlementStream => indexedStream(nodes.length, (index) => evaluateNode(nodes[index], ctx), vet)

/**
 * The degenerate case: the list arrived as data, so every value is already
 * known. Completion order is index order, and the body cannot tell.
 */
export const settledStream = (values: unknown[], vet: Vet): SettlementStream =>
  indexedStream(values.length, (index) => Promise.resolve(values[index]), vet)

const settlement = async (
  index: number,
  run: () => Promise<unknown>,
  vet: Vet
): Promise<Settlement> => {
  try {
    return { index, ok: true, value: vet(await run()) }
  } catch (error) {
    // Parked, never thrown — the body decides whether it matters
    return { index, ok: false, error }
  }
}

const streamOf = (settlements: Promise<Settlement>[], length: number): SettlementStream => {
  const pending = new Map(settlements.map((promise, index) => [index, promise]))
  return {
    [LAZY_HANDLE]: true,
    length,
    async *[Symbol.asyncIterator]() {
      // Re-racing the remaining set each turn is quadratic in the element
      // count. That is the right trade here: operand lists are short, and
      // the alternative — a hand-rolled queue with its own waiter — buys
      // nothing back at this size while costing real clarity
      while (pending.size > 0) {
        const next = await Promise.race(pending.values())
        pending.delete(next.index)
        yield next
      }
    },
  }
}

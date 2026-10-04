/**
 * Chunk 12.2 — `evaluate()`'s conditional return type ("The TypeScript
 * story" in docs-dev/v3-specs/v3-evaluator-methods.md).
 *
 * Compile-time assertions: `pnpm typecheck` covers the test tree, so a
 * return type that stops following the effective options fails CI. The
 * rule under test is one sentence — the bare value, unless `trace` is
 * `true` in the MERGED options — and the matrix is what keeps the merge
 * honest in both directions.
 *
 * Why there is no `const` type parameter behind any of this: widening
 * applies to a mutable variable declaration, not to inference into a
 * type-parameter position, so a fresh object literal argument keeps
 * `trace: true` as the literal on its own. `const` would additionally
 * infer a readonly tuple for the `operators` array literal, which the
 * declared type does not accept — the last case here is what would
 * catch that.
 */
import { FigTree, coreOperators } from '../src'
import type { EvaluationResult } from '../src'
import { echoOp } from './fixtures/evalOperators'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const assertType = <T extends true>(): T | undefined => undefined

// ── Instance-level ──────────────────────────────────────────────────

const plain = new FigTree()
const tracing = new FigTree({ trace: true })
const traceOff = new FigTree({ trace: false })

/*
 * Asserted at CALL sites throughout, never through `ReturnType`: that
 * helper instantiates a generic method's type parameters with their
 * CONSTRAINTS, so `CallOpts` becomes the whole of `FigTreeOptions` and
 * the merge strips the very keys under test. A call is also what a
 * consumer actually writes.
 */
const instanceLevel = async () => {
  assertType<Equal<Awaited<typeof a>, unknown>>()
  const a = plain.evaluate({})

  assertType<Equal<Awaited<typeof b>, EvaluationResult>>()
  const b = tracing.evaluate({})

  assertType<Equal<Awaited<typeof c>, unknown>>()
  const c = traceOff.evaluate({})

  return [a, b, c]
}

// ── Per-call, and per-call overriding the instance both ways ────────

const checks = async () => {
  assertType<Equal<Awaited<typeof a>, unknown>>()
  const a = plain.evaluate({})

  assertType<Equal<Awaited<typeof b>, EvaluationResult>>()
  const b = plain.evaluate({}, { trace: true })

  assertType<Equal<Awaited<typeof c>, unknown>>()
  const c = plain.evaluate({}, { trace: false })

  assertType<Equal<Awaited<typeof d>, unknown>>()
  const d = plain.evaluate({}, { data: { x: 1 }, timeout: 50 })

  // A per-call `trace: false` turns the instance's envelope off…
  assertType<Equal<Awaited<typeof e>, unknown>>()
  const e = tracing.evaluate({}, { trace: false })

  // …and a call that leaves `trace` alone keeps it
  assertType<Equal<Awaited<typeof f>, EvaluationResult>>()
  const f = tracing.evaluate({}, { data: { x: 1 } })

  assertType<Equal<Awaited<typeof g>, EvaluationResult>>()
  const g = traceOff.evaluate({}, { trace: true })

  return [a, b, c, d, e, f, g]
}

// ── The cases a `const` type parameter would have broken ────────────

const withRegistry = new FigTree({
  operators: [coreOperators, echoOp()],
  operatorDefaults: { join: { delimiter: ', ' } },
})

const tracingWithRegistry = new FigTree({
  operators: [coreOperators, echoOp()],
  trace: true,
})

const registryChecks = async () => {
  assertType<Equal<Awaited<typeof a>, unknown>>()
  const a = withRegistry.evaluate({})

  // An array literal beside `trace`: the combination a `const` type
  // parameter would have turned into a readonly tuple
  assertType<Equal<Awaited<typeof b>, EvaluationResult>>()
  const b = tracingWithRegistry.evaluate({})

  return [a, b]
}

// ── The handle: the instance's options, frozen at compile ───────────

const handleChecks = async () => {
  assertType<Equal<Awaited<typeof a>, unknown>>()
  const a = plain.compile({}).evaluate()

  assertType<Equal<Awaited<typeof b>, EvaluationResult>>()
  const b = tracing.compile({}).evaluate()

  assertType<Equal<Awaited<typeof c>, EvaluationResult>>()
  const c = plain.compile({}).evaluate({ trace: true })

  assertType<Equal<Awaited<typeof d>, unknown>>()
  const d = tracing.compile({}).evaluate({ trace: false })

  return [a, b, c, d]
}

// ── The one documented limitation ───────────────────────────────────

// Options hoisted into a variable widen before the class ever sees them,
// so the instance types as bare-value. `const` would not have reached
// this either — it only applies to literal arguments. The runtime shape
// is still the envelope; it is the static type that cannot follow
const hoisted = { trace: true }
const fromVariable = new FigTree(hoisted)

const limitation = async () => {
  assertType<Equal<Awaited<typeof a>, unknown>>()
  const a = fromVariable.evaluate({})
  return a
}

test('the return type follows the effective options', async () => {
  // The runtime half of the same rule, so jest has something to run
  expect(await plain.evaluate({ a: 1 })).toEqual({ a: 1 })
  expect(await tracing.evaluate({ a: 1 })).toMatchObject({ result: { a: 1 } })
  // The hoisted-options instance still behaves as an envelope at RUNTIME;
  // it is only the static type that cannot follow
  expect(await fromVariable.evaluate({ a: 1 })).toMatchObject({ result: { a: 1 } })
  await Promise.all([instanceLevel(), checks(), registryChecks(), handleChecks(), limitation()])
})
